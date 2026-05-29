import { createDecipheriv } from "crypto";
import type { Job } from "bullmq";
import { db } from "@buffer/db";

// ── Graph API helpers (inlined; worker cannot import from @buffer/web) ────────

const GRAPH_BASE = "https://graph.facebook.com/v22.0";

class MetaApiError extends Error {
  constructor(message: string, public readonly code?: number, public readonly traceId?: string) {
    super(message);
    this.name = "MetaApiError";
  }
}

async function parseMetaError(res: Response): Promise<MetaApiError> {
  const traceId = res.headers.get("x-fb-trace-id") ?? undefined;
  try {
    const body = await res.json();
    const e = body?.error;
    return new MetaApiError(e?.message ?? `Meta API error ${res.status}`, e?.code, traceId);
  } catch {
    return new MetaApiError(`Meta API error ${res.status}`, undefined, traceId);
  }
}

async function graphPost<T>(
  path: string,
  token: string,
  body: Record<string, string | boolean>
): Promise<T> {
  const params = new URLSearchParams({ access_token: token });
  for (const [k, v] of Object.entries(body)) params.set(k, String(v));
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw await parseMetaError(res);
  return res.json() as Promise<T>;
}

async function graphGet<T>(path: string, token: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH_BASE}${path}${sep}access_token=${token}`);
  if (!res.ok) throw await parseMetaError(res);
  return res.json() as Promise<T>;
}

type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

async function createFeedImageContainer(igUserId: string, imageUrl: string, caption: string, token: string): Promise<string> {
  const data = await graphPost<{ id: string }>(`/${igUserId}/media`, token, { image_url: imageUrl, caption });
  return data.id;
}

async function createReelContainer(igUserId: string, videoUrl: string, caption: string, token: string): Promise<string> {
  const data = await graphPost<{ id: string }>(`/${igUserId}/media`, token, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: true,
  });
  return data.id;
}

async function createCarouselItemContainer(
  igUserId: string,
  media: { url: string; isVideo: boolean },
  token: string,
): Promise<string> {
  const body: Record<string, string | boolean> = { is_carousel_item: true };
  if (media.isVideo) {
    body.media_type = "VIDEO";
    body.video_url = media.url;
  } else {
    body.image_url = media.url;
  }
  const data = await graphPost<{ id: string }>(`/${igUserId}/media`, token, body);
  return data.id;
}

async function createCarouselContainer(
  igUserId: string,
  childrenIds: string[],
  caption: string,
  token: string,
): Promise<string> {
  const data = await graphPost<{ id: string }>(`/${igUserId}/media`, token, {
    media_type: "CAROUSEL",
    children: childrenIds.join(","),
    caption,
  });
  return data.id;
}

async function createStoryContainer(
  igUserId: string,
  media: { url: string; isVideo: boolean },
  token: string,
): Promise<string> {
  const body: Record<string, string | boolean> = { media_type: "STORIES" };
  if (media.isVideo) body.video_url = media.url;
  else body.image_url = media.url;
  const data = await graphPost<{ id: string }>(`/${igUserId}/media`, token, body);
  return data.id;
}

async function getContainerStatus(containerId: string, token: string): Promise<ContainerStatus> {
  const data = await graphGet<{ status_code: ContainerStatus }>(
    `/${containerId}?fields=status_code`,
    token
  );
  return data.status_code;
}

async function publishContainer(igUserId: string, creationId: string, token: string): Promise<string> {
  const data = await graphPost<{ id: string }>(`/${igUserId}/media_publish`, token, { creation_id: creationId });
  return data.id;
}

async function postComment(mediaId: string, message: string, token: string): Promise<void> {
  await graphPost<{ id: string }>(`/${mediaId}/comments`, token, { message });
}

/** Errores que no vale la pena reintentar (token revocado, contenido rechazado, etc.) */
function isPermanentError(err: unknown): boolean {
  if (err instanceof MetaApiError) {
    // 190: token inválido/expirado, 32/36/100: permisos/contenido rechazado, 2207: media error
    return [190, 32, 36, 100, 2207].includes(err.code ?? -1);
  }
  return false;
}

// ── Crypto helpers (inlined; misma lógica que token-refresh.ts) ──────────────

function decryptToken(enc: string, keyHex: string): string {
  const [ivB64, authTagB64, ciphertextB64] = enc.split(":");
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ── In-app notifications ──────────────────────────────────────────────────────

async function notify(
  workspaceId: string,
  type: "post_published" | "post_failed",
  title: string,
  body: string,
  postId: string,
): Promise<void> {
  try {
    await db.notification.create({ data: { workspaceId, type, title, body, postId } });
  } catch (e: any) {
    console.warn(`[publish-post] No se pudo crear notificación: ${e.message}`);
  }
}

// ── Reel polling ──────────────────────────────────────────────────────────────

const REEL_POLL_INTERVAL_MS = 5_000;
const REEL_POLL_MAX_ATTEMPTS = 60; // 5 min máx

async function waitForReelReady(containerId: string, token: string): Promise<void> {
  for (let attempt = 0; attempt < REEL_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, REEL_POLL_INTERVAL_MS));
    const status = await getContainerStatus(containerId, token);
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new MetaApiError(`Reel container ${containerId} entró en status=${status}`, 2207);
    }
  }
  throw new MetaApiError(`Reel container ${containerId} no procesó en ${REEL_POLL_MAX_ATTEMPTS * REEL_POLL_INTERVAL_MS / 1000}s`, 2207);
}

// ── Job processor ─────────────────────────────────────────────────────────────

export interface PublishPostJobData {
  postId: string;
}

export async function processPublishPost(job: Job<PublishPostJobData>): Promise<void> {
  const { postId } = job.data;
  const ENC_KEY = process.env.INSTAGRAM_TOKEN_ENC_KEY ?? "a".repeat(64);

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
    const msg = `Cuenta @${post.igAccount.username} no está activa (status: ${post.igAccount.status})`;
    await db.scheduledPost.update({ where: { id: postId }, data: { status: "FAILED", errorMessage: msg } });
    return; // permanente, no reintentar
  }

  if (new Date(post.igAccount.tokenExpiresAt).getTime() < Date.now()) {
    const msg = `Token expirado para @${post.igAccount.username}`;
    await db.scheduledPost.update({ where: { id: postId }, data: { status: "FAILED", errorMessage: msg } });
    return;
  }

  const firstMedia = post.media[0]?.media;

  if (!firstMedia) {
    const msg = "Post sin media adjunta";
    await db.scheduledPost.update({ where: { id: postId }, data: { status: "FAILED", errorMessage: msg } });
    return;
  }

  // Marcar como publicando
  await db.scheduledPost.update({ where: { id: postId }, data: { status: "PUBLISHING" } });

  // ── Dev dry-run ───────────────────────────────────────────────────────────
  // Simula el flujo de la Graph API sin llamar a Meta ni descifrar el token.
  // Permite ver SCHEDULED → PUBLISHING → PUBLISHED en localhost sin app de Meta.
  if (process.env.PUBLISH_DRY_RUN === "true") {
    console.log(`🧪 [publish-post] DRY-RUN: simulando publicación de ${postId} (${post.type})…`);
    await new Promise((r) => setTimeout(r, 1500));
    const fakeMediaId = `dryrun_${Date.now()}`;
    await db.scheduledPost.update({
      where: { id: postId },
      data: { status: "PUBLISHED", publishedAt: new Date(), igMediaId: fakeMediaId },
    });
    await db.auditLog.create({
      data: {
        workspaceId: post.workspaceId,
        action: "post.published",
        resourceId: postId,
        metadata: JSON.stringify({ igMediaId: fakeMediaId, type: post.type, dryRun: true, account: post.igAccount.username }),
      },
    });
    await notify(
      post.workspaceId,
      "post_published",
      `Post publicado en @${post.igAccount.username}`,
      post.caption.slice(0, 80),
      postId,
    );
    console.log(`✅ [publish-post] DRY-RUN: post ${postId} marcado PUBLISHED — igMediaId: ${fakeMediaId}`);
    return;
  }

  const token = decryptToken(post.igAccount.accessTokenEnc, ENC_KEY);
  const igUserId = post.igAccount.igUserId;

  try {
    let igMediaId: string;

    if (post.type === "FEED_IMAGE") {
      console.log(`[publish-post] Creando container Feed para post ${postId}…`);
      const creationId = await createFeedImageContainer(igUserId, firstMedia.publicUrl, post.caption, token);

      await db.scheduledPost.update({ where: { id: postId }, data: { igContainerId: creationId } });

      console.log(`[publish-post] Publicando container ${creationId}…`);
      igMediaId = await publishContainer(igUserId, creationId, token);

    } else if (post.type === "REEL") {
      console.log(`[publish-post] Creando container Reel para post ${postId}…`);
      const creationId = await createReelContainer(igUserId, firstMedia.publicUrl, post.caption, token);

      await db.scheduledPost.update({ where: { id: postId }, data: { igContainerId: creationId } });

      console.log(`[publish-post] Esperando procesado de Reel ${creationId}…`);
      await waitForReelReady(creationId, token);

      console.log(`[publish-post] Publicando Reel ${creationId}…`);
      igMediaId = await publishContainer(igUserId, creationId, token);

    } else if (post.type === "CAROUSEL") {
      console.log(`[publish-post] Creando ${post.media.length} items de carrusel para ${postId}…`);
      const childrenIds: string[] = [];
      for (const item of post.media) {
        const isVideo = item.media.mimeType.startsWith("video/");
        const childId = await createCarouselItemContainer(igUserId, { url: item.media.publicUrl, isVideo }, token);
        if (isVideo) await waitForReelReady(childId, token);
        childrenIds.push(childId);
      }

      const creationId = await createCarouselContainer(igUserId, childrenIds, post.caption, token);
      await db.scheduledPost.update({ where: { id: postId }, data: { igContainerId: creationId } });

      console.log(`[publish-post] Publicando carrusel ${creationId}…`);
      igMediaId = await publishContainer(igUserId, creationId, token);

    } else if (post.type === "STORY") {
      const isVideo = firstMedia.mimeType.startsWith("video/");
      console.log(`[publish-post] Creando container Story (${isVideo ? "video" : "imagen"}) para ${postId}…`);
      const creationId = await createStoryContainer(igUserId, { url: firstMedia.publicUrl, isVideo }, token);

      await db.scheduledPost.update({ where: { id: postId }, data: { igContainerId: creationId } });

      if (isVideo) await waitForReelReady(creationId, token);

      console.log(`[publish-post] Publicando Story ${creationId}…`);
      igMediaId = await publishContainer(igUserId, creationId, token);

    } else {
      const msg = `Tipo de post no soportado: ${post.type}`;
      await db.scheduledPost.update({ where: { id: postId }, data: { status: "FAILED", errorMessage: msg } });
      console.warn(`[publish-post] ${msg}`);
      return;
    }

    // Publicación exitosa
    await db.scheduledPost.update({
      where: { id: postId },
      data: { status: "PUBLISHED", publishedAt: new Date(), igMediaId },
    });

    // Primer comentario (opcional)
    if (post.firstComment?.trim()) {
      try {
        await postComment(igMediaId, post.firstComment.trim(), token);
        console.log(`[publish-post] Primer comentario publicado en ${igMediaId}`);
      } catch (commentErr: any) {
        console.warn(`[publish-post] No se pudo publicar primer comentario: ${commentErr.message}`);
      }
    }

    await db.auditLog.create({
      data: {
        workspaceId: post.workspaceId,
        action: "post.published",
        resourceId: postId,
        metadata: JSON.stringify({ igMediaId, type: post.type, account: post.igAccount.username }),
      },
    });

    await notify(
      post.workspaceId,
      "post_published",
      `Post publicado en @${post.igAccount.username}`,
      post.caption.slice(0, 80),
      postId,
    );

    console.log(`✅ [publish-post] Post ${postId} publicado — igMediaId: ${igMediaId}`);

  } catch (err: any) {
    console.error(`❌ [publish-post] Error publicando ${postId}:`, err.message, err.traceId ? `(trace: ${err.traceId})` : "");

    const permanent = isPermanentError(err);
    await db.scheduledPost.update({
      where: { id: postId },
      data: {
        status: "FAILED",
        errorMessage: err.message,
        retryCount: { increment: 1 },
      },
    });

    // Notificar solo en el fallo definitivo (permanente o último reintento),
    // para no spamear en cada reintento transitorio.
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (permanent || isLastAttempt) {
      await notify(
        post.workspaceId,
        "post_failed",
        `Falló la publicación en @${post.igAccount.username}`,
        err.message?.slice(0, 120) ?? "Error desconocido",
        postId,
      );
    }

    if (permanent) {
      // No relanzar → BullMQ NO reintentará
      console.warn(`[publish-post] Error permanente para ${postId}, sin reintentos.`);
      return;
    }

    throw err; // Error transitorio → BullMQ reintentará (backoff exponencial)
  }
}
