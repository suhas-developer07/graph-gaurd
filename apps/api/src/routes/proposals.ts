import type { FastifyInstance } from "fastify";
import type {
  Proposal,
  CreateProposalInput,
  ProposalStatus,
  ProposalEvaluation,
} from "@graphguard/regression";
import type { GraphVersionInput } from "@graphguard/regression";
import { runReleaseGate } from "@graphguard/regression";
import type { AnalysisInput } from "@graphguard/regression";

// ─── In-Memory Store (Phase 6 moves to DB) ──────────────────────────────────
const proposals = new Map<string, Proposal>();

// ─── Valid State Transitions ─────────────────────────────────────────────────
const VALID_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ["evaluating"],
  evaluating: ["canary", "rejected"],
  canary: ["approved", "rejected"],
  approved: [], // Terminal — must go through publish flow
  rejected: [], // Terminal
};

function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

function transitionProposal(
  proposal: Proposal,
  newStatus: ProposalStatus,
  reason?: string,
): void {
  if (!canTransition(proposal.status, newStatus)) {
    throw new Error(
      `Invalid transition: ${proposal.status} → ${newStatus}. Valid transitions: ${VALID_TRANSITIONS[proposal.status]?.join(", ") ?? "none"}`,
    );
  }
  proposal.status = newStatus;
  proposal.updatedAt = new Date();
  if (reason) {
    proposal.rejectionReason = reason;
  }
}

/**
 * Register proposal routes.
 */
