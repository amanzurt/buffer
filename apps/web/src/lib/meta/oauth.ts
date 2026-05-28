import { createHmac, randomBytes } from "crypto";
import type { MetaTokenResponse } from "./types";
import { parseMetaError } from "./errors";

const GRAPH_VERSION = "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
].join(",");

function appId(): string {
  return process.env.META_APP_ID ?? "";
}

function appSecret(): string {
  return process.env.META_APP_SECRET ?? "";
}

function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/auth/meta/callback`;
}

/** Genera un state CSRF firmado con HMAC-SHA256. Formato: nonce.workspaceId.timestamp.sig */
export function generateOAuthState(workspaceId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const ts = Date.now().toString();
  const payload = `${nonce}.${workspaceId}.${ts}`;
  const sig = createHmac("sha256", appSecret())
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

/** Verifica el state CSRF. Devuelve workspaceId si es válido, null si no. */
export function verifyOAuthState(
  state: string,
  maxAgeMs = 10 * 60 * 1000
): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString();
    const parts = decoded.split(".");
    if (parts.length !== 4) return null;
    const [nonce, workspaceId, ts, receivedSig] = parts;
    const age = Date.now() - Number(ts);
    if (age > maxAgeMs || age < 0) return null;

    const payload = `${nonce}.${workspaceId}.${ts}`;
    const expectedSig = createHmac("sha256", appSecret())
      .update(payload)
      .digest("hex");

    if (expectedSig !== receivedSig) return null;
    return workspaceId;
  } catch {
    return null;
  }
}

/** Construye la URL de autorización de Facebook Login. */
export function buildOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri(),
    state,
    scope: SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
}

/** Intercambia el code por un short-lived user access token. */
export async function exchangeCodeForToken(
  code: string
): Promise<MetaTokenResponse> {
  const params = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    redirect_uri: redirectUri(),
    code,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params}`);
  if (!res.ok) throw await parseMetaError(res);
  return res.json() as Promise<MetaTokenResponse>;
}

/** Intercambia un short-lived token por un long-lived (60 días). */
export async function exchangeForLongLivedToken(
  shortToken: string
): Promise<MetaTokenResponse & { expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId(),
    client_secret: appSecret(),
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params}`);
  if (!res.ok) throw await parseMetaError(res);
  return res.json() as Promise<MetaTokenResponse & { expires_in: number }>;
}

/** Renueva un long-lived token (devuelve uno nuevo con 60 días). */
export async function refreshLongLivedToken(
  currentToken: string
): Promise<MetaTokenResponse & { expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId(),
    client_secret: appSecret(),
    fb_exchange_token: currentToken,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params}`);
  if (!res.ok) throw await parseMetaError(res);
  return res.json() as Promise<MetaTokenResponse & { expires_in: number }>;
}
