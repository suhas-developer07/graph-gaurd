import { describe, it, expect } from "vitest";
import {
  aggregateRun,
  diffAggregations,
  THRESHOLDS,
  type RunAggregate,
} from "./scoring";
import type { EvaluationResult } from "./types";

describe("scoring", () => {
  describe("aggregateRun", () => {
    it("aggregates results correctly across multiple test cases", () => {
      const results = [
        {
          testCaseId: "tc-001",
          results: [
            { evaluator: "routing", score: 1.0, passed: true, explanation: "Correct", confidence: 1, cleanJudgment: true },
            { evaluator: "grounding", score: 0.9, passed: true, explanation: "Grounded", confidence: 0.85, cleanJudgment: true },
          ],
          nodeIds: ["router", "retrieval", "specialist"],
          nodeTypes: ["router", "retrieval", "specialist"],
        },
        {
          testCaseId: "tc-002",
          results: [
            { evaluator: "routing", score: 0.0, passed: false, explanation: "Wrong route", confidence: 1, cleanJudgment: true },
            { evaluator: "grounding", score: 0.4, passed: false, explanation: "Weak grounding", confidence: 0.85, cleanJudgment: true },
          ],
          nodeIds: ["router", "retrieval"],
          nodeTypes: ["router", "retrieval"],
        },
      ];

      const agg = aggregateRun("run-001", "gv-001", results);

      expect(agg.runId).toBe("run-001");
      expect(agg.totalCases).toBe(2);
      expect(agg.passedCases).toBe(1);
      expect(agg.failedCases).toBe(1);
      expect(agg.overallPassRate).toBe(0.5);

      // Per-evaluator
      const routingEval = agg.evaluatorAggregates.find((e) => e.evaluator === "routing");
      expect(routingEval).toBeDefined();
      expect(routingEval!.passRate).toBe(0.5);

      // Per-node
      expect(agg.nodeFailureAggregates.length).toBeGreaterThan(0);
    });

    it("handles empty results", () => {
      const agg = aggregateRun("run-empty", "gv-001", []);
      expect(agg.totalCases).toBe(0);
      expect(agg.overallPassRate).toBe(0);
      expect(agg.evaluatorAggregates).toHaveLength(0);
    });

    it("handles single test case with all passing", () => {
      const results = [
        {
          testCaseId: "tc-001",
          results: [
            { evaluator: "routing", score: 1.0, passed: true, explanation: "OK", confidence: 1, cleanJudgment: true },
          ],
          nodeIds: ["router"],
          nodeTypes: ["router"],
        },
      ];

      const agg = aggregateRun("run-single", "gv-001", results);
      expect(agg.passedCases).toBe(1);
      expect(agg.failedCases).toBe(0);
      expect(agg.overallPassRate).toBe(1.0);
    });
  });

  describe("diffAggregations", () => {
    it("detects improvements and regressions", () => {
      const previous: RunAggregate = {
        runId: "run-prev",
        graphVersionId: "gv-001",
        totalCases: 100,
        passedCases: 80,
        failedCases: 20,
        overallPassRate: 0.8,
        overallScore: 0.8,
        evaluatorAggregates: [
          { evaluator: "routing", totalCases: 100, passedCases: 90, failedCases: 10, passRate: 0.9, averageScore: 0.9 },
          { evaluator: "grounding", totalCases: 100, passedCases: 70, failedCases: 30, passRate: 0.7, averageScore: 0.72 },
        ],
        nodeFailureAggregates: [],
        caseAggregates: [],
        timestamp: new Date(),
      };

      const current: RunAggregate = {
        runId: "run-curr",
        graphVersionId: "gv-001",
        totalCases: 100,
        passedCases: 85,
        failedCases: 15,
        overallPassRate: 0.85,
        overallScore: 0.85,
        evaluatorAggregates: [
          { evaluator: "routing", totalCases: 100, passedCases: 95, failedCases: 5, passRate: 0.95, averageScore: 0.95 },
          { evaluator: "grounding", totalCases: 100, passedCases: 60, failedCases: 40, passRate: 0.6, averageScore: 0.62 },
        ],
        nodeFailureAggregates: [],
        caseAggregates: [],
        timestamp: new Date(),
      };

      const diffs = diffAggregations(previous, current);

      expect(diffs).toHaveLength(2);
      const routingDiff = diffs.find((d) => d.evaluator === "routing");
      expect(routingDiff!.direction).toBe("improved");
      expect(routingDiff!.delta).toBeCloseTo(0.05);

      const groundingDiff = diffs.find((d) => d.evaluator === "grounding");
      expect(groundingDiff!.direction).toBe("regressed");
      expect(groundingDiff!.delta).toBeCloseTo(-0.1);
    });

    it("detects unchanged evaluators", () => {
      const makeAgg = (): RunAggregate => ({
        runId: "run",
        graphVersionId: "gv-001",
        totalCases: 100,
        passedCases: 90,
        failedCases: 10,
        overallPassRate: 0.9,
        overallScore: 0.9,
        evaluatorAggregates: [
          { evaluator: "routing", totalCases: 100, passedCases: 90, failedCases: 10, passRate: 0.9, averageScore: 0.9 },
        ],
        nodeFailureAggregates: [],
        caseAggregates: [],
        timestamp: new Date(),
      });

      const diffs = diffAggregations(makeAgg(), makeAgg());
      expect(diffs[0]!.direction).toBe("unchanged");
    });
  });

  describe("THRESHOLDS", () => {
    it("has thresholds for all standard evaluators", () => {
      expect(THRESHOLDS.routing).toBeDefined();
      expect(THRESHOLDS.grounding).toBeDefined();
      expect(THRESHOLDS.compliance).toBeDefined();
      expect(THRESHOLDS.escalation).toBeDefined();
      expect(THRESHOLDS.response_quality).toBeDefined();
    });

    it("compliance threshold is 1.0 (binary)", () => {
      expect(THRESHOLDS.compliance).toBe(1.0);
    });
  });
});
