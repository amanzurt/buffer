// Dev seed: recreate a usable local fixture (user, workspace, fake IG account,
// and a known session token so you can log in by setting the cookie).
// Run from apps/web:  DATABASE_URL="file:./prisma/dev.db" node scripts/seed-dev.mjs
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const EMAIL = "amanzur@gmail.com";
const SESSION_TOKEN = "dev-session-token-001";
const day = 86_400_000;

const user = await db.user.upsert({
  where: { email: EMAIL },
  update: {},
  create: { email: EMAIL, name: "Alberto", emailVerified: new Date() },
});

const ws = await db.workspace.upsert({
  where: { slug: "test-agency" },
  update: {},
  create: { name: "Test Agency", slug: "test-agency", ownerId: user.id, timezone: "America/Mexico_City" },
});

await db.membership.upsert({
  where: { userId_workspaceId: { userId: user.id, workspaceId: ws.id } },
  update: { role: "OWNER" },
  create: { userId: user.id, workspaceId: ws.id, role: "OWNER" },
});

const igUserId = "17841400000000000";
await db.instagramAccount.upsert({
  where: { igUserId },
  update: { status: "active" },
  create: {
    workspaceId: ws.id,
    igUserId,
    username: "test_agency_ig",
    accountType: "BUSINESS",
    facebookPageId: "1234567890",
    accessTokenEnc: "dev:fake:token",
    tokenExpiresAt: new Date(Date.now() + 60 * day),
    connectedById: user.id,
    status: "active",
  },
});

await db.session.upsert({
  where: { sessionToken: SESSION_TOKEN },
  update: { expires: new Date(Date.now() + 30 * day) },
  create: { sessionToken: SESSION_TOKEN, userId: user.id, expires: new Date(Date.now() + 30 * day) },
});

console.log(JSON.stringify({ userId: user.id, workspaceId: ws.id, slug: ws.slug, sessionToken: SESSION_TOKEN }, null, 2));
await db.$disconnect();
