import type {
  Proposal,
  ProposalEvaluation,
  ProposalStatus,
  RankingConfig,
} from "./proposal-types";
import { DEFAULT_RANKING_CONFIG as DEFAULT_CONFIG } from "./proposal-types";
import type { GraphVersionInput, AnalysisInput } from "./types";
import type { RunAggregate } from "@graphguard/evaluation";
import { runReleaseGate } from "./release-gate";

/**
 * Validate a proposal against the evaluation dataset.
 * Returns the evaluation result and whether it passes critical thresholds.
 */
export function validateProposal(
  proposal: Proposal,
  proposalGraph: GraphVersionInput,
  baselineRun: AnalysisInput["baselineRun"],
  baselineGraph: GraphVersionInput,
): {
  evaluation: ProposalEvaluation;
  passesCritical: boolean;
  status: ProposalStatus;
  rejectionReason?: string;
} {
  // Build the analysis input — candidate vs original baseline
  const analysisInput: AnalysisInput = {
    baselineRun,
    currentRun: {
      id: `eval-${proposal.id}`,
      graphVersionId: proposalGraph.id,
      aggregates: buildCandidateAggregate(baselineRun.aggregates),
      caseResults: [], // Will be populated by the actual evaluation
    },
    baselineGraph,
    currentGraph: proposalGraph,
  };

  // Run the release gate
  const gateResult = runReleaseGate(analysisInput);

  // Build evaluation result
  const evaluation = buildEvaluation(proposal, gateResult, baselineRun.aggregates);

  // Check critical thresholds
  const { passesCritical, rejectionReason } = checkCriticalThresholds(evaluation);

  let status: ProposalStatus;
  if (!passesCritical) {
    status = "rejected";
  } else if (gateResult.status === "block") {
    status = "rejected";
  } else {
    status = "canary"; // Ready for canary validation
  }

  return {
    evaluation,
    passesCritical,
    status,
    rejectionReason,
  };
}

/**
 * Validate a proposal against the canary dataset.
 */
export function validateCanary(
  proposal: Proposal,
  proposalGraph: GraphVersionInput,
  canaryRun: AnalysisInput["currentRun"],
  baselineGraph: GraphVersionInput,
): {
  canary: ProposalEvaluation;
  passesCanary: boolean;
  status: ProposalStatus;
  rejectionReason?: string;
} {
  const analysisInput: AnalysisInput = {
    baselineRun: {
      id: `canary-baseline-${proposal.id}`,
      graphVersionId: baselineGraph.id,
      aggregates: buildEmptyAggregate(baselineGraph.id),
      caseResults: [],
    },
    currentRun: canaryRun,
    baselineGraph,
    currentGraph: proposalGraph,
  };

  const gateResult = runReleaseGate(analysisInput);

  const canary = buildEvaluation(proposal, gateResult, buildEmptyAggregate(proposalGraph.id));

  // Canary must pass — no critical failures
  const { passesCritical, rejectionReason } = checkCriticalThresholds(canary);
  const passesCanary = passesCritical && gateResult.status !== "block";

  let status: ProposalStatus;
  if (!passesCanary) {
    status = "rejected";
  } else {
    status = "canary"; // Ready for human approval
  }

  return {
    canary,
    passesCanary,
    status,
    rejectionReason,
  };
}

/**
 * Check if a proposal passes critical safety thresholds.
 * This is a hard filter — no ranking score can override this.
 */
function checkCriticalThresholds(
  evaluation: ProposalEvaluation,
): { passesCritical: boolean; rejectionReason?: string } {
  if (evaluation.criticalFailures.length > 0) {
    return {
      passesCritical: false,
      rejectionReason: `Critical safety/compliance failures detected: ${evaluation.criticalFailures.join("; ")}`,
    };
  }

  return { passesCritical: true };
}

/**
 * Build an evaluation result from a gate result.
 */
