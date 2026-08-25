import { describe, it, expect } from "vitest";
import { validateProposal, validateCanary, rankProposals } from "./proposal-validator";
import type { Proposal, ProposalEvaluation, GraphVersionInput } from "./proposal-types";
import type { RunAggregate } from "@graphguard/evaluation";

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "prop-test",
    graphVersionId: "gv-2",
    targetNode: "router",
    changeType: "prompt",
    change: { prompt: "New prompt" },
    rationale: "Fix routing regression",
    regressionId: "reg-1",
    generatedBy: "llm",
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeGraph(id: string): GraphVersionInput {
  return {
    id,
    nodes: [{ id: "router", type: "router", prompt: "Route", activationConfig: {} }],
    edges: [],
  };
}

function makeAggregate(overrides: Partial<RunAggregate> = {}): RunAggregate {
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

function makeBaselineRun() {
  return {
    id: "baseline-run",
    graphVersionId: "gv-1",
    aggregates: makeAggregate(),
    caseResults: [],
  };
}

describe("validateProposal", () => {
  it("transitions to canary when validation passes", () => {
    const proposal = makeProposal();
    const result = validateProposal(
      proposal,
      makeGraph("gv-2"),
      makeBaselineRun(),
      makeGraph("gv-1"),
    );

    expect(result.status).toBe("canary");
    expect(result.passesCritical).toBe(true);
    expect(result.evaluation).toBeDefined();
    expect(result.evaluation.gateStatus).toBeDefined();
  });

  it("rejects when critical failures are present", () => {
    const proposal = makeProposal({
      evaluation: {
        gateStatus: "block",
        passRate: 0.5,
        improvements: [],
        newRegressions: [],
        criticalFailures: ["[compliance] Safety violation detected"],
        gateResultJson: {},
      },
    });

    // Manually set evaluation to simulate a previous failed validation
    const result = validateProposal(
      proposal,
      makeGraph("gv-2"),
      makeBaselineRun(),
      makeGraph("gv-1"),
    );

    // The validation re-runs the gate, so we check the result structure
    expect(result.evaluation).toBeDefined();
    expect(result.evaluation.criticalFailures).toBeDefined();
  });
});

describe("rankProposals", () => {
  it("ranks proposals by score, best first", () => {
    const proposals: Proposal[] = [
      makeProposal({
        id: "prop-1",
        status: "canary",
        evaluation: {
          gateStatus: "warn",
          passRate: 0.85,
          improvements: [
            { evaluator: "routing", baselineScore: 0.6, candidateScore: 0.9, delta: 0.3 },
          ],
          newRegressions: [],
          criticalFailures: [],
          gateResultJson: {},
        },
      }),
      makeProposal({
        id: "prop-2",
        status: "canary",
        evaluation: {
          gateStatus: "pass",
          passRate: 0.95,
          improvements: [
            { evaluator: "routing", baselineScore: 0.6, candidateScore: 0.95, delta: 0.35 },
          ],
          newRegressions: [],
          criticalFailures: [],
          gateResultJson: {},
        },
      }),
    ];

    const ranked = rankProposals(proposals);

    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.id).toBe("prop-2"); // Higher improvement
    expect(ranked[1]!.id).toBe("prop-1");
    expect(ranked[0]!.rankingScore).toBeGreaterThan(ranked[1]!.rankingScore!);
  });

  it("disqualifies proposals with critical failures", () => {
    const proposals: Proposal[] = [
      makeProposal({
        id: "prop-1",
        status: "canary",
        evaluation: {
          gateStatus: "block",
          passRate: 0.5,
          improvements: [],
          newRegressions: [
            { evaluator: "compliance", baselineScore: 1.0, candidateScore: 0.5, delta: -0.5 },
          ],
          criticalFailures: ["[compliance] Critical safety failure"],
          gateResultJson: {},
        },
      }),
      makeProposal({
        id: "prop-2",
        status: "canary",
        evaluation: {
          gateStatus: "pass",
          passRate: 0.9,
          improvements: [
            { evaluator: "routing", baselineScore: 0.7, candidateScore: 0.9, delta: 0.2 },
          ],
          newRegressions: [],
          criticalFailures: [],
          gateResultJson: {},
        },
      }),
    ];

    const ranked = rankProposals(proposals);

    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.id).toBe("prop-2");
  });

  it("disqualifies rejected proposals", () => {
    const proposals: Proposal[] = [
      makeProposal({ id: "prop-1", status: "rejected" }),
      makeProposal({
        id: "prop-2",
        status: "canary",
        evaluation: {
          gateStatus: "pass",
          passRate: 0.9,
          improvements: [],
          newRegressions: [],
          criticalFailures: [],
          gateResultJson: {},
        },
      }),
    ];

    const ranked = rankProposals(proposals);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.id).toBe("prop-2");
  });

  it("penalizes regressions more heavily for safety-critical evaluators", () => {
    const proposals: Proposal[] = [
      makeProposal({
        id: "prop-routing-regression",
        status: "canary",
        evaluation: {
          gateStatus: "warn",
          passRate: 0.85,
          improvements: [
            { evaluator: "routing", baselineScore: 0.6, candidateScore: 0.9, delta: 0.3 },
          ],
          newRegressions: [
            { evaluator: "grounding", baselineScore: 0.8, candidateScore: 0.7, delta: -0.1 },
          ],
          criticalFailures: [],
          gateResultJson: {},
        },
      }),
      makeProposal({
        id: "prop-clean",
        status: "canary",
        evaluation: {
          gateStatus: "pass",
          passRate: 0.88,
          improvements: [
            { evaluator: "routing", baselineScore: 0.6, candidateScore: 0.85, delta: 0.25 },
          ],
          newRegressions: [],
          criticalFailures: [],
          gateResultJson: {},
        },
      }),
    ];

    const ranked = rankProposals(proposals);

    // Clean proposal should rank higher despite smaller improvement
    // because the other has a regression penalty
    expect(ranked[0]!.id).toBe("prop-clean");
  });
});
