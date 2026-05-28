import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith("rediss://") ? {} : undefined,
});

connection.on("connect", () => console.log("✅ Redis connected"));
connection.on("error", (err) => console.error("❌ Redis error:", err.message));

const testQueue = new Queue("test-queue", { connection });

const worker = new Worker(
  "test-queue",
  async (job) => {
    console.log(`[worker] Procesando job ${job.id}:`, job.data);
    await new Promise((r) => setTimeout(r, 200));
    console.log(`[worker] Job ${job.id} completado`);
    return { ok: true };
  },
  { connection, concurrency: 5 }
);

worker.on("completed", (job) => console.log(`✅ Job ${job.id} completado`));
worker.on("failed", (job, err) =>
  console.error(`❌ Job ${job?.id} fallido:`, err.message)
);

console.log("🚀 Worker iniciado, esperando jobs...");

if (process.env.NODE_ENV !== "production") {
  setTimeout(async () => {
    await testQueue.add("hello", { mensaje: "Hola desde el worker!" });
    console.log("📬 Job de prueba encolado");
  }, 2000);
}

process.on("SIGTERM", async () => {
  console.log("Apagando worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});
