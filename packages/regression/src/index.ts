export const REGRESSION_VERSION = "0.1.0";

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  GraphDiff,
  NodeDiffSummary,
  NodeChangeDiff,
  EdgeDiffSummary,
  EdgeChangeDiff,
  FieldChange,
  SemanticChange,
  ScoreDiff,
  NodeScoreDiff,
  Regression,
  RegressionSeverity,
  RegressionEvidence,
  FailureCluster,
  GateStatus,
  GateResult,
  GraphVersionInput,
  AnalysisInput,
} from "./types";

// ─── Graph Diff ──────────────────────────────────────────────────────────────
export {
  computeGraphDiff,
  getChangedNodeIds,
  getSemanticChangeNodeIds,
} from "./graph-diff";

// ─── Score Diff ──────────────────────────────────────────────────────────────
export {
  computeScoreDiffs,
  computeNodeScoreDiffs,
  computeOverallDiff,
} from "./score-diff";

// ─── Thresholds ──────────────────────────────────────────────────────────────
export {
  DEFAULT_REGRESSION_THRESHOLDS,
  classifyRegressionSeverity,
  determineGateStatus,
  type RegressionThresholds,
  type EvaluatorThreshold,
  type OverallThresholds,
} from "./thresholds";

// ─── Clustering ──────────────────────────────────────────────────────────────
export {
  findNewlyFailing,
  clusterFailures,
  buildRegressions,
} from "./clustering";

// ─── Root Cause ──────────────────────────────────────────────────────────────
export {
  analyzeRootCauses,
  type RootCauseAnalysis,
} from "./root-cause";

// ─── Release Gate ────────────────────────────────────────────────────────────
export {
  runAnalysis,
  runReleaseGate,
} from "./release-gate";
