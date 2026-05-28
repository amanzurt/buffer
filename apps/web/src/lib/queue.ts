import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// Singleton connection — reused across hot reloads in Next.js dev
const globalForRedis = globalThis as unknown as { redisConn?: IORedis };

const connection =
  globalForRedis.redisConn ??
  new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    tls: redisUrl.startsWith("rediss://") ? {} : undefined,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redisConn = connection;

const publishQueue = new Queue("publish-post", { connection });

export async function enqueuePublishPost(
  postId: string,
  scheduledAt: Date
): Promise<string> {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());
  const job = await publishQueue.add(
    "publish",
    { postId },
    {
      delay,
      jobId: `post-${postId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    }
  );
  return job.id!;
}

export async function cancelPublishPost(bullJobId: string): Promise<void> {
  const job = await publishQueue.getJob(bullJobId);
  if (job) await job.remove();
}
