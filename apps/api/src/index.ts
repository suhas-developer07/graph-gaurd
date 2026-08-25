import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { getEnv } from "@graphguard/config";
import { testConnection, closeDb } from "@graphguard/db";
import { initTelemetry, shutdownTelemetry } from "@graphguard/observability";
import { createLogger, createQueue, QUEUE_NAMES } from "@graphguard/queue";

const logger = createLogger("graphguard-api");

async function main() {
  const env = getEnv();

  initTelemetry("graphguard-api");
  logger.info("API starting", { port: env.PORT, nodeEnv: env.NODE_ENV });

  const app = Fastify({
    logger: false, // We use our own structured logger
  });

  // ── Request ID Plugin ───────────────────────────────────────────────────
  app.addHook("onRequest", async (request) => {
    const requestId = (request.headers["x-request-id"] as string) ?? randomUUID();
    (request as unknown as { requestId: string }).requestId = requestId;
    request.headers["x-request-id"] = requestId;
  });

  app.addHook("onSend", async (request, reply) => {
    const requestId = (request as unknown as { requestId: string }).requestId;
    reply.header("x-request-id", requestId);
  });

  // ── Auth Middleware ──────────────────────────────────────────────────────
  const API_AUTH_TOKEN = process.env.API_AUTH_TOKEN;

  app.addHook("onRequest", async (request, reply) => {
    // Skip auth for health/readiness checks and non-mutation routes
    const path = request.url;
    if (
      path === "/health" ||
      path === "/ready" ||
      path.startsWith("/api/v1/graphs") && request.method === "GET" ||
      path.startsWith("/api/v1/evaluations") && request.method === "GET" ||
      path.startsWith("/api/v1/proposals") && request.method === "GET"
    ) {
      return;
    }

    // If no auth token configured, allow all (development mode)
    if (!API_AUTH_TOKEN) return;

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({
        error: "Missing or invalid Authorization header. Expected: Bearer <token>",
      });
    }

    const token = authHeader.slice(7);
    if (token !== API_AUTH_TOKEN) {
      return reply.status(403).send({ error: "Invalid API token" });
    }
  });

  // ── Rate Limiting (simple in-memory) ────────────────────────────────────
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
  const RATE_LIMIT_MAX = 60; // 60 requests per minute

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url;
    // Only rate-limit mutation routes
    if (request.method === "GET" || path === "/health" || path === "/ready") {
      return;
    }

    const clientIp = request.ip ?? "unknown";
    const now = Date.now();
    const entry = rateLimitMap.get(clientIp);

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return;
    }

    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) {
      return reply.status(429).send({
        error: "Rate limit exceeded. Try again later.",
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
    }
  });

  // ── CORS ────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: env.NODE_ENV === "development" ? true : false,
  });

  // ── Routes ──────────────────────────────────────────────────────────────
  const { registerRegressionRoutes } = await import("./routes/regressions");
  await registerRegressionRoutes(app);

  const { registerProposalRoutes } = await import("./routes/proposals");
  await registerProposalRoutes(app);

  // Evaluation run routes (enqueue to BullMQ)
  const evaluationQueue = createQueue(QUEUE_NAMES.evaluation);

  app.post<{
    Body: {
      graphVersionId: string;
      datasetId: string;
      testCaseIds: string[];
      baselineRunId?: string;
    };
  }>("/api/v1/evaluations/runs", async (request, reply) => {
    const { graphVersionId, datasetId, testCaseIds, baselineRunId } = request.body;
    const requestId = (request as unknown as { requestId: string }).requestId;

    if (!graphVersionId || !datasetId || !testCaseIds?.length) {
      return reply.status(400).send({
        error: "Missing required fields: graphVersionId, datasetId, testCaseIds",
      });
    }

    const runId = `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

    // Enqueue evaluation run job
    await evaluationQueue.add("evaluation-run", {
      type: "evaluation_run",
      jobId: `eval-run-${runId}`,
      requestId,
      runId,
      graphVersionId,
      datasetId,
      testCaseIds,
      baselineRunId,
    }, {
      jobId: `eval-run-${runId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    });

    logger.info("Evaluation run enqueued", { runId, graphVersionId, requestId });

    return reply.status(202).send({
      runId,
      status: "queued",
      message: `Evaluation run ${runId} has been queued for processing.`,
      requestId,
    });
  });

  // Health check
  app.get("/health", async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.6.0",
    });
  });

  // Readiness check
  app.get("/ready", async (_request, reply) => {
    const checks: Record<string, string> = {};

    try {
      const pgOk = await testConnection(env.DATABASE_URL);
      checks.postgres = pgOk ? "ok" : "unavailable";
    } catch {
      checks.postgres = "error";
    }

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

  // ── Graceful Shutdown ───────────────────────────────────────────────────
  const shutdown = async () => {
    logger.info("Shutting down API...");
    await app.close();
    await evaluationQueue.close();
    await closeDb();
    await shutdownTelemetry();
    logger.info("API shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info("API ready", { port: env.PORT, url: `http://localhost:${env.PORT}` });
}

main().catch((err) => {
  logger.error("Failed to start API", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
