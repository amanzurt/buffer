import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

const isDev = process.env.NODE_ENV !== "production";
const hasRealResendKey = process.env.AUTH_RESEND_KEY?.startsWith("re_");

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY ?? "re_placeholder",
      from: process.env.EMAIL_FROM ?? "noreply@localhost",
      // Dev bypass: when no real Resend key is set, print the magic link to the
      // terminal instead of sending an email. Copy the URL into the browser to log in.
      ...(isDev && !hasRealResendKey
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
