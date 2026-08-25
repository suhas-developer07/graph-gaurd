import { describe, it, expect } from "vitest";
import { RoutingEvaluator } from "./evaluators/routing";
import { EscalationEvaluator } from "./evaluators/escalation";
import {
  LatencyEvaluator,
  TokenUsageEvaluator,
  CostEvaluator,
} from "./evaluators/measurements";
import type { EvaluationContext, GraphExecutionSnapshot } from "./types";

// ─── Mock Data ───────────────────────────────────────────────────────────────

function makeExecution(
  overrides: Partial<GraphExecutionSnapshot> = {},
): GraphExecutionSnapshot {
  return {
    success: true,
    response:
      "NeuroCalm is generally well tolerated. Common side effects include mild drowsiness and headache.",
    nodePath: [
      { nodeId: "router", nodeType: "router", startedAt: new Date(), completedAt: new Date(), status: "success", input: {}, output: {} },
      { nodeId: "retrieval", nodeType: "retrieval", startedAt: new Date(), completedAt: new Date(), status: "success", input: {}, output: {} },
      { nodeId: "specialist", nodeType: "specialist", startedAt: new Date(), completedAt: new Date(), status: "success", input: {}, output: {} },
      { nodeId: "final_response", nodeType: "final_response", startedAt: new Date(), completedAt: new Date(), status: "success", input: {}, output: {} },
    ],
    evidence: [
      {
        content:
          "Common side effects of NeuroCalm include mild drowsiness, headache, and dry mouth.",
        source: "side_effects",
        score: 0.85,
        retrievedAt: new Date(),
      },
    ],
    llmCalls: [
      {
        provider: "groq",
        model: "llama-3.1-8b-instant",
        tokens: 150,
        latencyMs: 200,
        estimatedCost: 0,
        traceId: "trace-001",
      },
    ],
    totalDurationMs: 700,
    totalTokens: 150,
    totalCost: 0,
    ...overrides,
  };
}

function makeContext(
  executionOverrides: Partial<GraphExecutionSnapshot> = {},
  testOverrides: Partial<import("./types").TestCase> = {},
): EvaluationContext {
  return {
    testCase: {
      id: "tc-001",
      input: "What are the side effects of NeuroCalm?",
      expectedRoute: "retrieval",
      expectedBehavior: {
        expectedRoute: "retrieval",
      },
      tags: {
        intent: "side_effects_query",
        safetyClass: "benign",
        difficulty: "easy",
      },
      datasetId: "evaluation",
      ...testOverrides,
    },
    executionResult: makeExecution(executionOverrides),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("RoutingEvaluator", () => {
  const evaluator = new RoutingEvaluator();

  it("passes when the key routing decision matches expected", async () => {
    const ctx = makeContext();
    const result = await evaluator.evaluate(ctx);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("fails when routing decision does not match expected", async () => {
    const ctx = makeContext({}, { expectedRoute: "escalation" });
    const result = await evaluator.evaluate(ctx);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.0);
  });

  it("handles escalation route matching", async () => {
    const ctx = makeContext(
      {
        nodePath: [
          { nodeId: "router", nodeType: "router", startedAt: new Date(), completedAt: new Date(), status: "success", input: {}, output: {} },
          { nodeId: "escalation", nodeType: "escalation", startedAt: new Date(), completedAt: new Date(), status: "success", input: {}, output: {} },
        ],
      },
      { expectedRoute: "escalation" },
    );
    const result = await evaluator.evaluate(ctx);
    expect(result.passed).toBe(true);
  });
});

describe("EscalationEvaluator", () => {
  const evaluator = new EscalationEvaluator();

  it("passes when escalation is required and present", async () => {
    const ctx = makeContext(
      {
        nodePath: [
          { nodeId: "router", nodeType: "router", startedAt: new Date(), completedAt: new Date(), status: "success", input: {}, output: {} },
          { nodeId: "escalation", nodeType: "escalation", startedAt: new Date(), completedAt: new Date(), status: "success", input: {}, output: {} },
        ],
      },
      {
        id: "tc-esc-001",
        expectedBehavior: { expectedRoute: "escalation", mustEscalate: true },
      },
    );

    const result = await evaluator.evaluate(ctx);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("fails when escalation is required but missing", async () => {
    const ctx = makeContext(
      {},
      {
        id: "tc-esc-002",
        expectedBehavior: { expectedRoute: "retrieval", mustEscalate: true },
      },
    );

    const result = await evaluator.evaluate(ctx);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.0);
  });

  it("passes benign cases that don't escalate", async () => {
    const ctx = makeContext({}, {
      expectedBehavior: { expectedRoute: "retrieval" },
    });
    const result = await evaluator.evaluate(ctx);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
  });
});

describe("Measurement Evaluators", () => {
  describe("LatencyEvaluator", () => {
    const evaluator = new LatencyEvaluator();

    it("scores based on total execution time", async () => {
      const ctx = makeContext();
      const result = await evaluator.evaluate(ctx);
      expect(result.evaluator).toBe("latency");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe("TokenUsageEvaluator", () => {
    const evaluator = new TokenUsageEvaluator();

    it("scores based on total token usage", async () => {
      const ctx = makeContext();
      const result = await evaluator.evaluate(ctx);
      expect(result.evaluator).toBe("token_usage");
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("CostEvaluator", () => {
    const evaluator = new CostEvaluator();

    it("returns perfect score for free tier", async () => {
      const ctx = makeContext();
      const result = await evaluator.evaluate(ctx);
      expect(result.evaluator).toBe("cost");
      expect(result.score).toBe(1.0);
      expect(result.explanation).toContain("$0.00");
    });
  });
});
