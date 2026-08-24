import { getEnv } from "@graphguard/config";
import { testConnection, closeDb } from "@graphguard/db";
import { initTelemetry, shutdownTelemetry } from "@graphguard/observability";

async function main() {
  const env = getEnv();

  // Initialize OpenTelemetry
  initTelemetry("graphguard-worker");

  console.log("🔧 GraphGuard Worker starting...");

  // Verify database connectivity
  const pgOk = await testConnection(env.DATABASE_URL);
  if (!pgOk) {
    throw new Error("Cannot connect to PostgreSQL");
  }
  console.log("✅ PostgreSQL connected");

  // Verify Redis connectivity
  try {
    const redis = await import("redis");
    const client = redis.createClient({ url: env.REDIS_URL });
    await client.connect();
    await client.ping();
    await client.disconnect();
    console.log("✅ Redis connected");
  } catch (err) {
    throw new Error("Cannot connect to Redis");
  }

  console.log("🚀 GraphGuard Worker is ready. BullMQ queues will be wired in Phase 6.");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down worker...");
    await closeDb();
    await shutdownTelemetry();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("❌ Failed to start worker:", err);
  process.exit(1);
});
