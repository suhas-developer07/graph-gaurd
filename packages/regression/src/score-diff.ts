import type {
  RunAggregate,
  EvaluatorAggregate,
  NodeFailureAggregate,
} from "@graphguard/evaluation";
import type { ScoreDiff, NodeScoreDiff } from "./types";

/**
 * Compute score diffs between baseline and current runs.
 * Returns absolute and relative deltas per evaluator.
 */
export function computeScoreDiffs(
  baseline: RunAggregate,
  current: RunAggregate,
): ScoreDiff[] {
  const baselineMap = new Map<string, EvaluatorAggregate>(
    baseline.evaluatorAggregates.map((e) => [e.evaluator, e]),
  );
  const currentMap = new Map<string, EvaluatorAggregate>(
    current.evaluatorAggregates.map((e) => [e.evaluator, e]),
  );

  const allEvaluators = new Set([...baselineMap.keys(), ...currentMap.keys()]);
  const diffs: ScoreDiff[] = [];

  for (const evaluator of allEvaluators) {
    const b = baselineMap.get(evaluator);
    const c = currentMap.get(evaluator);

    const baselineScore = b?.passRate ?? 0;
    const currentScore = c?.passRate ?? 0;
    const absoluteDelta = currentScore - baselineScore;
    const relativeDelta =
      baselineScore > 0
        ? (absoluteDelta / baselineScore) * 100
        : currentScore > 0
          ? 100
          : 0;

    diffs.push({
      evaluator,
      baselineScore,
      currentScore,
      absoluteDelta,
      relativeDelta,
      direction:
        Math.abs(absoluteDelta) < 0.001
          ? "unchanged"
          : absoluteDelta > 0
            ? "improved"
            : "regressed",
    });
  }

  // Sort: regressions first (most negative delta), then unchanged, then improved
  diffs.sort((a, b) => a.absoluteDelta - b.absoluteDelta);

  return diffs;
}

/**
 * Compute per-node score diffs — which nodes had more failures in the current run.
 */
export function computeNodeScoreDiffs(
  baseline: RunAggregate,
  current: RunAggregate,
): NodeScoreDiff[] {
  const baselineNodeMap = new Map<string, NodeFailureAggregate>(
    baseline.nodeFailureAggregates.map((n) => [n.nodeId, n]),
  );
  const currentNodeMap = new Map<string, NodeFailureAggregate>(
    current.nodeFailureAggregates.map((n) => [n.nodeId, n]),
  );

  const allNodes = new Set([...baselineNodeMap.keys(), ...currentNodeMap.keys()]);
  const diffs: NodeScoreDiff[] = [];

  for (const nodeId of allNodes) {
    const b = baselineNodeMap.get(nodeId);
    const c = currentNodeMap.get(nodeId);

    const baselineFailures = b?.failureCount ?? 0;
    const currentFailures = c?.failureCount ?? 0;

    // If the total failure count changed, report a diff
    if (baselineFailures !== currentFailures) {
      diffs.push({
        nodeId,
        nodeType: c?.nodeType ?? b?.nodeType ?? "unknown",
        evaluator: "all",
        baselineFailureCount: baselineFailures,
        currentFailureCount: currentFailures,
        delta: currentFailures - baselineFailures,
      });
    }
  }

  // Sort by delta descending (biggest increase in failures first)
  diffs.sort((a, b) => b.delta - a.delta);

  return diffs;
}

/**
 * Compute the overall score diff (summary).
 */
export function computeOverallDiff(
  baseline: RunAggregate,
  current: RunAggregate,
): {
  baselinePassRate: number;
  currentPassRate: number;
  absoluteDelta: number;
  relativeDelta: number;
  direction: "improved" | "regressed" | "unchanged";
} {
  const baselinePassRate = baseline.overallPassRate;
  const currentPassRate = current.overallPassRate;
  const absoluteDelta = currentPassRate - baselinePassRate;
  const relativeDelta =
    baselinePassRate > 0
      ? (absoluteDelta / baselinePassRate) * 100
      : currentPassRate > 0
        ? 100
        : 0;

  return {
    baselinePassRate,
    currentPassRate,
    absoluteDelta,
    relativeDelta,
    direction:
      Math.abs(absoluteDelta) < 0.001
        ? "unchanged"
        : absoluteDelta > 0
          ? "improved"
          : "regressed",
  };
}
