import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth?.user;
  const path = req.nextUrl.pathname;

  const isAppRoute = path.startsWith("/app");
  const isAuthRoute = path.startsWith("/api/auth");
  const isApiRoute = path.startsWith("/api");

  if (isAuthRoute || isApiRoute) return NextResponse.next();
  if (isAppRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
