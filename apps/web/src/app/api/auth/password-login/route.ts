import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

// Email + password login that creates a NextAuth *database* session directly
// (the Credentials provider can't be used with the database session strategy).
// On success we mint a Session row and set the session cookie NextAuth reads.
const SESSION_DAYS = 30;

// Honor the tunnel/proxy forwarded protocol+host so redirects and the cookie
// Secure flag are correct whether accessed via localhost or an https tunnel.
function baseUrl(req: NextRequest): { origin: string; isHttps: boolean } {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return { origin: `${proto}://${host}`, isHttps: proto === "https" };
}

export async function POST(req: NextRequest) {
  const { origin, isHttps } = baseUrl(req);
  const redirectTo = (path: string) => NextResponse.redirect(`${origin}${path}`, { status: 303 });

  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (!email || !password) return redirectTo("/login?error=1");

  const user = await db.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return redirectTo("/login?error=1");
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { sessionToken, userId: user.id, expires } });

  const res = redirectTo("/app");
  // Match the cookie name NextAuth uses for database sessions in this app.
  res.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    secure: isHttps,
  });
  return res;
}