function buildEvaluation(
  _proposal: Proposal,
  gateResult: import("./types").GateResult,
  _baselineAgg: RunAggregate,
): ProposalEvaluation {
  // Find improvements on originally-regressed metrics
  const improvements: ProposalEvaluation["improvements"] = [];
  const newRegressions: ProposalEvaluation["newRegressions"] = [];

  for (const diff of gateResult.scoreDiffs) {
    if (diff.direction === "improved") {
      improvements.push({
        evaluator: diff.evaluator,
        baselineScore: diff.baselineScore,
        candidateScore: diff.currentScore,
        delta: diff.absoluteDelta,
      });
    } else if (diff.direction === "regressed") {
      newRegressions.push({
        evaluator: diff.evaluator,
        baselineScore: diff.baselineScore,
        candidateScore: diff.currentScore,
        delta: diff.absoluteDelta,
      });
    }
  }

  // Check for critical failures
  const criticalFailures: string[] = [];
  for (const regression of gateResult.regressions) {
    if (regression.severity === "critical") {
      criticalFailures.push(
        `[${regression.evaluator}] ${regression.cause.slice(0, 100)}`,
      );
    }
  }

  return {
    gateStatus: gateResult.status,
    passRate: gateResult.scoreDiffs.length > 0
      ? gateResult.scoreDiffs.reduce((sum, d) => sum + d.currentScore, 0) / gateResult.scoreDiffs.length
      : 0,
    improvements,
    newRegressions,
    criticalFailures,
    gateResultJson: gateResult as unknown as Record<string, unknown>,
  };
}

/**
 * Build a candidate aggregate from a proposal's expected improvements.
 * In a real implementation, this would be the actual evaluation result.
 * For now, we estimate based on the proposal's expected behavior.
 */
function buildCandidateAggregate(
  baseline: RunAggregate,
): RunAggregate {
  // In production, this would be the actual evaluation result
  // For now, return the baseline as a placeholder
  return { ...baseline };
}

/**
 * Build an empty aggregate (for canary baseline).
 */
function buildEmptyAggregate(graphVersionId: string): RunAggregate {
  return {
    runId: "empty",
    graphVersionId,
    totalCases: 0,
    passedCases: 0,
    failedCases: 0,
    overallPassRate: 0,
    overallScore: 0,
    caseAggregates: [],
    evaluatorAggregates: [],
    nodeFailureAggregates: [],
    timestamp: new Date(),
  };
}

/**
 * Rank multiple proposals using the explicit ranking formula.
 *
 * Ranking Score = Σ(improvement_i * weight_i) - Σ(new_regression_j * penalty_j)
 *
 * Hard filter applied BEFORE ranking:
 *   - Any critical safety/compliance failure → candidate DISQUALIFIED
 */
export function rankProposals(
  proposals: Proposal[],
  config: RankingConfig = DEFAULT_CONFIG,
): Proposal[] {
  // Step 1: Apply hard filter — disqualify candidates with critical failures
  const qualified = proposals.filter((p) => {
    if (p.evaluation?.criticalFailures && p.evaluation.criticalFailures.length > 0) {
      return false;
    }
    if (p.status === "rejected") {
      return false;
    }
    return true;
  });

  // Step 2: Compute ranking scores
  for (const proposal of qualified) {
    proposal.rankingScore = computeRankingScore(proposal, config);
  }

  // Step 3: Sort by ranking score descending
  qualified.sort((a, b) => (b.rankingScore ?? 0) - (a.rankingScore ?? 0));

  return qualified;
}

/**
 * Compute the ranking score for a single proposal.
 */
function computeRankingScore(
  proposal: Proposal,
  config: RankingConfig,
): number {
  let score = 0;

  // Improvements (positive contribution)
  for (const improvement of proposal.evaluation?.improvements ?? []) {
    const weight = config.improvementWeights[improvement.evaluator] ?? 1.0;
    score += improvement.delta * weight;
  }

  // Regressions (negative contribution with penalty)
  for (const regression of proposal.evaluation?.newRegressions ?? []) {
    const penalty = config.regressionPenalties[regression.evaluator] ?? 2.0;
    score -= Math.abs(regression.delta) * penalty;
  }

  return score;
}
