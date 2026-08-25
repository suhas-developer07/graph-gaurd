import { describe, it, expect } from "vitest";
import { computeScoreDiffs, computeNodeScoreDiffs, computeOverallDiff } from "./score-diff";
import type { RunAggregate } from "@graphguard/evaluation";

function makeAggregate(
  overrides: Partial<RunAggregate> = {},
): RunAggregate {
  return {
    runId: "run-1",
    graphVersionId: "gv-1",
    totalCases: 100,
    passedCases: 80,
    failedCases: 20,
    overallPassRate: 0.8,
    overallScore: 0.8,
    caseAggregates: [],
    evaluatorAggregates: [],
    nodeFailureAggregates: [],
    timestamp: new Date(),
    ...overrides,
  };
}

describe("computeScoreDiffs", () => {
  it("detects regressions", () => {
    const baseline = makeAggregate({
      evaluatorAggregates: [
        { evaluator: "routing", passRate: 0.95, averageScore: 0.95, totalCases: 100, passedCases: 95, failedCases: 5 },
        { evaluator: "grounding", passRate: 0.80, averageScore: 0.80, totalCases: 100, passedCases: 80, failedCases: 20 },
      ],
    });
    const current = makeAggregate({
      evaluatorAggregates: [
        { evaluator: "routing", passRate: 0.70, averageScore: 0.70, totalCases: 100, passedCases: 70, failedCases: 30 },
        { evaluator: "grounding", passRate: 0.85, averageScore: 0.85, totalCases: 100, passedCases: 85, failedCases: 15 },
      ],
    });

    const diffs = computeScoreDiffs(baseline, current);
    expect(diffs).toHaveLength(2);

    const routingDiff = diffs.find((d) => d.evaluator === "routing")!;
    expect(routingDiff.direction).toBe("regressed");
    expect(routingDiff.absoluteDelta).toBeCloseTo(-0.25);
    expect(routingDiff.relativeDelta).toBeCloseTo(-26.32, 0);

    const groundingDiff = diffs.find((d) => d.evaluator === "grounding")!;
    expect(groundingDiff.direction).toBe("improved");
  });

  it("handles missing evaluators in baseline", () => {
    const baseline = makeAggregate({
      evaluatorAggregates: [],
    });
    const current = makeAggregate({
      evaluatorAggregates: [
        { evaluator: "routing", passRate: 0.9, averageScore: 0.9, totalCases: 100, passedCases: 90, failedCases: 10 },
      ],
    });

    const diffs = computeScoreDiffs(baseline, current);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.direction).toBe("improved");
  });

  it("handles missing evaluators in current", () => {
    const baseline = makeAggregate({
      evaluatorAggregates: [
        { evaluator: "routing", passRate: 0.9, averageScore: 0.9, totalCases: 100, passedCases: 90, failedCases: 10 },
      ],
    });
    const current = makeAggregate({
      evaluatorAggregates: [],
    });

    const diffs = computeScoreDiffs(baseline, current);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.direction).toBe("regressed");
  });

  it("sorts regressions first", () => {
    const baseline = makeAggregate({
      evaluatorAggregates: [
        { evaluator: "routing", passRate: 0.9, averageScore: 0.9, totalCases: 100, passedCases: 90, failedCases: 10 },
        { evaluator: "grounding", passRate: 0.9, averageScore: 0.9, totalCases: 100, passedCases: 90, failedCases: 10 },
      ],
    });
    const current = makeAggregate({
      evaluatorAggregates: [
        { evaluator: "routing", passRate: 0.5, averageScore: 0.5, totalCases: 100, passedCases: 50, failedCases: 50 },
        { evaluator: "grounding", passRate: 0.85, averageScore: 0.85, totalCases: 100, passedCases: 85, failedCases: 15 },
      ],
    });

    const diffs = computeScoreDiffs(baseline, current);
    // Regressions should come first (most negative delta)
    expect(diffs[0]!.evaluator).toBe("routing");
    expect(diffs[0]!.direction).toBe("regressed");
  });
});

describe("computeNodeScoreDiffs", () => {
  it("detects node-level regression", () => {
    const baseline = makeAggregate({
      nodeFailureAggregates: [
        { nodeId: "router", nodeType: "router", failureCount: 2, associatedEvaluators: ["routing"] },
      ],
    });
    const current = makeAggregate({
      nodeFailureAggregates: [
        { nodeId: "router", nodeType: "router", failureCount: 10, associatedEvaluators: ["routing"] },
      ],
    });

    const diffs = computeNodeScoreDiffs(baseline, current);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.nodeId).toBe("router");
    expect(diffs[0]!.delta).toBe(8); // 10 - 2
  });
});

describe("computeOverallDiff", () => {
  it("computes overall diff correctly", () => {
    const baseline = makeAggregate({ overallPassRate: 0.9 });
    const current = makeAggregate({ overallPassRate: 0.75 });

    const diff = computeOverallDiff(baseline, current);
    expect(diff.direction).toBe("regressed");
    expect(diff.absoluteDelta).toBeCloseTo(-0.15);
    expect(diff.relativeDelta).toBeCloseTo(-16.67, 0);
  });

  it("detects improvement", () => {
    const baseline = makeAggregate({ overallPassRate: 0.7 });
    const current = makeAggregate({ overallPassRate: 0.85 });

    const diff = computeOverallDiff(baseline, current);
    expect(diff.direction).toBe("improved");
    expect(diff.absoluteDelta).toBeCloseTo(0.15);
  });

  it("detects unchanged", () => {
    const baseline = makeAggregate({ overallPassRate: 0.8 });
    const current = makeAggregate({ overallPassRate: 0.8 });

    const diff = computeOverallDiff(baseline, current);
    expect(diff.direction).toBe("unchanged");
  });
});
