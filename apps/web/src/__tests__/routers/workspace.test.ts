import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock next-auth antes de cualquier import que lo use
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));

import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { workspaceRouter } from "@/server/api/routers/workspace";
import { db } from "@/lib/db";

process.env.SKIP_ENV_VALIDATION = "true";

const router = createTRPCRouter({ workspace: workspaceRouter });
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

describe("workspaceRouter", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await db.user.create({
      data: { email: `test-${Date.now()}@test.com` },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await db.membership.deleteMany({ where: { userId } });
    await db.workspace.deleteMany({ where: { ownerId: userId } });
    await db.user.delete({ where: { id: userId } });
  });

  it("crea workspace y agrega membership OWNER", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    const ws = await caller.workspace.create({ name: "Mi Agencia" });
    expect(ws.name).toBe("Mi Agencia");
    expect(ws.ownerId).toBe(userId);
    const m = await db.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: ws.id } },
    });
    expect(m?.role).toBe("OWNER");
  });

  it("lista solo workspaces del usuario", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    await caller.workspace.create({ name: "WS 1" });
    await caller.workspace.create({ name: "WS 2" });
    const list = await caller.workspace.list();
    expect(list.length).toBe(2);
  });

  it("getBySlug lanza FORBIDDEN para workspace de otro usuario", async () => {
    const other = await db.user.create({
      data: { email: `other-${Date.now()}@test.com` },
    });
    const otherWs = await db.workspace.create({
      data: {
        name: "Otro",
        slug: `otro-${Date.now()}`,
        ownerId: other.id,
        memberships: { create: { userId: other.id, role: "OWNER" } },
      },
    });

    const caller = createCaller(mockCtx(userId) as any);
    await expect(
      caller.workspace.getBySlug({ slug: otherWs.slug })
    ).rejects.toThrow("Workspace not found");

    await db.membership.deleteMany({ where: { userId: other.id } });
    await db.workspace.delete({ where: { id: otherWs.id } });
    await db.user.delete({ where: { id: other.id } });
  });
});
