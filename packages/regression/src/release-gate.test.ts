import { describe, it, expect } from "vitest";
import { runAnalysis, runReleaseGate } from "./release-gate";
import type { AnalysisInput, GraphVersionInput } from "./types";
import type { RunAggregate } from "@graphguard/evaluation";

function makeGraph(id: string, nodes: GraphVersionInput["nodes"]): GraphVersionInput {
  return { id, nodes, edges: [] };
}

function makeAgg(
  evaluatorRates: Record<string, number>,
  overallRate: number,
): RunAggregate {
  return {
    runId: "run",
    graphVersionId: "gv",
    totalCases: 100,
    passedCases: Math.round(overallRate * 100),
    failedCases: 100 - Math.round(overallRate * 100),
    overallPassRate: overallRate,
    overallScore: overallRate,
    caseAggregates: [],
    evaluatorAggregates: Object.entries(evaluatorRates).map(([evaluator, passRate]) => ({
      evaluator,
      passRate,
      averageScore: passRate,
      totalCases: 100,
      passedCases: Math.round(passRate * 100),
      failedCases: 100 - Math.round(passRate * 100),
    })),
    nodeFailureAggregates: [],
    timestamp: new Date(),
  };
}

function makeInput(
  baselineRates: Record<string, number>,
  currentRates: Record<string, number>,
  baselineOverall: number,
  currentOverall: number,
  baselineNodes: GraphVersionInput["nodes"] = [
    { id: "router", type: "router", prompt: "Route", activationConfig: {} },
  ],
  currentNodes: GraphVersionInput["nodes"] = [
    { id: "router", type: "router", prompt: "Route", activationConfig: {} },
  ],
): AnalysisInput {
  return {
    baselineRun: {
      id: "baseline-run",
      graphVersionId: "baseline-gv",
      aggregates: makeAgg(baselineRates, baselineOverall),
      caseResults: [],
    },
    currentRun: {
      id: "current-run",
      graphVersionId: "current-gv",
      aggregates: makeAgg(currentRates, currentOverall),
      caseResults: [],
    },
    baselineGraph: makeGraph("baseline-gv", baselineNodes),
    currentGraph: makeGraph("current-gv", currentNodes),
  };
}

describe("runAnalysis", () => {
  it("returns empty regressions when no changes", () => {
    const input = makeInput(
      { routing: 0.95, grounding: 0.80 },
      { routing: 0.95, grounding: 0.80 },
      0.9,
      0.9,
    );

    const result = runAnalysis(input);
    expect(result.regressions).toHaveLength(0);
    expect(result.scoreDiffs).toHaveLength(2);
  });

  it("detects regressions when scores drop", () => {
    const input = makeInput(
      { routing: 0.95, grounding: 0.80 },
      { routing: 0.60, grounding: 0.85 },
      0.9,
      0.7,
    );

    const result = runAnalysis(input);
    expect(result.scoreDiffs).toHaveLength(2);
    const routingDiff = result.scoreDiffs.find((d) => d.evaluator === "routing");
    expect(routingDiff!.direction).toBe("regressed");
  });

  it("produces graph diff when graphs differ", () => {
    const input = makeInput(
      { routing: 0.95 },
      { routing: 0.95 },
      0.9,
      0.9,
      [{ id: "router", type: "router", prompt: "Old", activationConfig: {} }],
      [{ id: "router", type: "router", prompt: "New", activationConfig: {} }],
    );

    const result = runAnalysis(input);
    expect(result.graphDiff.semanticChanges.length).toBeGreaterThan(0);
  });
});

describe("runReleaseGate", () => {
  it("returns PASS when no regressions", () => {
    const input = makeInput(
      { routing: 0.95, grounding: 0.80 },
      { routing: 0.95, grounding: 0.80 },
      0.9,
      0.9,
    );

    const gate = runReleaseGate(input);
    expect(gate.status).toBe("pass");
    expect(gate.summary).toContain("PASS");
  });

  it("returns BLOCK for critical compliance regression", () => {
    const input = makeInput(
      { compliance: 1.0 },
      { compliance: 0.80 },
      1.0,
      0.8,
    );

    const gate = runReleaseGate(input);
    expect(gate.status).toBe("block");
    expect(gate.summary).toContain("BLOCK");
  });

  it("returns BLOCK for critical escalation regression", () => {
    const input = makeInput(
      { escalation: 1.0 },
      { escalation: 0.85 },
      1.0,
      0.85,
    );

    const gate = runReleaseGate(input);
    expect(gate.status).toBe("block");
  });

  it("returns WARN for moderate routing regression", () => {
    const input = makeInput(
      { routing: 0.95, grounding: 0.80 },
      { routing: 0.85, grounding: 0.80 },
      0.9,
      0.85,
    );

    const gate = runReleaseGate(input);
    // 0.95 → 0.85 = 10pp absolute drop, which exceeds warn threshold (5pp)
    expect(gate.status).toMatch(/(warn|block)/);
  });

  it("includes CI-friendly JSON fields", () => {
    const input = makeInput(
      { routing: 0.95 },
      { routing: 0.95 },
      0.9,
      0.9,
    );

    const gate = runReleaseGate(input);
    expect(gate).toHaveProperty("status");
    expect(gate).toHaveProperty("graphVersionId");
    expect(gate).toHaveProperty("baselineRunId");
    expect(gate).toHaveProperty("currentRunId");
    expect(gate).toHaveProperty("summary");
    expect(gate).toHaveProperty("regressions");
    expect(gate).toHaveProperty("scoreDiffs");
    expect(gate).toHaveProperty("graphDiff");
    expect(gate).toHaveProperty("timestamp");
    expect(gate.timestamp).toBeInstanceOf(Date);
  });
});
