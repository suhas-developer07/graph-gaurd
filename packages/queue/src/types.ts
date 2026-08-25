// ─── Job Types ───────────────────────────────────────────────────────────────

/**
 * Base job data — every job has these fields.
 */
export interface BaseJobData {
  /** Unique job ID for idempotency */
  jobId: string;
  /** Request ID for tracing */
  requestId: string;
  /** Trace ID for OpenTelemetry */
  traceId?: string;
}

/**
 * Evaluation run job — processes a batch of test cases.
 */
export interface EvaluationRunJobData extends BaseJobData {
  type: "evaluation_run";
  /** The evaluation run ID */
  runId: string;
  /** Graph version ID to evaluate */
  graphVersionId: string;
  /** Dataset ID (evaluation or canary) */
  datasetId: string;
  /** Test case IDs to process (batch) */
  testCaseIds: string[];
  /** Baseline run ID for comparison */
  baselineRunId?: string;
}

/**
 * Single test case evaluation job.
 */
export interface TestCaseEvaluationJobData extends BaseJobData {
  type: "test_case_evaluation";
  /** The evaluation run ID */
  runId: string;
  /** Graph version ID */
  graphVersionId: string;
  /** Test case ID */
  testCaseId: string;
  /** Dataset ID */
  datasetId: string;
}

/**
 * Proposal validation job.
 */
export interface ProposalValidationJobData extends BaseJobData {
  type: "proposal_validation";
  /** Proposal ID */
  proposalId: string;
  /** Graph version ID of the proposal */
  proposalGraphVersionId: string;
  /** Baseline graph version ID */
  baselineGraphVersionId: string;
  /** Baseline run ID */
  baselineRunId: string;
  /** Whether to run canary validation */
  runCanary: boolean;
  /** Canary run ID (if canary validation is needed) */
  canaryRunId?: string;
}

/**
 * Proposal generation job.
 */
export interface ProposalGenerationJobData extends BaseJobData {
  type: "proposal_generation";
  /** Regression ID to fix */
  regressionId: string;
  /** Target node */
  targetNode: string;
  /** Change type */
  changeType: "prompt" | "activation_config";
  /** Current prompt (for prompt changes) */
  currentPrompt?: string;
  /** Current activation config (for config changes) */
  currentActivationConfig?: Record<string, unknown>;
  /** Failure cluster details */
  failureCluster: {
    clusterKey: string;
    failureCount: number;
    evaluators: string[];
    caseIds: string[];
    commonTags: Record<string, string>;
  };
  /** Sample failing inputs */
  sampleFailingInputs: string[];
}

/**
 * Union of all job types.
 */
export type QueueJobData =
  | EvaluationRunJobData
  | TestCaseEvaluationJobData
  | ProposalValidationJobData
  | ProposalGenerationJobData;

// ─── Queue Names ─────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  evaluation: "graphguard:evaluation",
  proposals: "graphguard:proposals",
} as const;

// ─── Job Results ─────────────────────────────────────────────────────────────

/**
 * Result of processing a test case evaluation job.
 */
export interface TestCaseEvaluationResult {
  testCaseId: string;
  evaluator: string;
  passed: boolean;
  score: number;
  explanation: string;
}

/**
 * Result of processing an evaluation run job.
 */
export interface EvaluationRunResult {
  runId: string;
  totalCases: number;
  completedCases: number;
  failedCases: number;
  status: "completed" | "failed" | "partial";
}
