import * as Sentry from "@sentry/node";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { processTokenRefresh } from "./jobs/token-refresh";
import { processPublishPost } from "./jobs/publish-post";

const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({ dsn: sentryDsn, tracesSampleRate: 0.1 });
  console.log("✅ Sentry inicializado");
}

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// Plain connection options avoid ioredis version conflicts with BullMQ
function makeConnectionOpts() {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    tls: redisUrl.startsWith("rediss://") ? {} : undefined,
  };
}

// IORedis instance only used for event logging (not passed to BullMQ)
const redisMonitor = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith("rediss://") ? {} : undefined,
});

redisMonitor.on("connect", () => console.log("✅ Redis connected"));
redisMonitor.on("error", (err) => console.error("❌ Redis error:", err.message));

const testQueue = new Queue("test-queue", { connection: makeConnectionOpts() });

const testWorker = new Worker(
  "test-queue",
  async (job) => {
    console.log(`[worker] Procesando job ${job.id}:`, job.data);
    await new Promise((r) => setTimeout(r, 200));
    console.log(`[worker] Job ${job.id} completado`);
    return { ok: true };
  },
  { connection: makeConnectionOpts(), concurrency: 5 }
);

testWorker.on("completed", (job) => console.log(`✅ Job ${job.id} completado`));
testWorker.on("failed", (job, err) =>
  console.error(`❌ Job ${job?.id} fallido:`, err.message)
);

const tokenRefreshWorker = new Worker(
  "token-refresh",
  processTokenRefresh,
  {
    connection: makeConnectionOpts(),
    concurrency: 5,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  }
);

tokenRefreshWorker.on("completed", (job) =>
  console.log(`✅ [token-refresh] Job ${job.id} completado`)
);
tokenRefreshWorker.on("failed", (job, err) => {
  console.error(`❌ [token-refresh] Job ${job?.id} fallido:`, err.message);
  Sentry.captureException(err, { extra: { jobId: job?.id, data: job?.data } });
});

const publishPostWorker = new Worker(
  "publish-post",
  processPublishPost,
  {
    connection: makeConnectionOpts(),
    concurrency: 10,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  }
);

publishPostWorker.on("completed", (job) =>
  console.log(`✅ [publish-post] Job ${job.id} completado`)
);
publishPostWorker.on("failed", (job, err) => {
  console.error(`❌ [publish-post] Job ${job?.id} fallido:`, err.message);
  Sentry.captureException(err, { extra: { jobId: job?.id, postId: (job?.data as any)?.postId } });
});

console.log("🚀 Worker iniciado, esperando jobs...");

if (process.env.NODE_ENV !== "production") {
  setTimeout(async () => {
    await testQueue.add("hello", { mensaje: "Hola desde el worker!" });
    console.log("📬 Job de prueba encolado");
  }, 2000);
}

process.on("SIGTERM", async () => {
  console.log("Apagando worker...");
  await Promise.all([testWorker.close(), tokenRefreshWorker.close(), publishPostWorker.close()]);
  await redisMonitor.quit();
  process.exit(0);
});
