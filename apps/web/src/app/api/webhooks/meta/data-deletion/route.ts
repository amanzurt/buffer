import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/lib/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const appSecret = process.env.META_APP_SECRET ?? "";
  const expected = "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
  return expected === signature;
}

// Meta sends a signed_request param (form-encoded POST from their side),
// but also supports the X-Hub-Signature-256 pattern for JSON payloads.
// We handle both: if body is application/json we use the header, otherwise
// we decode the signed_request (base64url(sig).base64url(payload)).
function decodeSignedRequest(signedRequest: string): { user_id?: string } | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  try {
    const payload = Buffer.from(parts[1]!, "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  let igUserId: string | undefined;
  let confirmationCode: string;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const signedRequest = params.get("signed_request");
    if (!signedRequest) {
      return NextResponse.json({ error: "missing signed_request" }, { status: 400 });
    }
    const decoded = decodeSignedRequest(signedRequest);
    igUserId = decoded?.user_id ? String(decoded.user_id) : undefined;
  } else {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 403 });
    }
    try {
      const payload = JSON.parse(rawBody);
      igUserId = payload.user_id ? String(payload.user_id) : undefined;
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
  }

  confirmationCode = `del_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  if (igUserId) {
    const account = await db.instagramAccount.findFirst({
      where: { igUserId },
    });

    if (account) {
      // Soft-delete: mark revoked and log the deletion request.
      // Hard delete will be executed 30 days later (Fase 2 job).
      await db.instagramAccount.update({
        where: { id: account.id },
        data: { status: "revoked" },
      });

      await db.auditLog.create({
        data: {
          workspaceId: account.workspaceId,
          action: "igaccount.data_deletion_requested",
          resourceId: account.id,
          metadata: JSON.stringify({ igUserId, confirmationCode }),
        },
      });
    }
  }

  // Meta requires this exact response shape to verify the callback URL.
  return NextResponse.json({
    url: `${APP_URL}/privacy/deletion-status?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
