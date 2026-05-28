import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { verifyOAuthState, exchangeCodeForToken, exchangeForLongLivedToken } from "@/lib/meta/oauth";
import { getConnectableIgAccounts } from "@/lib/meta/accounts";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";

const ENC_KEY = process.env.INSTAGRAM_TOKEN_ENC_KEY ?? "a".repeat(64);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/app?error=meta_denied`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(`/app?error=meta_invalid`, req.url));
  }

  const workspaceId = verifyOAuthState(state);
  if (!workspaceId) {
    return NextResponse.redirect(
      new URL(`/app?error=meta_state_invalid`, req.url)
    );
  }

  // Verificar que el usuario pertenece al workspace
  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId: session.user.id, workspaceId } },
    include: { workspace: true },
  });
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.redirect(new URL(`/app?error=meta_forbidden`, req.url));
  }

  try {
    // 1. Intercambiar code → short-lived token
    const shortToken = await exchangeCodeForToken(code);

    // 2. Intercambiar → long-lived (60 días)
    const longToken = await exchangeForLongLivedToken(shortToken.access_token);
    const expiresIn = longToken.expires_in ?? 5184000; // 60 días por defecto
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // 3. Obtener cuentas IG Business/Creator disponibles
    const accounts = await getConnectableIgAccounts(longToken.access_token);

    if (accounts.length === 0) {
      return NextResponse.redirect(
        new URL(
          `/app/${membership.workspace.slug}/accounts?error=no_business_accounts`,
          req.url
        )
      );
    }

    // 4. Cifrar y guardar cada cuenta (upsert por igUserId)
    for (const account of accounts) {
      const tokenEnc = encrypt(longToken.access_token, ENC_KEY);
      await db.instagramAccount.upsert({
        where: { igUserId: account.igUserId },
        update: {
          accessTokenEnc: tokenEnc,
          tokenExpiresAt,
          lastRefreshedAt: new Date(),
          status: "active",
          username: account.username,
          profilePictureUrl: account.profilePictureUrl ?? null,
          facebookPageId: account.facebookPageId,
          facebookPageName: account.facebookPageName,
          scopes: JSON.stringify([
            "instagram_basic",
            "instagram_content_publish",
            "pages_show_list",
          ]),
        },
        create: {
          workspaceId,
          igUserId: account.igUserId,
          username: account.username,
          accountType: account.accountType,
          profilePictureUrl: account.profilePictureUrl ?? null,
          facebookPageId: account.facebookPageId,
          facebookPageName: account.facebookPageName,
          accessTokenEnc: tokenEnc,
          tokenExpiresAt,
          connectedById: session.user.id,
          scopes: JSON.stringify([
            "instagram_basic",
            "instagram_content_publish",
            "pages_show_list",
          ]),
        },
      });
    }

    await db.auditLog.create({
      data: {
        workspaceId,
        userId: session.user.id,
        action: "igaccount.connected",
        metadata: JSON.stringify({ accountsCount: accounts.length }),
      },
    });

    return NextResponse.redirect(
      new URL(
        `/app/${membership.workspace.slug}/accounts?success=connected`,
        req.url
      )
    );
  } catch (err) {
    console.error("[meta/callback] Error:", err);
    return NextResponse.redirect(
      new URL(
        `/app/${membership.workspace.slug}/accounts?error=meta_error`,
        req.url
      )
    );
  }
}
