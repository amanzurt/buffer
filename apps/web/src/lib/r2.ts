import { S3Client, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const hasR2 = !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID);

function getR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
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
  if (!hasR2) {
    // Dev mock: return a data-echo URL that the MediaDropzone can PUT to.
    // The upload "succeeds" (200) but nothing is stored. The publicUrl will 404,
    // which is fine for local UI testing.
    return `/api/dev/upload-mock?key=${encodeURIComponent(key)}`;
  }
  const client = getR2Client();
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: maxBytes,
  });
  return getSignedUrl(client, cmd, { expiresIn: 300 });
}

export async function deleteObject(key: string): Promise<void> {
  if (!hasR2) return; // no-op in dev
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
