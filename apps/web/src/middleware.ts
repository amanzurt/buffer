import { NextRequest, NextResponse } from "next/server";

// Middleware runs on the Edge Runtime where PrismaClient cannot run, so we
// can't read the database session here. We only do coarse gating: redirect to
// /login when the session cookie is absent. The real authorization check runs
// in the Node-runtime server components (which call auth() and verify the
// session against the database).
const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

export default function middleware(req: NextRequest) {
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
