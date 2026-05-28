import type { Job } from "bullmq";
import { db } from "@buffer/db";

export interface PublishPostJobData {
  postId: string;
}

export async function processPublishPost(job: Job<PublishPostJobData>): Promise<void> {
  const { postId } = job.data;

  const post = await db.scheduledPost.findUnique({
    where: { id: postId },
    include: {
      media: { include: { media: true }, orderBy: { order: "asc" } },
      igAccount: true,
    },
  });

  if (!post) {
    console.warn(`[publish-post] Post ${postId} no encontrado, saltando`);
    return;
  }

  if (post.status === "CANCELED") {
    console.log(`[publish-post] Post ${postId} cancelado, saltando`);
    return;
  }

  if (post.status === "PUBLISHED") {
    console.log(`[publish-post] Post ${postId} ya publicado, saltando`);
    return;
  }

  if (post.igAccount.status !== "active") {
    const msg = `Cuenta de Instagram ${post.igAccount.username} no está activa (status: ${post.igAccount.status})`;
    await db.scheduledPost.update({
      where: { id: postId },
      data: { status: "FAILED", errorMessage: msg },
    });
    throw new Error(msg);
  }

  const tokenExpiry = new Date(post.igAccount.tokenExpiresAt);
  if (tokenExpiry.getTime() < Date.now()) {
    const msg = `Token de Instagram expirado para ${post.igAccount.username}`;
    await db.scheduledPost.update({
      where: { id: postId },
      data: { status: "FAILED", errorMessage: msg },
    });
    throw new Error(msg);
  }

  // Marcar como publicando
  await db.scheduledPost.update({
    where: { id: postId },
    data: { status: "PUBLISHING" },
  });

  try {
    // --- STUB: Plan E implementará la llamada real a Graph API ---
    console.log(`[publish-post] STUB: publicaría ${post.type} para @${post.igAccount.username}`);
    console.log(`  Caption: ${post.caption.slice(0, 80)}${post.caption.length > 80 ? "…" : ""}`);
    console.log(`  Media: ${post.media.map((m) => m.media.filename).join(", ")}`);
    await new Promise((r) => setTimeout(r, 500));
    const stubMediaId = `stub_${Date.now()}`;
    // --- fin stub ---

    await db.scheduledPost.update({
      where: { id: postId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        igMediaId: stubMediaId,
      },
    });

    await db.auditLog.create({
      data: {
        workspaceId: post.workspaceId,
        action: "post.published",
        resourceId: postId,
        metadata: JSON.stringify({ igMediaId: stubMediaId, stub: true }),
      },
    });

    console.log(`✅ [publish-post] Post ${postId} publicado (stub) — igMediaId: ${stubMediaId}`);
  } catch (err: any) {
    console.error(`❌ [publish-post] Error publicando ${postId}:`, err.message);

    await db.scheduledPost.update({
      where: { id: postId },
      data: {
        status: "FAILED",
        errorMessage: err.message,
        retryCount: { increment: 1 },
      },
    });

    throw err;
  }
}
