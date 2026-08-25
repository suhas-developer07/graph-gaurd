export const QUEUE_VERSION = "0.1.0";

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  BaseJobData,
  EvaluationRunJobData,
  TestCaseEvaluationJobData,
  ProposalValidationJobData,
  ProposalGenerationJobData,
  QueueJobData,
  TestCaseEvaluationResult,
  EvaluationRunResult,
} from "./types";

export { QUEUE_NAMES } from "./types";

// ─── Connection ──────────────────────────────────────────────────────────────
export { createQueue, createWorker } from "./connection";

// ─── Idempotency ────────────────────────────────────────────────────────────
export {
  idempotencyKey,
  isAlreadyProcessed,
  markAsProcessed,
  clearProcessedCache,
} from "./idempotency";

// ─── Rate Limiter ────────────────────────────────────────────────────────────
export { RateLimiter, groqRateLimiter, geminiRateLimiter } from "./rate-limiter";

// ─── Logger ──────────────────────────────────────────────────────────────────
export { createLogger, type Logger } from "./logger";
