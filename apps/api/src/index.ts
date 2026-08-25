import Fastify from "fastify";
import cors from "@fastify/cors";
import { getEnv } from "@graphguard/config";
import { testConnection, closeDb } from "@graphguard/db";
import { initTelemetry, shutdownTelemetry } from "@graphguard/observability";

async function main() {
  // Validate environment variables at startup (fail fast)
  const env = getEnv();

  // Initialize OpenTelemetry
  initTelemetry("graphguard-api");

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  // Enable CORS for the Next.js dashboard
  await app.register(cors, {
    origin: env.NODE_ENV === "development" ? true : false,
  });

  // Register regression and release gate routes
  const { registerRegressionRoutes } = await import("./routes/regressions");
  await registerRegressionRoutes(app);

  // Health check - process is alive
  app.get("/health", async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness check - process is alive AND can reach Postgres + Redis
  app.get("/ready", async (_request, reply) => {
    const checks: Record<string, string> = {};

    // Check Postgres
    try {
      const pgOk = await testConnection(env.DATABASE_URL);
      checks.postgres = pgOk ? "ok" : "unavailable";
    } catch {
      checks.postgres = "error";
    }

    // Check Redis
    try {
      const redis = await import("redis");
      const client = redis.createClient({ url: env.REDIS_URL });
      await client.connect();
      await client.ping();
      await client.disconnect();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }

    const allOk = Object.values(checks).every((v) => v === "ok");

    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? "ok" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info("Shutting down...");
    await app.close();
    await closeDb();
    await shutdownTelemetry();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Start server
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`🚀 GraphGuard API running on http://localhost:${env.PORT}`);
}

main().catch((err) => {
  console.error("❌ Failed to start API:", err);
  process.exit(1);
});
