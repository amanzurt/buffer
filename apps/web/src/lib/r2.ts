import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID ?? "";
  return new S3Client({
    region: "auto",
    endpoint: accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : "http://localhost:9000", // fallback for local dev without R2
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "minioadmin",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "minioadmin",
    },
  });
}

const BUCKET = process.env.R2_BUCKET_NAME ?? "buffer-dev";

export function getPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/${key}`;
}

export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  maxBytes: number
): Promise<string> {
  const client = getR2Client();
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: maxBytes, // enforced by Cloudflare; browser must match
  });
  return getSignedUrl(client, cmd, { expiresIn: 300 }); // 5 min TTL
}

export async function deleteObject(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
