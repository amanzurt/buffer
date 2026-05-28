import { parseMetaError } from "./errors";

const GRAPH_BASE = "https://graph.facebook.com/v22.0";

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

/** Crea un container de imagen Feed. Devuelve creation_id. */
export async function createFeedImageContainer(
  igUserId: string,
  imageUrl: string,
  caption: string,
  token: string
): Promise<string> {
  const data = await graphPost<{ id: string }>(
    `/${igUserId}/media`,
    token,
    { image_url: imageUrl, caption }
  );
  return data.id;
}

/** Crea un container de Reel. Devuelve creation_id. */
export async function createReelContainer(
  igUserId: string,
  videoUrl: string,
  caption: string,
  shareToFeed: boolean,
  token: string
): Promise<string> {
  const data = await graphPost<{ id: string }>(
    `/${igUserId}/media`,
    token,
    { media_type: "REELS", video_url: videoUrl, caption, share_to_feed: shareToFeed }
  );
  return data.id;
}

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

/** Consulta el status de un container (útil para Reels). */
export async function getContainerStatus(
  containerId: string,
  token: string
): Promise<{ statusCode: ContainerStatus; statusMessage?: string }> {
  const data = await graphGet<{ status_code: ContainerStatus; status?: string }>(
    `/${containerId}?fields=status_code,status`,
    token
  );
  return { statusCode: data.status_code, statusMessage: data.status };
}

/** Publica un container ya procesado. Devuelve media_id de Instagram. */
export async function publishContainer(
  igUserId: string,
  creationId: string,
  token: string
): Promise<string> {
  const data = await graphPost<{ id: string }>(
    `/${igUserId}/media_publish`,
    token,
    { creation_id: creationId }
  );
  return data.id;
}
