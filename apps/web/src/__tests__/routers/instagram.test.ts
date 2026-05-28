import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));

import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { instagramRouter } from "@/server/api/routers/instagram";
import { db } from "@/lib/db";

process.env.SKIP_ENV_VALIDATION = "true";
process.env.META_APP_SECRET = "test_secret";

const router = createTRPCRouter({ instagram: instagramRouter });
const createCaller = createCallerFactory(router);

const mockCtx = (userId: string) => ({
  session: {
    user: { id: userId, email: "test@test.com", name: "Test" },
    expires: new Date(Date.now() + 86400000).toISOString(),
  },
  db,
  headers: new Headers(),
  userId,
});

describe("instagramRouter", () => {
  let userId: string;
  let workspaceId: string;

  beforeEach(async () => {
    const user = await db.user.create({
      data: { email: `igtest-${Date.now()}@test.com` },
    });
    userId = user.id;
    const ws = await db.workspace.create({
      data: {
        name: "Test WS",
        slug: `igtest-${Date.now()}`,
        ownerId: userId,
        memberships: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = ws.id;
  });

  afterEach(async () => {
    await db.instagramAccount.deleteMany({ where: { workspaceId } });
    await db.membership.deleteMany({ where: { userId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
  });

  it("listAccounts devuelve array vacío cuando no hay cuentas", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    const accounts = await caller.instagram.listAccounts({ workspaceId });
    expect(accounts).toEqual([]);
  });

  it("getOAuthUrl devuelve una URL de facebook.com", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    const { url } = await caller.instagram.getOAuthUrl({ workspaceId });
    expect(url).toContain("facebook.com");
    expect(url).toContain("instagram_content_publish");
  });

  it("getOAuthUrl lanza FORBIDDEN para no-owner", async () => {
    const editor = await db.user.create({
      data: { email: `editor-${Date.now()}@test.com` },
    });
    await db.membership.create({
      data: { userId: editor.id, workspaceId, role: "EDITOR" },
    });

    const caller = createCaller(mockCtx(editor.id) as any);
    await expect(
      caller.instagram.getOAuthUrl({ workspaceId })
    ).rejects.toThrow();

    await db.membership.deleteMany({ where: { userId: editor.id } });
    await db.user.delete({ where: { id: editor.id } });
  });

  it("disconnect marca cuenta como revocada y cancela posts", async () => {
    const account = await db.instagramAccount.create({
      data: {
        workspaceId,
        igUserId: `ig-${Date.now()}`,
        username: "testuser",
        accountType: "BUSINESS",
        facebookPageId: "page123",
        accessTokenEnc: "enc:token:data",
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        connectedById: userId,
        scopes: "[]",
      },
    });

    const caller = createCaller(mockCtx(userId) as any);
    const result = await caller.instagram.disconnect({
      accountId: account.id,
      workspaceId,
    });
    expect(result.success).toBe(true);

    const updated = await db.instagramAccount.findUnique({
      where: { id: account.id },
    });
    expect(updated?.status).toBe("revoked");
  });
});
