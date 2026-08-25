import type {
  GateResult,
  GateStatus,
  Regression,
  GraphDiff,
  ScoreDiff,
  NodeScoreDiff,
  AnalysisInput,
} from "./types";
import { DEFAULT_REGRESSION_THRESHOLDS, type RegressionThresholds } from "./thresholds";
import { computeGraphDiff } from "./graph-diff";
import { computeScoreDiffs, computeNodeScoreDiffs } from "./score-diff";
import { findNewlyFailing, clusterFailures, buildRegressions } from "./clustering";
import { analyzeRootCauses, type RootCauseAnalysis } from "./root-cause";

export { type RootCauseAnalysis };

/**
 * Run the full regression analysis pipeline.
 */
export function runAnalysis(
  input: AnalysisInput,
  _thresholds: RegressionThresholds = DEFAULT_REGRESSION_THRESHOLDS,
): {
  regressions: Regression[];
  graphDiff: GraphDiff;
  scoreDiffs: ScoreDiff[];
  nodeScoreDiffs: NodeScoreDiff[];
  rootCauses: RootCauseAnalysis[];
} {
  const { baselineRun, currentRun, baselineGraph, currentGraph } = input;

  // 1. Compute graph diff
  const graphDiff = computeGraphDiff(baselineGraph, currentGraph);

  // 2. Compute score diffs
  const scoreDiffs = computeScoreDiffs(
    baselineRun.aggregates,
    currentRun.aggregates,
  );
  const nodeScoreDiffs = computeNodeScoreDiffs(
    baselineRun.aggregates,
    currentRun.aggregates,
  );

  // 3. Find newly failing cases
  const newlyFailing = findNewlyFailing(
    baselineRun.caseResults,
    currentRun.caseResults,
  );

  // 4. Cluster failures
  const clusters = clusterFailures(newlyFailing);

  // 5. Build regression objects
  const regressions = buildRegressions(
    clusters,
    baselineRun.aggregates,
    currentRun.aggregates,
    graphDiff,
  );

  // 6. Analyze root causes
  const rootCauses = analyzeRootCauses(
    regressions,
    graphDiff,
    baselineRun.aggregates,
    currentRun.aggregates,
  );

  // Attach root causes to regressions
  for (const regression of regressions) {
    const rootCause = rootCauses.find((rc) => rc.regressionId === regression.id);
    if (rootCause) {
      regression.cause += ` [Root cause: ${rootCause.likelyCauseChange} (confidence: ${(rootCause.confidence * 100).toFixed(0)}%)]`;
    }
  }

  return {
    regressions,
    graphDiff,
    scoreDiffs,
    nodeScoreDiffs,
    rootCauses,
  };
}

/**
 * Run the release gate — determines PASS/WARN/BLOCK.
 */
export function runReleaseGate(
  input: AnalysisInput,
  thresholds: RegressionThresholds = DEFAULT_REGRESSION_THRESHOLDS,
): GateResult {
  const { regressions, graphDiff, scoreDiffs, nodeScoreDiffs } =
    runAnalysis(input, thresholds);

  // Determine gate status
  const status = determineGateStatusFromRegressions(
    regressions,
    scoreDiffs,
    thresholds,
  );

  const summary = buildGateSummary(
    status,
    regressions,
    scoreDiffs,
    input,
  );

  return {
    status,
    graphVersionId: input.currentRun.graphVersionId,
    baselineRunId: input.baselineRun.id,
    currentRunId: input.currentRun.id,
    regressions,
    scoreDiffs,
    nodeScoreDiffs,
    graphDiff,
    summary,
    timestamp: new Date(),
  };
}

/**
 * Determine gate status from regressions and score diffs.
 */
function determineGateStatusFromRegressions(
  regressions: Regression[],
  scoreDiffs: ScoreDiff[],
  thresholds: RegressionThresholds,
): GateStatus {
  // Any critical regression = BLOCK
  if (regressions.some((r) => r.severity === "critical")) {
    return "block";
  }

  // Any high severity regression = BLOCK
  if (regressions.some((r) => r.severity === "high")) {
    return "block";
  }

  // Check per-evaluator thresholds
  for (const diff of scoreDiffs) {
    const evalThreshold = thresholds.evaluatorThresholds[diff.evaluator];
    if (!evalThreshold) continue;

    if (
      diff.absoluteDelta <= -evalThreshold.blockAbsolute ||
      diff.relativeDelta <= -evalThreshold.blockRelative
    ) {
      return "block";
    }
    if (
      diff.absoluteDelta <= -evalThreshold.warnAbsolute ||
      diff.relativeDelta <= -evalThreshold.warnRelative
    ) {
      return "warn";
    }
  }

  // Any medium severity regression = WARN
  if (regressions.some((r) => r.severity === "medium")) {
    return "warn";
  }

  return "pass";
}

/**
 * Build a human-readable summary of the gate result.
 */
function buildGateSummary(
  status: GateStatus,
  regressions: Regression[],
  scoreDiffs: ScoreDiff[],
  input: AnalysisInput,
): string {
  const lines: string[] = [];

  const statusEmoji =
    status === "pass" ? "✅" : status === "warn" ? "⚠️" : "🛑";
  lines.push(
    `${statusEmoji} Gate: ${status.toUpperCase()} — ${input.currentRun.graphVersionId}`,
  );

  if (regressions.length === 0) {
    lines.push("No regressions detected.");
  } else {
    lines.push(`${regressions.length} regression(s) detected:`);
    for (const reg of regressions) {
      lines.push(
        `  [${reg.severity.toUpperCase()}] ${reg.cause.slice(0, 120)}`,
      );
    }
  }

  // Show significant score diffs
  const significantDiffs = scoreDiffs.filter(
    (d) => d.direction === "regressed",
  );
  if (significantDiffs.length > 0) {
    lines.push("Score changes:");
    for (const diff of significantDiffs) {
      lines.push(
        `  ${diff.evaluator}: ${(diff.baselineScore * 100).toFixed(1)}% → ${(diff.currentScore * 100).toFixed(1)}% (${(diff.absoluteDelta * 100).toFixed(1)}pp)`,
      );
    }
  }

  return lines.join("\n");
}
