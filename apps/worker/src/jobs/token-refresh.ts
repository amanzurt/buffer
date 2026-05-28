import { Queue, type Job } from "bullmq";
import { db } from "@buffer/db";

// Importamos las funciones de Meta directamente (no vía @buffer/web)
// para evitar dependencia circular — copiamos la lógica mínima necesaria

const GRAPH_BASE = "https://graph.facebook.com/v22.0";

async function refreshLongLivedToken(currentToken: string): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    fb_exchange_token: currentToken,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Meta error ${res.status}`);
  }
  return res.json();
}

function decryptToken(enc: string, keyHex: string): string {
  const { createDecipheriv } = require("crypto");
  const [ivB64, authTagB64, ciphertextB64] = enc.split(":");
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function encryptToken(plaintext: string, keyHex: string): string {
  const { createCipheriv, randomBytes } = require("crypto");
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export interface TokenRefreshJobData {
  accountId: string;
}

export async function processTokenRefresh(job: Job<TokenRefreshJobData>): Promise<void> {
  const { accountId } = job.data;
  const ENC_KEY = process.env.INSTAGRAM_TOKEN_ENC_KEY ?? "a".repeat(64);

  const account = await db.instagramAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    console.warn(`[token-refresh] Cuenta ${accountId} no encontrada, saltando`);
    return;
  }

  if (account.status !== "active") {
    console.log(`[token-refresh] Cuenta ${accountId} status=${account.status}, saltando`);
    return;
  }

  try {
    const currentToken = decryptToken(account.accessTokenEnc, ENC_KEY);
    const newTokenData = await refreshLongLivedToken(currentToken);
    const newTokenEnc = encryptToken(newTokenData.access_token, ENC_KEY);
    const expiresIn = newTokenData.expires_in ?? 5184000;
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

    await db.instagramAccount.update({
      where: { id: accountId },
      data: {
        accessTokenEnc: newTokenEnc,
        tokenExpiresAt: newExpiresAt,
        lastRefreshedAt: new Date(),
        status: "active",
      },
    });

    console.log(`✅ [token-refresh] Token renovado para cuenta ${account.username} (${accountId})`);
    console.log(`   Nuevo expiry: ${newExpiresAt.toISOString()}`);

    // Re-encolar próximo refresh 7 días antes de expirar
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const nextRefreshDelay = Math.max(0, newExpiresAt.getTime() - Date.now() - sevenDaysMs);
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    const redisUrlParsed = new URL(redisUrl);
    const connOpts = {
      host: redisUrlParsed.hostname,
      port: Number(redisUrlParsed.port) || 6379,
      password: redisUrlParsed.password || undefined,
      tls: redisUrl.startsWith("rediss://") ? {} : undefined,
    };
    const queue = new Queue("token-refresh", { connection: connOpts });
    await queue.add(
      "refresh",
      { accountId },
      { delay: nextRefreshDelay, removeOnComplete: true }
    );
    await queue.close();

    await db.auditLog.create({
      data: {
        workspaceId: account.workspaceId,
        action: "token.refreshed",
        resourceId: accountId,
        metadata: JSON.stringify({ expiresAt: newExpiresAt }),
      },
    });

  } catch (err: any) {
    console.error(`❌ [token-refresh] Falló para cuenta ${accountId}:`, err.message);

    const isTokenInvalid = err.message?.includes("190") || err.message?.includes("invalid");

    await db.instagramAccount.update({
      where: { id: accountId },
      data: {
        status: isTokenInvalid ? "expired" : "error",
      },
    });

    if (isTokenInvalid) {
      // Cancelar posts programados
      await db.scheduledPost.updateMany({
        where: { igAccountId: accountId, status: "SCHEDULED" },
        data: {
          status: "CANCELED",
          errorMessage: "Token de Instagram expirado. Reconecta la cuenta.",
        },
      });
    }

    throw err; // Re-lanzar para que BullMQ haga retry
  }
}