export async function registerProposalRoutes(app: FastifyInstance) {
  /**
   * POST /proposals — create a proposal (manual or generated)
   */
  app.post<{
    Body: CreateProposalInput;
  }>("/proposals", async (request, reply) => {
    const input = request.body;

    // Validate required fields
    if (!input.graphVersionId || !input.targetNode || !input.change || !input.regressionId) {
      return reply.status(400).send({
        error: "Missing required fields: graphVersionId, targetNode, change, regressionId",
      });
    }

    const proposal: Proposal = {
      id: `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      graphVersionId: input.graphVersionId,
      targetNode: input.targetNode,
      changeType: input.changeType,
      change: input.change,
      rationale: input.rationale,
      regressionId: input.regressionId,
      generatedBy: input.generatedBy,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    proposals.set(proposal.id, proposal);

    return reply.status(201).send({
      id: proposal.id,
      status: proposal.status,
      graphVersionId: proposal.graphVersionId,
      targetNode: proposal.targetNode,
      changeType: proposal.changeType,
      rationale: proposal.rationale,
      createdAt: proposal.createdAt.toISOString(),
    });
  });

  /**
   * GET /proposals — list all proposals
   */
  app.get("/proposals", async (_request, reply) => {
    const allProposals = [...proposals.values()];
    return reply.status(200).send({
      proposals: allProposals.map((p) => ({
        id: p.id,
        status: p.status,
        graphVersionId: p.graphVersionId,
        targetNode: p.targetNode,
        changeType: p.changeType,
        rationale: p.rationale,
        regressionId: p.regressionId,
        generatedBy: p.generatedBy,
        rankingScore: p.rankingScore,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    });
  });

  /**
   * GET /proposals/:id — get a single proposal
   */
  app.get<{
    Params: { id: string };
  }>("/proposals/:id", async (request, reply) => {
    const { id } = request.params;
    const proposal = proposals.get(id);
    if (!proposal) {
      return reply.status(404).send({ error: "Proposal not found" });
    }
    return reply.status(200).send(proposal);
  });

  /**
   * POST /proposals/:id/evaluate — run regression + canary validation
   */
  app.post<{
    Params: { id: string };
    Body: {
      baselineGraph: GraphVersionInput;
      proposalGraph: GraphVersionInput;
      baselineRun?: AnalysisInput["baselineRun"];
      canaryRun?: AnalysisInput["currentRun"];
    };
  }>("/proposals/:id/evaluate", async (request, reply) => {
    const { id } = request.params;
    const proposal = proposals.get(id);

    if (!proposal) {
      return reply.status(404).send({ error: "Proposal not found" });
    }

    if (proposal.status !== "draft") {
      return reply.status(400).send({
        error: `Proposal is in "${proposal.status}" state. Only "draft" proposals can be evaluated.`,
      });
    }

    const { baselineGraph, proposalGraph, baselineRun, canaryRun } = request.body;

    if (!baselineGraph || !proposalGraph) {
      return reply.status(400).send({
        error: "Missing required fields: baselineGraph, proposalGraph",
      });
    }

    // Transition to evaluating
    transitionProposal(proposal, "evaluating");

    try {
      // Phase 1: Run regression validation against evaluation dataset
      const evalResult = runValidationStep(proposal, proposalGraph, baselineGraph, baselineRun);

      proposal.evaluation = evalResult.evaluation;

      if (evalResult.status === "rejected") {
        transitionProposal(proposal, "rejected", evalResult.rejectionReason);
        return reply.status(200).send({
          id: proposal.id,
          status: proposal.status,
          evaluation: proposal.evaluation,
          rejectionReason: proposal.rejectionReason,
        });
      }

      // Phase 2: Transition to canary
      transitionProposal(proposal, "canary");

      // Phase 3: Run canary validation
      if (canaryRun) {
        const canaryResult = runCanaryStep(proposal, proposalGraph, baselineGraph, canaryRun);

        proposal.canary = canaryResult.canary;

        if (!canaryResult.passesCanary) {
          transitionProposal(proposal, "rejected", canaryResult.rejectionReason);
          return reply.status(200).send({
            id: proposal.id,
            status: proposal.status,
            evaluation: proposal.evaluation,
            canary: proposal.canary,
            rejectionReason: proposal.rejectionReason,
          });
        }
      }

      // Proposal passed all validations — stays in "canary" awaiting human approval
      return reply.status(200).send({
        id: proposal.id,
        status: proposal.status,
        evaluation: proposal.evaluation,
        canary: proposal.canary,
        message: "Proposal passed validation. Awaiting human approval.",
      });
    } catch (error) {
      // On error, reject the proposal
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      transitionProposal(proposal, "rejected", `Evaluation failed: ${errorMsg}`);
      return reply.status(500).send({
        id: proposal.id,
        status: proposal.status,
        error: errorMsg,
      });
    }
  });

  /**
   * POST /proposals/:id/approve — human approves a proposal
   */
  app.post<{
    Params: { id: string };
  }>("/proposals/:id/approve", async (request, reply) => {
    const { id } = request.params;
    const proposal = proposals.get(id);

    if (!proposal) {
      return reply.status(404).send({ error: "Proposal not found" });
    }

    if (proposal.status !== "canary") {
      return reply.status(400).send({
        error: `Proposal is in "${proposal.status}" state. Only "canary" proposals can be approved.`,
      });
    }

    transitionProposal(proposal, "approved");

    return reply.status(200).send({
      id: proposal.id,
      status: proposal.status,
      message: "Proposal approved. Graph version is now eligible for the publish flow.",
    });
  });

  /**
   * POST /proposals/:id/reject — reject a proposal
   */
  app.post<{
    Params: { id: string };
    Body: { reason: string };
  }>("/proposals/:id/reject", async (request, reply) => {
    const { id } = request.params;
    const { reason } = request.body;
    const proposal = proposals.get(id);

    if (!proposal) {
      return reply.status(404).send({ error: "Proposal not found" });
    }

    if (proposal.status === "approved" || proposal.status === "rejected") {
      return reply.status(400).send({
        error: `Proposal is in "${proposal.status}" state and cannot be rejected.`,
      });
    }

    transitionProposal(proposal, "rejected", reason ?? "Rejected by human");

    return reply.status(200).send({
      id: proposal.id,
      status: proposal.status,
      rejectionReason: proposal.rejectionReason,
    });
  });
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function runValidationStep(
  proposal: Proposal,
  proposalGraph: GraphVersionInput,
  baselineGraph: GraphVersionInput,
  baselineRun?: AnalysisInput["baselineRun"],
): {
  evaluation: ProposalEvaluation;
  status: ProposalStatus;
  rejectionReason?: string;
} {
  // Use provided baseline run or build a minimal one
  const baseRun = baselineRun ?? {
    id: "baseline-placeholder",
    graphVersionId: baselineGraph.id,
    aggregates: {
      runId: "baseline-placeholder",
      graphVersionId: baselineGraph.id,
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      overallPassRate: 0,
      overallScore: 0,
      caseAggregates: [],
      evaluatorAggregates: [],
      nodeFailureAggregates: [],
      timestamp: new Date(),
    },
    caseResults: [],
  };

  const analysisInput: AnalysisInput = {
    baselineRun: baseRun,
    currentRun: {
      id: `eval-${proposal.id}`,
      graphVersionId: proposalGraph.id,
      aggregates: baseRun.aggregates, // Placeholder — real evaluation populates this
      caseResults: [],
    },
    baselineGraph,
    currentGraph: proposalGraph,
  };

  const gateResult = runReleaseGate(analysisInput);

  const evaluation: ProposalEvaluation = {
    gateStatus: gateResult.status,
    passRate: gateResult.scoreDiffs.length > 0
      ? gateResult.scoreDiffs.reduce((sum, d) => sum + d.currentScore, 0) / gateResult.scoreDiffs.length
      : 0,
    improvements: gateResult.scoreDiffs
      .filter((d) => d.direction === "improved")
      .map((d) => ({
        evaluator: d.evaluator,
        baselineScore: d.baselineScore,
        candidateScore: d.currentScore,
        delta: d.absoluteDelta,
      })),
    newRegressions: gateResult.scoreDiffs
      .filter((d) => d.direction === "regressed")
      .map((d) => ({
        evaluator: d.evaluator,
        baselineScore: d.baselineScore,
        candidateScore: d.currentScore,
        delta: d.absoluteDelta,
      })),
    criticalFailures: gateResult.regressions
      .filter((r) => r.severity === "critical")
      .map((r) => `[${r.evaluator}] ${r.cause.slice(0, 100)}`),
    gateResultJson: gateResult as unknown as Record<string, unknown>,
  };

  const hasCriticalFailures = evaluation.criticalFailures.length > 0;
  const isBlocked = gateResult.status === "block";

  if (hasCriticalFailures) {
    return {
      evaluation,
      status: "rejected",
      rejectionReason: `Critical safety/compliance failures: ${evaluation.criticalFailures.join("; ")}`,
    };
  }

  if (isBlocked) {
    return {
      evaluation,
      status: "rejected",
      rejectionReason: `Gate blocked: ${gateResult.summary.slice(0, 200)}`,
    };
  }

  return { evaluation, status: "canary" };
}

function runCanaryStep(
  _proposal: Proposal,
  proposalGraph: GraphVersionInput,
  baselineGraph: GraphVersionInput,
  canaryRun: AnalysisInput["currentRun"],
): {
  canary: ProposalEvaluation;
  passesCanary: boolean;
  rejectionReason?: string;
} {
  const analysisInput: AnalysisInput = {
    baselineRun: {
      id: "canary-baseline",
      graphVersionId: baselineGraph.id,
      aggregates: {
        runId: "canary-baseline",
        graphVersionId: baselineGraph.id,
        totalCases: 0,
        passedCases: 0,
        failedCases: 0,
        overallPassRate: 0,
        overallScore: 0,
        caseAggregates: [],
        evaluatorAggregates: [],
        nodeFailureAggregates: [],
        timestamp: new Date(),
      },
      caseResults: [],
    },
    currentRun: canaryRun,
    baselineGraph,
    currentGraph: proposalGraph,
  };

  const gateResult = runReleaseGate(analysisInput);

  const canary: ProposalEvaluation = {
    gateStatus: gateResult.status,
    passRate: gateResult.scoreDiffs.length > 0
      ? gateResult.scoreDiffs.reduce((sum, d) => sum + d.currentScore, 0) / gateResult.scoreDiffs.length
      : 0,
    improvements: gateResult.scoreDiffs
      .filter((d) => d.direction === "improved")
      .map((d) => ({
        evaluator: d.evaluator,
        baselineScore: d.baselineScore,
        candidateScore: d.currentScore,
        delta: d.absoluteDelta,
      })),
    newRegressions: gateResult.scoreDiffs
      .filter((d) => d.direction === "regressed")
      .map((d) => ({
        evaluator: d.evaluator,
        baselineScore: d.baselineScore,
        candidateScore: d.currentScore,
        delta: d.absoluteDelta,
      })),
    criticalFailures: gateResult.regressions
      .filter((r) => r.severity === "critical")
      .map((r) => `[${r.evaluator}] ${r.cause.slice(0, 100)}`),
    gateResultJson: gateResult as unknown as Record<string, unknown>,
  };

  const hasCriticalFailures = canary.criticalFailures.length > 0;
  const isBlocked = gateResult.status === "block";

  const passesCanary = !hasCriticalFailures && !isBlocked;

  return {
    canary,
    passesCanary,
    rejectionReason: hasCriticalFailures
      ? `Canary critical failures: ${canary.criticalFailures.join("; ")}`
      : isBlocked
        ? `Canary gate blocked`
        : undefined,
  };
}
