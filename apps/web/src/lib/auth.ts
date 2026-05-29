import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

const isDev = process.env.NODE_ENV !== "production";
// In dev we print the magic link to the terminal instead of calling Resend, so
// login works without a valid API key. Opt into real email sending in dev by
// setting RESEND_SEND_REAL_EMAILS=true. Production always sends real emails.
const useDevMagicLink = isDev && process.env.RESEND_SEND_REAL_EMAILS !== "true";

// AUTH_SECRET is required by NextAuth v5. In dev, fall back to a fixed value so
// the app runs without forcing the user to populate .env.local. In production
// the real env var must be set (no fallback).
const authSecret =
  process.env.AUTH_SECRET ??
  (isDev ? "dev-only-insecure-secret-do-not-use-in-production" : undefined);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  secret: authSecret,
  trustHost: true,
  debug: isDev,
  session: { strategy: "database" },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY ?? "re_placeholder",
      from: process.env.EMAIL_FROM ?? "noreply@localhost",
      // Dev bypass: print the magic link to the terminal instead of sending an
      // email. Copy the URL into the browser to log in.
      ...(useDevMagicLink
        ? {
            sendVerificationRequest({ url }) {
              console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
              console.log("🔑  [DEV] Magic link — copia en el navegador:");
              console.log("   " + url);
              console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
            },
          }
        : {}),
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=1",
    error: "/login?error=1",
  },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
