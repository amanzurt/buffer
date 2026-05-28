import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// BullMQ accepts a URL string as connection config — avoids ioredis version conflicts.
function makeConnectionOpts() {
  const url = new URL(redisUrl.replace(/^rediss?:\/\//, (m) => m));
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    tls: redisUrl.startsWith("rediss://") ? {} : undefined,
  };
}

const globalForQueue = globalThis as unknown as { publishQueue?: Queue };

const publishQueue: Queue =
  globalForQueue.publishQueue ??
  new Queue("publish-post", { connection: makeConnectionOpts() });

if (process.env.NODE_ENV !== "production") globalForQueue.publishQueue = publishQueue;

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
