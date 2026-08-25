import { describe, it, expect } from "vitest";
import { runEvaluation, createRunId, splitDataset } from "./runner";
import type { ExecuteGraphFn, GraphExecutionSnapshot } from "./runner";
import type { TestCase, Evaluator, EvaluationResult } from "./types";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockExecution: GraphExecutionSnapshot = {
  success: true,
  response: "Test response",
  nodePath: [
    { nodeId: "router", nodeType: "router", startedAt: new Date(), completedAt: new Date(), status: "success", input: {}, output: {} },
    { nodeId: "retrieval", nodeType: "retrieval", startedAt: new Date(), completedAt: new Date(), status: "success", input: {}, output: {} },
    { nodeId: "final_response", nodeType: "final_response", startedAt: new Date(), completedAt: new Date(), status: "success", input: {}, output: {} },
  ],
  evidence: [],
  llmCalls: [],
  totalDurationMs: 100,
  totalTokens: 50,
  totalCost: 0,
};

const mockExecuteGraph: ExecuteGraphFn = async () => ({ ...mockExecution });

class MockEvaluator implements Evaluator {
  name: string;
  requiresLlm = false;
  shouldPass: boolean;

  constructor(name: string, shouldPass = true) {
    this.name = name;
    this.shouldPass = shouldPass;
  }

  async evaluate(): Promise<EvaluationResult> {
    return {
      evaluator: this.name,
      score: this.shouldPass ? 1.0 : 0.0,
      passed: this.shouldPass,
      explanation: this.shouldPass ? "Pass" : "Fail",
      confidence: 1.0,
      cleanJudgment: true,
    };
  }
}

function makeTestCases(count: number): TestCase[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `tc-${String(i + 1).padStart(3, "0")}`,
    input: `Test question ${i + 1}`,
    expectedRoute: "retrieval",
    expectedBehavior: { expectedRoute: "retrieval" },
    tags: {
      intent: "test",
      safetyClass: "benign" as const,
      difficulty: "easy" as const,
    },
    datasetId: "evaluation",
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("createRunId", () => {
  it("generates a unique run ID", () => {
    const id1 = createRunId();
    const id2 = createRunId();
    expect(id1).toMatch(/^eval-/);
    expect(id1).not.toBe(id2);
  });
});

describe("splitDataset", () => {
  it("splits cases into evaluation and canary", () => {
    const cases = makeTestCases(20);
    const canaryIds = new Set(["tc-001", "tc-005", "tc-010"]);

    const { evaluation, canary } = splitDataset(cases, canaryIds);
    expect(evaluation.length).toBe(17);
    expect(canary.length).toBe(3);
  });

  it("handles empty canary set", () => {
    const cases = makeTestCases(10);
    const { evaluation, canary } = splitDataset(cases, new Set());
    expect(evaluation.length).toBe(10);
    expect(canary.length).toBe(0);
  });
});

describe("runEvaluation", () => {
  it("runs all test cases and produces aggregation", async () => {
    const testCases = makeTestCases(5);
    const evaluators = [new MockEvaluator("routing")];

    const result = await runEvaluation(
      "run-test",
      "gv-001",
      testCases,
      evaluators,
      mockExecuteGraph,
    );

    expect(result.runId).toBe("run-test");
    expect(result.caseResults).toHaveLength(5);
    expect(result.aggregation.totalCases).toBe(5);
    expect(result.aggregation.overallPassRate).toBe(1.0);
  });

  it("calls onCaseComplete for each test case", async () => {
    const testCases = makeTestCases(3);
    const evaluators = [new MockEvaluator("routing")];
    const completedIds: string[] = [];

    await runEvaluation(
      "run-callback",
      "gv-001",
      testCases,
      evaluators,
      mockExecuteGraph,
      {
        onCaseComplete: (testCaseId) => {
          completedIds.push(testCaseId);
        },
      },
    );

    expect(completedIds).toHaveLength(3);
    expect(completedIds).toContain("tc-001");
    expect(completedIds).toContain("tc-003");
  });

  it("calls onRunComplete with aggregation", async () => {
    const testCases = makeTestCases(2);
    const evaluators = [new MockEvaluator("routing")];
    let capturedAgg: unknown = null;

    await runEvaluation(
      "run-final",
      "gv-001",
      testCases,
      evaluators,
      mockExecuteGraph,
      {
        onRunComplete: (agg) => {
          capturedAgg = agg;
        },
      },
    );

    expect(capturedAgg).toBeDefined();
    expect((capturedAgg as { totalCases: number }).totalCases).toBe(2);
  });

  it("respects concurrency limit", async () => {
    const testCases = makeTestCases(10);
    const evaluators = [new MockEvaluator("routing")];
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const slowExecute: ExecuteGraphFn = async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((r) => setTimeout(r, 10));
      currentConcurrent--;
      return { ...mockExecution };
    };

    await runEvaluation(
      "run-concurrency",
      "gv-001",
      testCases,
      evaluators,
      slowExecute,
      { concurrency: 3 },
    );

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it("handles failing evaluators", async () => {
    const testCases = makeTestCases(3);
    const evaluators = [
      new MockEvaluator("routing", false),
      new MockEvaluator("grounding", true),
    ];

    const result = await runEvaluation(
      "run-fail",
      "gv-001",
      testCases,
      evaluators,
      mockExecuteGraph,
    );

    expect(result.aggregation.overallPassRate).toBe(0); // routing fails all
    expect(result.aggregation.failedCases).toBe(3);
  });
});
