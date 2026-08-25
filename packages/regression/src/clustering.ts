import type {
  FailureCluster,
  Regression,
  RegressionSeverity,
  RegressionEvidence,
  GraphDiff,
} from "./types";
import { classifyRegressionSeverity } from "./thresholds";
import { getSemanticChangeNodeIds } from "./graph-diff";
import type { RunAggregate } from "@graphguard/evaluation";

interface CaseResult {
  testCaseId: string;
  evaluator: string;
  passed: boolean;
  score: number;
  tags?: Record<string, string>;
  nodeIds?: string[];
}

/**
 * Identify newly failing cases (passed at baseline, failing now).
 */
export function findNewlyFailing(
  baselineResults: CaseResult[],
  currentResults: CaseResult[],
): CaseResult[] {
  const baselinePassMap = new Map<string, boolean>();
  for (const r of baselineResults) {
    baselinePassMap.set(`${r.testCaseId}::${r.evaluator}`, r.passed);
  }

  const newlyFailing: CaseResult[] = [];
  for (const r of currentResults) {
    const key = `${r.testCaseId}::${r.evaluator}`;
    const baselinePassed = baselinePassMap.get(key);
    if (baselinePassed === true && !r.passed) {
      newlyFailing.push(r);
    }
  }

  return newlyFailing;
}

/**
 * Cluster newly failing cases by multiple dimensions.
 */
export function clusterFailures(
  newlyFailing: CaseResult[],
): FailureCluster[] {
  const clusters: FailureCluster[] = [];

  // Cluster by node
  const byNode = new Map<string, CaseResult[]>();
  for (const r of newlyFailing) {
    const nodeIds = r.nodeIds ?? [];
    for (const nodeId of nodeIds) {
      if (!byNode.has(nodeId)) byNode.set(nodeId, []);
      byNode.get(nodeId)!.push(r);
    }
  }

  for (const [nodeId, cases] of byNode) {
    const evaluatorSet = new Set(cases.map((c) => c.evaluator));
    clusters.push({
      clusterKey: `node:${nodeId}`,
      failureCount: cases.length,
      evaluators: [...evaluatorSet],
      caseIds: cases.map((c) => c.testCaseId),
      commonTags: extractCommonTags(cases),
    });
  }

  // Cluster by intent
  const byIntent = new Map<string, CaseResult[]>();
  for (const r of newlyFailing) {
    const intent = r.tags?.intent ?? "unknown";
    if (!byIntent.has(intent)) byIntent.set(intent, []);
    byIntent.get(intent)!.push(r);
  }

  for (const [intent, cases] of byIntent) {
    const evaluatorSet = new Set(cases.map((c) => c.evaluator));
    clusters.push({
      clusterKey: `intent:${intent}`,
      failureCount: cases.length,
      evaluators: [...evaluatorSet],
      caseIds: cases.map((c) => c.testCaseId),
      commonTags: extractCommonTags(cases),
    });
  }

  // Cluster by evaluator
  const byEvaluator = new Map<string, CaseResult[]>();
  for (const r of newlyFailing) {
    if (!byEvaluator.has(r.evaluator)) byEvaluator.set(r.evaluator, []);
    byEvaluator.get(r.evaluator)!.push(r);
  }

  for (const [evaluator, cases] of byEvaluator) {
    clusters.push({
      clusterKey: `evaluator:${evaluator}`,
      failureCount: cases.length,
      evaluators: [evaluator],
      caseIds: cases.map((c) => c.testCaseId),
      commonTags: extractCommonTags(cases),
    });
  }

  // Cluster by safety class
  const bySafetyClass = new Map<string, CaseResult[]>();
  for (const r of newlyFailing) {
    const safetyClass = r.tags?.safetyClass ?? "unknown";
    if (!bySafetyClass.has(safetyClass)) bySafetyClass.set(safetyClass, []);
    bySafetyClass.get(safetyClass)!.push(r);
  }

  for (const [safetyClass, cases] of bySafetyClass) {
    const evaluatorSet = new Set(cases.map((c) => c.evaluator));
    clusters.push({
      clusterKey: `safetyClass:${safetyClass}`,
      failureCount: cases.length,
      evaluators: [...evaluatorSet],
      caseIds: cases.map((c) => c.testCaseId),
      commonTags: extractCommonTags(cases),
    });
  }

  return clusters;
}

/**
 * Extract common tags across a set of cases.
 */
function extractCommonTags(cases: CaseResult[]): Record<string, string> {
  if (cases.length === 0) return {};

  const tagCounts = new Map<string, Map<string, number>>();

  for (const c of cases) {
    const tags = c.tags ?? {};
    for (const [key, value] of Object.entries(tags)) {
      if (!tagCounts.has(key)) tagCounts.set(key, new Map());
      const valueMap = tagCounts.get(key)!;
      valueMap.set(value, (valueMap.get(value) ?? 0) + 1);
    }
  }

  const common: Record<string, string> = {};
  for (const [key, valueMap] of tagCounts) {
    let maxCount = 0;
    let maxValue = "";
    for (const [value, count] of valueMap) {
      if (count > maxCount) {
        maxCount = count;
        maxValue = value;
      }
    }
    if (maxCount > cases.length * 0.5) {
      common[key] = maxValue;
    }
  }

  return common;
}

