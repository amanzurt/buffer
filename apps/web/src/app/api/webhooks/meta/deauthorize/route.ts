import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/lib/db";

function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const appSecret = process.env.META_APP_SECRET ?? "";
  const expected = "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
  return expected === signature;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  let payload: { user_id?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const igUserId = payload.user_id;
  if (!igUserId) {
    return NextResponse.json({ ok: true });
  }

  const account = await db.instagramAccount.findFirst({
    where: { igUserId: String(igUserId) },
  });

  if (account) {
    await db.instagramAccount.update({
      where: { id: account.id },
      data: { status: "revoked" },
    });

    await db.scheduledPost.updateMany({
      where: { igAccountId: account.id, status: "SCHEDULED" },
      data: {
        status: "CANCELED",
        errorMessage: "Cuenta de Instagram desautorizada desde Meta.",
      },
    });

    await db.auditLog.create({
      data: {
        workspaceId: account.workspaceId,
        action: "igaccount.deauthorized",
        resourceId: account.id,
        metadata: JSON.stringify({ igUserId }),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
