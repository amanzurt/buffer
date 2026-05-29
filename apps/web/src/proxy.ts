import { NextRequest, NextResponse } from "next/server";

// Next.js 16: the `proxy` convention (formerly `middleware`). Runs on the Node
// runtime. We keep it to coarse gating only — redirect to /login when the
// session cookie is absent — so it stays cheap and DB-free. The real
// authorization check runs in the Node-runtime server components (which call
// auth() and verify the session against the database).
const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAppRoute = path.startsWith("/app");

  if (!isAppRoute) return NextResponse.next();

  const hasSession =
    req.cookies.has(SESSION_COOKIE) || req.cookies.has(SECURE_SESSION_COOKIE);

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
