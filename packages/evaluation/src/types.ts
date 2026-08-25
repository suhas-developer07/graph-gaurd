// ─── Evaluator Interface ─────────────────────────────────────────────────────

/** The result of evaluating a single test case against a single evaluator */
export interface EvaluationResult {
  /** Evaluator name (e.g., "RoutingEvaluator") */
  evaluator: string;
  /** Normalized score on a 0-1 scale */
  score: number;
  /** Whether the evaluator considers this a pass */
  passed: boolean;
  /** Human-readable explanation of the result */
  explanation: string;
  /** Specific evidence snippets cited (if applicable) */
  evidenceSnippets?: string[];
  /** Evaluator confidence (0-1) — how confident the evaluator is in its own judgment */
  confidence: number;
  /** Whether the evaluator's output required a retry or had issues */
  cleanJudgment: boolean;
}

/** An evaluator that scores a test case against an execution trace */
export interface Evaluator {
  /** Unique name of the evaluator */
  readonly name: string;
  /** Whether this evaluator requires an LLM (for concurrency planning) */
  readonly requiresLlm: boolean;
  /** Evaluate a single test case */
  evaluate(context: EvaluationContext): Promise<EvaluationResult>;
}

/** Context passed to every evaluator */
export interface EvaluationContext {
  /** The test case being evaluated */
  testCase: TestCase;
  /** The execution result from the graph runtime */
  executionResult: GraphExecutionSnapshot;
  /** Knowledge base entries (for grounding evaluator) */
  knowledgeBase?: KnowledgeBaseEntry[];
}

/** A snapshot of the graph execution result */
export interface GraphExecutionSnapshot {
  success: boolean;
  response?: string;
  nodePath: NodePathEntry[];
  evidence: EvidenceEntry[];
  llmCalls: LLMCallSnapshot[];
  totalDurationMs: number;
  totalTokens: number;
  totalCost: number;
  error?: string;
}

/** A single node's execution in the trace */
export interface NodePathEntry {
  nodeId: string;
  nodeType: string;
  startedAt: Date;
  completedAt: Date;
  status: "success" | "error" | "skipped";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
}

/** Evidence retrieved during execution */
export interface EvidenceEntry {
  content: string;
  source: string;
  score: number;
  retrievedAt: Date;
}

/** LLM call snapshot */
export interface LLMCallSnapshot {
  provider: string;
  model: string;
  tokens: number;
  latencyMs: number;
  estimatedCost: number;
  traceId: string;
}

// ─── Test Case Types ─────────────────────────────────────────────────────────

/** A test case for evaluation */
export interface TestCase {
  id: string;
  input: string;
  expectedRoute: string;
  expectedBehavior: ExpectedBehavior;
  tags: TestCaseTags;
  datasetId: string;
}

/** Tags for a test case */
export interface TestCaseTags {
  intent: string;
  safetyClass: "benign" | "sensitive" | "must_escalate";
  difficulty: "easy" | "medium" | "hard";
  expectedEvidence?: string[];
}

/** Expected behavior for a test case */
export interface ExpectedBehavior {
  expectedRoute: string;
  shouldContain?: string[];
  shouldNotContain?: string[];
  mustEscalate?: boolean;
  expectedScore?: number;
}

// ─── Knowledge Base ──────────────────────────────────────────────────────────

/** A knowledge base entry */
export interface KnowledgeBaseEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  source: string;
  embedding?: number[];
}

// ─── Aggregation Types ───────────────────────────────────────────────────────

/** Per-case aggregate result */
export interface CaseAggregate {
  caseId: string;
  passed: boolean;
  score: number;
  evaluatorResults: EvaluationResult[];
}

/** Per-evaluator aggregate result */
export interface EvaluatorAggregate {
  evaluator: string;
  passRate: number;
  averageScore: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
}

/** Per-node failure analysis */
export interface NodeFailureAggregate {
  nodeId: string;
  nodeType: string;
  failureCount: number;
  associatedEvaluators: string[];
}

/** Run-level aggregate */
export interface RunAggregate {
  runId: string;
  graphVersionId: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  overallPassRate: number;
  overallScore: number;
  caseAggregates: CaseAggregate[];
  evaluatorAggregates: EvaluatorAggregate[];
  nodeFailureAggregates: NodeFailureAggregate[];
  timestamp: Date;
}

// ─── Config ──────────────────────────────────────────────────────────────────

/** Evaluator pass/fail thresholds */
export const EVALUATOR_THRESHOLDS = {
  routing: 1.0, // Routing must be exactly correct
  grounding: 0.7, // 70% similarity threshold
  compliance: 1.0, // Binary — compliance is pass/fail
  escalation: 1.0, // Must escalate when expected
  responseQuality: 0.6, // 60% quality threshold
} as const;

/** Score normalization helper */
export function normalizeScore(score: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, (score - min) / (max - min)));
}

/** Check if a score passes the threshold */
export function passesThreshold(score: number, threshold: number): boolean {
  return score >= threshold;
}
