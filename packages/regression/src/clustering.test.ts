import { describe, it, expect } from "vitest";
import { findNewlyFailing, clusterFailures, buildRegressions } from "./clustering";
import type { RunAggregate } from "@graphguard/evaluation";

interface CaseResult {
  testCaseId: string;
  evaluator: string;
  passed: boolean;
  score: number;
  tags?: Record<string, string>;
  nodeIds?: string[];
}

function makeCaseResult(
  id: string,
  evaluator: string,
  passed: boolean,
  overrides: Partial<CaseResult> = {},
): CaseResult {
  return {
    testCaseId: id,
    evaluator,
    passed,
    score: passed ? 1.0 : 0.0,
    ...overrides,
  };
}

describe("findNewlyFailing", () => {
  it("finds cases that passed at baseline but fail now", () => {
    const baseline: CaseResult[] = [
      makeCaseResult("tc-001", "routing", true),
      makeCaseResult("tc-002", "routing", true),
      makeCaseResult("tc-003", "routing", false), // was already failing
    ];
    const current: CaseResult[] = [
      makeCaseResult("tc-001", "routing", true), // still passing
      makeCaseResult("tc-002", "routing", false), // NEW failure
      makeCaseResult("tc-003", "routing", false), // still failing
      makeCaseResult("tc-004", "routing", false), // new case, new failure
    ];

    const newlyFailing = findNewlyFailing(baseline, current);
    expect(newlyFailing).toHaveLength(1);
    expect(newlyFailing[0]!.testCaseId).toBe("tc-002");
  });

  it("returns empty when no new failures", () => {
    const baseline: CaseResult[] = [
      makeCaseResult("tc-001", "routing", true),
    ];
    const current: CaseResult[] = [
      makeCaseResult("tc-001", "routing", true),
    ];

    const newlyFailing = findNewlyFailing(baseline, current);
    expect(newlyFailing).toHaveLength(0);
  });
});

describe("clusterFailures", () => {
  it("clusters by node", () => {
    const cases: CaseResult[] = [
      makeCaseResult("tc-001", "routing", false, { nodeIds: ["router", "retrieval"] }),
      makeCaseResult("tc-002", "routing", false, { nodeIds: ["router", "retrieval"] }),
    ];

    const clusters = clusterFailures(cases);
    const nodeClusters = clusters.filter((c) => c.clusterKey.startsWith("node:"));
    expect(nodeClusters.length).toBeGreaterThan(0);
    const routerCluster = nodeClusters.find((c) => c.clusterKey === "node:router");
    expect(routerCluster).toBeDefined();
    expect(routerCluster!.failureCount).toBe(2);
  });

  it("clusters by intent", () => {
    const cases: CaseResult[] = [
      makeCaseResult("tc-001", "routing", false, { tags: { intent: "dosage_question" } }),
      makeCaseResult("tc-002", "routing", false, { tags: { intent: "dosage_question" } }),
    ];

    const clusters = clusterFailures(cases);
    const intentClusters = clusters.filter((c) => c.clusterKey.startsWith("intent:"));
    expect(intentClusters).toHaveLength(1);
    expect(intentClusters[0]!.failureCount).toBe(2);
  });

  it("clusters by evaluator", () => {
    const cases: CaseResult[] = [
      makeCaseResult("tc-001", "routing", false),
      makeCaseResult("tc-001", "grounding", false),
    ];

    const clusters = clusterFailures(cases);
    const evalClusters = clusters.filter((c) => c.clusterKey.startsWith("evaluator:"));
    expect(evalClusters).toHaveLength(2);
  });

  it("clusters by safety class", () => {
    const cases: CaseResult[] = [
      makeCaseResult("tc-001", "routing", false, { tags: { safetyClass: "must_escalate" } }),
      makeCaseResult("tc-002", "routing", false, { tags: { safetyClass: "must_escalate" } }),
    ];

    const clusters = clusterFailures(cases);
    const safetyClusters = clusters.filter((c) => c.clusterKey.startsWith("safetyClass:"));
    expect(safetyClusters).toHaveLength(1);
    expect(safetyClusters[0]!.failureCount).toBe(2);
  });
});

describe("buildRegressions", () => {
  it("builds regression objects from clusters", () => {
    const baseline: RunAggregate = {
      runId: "run-1",
      graphVersionId: "gv-1",
      totalCases: 100,
      passedCases: 90,
      failedCases: 10,
      overallPassRate: 0.9,
      overallScore: 0.9,
      caseAggregates: [],
      evaluatorAggregates: [
        { evaluator: "routing", passRate: 0.95, averageScore: 0.95, totalCases: 100, passedCases: 95, failedCases: 5 },
      ],
      nodeFailureAggregates: [],
      timestamp: new Date(),
    };
    const current: RunAggregate = {
      runId: "run-2",
      graphVersionId: "gv-2",
      totalCases: 100,
      passedCases: 70,
      failedCases: 30,
      overallPassRate: 0.7,
      overallScore: 0.7,
      caseAggregates: [],
      evaluatorAggregates: [
        { evaluator: "routing", passRate: 0.60, averageScore: 0.60, totalCases: 100, passedCases: 60, failedCases: 40 },
      ],
      nodeFailureAggregates: [],
      timestamp: new Date(),
    };

    const clusters = [
      {
        clusterKey: "intent:dosage_question",
        failureCount: 12,
        evaluators: ["routing"],
        caseIds: ["tc-001", "tc-002"],
        commonTags: { intent: "dosage_question" },
      },
    ];

    const regressions = buildRegressions(clusters, baseline, current);
    expect(regressions).toHaveLength(1);
    expect(regressions[0]!.severity).toBe("high"); // routing 0.95 → 0.60 is a big drop
    expect(regressions[0]!.cause).toContain("12 test case(s)");
  });

  it("marks compliance regressions as critical", () => {
    const baseline: RunAggregate = {
      runId: "run-1",
      graphVersionId: "gv-1",
      totalCases: 100,
      passedCases: 100,
      failedCases: 0,
      overallPassRate: 1.0,
      overallScore: 1.0,
      caseAggregates: [],
      evaluatorAggregates: [
        { evaluator: "compliance", passRate: 1.0, averageScore: 1.0, totalCases: 100, passedCases: 100, failedCases: 0 },
      ],
      nodeFailureAggregates: [],
      timestamp: new Date(),
    };
    const current: RunAggregate = {
      runId: "run-2",
      graphVersionId: "gv-2",
      totalCases: 100,
      passedCases: 80,
      failedCases: 20,
      overallPassRate: 0.8,
      overallScore: 0.8,
      caseAggregates: [],
      evaluatorAggregates: [
        { evaluator: "compliance", passRate: 0.80, averageScore: 0.80, totalCases: 100, passedCases: 80, failedCases: 20 },
      ],
      nodeFailureAggregates: [],
      timestamp: new Date(),
    };

    const clusters = [
      {
        clusterKey: "evaluator:compliance",
        failureCount: 20,
        evaluators: ["compliance"],
        caseIds: ["tc-001"],
        commonTags: {},
      },
    ];

    const regressions = buildRegressions(clusters, baseline, current);
    expect(regressions[0]!.severity).toBe("critical");
  });
});
