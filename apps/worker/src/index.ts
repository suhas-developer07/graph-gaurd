import { getEnv } from "@graphguard/config";
import { testConnection, closeDb } from "@graphguard/db";
import { initTelemetry, shutdownTelemetry } from "@graphguard/observability";
import {
  createWorker,
  createQueue,
  QUEUE_NAMES,
  idempotencyKey,
  isAlreadyProcessed,
  markAsProcessed,
  createLogger,
  type TestCaseEvaluationJobData,
  type EvaluationRunJobData,
  type ProposalValidationJobData,
  type ProposalGenerationJobData,
} from "@graphguard/queue";
import type { Worker } from "bullmq";

const logger = createLogger("graphguard-worker");

async function main() {
  const env = getEnv();

  // Initialize OpenTelemetry
  initTelemetry("graphguard-worker");
  logger.info("Worker starting");

  // Verify database connectivity
  const pgOk = await testConnection(env.DATABASE_URL);
  if (!pgOk) {
    throw new Error("Cannot connect to PostgreSQL");
  }
  logger.info("PostgreSQL connected");

  // Verify Redis connectivity
  try {
    const redis = await import("redis");
    const client = redis.createClient({ url: env.REDIS_URL });
    await client.connect();
    await client.ping();
    await client.disconnect();
    logger.info("Redis connected");
  } catch {
    throw new Error("Cannot connect to Redis");
  }

  // ── Create Queues ───────────────────────────────────────────────────────
  const evaluationQueue = createQueue(QUEUE_NAMES.evaluation);
  const proposalsQueue = createQueue(QUEUE_NAMES.proposals);

  // ── Create Workers ──────────────────────────────────────────────────────
  const workers: Worker[] = [];

  // Worker 1: Test case evaluation jobs
  const testCaseWorker = createWorker<TestCaseEvaluationJobData>(
    QUEUE_NAMES.evaluation,
    async (job) => {
      const { runId, testCaseId, graphVersionId, requestId, traceId } = job.data;

      const iKey = idempotencyKey("tc-eval", runId, testCaseId);
      if (isAlreadyProcessed(iKey)) {
        logger.info("Job already processed (idempotent skip)", { jobId: job.id, runId, testCaseId });
        return { skipped: true };
      }

      logger.info("Processing test case evaluation", {
        jobId: job.id,
        runId,
        testCaseId,
        graphVersionId,
        requestId,
        traceId,
      });

      try {
        // TODO: Wire up actual graph execution and evaluation
        // For now, record that this job was processed
        markAsProcessed(iKey);

        logger.info("Test case evaluation completed", {
          jobId: job.id,
          runId,
          testCaseId,
        });

        return { success: true, testCaseId };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error("Test case evaluation failed", {
          jobId: job.id,
          runId,
          testCaseId,
          error: errorMsg,
        });
        throw error; // BullMQ will retry
      }
    },
    {
      concurrency: 5,
      limiter: {
        max: 30, // 30 jobs per minute (Groq free-tier limit)
        duration: 60_000,
      },
    },
  );
  workers.push(testCaseWorker);

  // Worker 2: Evaluation run aggregation jobs
  const runWorker = createWorker<EvaluationRunJobData>(
    QUEUE_NAMES.evaluation,
    async (job) => {
      const { runId, graphVersionId, datasetId, testCaseIds, requestId } = job.data;

      logger.info("Processing evaluation run aggregation", {
        jobId: job.id,
        runId,
        graphVersionId,
        testCaseCount: testCaseIds.length,
        requestId,
      });

      try {
        // Enqueue individual test case jobs
        for (const testCaseId of testCaseIds) {
          const tcJobData: TestCaseEvaluationJobData = {
            type: "test_case_evaluation",
            jobId: idempotencyKey("tc", runId, testCaseId),
            requestId,
            runId,
            graphVersionId,
            testCaseId,
            datasetId,
          };
          await evaluationQueue.add("test-case-eval", tcJobData, {
            jobId: tcJobData.jobId, // BullMQ idempotency
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 2000,
            },
          });
        }

        logger.info("Enqueued test case jobs", {
          jobId: job.id,
          runId,
          count: testCaseIds.length,
        });

        return { enqueued: testCaseIds.length };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error("Evaluation run aggregation failed", {
          jobId: job.id,
          runId,
          error: errorMsg,
        });
        throw error;
      }
    },
    { concurrency: 2 },
  );
  workers.push(runWorker);

  // Worker 3: Proposal validation jobs
  const proposalWorker = createWorker<ProposalValidationJobData>(
    QUEUE_NAMES.proposals,
    async (job) => {
      const { proposalId, requestId } = job.data;

      logger.info("Processing proposal validation", {
        jobId: job.id,
        proposalId,
        requestId,
      });

      try {
        // TODO: Wire up actual proposal validation pipeline
        logger.info("Proposal validation completed", {
          jobId: job.id,
          proposalId,
        });

        return { success: true, proposalId };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error("Proposal validation failed", {
          jobId: job.id,
          proposalId,
          error: errorMsg,
        });
        throw error;
      }
    },
    { concurrency: 2 },
  );
  workers.push(proposalWorker);

  // Worker 4: Proposal generation jobs
  const generationWorker = createWorker<ProposalGenerationJobData>(
    QUEUE_NAMES.proposals,
    async (job) => {
      const { regressionId, targetNode, requestId } = job.data;

      logger.info("Processing proposal generation", {
        jobId: job.id,
        regressionId,
        targetNode,
        requestId,
      });

      try {
        // TODO: Wire up actual LLM-based proposal generation
        logger.info("Proposal generation completed", {
          jobId: job.id,
          regressionId,
        });

        return { success: true, regressionId };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error("Proposal generation failed", {
          jobId: job.id,
          regressionId,
          error: errorMsg,
        });
        throw error;
      }
    },
    { concurrency: 1 },
  );
  workers.push(generationWorker);

  logger.info("All workers started", { workerCount: workers.length });

  // ── Graceful Shutdown ───────────────────────────────────────────────────
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info("Shutting down worker...");

    // Close all workers (let in-flight jobs finish)
    await Promise.all(workers.map((w) => w.close()));
    logger.info("Workers closed");

    // Close queues
    await evaluationQueue.close();
    await proposalsQueue.close();
    logger.info("Queues closed");

    await closeDb();
    await shutdownTelemetry();
    logger.info("Worker shutdown complete");

    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Worker ready", {
    queues: [QUEUE_NAMES.evaluation, QUEUE_NAMES.proposals],
  });
}

main().catch((err) => {
  logger.error("Failed to start worker", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
