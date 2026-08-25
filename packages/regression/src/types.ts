// ─── Graph Diff Types ────────────────────────────────────────────────────────

export interface GraphDiff {
  /** The two version IDs being compared */
  baselineVersionId: string;
  currentVersionId: string;
  /** Nodes added in current (not in baseline) */
  nodesAdded: NodeDiffSummary[];
  /** Nodes removed in current (were in baseline) */
  nodesRemoved: NodeDiffSummary[];
  /** Nodes that exist in both but changed */
  nodesChanged: NodeChangeDiff[];
  /** Edges added in current */
  edgesAdded: EdgeDiffSummary[];
  /** Edges removed in current */
  edgesRemoved: EdgeDiffSummary[];
  /** Edges that changed (source/target/condition) */
  edgesChanged: EdgeChangeDiff[];
  /** Semantic config changes — prompts, activation criteria, routing rules */
  semanticChanges: SemanticChange[];
}

export interface NodeDiffSummary {
  nodeId: string;
  nodeType: string;
}

export interface NodeChangeDiff {
  nodeId: string;
  nodeType: string;
  /** Which fields changed */
  changes: FieldChange[];
}

export interface EdgeDiffSummary {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface EdgeChangeDiff {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  changes: FieldChange[];
}

export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface SemanticChange {
  nodeId: string;
  nodeType: string;
  changeType: "prompt" | "activation_config" | "routing_rules" | "model" | "other";
  description: string;
  oldValue: unknown;
  newValue: unknown;
}

// ─── Score Diff Types ────────────────────────────────────────────────────────

export interface ScoreDiff {
  evaluator: string;
  baselineScore: number;
  currentScore: number;
  /** Absolute difference (current - baseline) */
  absoluteDelta: number;
  /** Relative difference (as percentage, e.g. -13.8 means 13.8% drop) */
  relativeDelta: number;
  direction: "improved" | "regressed" | "unchanged";
}

export interface NodeScoreDiff {
  nodeId: string;
  nodeType: string;
  evaluator: string;
  baselineFailureCount: number;
  currentFailureCount: number;
  delta: number;
}

// ─── Regression Types ────────────────────────────────────────────────────────

export type RegressionSeverity = "low" | "medium" | "high" | "critical";

export interface Regression {
  id: string;
  severity: RegressionSeverity;
  /** The evaluator that detected this regression */
  evaluator: string;
  /** The node most strongly associated with this regression */
  affectedNode: string;
  /** Human-readable explanation of the root cause */
  cause: string;
  /** Structured evidence backing the claim */
  evidence: RegressionEvidence;
  /** Newly failing test case IDs */
  affectedCases: string[];
}

export interface RegressionEvidence {
  /** The graph diff that correlates with this regression */
  graphDiff?: GraphDiff;
  /** Score diffs for this evaluator */
  scoreDiffs: ScoreDiff[];
  /** Failure cluster info */
  cluster: FailureCluster;
  /** Which nodes changed between baseline and current */
  changedNodes: string[];
}

export interface FailureCluster {
  /** Grouping key (e.g. "node:dosage_specialist" or "intent:dosage_question") */
  clusterKey: string;
  /** Number of newly failing cases in this cluster */
  failureCount: number;
  /** The evaluator(s) that failed these cases */
  evaluators: string[];
  /** Test case IDs in this cluster */
  caseIds: string[];
  /** Common tags (intent, safetyClass, difficulty) */
  commonTags: Record<string, string>;
}

// ─── Release Gate Types ──────────────────────────────────────────────────────

export type GateStatus = "pass" | "warn" | "block";

export interface GateResult {
  status: GateStatus;
  /** The graph version being gated */
  graphVersionId: string;
  /** Baseline run ID */
  baselineRunId: string;
  /** Current run ID */
  currentRunId: string;
  /** All regressions detected */
  regressions: Regression[];
  /** Score diffs per evaluator */
  scoreDiffs: ScoreDiff[];
  /** Node score diffs */
  nodeScoreDiffs: NodeScoreDiff[];
  /** The graph structural diff */
  graphDiff: GraphDiff;
  /** Human-readable summary */
  summary: string;
  /** Timestamp of the gate check */
  timestamp: Date;
}

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface GraphVersionInput {
  id: string;
  nodes: Array<{
    id: string;
    type: string;
    prompt: string;
    activationConfig: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    condition: Record<string, unknown> | null;
  }>;
}

export interface AnalysisInput {
  baselineRun: {
    id: string;
    graphVersionId: string;
    aggregates: import("@graphguard/evaluation").RunAggregate;
    caseResults: Array<{
      testCaseId: string;
      evaluator: string;
      passed: boolean;
      score: number;
    }>;
  };
  currentRun: {
    id: string;
    graphVersionId: string;
    aggregates: import("@graphguard/evaluation").RunAggregate;
    caseResults: Array<{
      testCaseId: string;
      evaluator: string;
      passed: boolean;
      score: number;
    }>;
  };
  baselineGraph: GraphVersionInput;
  currentGraph: GraphVersionInput;
}
