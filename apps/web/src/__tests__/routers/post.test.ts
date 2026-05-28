import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/queue", () => ({
  enqueuePublishPost: vi.fn().mockResolvedValue("job-123"),
  cancelPublishPost: vi.fn().mockResolvedValue(undefined),
}));

import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { postRouter } from "@/server/api/routers/post";
import { db } from "@/lib/db";

process.env.SKIP_ENV_VALIDATION = "true";

const router = createTRPCRouter({ post: postRouter });
const createCaller = createCallerFactory(router);

const mockCtx = (userId: string) => ({
  session: { user: { id: userId, email: "t@t.com", name: "T" }, expires: new Date(Date.now() + 86400000).toISOString() },
  db,
  headers: new Headers(),
  userId,
});

describe("postRouter", () => {
  let userId: string;
  let workspaceId: string;
  let igAccountId: string;
  let mediaId: string;

  beforeEach(async () => {
    const user = await db.user.create({ data: { email: `post-${Date.now()}@t.com` } });
    userId = user.id;
    const ws = await db.workspace.create({
      data: {
        name: "Post WS",
        slug: `post-${Date.now()}`,
        ownerId: userId,
        memberships: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = ws.id;

    const ig = await db.instagramAccount.create({
      data: {
        workspaceId,
        igUserId: `ig-${Date.now()}`,
        username: "testaccount",
        accountType: "BUSINESS",
        facebookPageId: "page-1",
        accessTokenEnc: "enc:tok:en",
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        connectedById: userId,
        scopes: "[]",
        status: "active",
      },
    });
    igAccountId = ig.id;

    const asset = await db.mediaAsset.create({
      data: {
        workspaceId,
        uploadedById: userId,
        filename: "test.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        r2Key: "media/test.jpg",
        publicUrl: "https://pub.example.com/media/test.jpg",
        width: 1080,
        height: 1080,
      },
    });
    mediaId = asset.id;
  });

  afterEach(async () => {
    await db.postMedia.deleteMany({ where: { post: { workspaceId } } });
    await db.scheduledPost.deleteMany({ where: { workspaceId } });
    await db.mediaAsset.deleteMany({ where: { workspaceId } });
    await db.instagramAccount.deleteMany({ where: { workspaceId } });
    await db.membership.deleteMany({ where: { userId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
  });

  it("create programa un post y devuelve id", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
    const post = await caller.post.create({
      workspaceId,
      igAccountId,
      type: "FEED_IMAGE",
      caption: "Hola mundo #test",
      scheduledAt: scheduledAt.toISOString(),
      mediaIds: [mediaId],
    });
    expect(post.id).toBeDefined();
    expect(post.status).toBe("SCHEDULED");
    expect(post.bullJobId).toBe("job-123");
  });

  it("list devuelve posts en rango", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await caller.post.create({
      workspaceId, igAccountId, type: "FEED_IMAGE",
      caption: "Test", scheduledAt: scheduledAt.toISOString(), mediaIds: [mediaId],
    });
    const from = new Date(Date.now() - 1000).toISOString();
    const to = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const posts = await caller.post.list({ workspaceId, from, to });
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]!.workspaceId).toBe(workspaceId);
  });

  it("delete elimina post SCHEDULED", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const post = await caller.post.create({
      workspaceId, igAccountId, type: "FEED_IMAGE",
      caption: "Borrar", scheduledAt: scheduledAt.toISOString(), mediaIds: [mediaId],
    });
    await caller.post.delete({ id: post.id, workspaceId });
    const found = await db.scheduledPost.findUnique({ where: { id: post.id } });
    expect(found).toBeNull();
  });

  it("cancelScheduled cambia status a CANCELED", async () => {
    const caller = createCaller(mockCtx(userId) as any);
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const post = await caller.post.create({
      workspaceId, igAccountId, type: "FEED_IMAGE",
      caption: "Cancelar", scheduledAt: scheduledAt.toISOString(), mediaIds: [mediaId],
    });
    await caller.post.cancelScheduled({ id: post.id, workspaceId });
    const updated = await db.scheduledPost.findUnique({ where: { id: post.id } });
    expect(updated?.status).toBe("CANCELED");
  });
});