/**
 * Build regression objects from clusters, correlating with graph diff.
 */
export function buildRegressions(
  clusters: FailureCluster[],
  baseline: RunAggregate,
  current: RunAggregate,
  graphDiff?: GraphDiff,
): Regression[] {
  const regressions: Regression[] = [];
  const changedNodeIds = graphDiff ? getSemanticChangeNodeIds(graphDiff) : [];

  for (const cluster of clusters) {
    let worstSeverity: RegressionSeverity = "low";

    for (const evaluator of cluster.evaluators) {
      const baselineEvAgg = baseline.evaluatorAggregates.find(
        (e: { evaluator: string }) => e.evaluator === evaluator,
      );
      const currentEvAgg = current.evaluatorAggregates.find(
        (e: { evaluator: string }) => e.evaluator === evaluator,
      );

      const baselineRate = baselineEvAgg?.passRate ?? 1;
      const currentRate = currentEvAgg?.passRate ?? 1;
      const absoluteDelta = currentRate - baselineRate;
      const relativeDelta =
        baselineRate > 0 ? (absoluteDelta / baselineRate) * 100 : 0;

      const severity = classifyRegressionSeverity(
        evaluator,
        absoluteDelta,
        relativeDelta,
      );

      const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      if (severityOrder[severity] > severityOrder[worstSeverity]) {
        worstSeverity = severity;
      }
    }

    let affectedNode = "unknown";
    if (cluster.clusterKey.startsWith("node:")) {
      affectedNode = cluster.clusterKey.slice(5);
    } else if (changedNodeIds.length > 0) {
      affectedNode = changedNodeIds[0]!;
    }

    const cause = buildCauseExplanation(cluster, changedNodeIds, graphDiff);

    const scoreDiffs = computeClusterScoreDiffs(
      cluster.evaluators,
      baseline,
      current,
    );

    const evidence: RegressionEvidence = {
      cluster,
      scoreDiffs,
      changedNodes: changedNodeIds,
    };

    if (graphDiff) {
      evidence.graphDiff = graphDiff;
    }

    regressions.push({
      id: `reg-${cluster.clusterKey.replace(/:/g, "-")}-${Date.now().toString(36)}`,
      severity: worstSeverity,
      evaluator: cluster.evaluators.join(", "),
      affectedNode,
      cause,
      evidence,
      affectedCases: cluster.caseIds,
    });
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  regressions.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );

  return regressions;
}

/**
 * Build a human-readable cause explanation for a failure cluster.
 */
function buildCauseExplanation(
  cluster: FailureCluster,
  changedNodeIds: string[],
  graphDiff?: GraphDiff,
): string {
  const parts: string[] = [];

  parts.push(
    `${cluster.failureCount} test case(s) newly failing in cluster "${cluster.clusterKey}".`,
  );

  if (changedNodeIds.length > 0) {
    const semanticChanges = graphDiff?.semanticChanges.filter(
      (sc) => changedNodeIds.includes(sc.nodeId),
    );
    if (semanticChanges && semanticChanges.length > 0) {
      const changeDescriptions = semanticChanges.map(
        (sc) => sc.description,
      );
      parts.push(
        `Graph changes correlate: ${changeDescriptions.join("; ")}.`,
      );
    } else {
      parts.push(
        `Changed nodes in this path: ${changedNodeIds.join(", ")}.`,
      );
    }
  }

  if (cluster.evaluators.length > 0) {
    parts.push(
      `Affected evaluators: ${cluster.evaluators.join(", ")}.`,
    );
  }

  const intent = cluster.commonTags.intent;
  if (intent) {
    parts.push(`Common intent: "${intent}".`);
  }

  return parts.join(" ");
}

/**
 * Compute score diffs for a specific set of evaluators.
 */
function computeClusterScoreDiffs(
  evaluators: string[],
  baseline: RunAggregate,
  current: RunAggregate,
): Array<{
  evaluator: string;
  baselineScore: number;
  currentScore: number;
  absoluteDelta: number;
  relativeDelta: number;
  direction: "improved" | "regressed" | "unchanged";
}> {
  return evaluators.map((evaluator) => {
    const b = baseline.evaluatorAggregates.find(
      (e: { evaluator: string }) => e.evaluator === evaluator,
    );
    const c = current.evaluatorAggregates.find(
      (e: { evaluator: string }) => e.evaluator === evaluator,
    );

    const baselineScore = b?.passRate ?? 0;
    const currentScore = c?.passRate ?? 0;
    const absoluteDelta = currentScore - baselineScore;
    const relativeDelta =
      baselineScore > 0
        ? (absoluteDelta / baselineScore) * 100
        : currentScore > 0
          ? 100
          : 0;

    return {
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
    };
  });
}
