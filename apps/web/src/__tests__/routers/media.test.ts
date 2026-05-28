import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/r2", () => ({
  getPresignedPutUrl: vi.fn().mockResolvedValue("https://r2.example.com/presigned"),
  getPublicUrl: vi.fn((key: string) => `https://pub.example.com/${key}`),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { mediaRouter } from "@/server/api/routers/media";
import { db } from "@/lib/db";

process.env.SKIP_ENV_VALIDATION = "true";

const router = createTRPCRouter({ media: mediaRouter });
const createCaller = createCallerFactory(router);

const mockCtx = (userId: string) => ({
  session: { user: { id: userId, email: "t@t.com", name: "T" }, expires: new Date(Date.now() + 86400000).toISOString() },
  db,
  headers: new Headers(),
  userId,
});

describe("mediaRouter", () => {
  let userId: string;
  let workspaceId: string;

  beforeEach(async () => {
    const user = await db.user.create({ data: { email: `media-${Date.now()}@t.com` } });
    userId = user.id;
    const ws = await db.workspace.create({
      data: {
        name: "Media WS",
        slug: `media-${Date.now()}`,
        ownerId: userId,
        memberships: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = ws.id;
  });

  afterEach(async () => {
    await db.mediaAsset.deleteMany({ where: { workspaceId } });
    await db.membership.deleteMany({ where: { userId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
  });

  it("getUploadUrl devuelve uploadUrl, key y publicUrl", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    const result = await caller.media.getUploadUrl({
      workspaceId,
      filename: "photo.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1024 * 1024,
    });
    expect(result.uploadUrl).toContain("presigned");
    expect(result.key).toMatch(/^media\//);
    expect(result.publicUrl).toContain("pub.example.com");
  });

  it("finalizeUpload crea MediaAsset en DB", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    const asset = await caller.media.finalizeUpload({
      workspaceId,
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024 * 1024,
      r2Key: "media/test-key.jpg",
      publicUrl: "https://pub.example.com/media/test-key.jpg",
      width: 1080,
      height: 1080,
    });
    expect(asset.id).toBeDefined();
    expect(asset.workspaceId).toBe(workspaceId);
    expect(asset.r2Key).toBe("media/test-key.jpg");
  });

  it("list devuelve assets del workspace", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    await caller.media.finalizeUpload({
      workspaceId,
      filename: "img.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 500,
      r2Key: "media/img.jpg",
      publicUrl: "https://pub.example.com/media/img.jpg",
    });
    const { items } = await caller.media.list({ workspaceId });
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.workspaceId).toBe(workspaceId);
  });

  it("delete elimina el asset de DB", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    const asset = await caller.media.finalizeUpload({
      workspaceId,
      filename: "del.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 500,
      r2Key: "media/del.jpg",
      publicUrl: "https://pub.example.com/media/del.jpg",
    });
    await caller.media.delete({ id: asset.id, workspaceId });
    const found = await db.mediaAsset.findUnique({ where: { id: asset.id } });
    expect(found).toBeNull();
  });
});
