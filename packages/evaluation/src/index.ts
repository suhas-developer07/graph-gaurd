export const EVALUATION_VERSION = "0.1.0";

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  TestCase,
  TestCaseTags,
  ExpectedBehavior,
  EvaluationResult,
  Evaluator,
  EvaluationContext,
  GraphExecutionSnapshot,
  NodePathEntry,
  EvidenceEntry,
  LLMCallSnapshot,
  KnowledgeBaseEntry,
  CaseAggregate,
  EvaluatorAggregate,
  NodeFailureAggregate,
  RunAggregate,
} from "./types";

// ─── Evaluators ──────────────────────────────────────────────────────────────
export {
  RoutingEvaluator,
  GroundingEvaluator,
  ComplianceSafetyEvaluator,
  EscalationEvaluator,
  ResponseQualityEvaluator,
  LatencyEvaluator,
  TokenUsageEvaluator,
  CostEvaluator,
} from "./evaluators";

// ─── Scoring & Aggregation ───────────────────────────────────────────────────
export {
  aggregateRun,
  diffAggregations,
  THRESHOLDS,
  type TestCaseResults,
  type AggregationDiff,
} from "./scoring";

// ─── Runner ──────────────────────────────────────────────────────────────────
export {
  runEvaluation,
  createRunId,
  splitDataset,
  type ExecuteGraphFn,
  type EvaluationRunnerOptions,
  type RunResult,
} from "./runner";

// ─── KB Loader ───────────────────────────────────────────────────────────────
export {
  loadKBFromSeed,
  generateInsertSQL,
  type KBSnippet,
} from "./kb-loader";

// ─── Test Generator ──────────────────────────────────────────────────────────
export {
  generateTestDataset,
  type GeneratedTestCase,
} from "./test-generator";
