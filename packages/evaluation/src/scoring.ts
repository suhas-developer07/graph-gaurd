import type {
  EvaluationResult,
  RunAggregate,
  CaseAggregate,
  EvaluatorAggregate,
  NodeFailureAggregate,
} from "./types";

// ─── Score Normalization ─────────────────────────────────────────────────────
// All scores are normalized to 0–1 scale.
// Binary evaluators: pass = 1.0, fail = 0.0
// LLM-as-judge evaluators: score is already 0–1

// ─── Pass/Fail Thresholds (centralized config — Phase 4 reads these) ─────────
export const THRESHOLDS: Record<string, number> = {
  routing: 1.0, // routing must be exactly correct
  grounding: 0.5, // minimum word-overlap for grounding
  compliance: 1.0, // compliance is binary — pass or fail, no partial credit
  escalation: 1.0, // escalation must be triggered when required
  response_quality: 0.6, // minimum quality score
  latency: 0.5, // normalized latency score
  token_usage: 0.5, // normalized token usage score
  cost: 0.5, // normalized cost score
};

// ─── Aggregation Functions ───────────────────────────────────────────────────

export interface TestCaseResults {
  testCaseId: string;
  results: EvaluationResult[];
  /** Node IDs involved in this test case's execution path */
  nodeIds: string[];
  nodeTypes: string[];
}

export function aggregateRun(
  runId: string,
  graphVersionId: string,
  testCaseResults: TestCaseResults[],
): RunAggregate {
  // Per-case aggregation
  const caseAggregates: CaseAggregate[] = testCaseResults.map((tcr) => {
    let allPassed = true;
    for (const result of tcr.results) {
      if (!result.passed) {
        allPassed = false;
        break;
      }
    }

    const overallScore =
      tcr.results.length > 0
        ? tcr.results.reduce((sum, r) => sum + r.score, 0) /
          tcr.results.length
        : 0;

    return {
      caseId: tcr.testCaseId,
      passed: allPassed,
      score: overallScore,
      evaluatorResults: tcr.results,
    };
  });

  // Per-evaluator aggregation
  const evaluatorMap = new Map<
    string,
    { scores: number[]; passedCount: number }
  >();
  for (const tcr of testCaseResults) {
    for (const result of tcr.results) {
      if (!evaluatorMap.has(result.evaluator)) {
        evaluatorMap.set(result.evaluator, {
          scores: [],
          passedCount: 0,
        });
      }
      const entry = evaluatorMap.get(result.evaluator)!;
      entry.scores.push(result.score);
      if (result.passed) entry.passedCount++;
    }
  }

  const evaluatorAggregates: EvaluatorAggregate[] = [];
  for (const [name, data] of evaluatorMap) {
    const total = data.scores.length;
    evaluatorAggregates.push({
      evaluator: name,
      totalCases: total,
      passedCases: data.passedCount,
      failedCases: total - data.passedCount,
      passRate: total > 0 ? data.passedCount / total : 0,
      averageScore:
        total > 0 ? data.scores.reduce((a, b) => a + b, 0) / total : 0,
    });
  }

  // Per-node failure aggregation
  const nodeFailures = new Map<
    string,
    { nodeType: string; evaluatorCounts: Map<string, number> }
  >();
  for (let i = 0; i < testCaseResults.length; i++) {
    const tcr = testCaseResults[i]!;
    for (const result of tcr.results) {
      if (!result.passed) {
        // Find nodes that could be associated with this failure
        for (let j = 0; j < tcr.nodeIds.length; j++) {
          const nodeId = tcr.nodeIds[j]!;
          const nodeType = tcr.nodeTypes[j] ?? "unknown";
          if (!nodeFailures.has(nodeId)) {
            nodeFailures.set(nodeId, {
              nodeType,
              evaluatorCounts: new Map(),
            });
          }
          const entry = nodeFailures.get(nodeId)!;
          entry.evaluatorCounts.set(
            result.evaluator,
            (entry.evaluatorCounts.get(result.evaluator) ?? 0) + 1,
          );
        }
      }
    }
  }

  const nodeFailureAggregates: NodeFailureAggregate[] = [];
  for (const [nodeId, data] of nodeFailures) {
    let failureCount = 0;
    const associatedEvaluators: string[] = [];
    for (const [evalName, count] of data.evaluatorCounts) {
      failureCount += count;
      associatedEvaluators.push(evalName);
    }
    nodeFailureAggregates.push({
      nodeId,
      nodeType: data.nodeType,
      failureCount,
      associatedEvaluators,
    });
  }

  // Sort by failure count descending
  nodeFailureAggregates.sort((a, b) => b.failureCount - a.failureCount);

  const passedCases = caseAggregates.filter((c) => c.passed).length;
  const failedCases = caseAggregates.filter((c) => !c.passed).length;
  const overallScore =
    caseAggregates.length > 0
      ? caseAggregates.reduce((a, c) => a + c.score, 0) /
        caseAggregates.length
      : 0;

  return {
    runId,
    graphVersionId,
    totalCases: testCaseResults.length,
    passedCases,
    failedCases,
    overallPassRate:
      testCaseResults.length > 0 ? passedCases / testCaseResults.length : 0,
    overallScore,
    caseAggregates,
    evaluatorAggregates,
    nodeFailureAggregates,
    timestamp: new Date(),
  };
}

// ─── Diff Two Aggregations (for Phase 4 regression detection) ───────────────

export interface AggregationDiff {
  evaluator: string;
  previousPassRate: number;
  currentPassRate: number;
  delta: number;
  direction: "improved" | "regressed" | "unchanged";
}

export function diffAggregations(
  previous: RunAggregate,
  current: RunAggregate,
): AggregationDiff[] {
  const prevMap = new Map(
    previous.evaluatorAggregates.map((e) => [e.evaluator, e]),
  );
  const currMap = new Map(
    current.evaluatorAggregates.map((e) => [e.evaluator, e]),
  );

  const allEvaluatorNames = new Set([...prevMap.keys(), ...currMap.keys()]);

  const diffs: AggregationDiff[] = [];
  for (const name of allEvaluatorNames) {
    const prev = prevMap.get(name);
    const curr = currMap.get(name);
    const previousPassRate = prev?.passRate ?? 0;
    const currentPassRate = curr?.passRate ?? 0;
    const delta = currentPassRate - previousPassRate;

    diffs.push({
      evaluator: name,
      previousPassRate,
      currentPassRate,
      delta,
      direction:
        Math.abs(delta) < 0.001
          ? "unchanged"
          : delta > 0
            ? "improved"
            : "regressed",
    });
  }

  return diffs;
}
