// ─── Proposal Types ──────────────────────────────────────────────────────────

/**
 * Promotion states for proposals.
 * Each transition is a discrete, logged action — no skipping states.
 */
export type ProposalStatus =
  | "draft"         // Created but not yet evaluated
  | "evaluating"    // Running regression validation
  | "canary"        // Passed regression, now running canary validation
  | "approved"      // Human approved — eligible for publish flow
  | "rejected";     // Failed at some stage (with reason)

/**
 * What kind of change this proposal proposes.
 */
export type ProposalChangeType = "prompt" | "activation_config";

/**
 * A proposal to fix a regression in an agent graph.
 */
export interface Proposal {
  /** Unique ID */
  id: string;
  /** The graph version this proposal is modifying */
  graphVersionId: string;
  /** The target node to modify */
  targetNode: string;
  /** Type of change */
  changeType: ProposalChangeType;
  /** The proposed change (new prompt text or new activation_config) */
  change: Record<string, unknown>;
  /** Human-readable rationale for why this change should help */
  rationale: string;
  /** The regression this proposal is responding to */
  regressionId: string;
  /** How this proposal was generated */
  generatedBy: "human" | "heuristic" | "llm";
  /** Current promotion status */
  status: ProposalStatus;
  /** Rejection reason (if rejected) */
  rejectionReason?: string;
  /** Evaluation results (populated during validation) */
  evaluation?: ProposalEvaluation;
  /** Canary results (populated during canary validation) */
  canary?: ProposalEvaluation;
  /** Ranking score (populated after evaluation) */
  rankingScore?: number;
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Evaluation result for a proposal.
 */
export interface ProposalEvaluation {
  /** The gate result from Phase 4 */
  gateStatus: "pass" | "warn" | "block";
  /** Overall pass rate vs baseline */
  passRate: number;
  /** Score improvements on the originally-regressed metrics */
  improvements: Array<{
    evaluator: string;
    baselineScore: number;
    candidateScore: number;
    delta: number;
  }>;
  /** Any new regressions introduced */
  newRegressions: Array<{
    evaluator: string;
    baselineScore: number;
    candidateScore: number;
    delta: number;
  }>;
  /** Whether any critical safety/compliance cases failed */
  criticalFailures: string[];
  /** Full gate result JSON for inspection */
  gateResultJson: Record<string, unknown>;
}

/**
 * Input for creating a proposal.
 */
export interface CreateProposalInput {
  graphVersionId: string;
  targetNode: string;
  changeType: ProposalChangeType;
  change: Record<string, unknown>;
  rationale: string;
  regressionId: string;
  generatedBy: "human" | "heuristic" | "llm";
}

/**
 * Context for generating a proposal via LLM.
 */
export interface ProposalGenerationContext {
  /** The regression to fix */
  regressionId: string;
  /** The affected node */
  targetNode: string;
  /** The node's current prompt (if prompt-based change) */
  currentPrompt?: string;
  /** The node's current activation config (if config-based change) */
  currentActivationConfig?: Record<string, unknown>;
  /** The failure cluster details */
  failureCluster: {
    clusterKey: string;
    failureCount: number;
    evaluators: string[];
    caseIds: string[];
    commonTags: Record<string, string>;
  };
  /** Sample failing test case inputs (for LLM context) */
  sampleFailingInputs: string[];
  /** The change type to generate */
  changeType: ProposalChangeType;
}

/**
 * Result of generating a proposal.
 */
export interface GeneratedProposal {
  /** The proposed change */
  change: Record<string, unknown>;
  /** Human-readable rationale */
  rationale: string;
  /** Confidence in this fix (0-1) */
  confidence: number;
}

/**
 * Ranking formula documentation (for ADR).
 *
 * Ranking Score = Σ(improvement_i * weight_i) - Σ(new_regression_j * penalty_j)
 *
 * Where:
 *   improvement_i = max(0, candidate_score_i - baseline_score_i) for each evaluator
 *   weight_i = 1.0 for standard evaluators, 2.0 for safety-critical evaluators
 *   new_regression_j = max(0, baseline_score_j - candidate_score_j) for each evaluator
 *   penalty_j = 2.0 for standard evaluators, 10.0 for safety-critical evaluators
 *
 * Hard filter (applied BEFORE ranking):
 *   - If any critical safety/compliance case fails → candidate is DISQUALIFIED
 *   - No ranking score can override this
 */
export interface RankingConfig {
  /** Weight for improvements per evaluator */
  improvementWeights: Record<string, number>;
  /** Penalty for regressions per evaluator */
  regressionPenalties: Record<string, number>;
  /** Evaluators where failure = automatic disqualification */
  criticalEvaluators: string[];
}

export const DEFAULT_RANKING_CONFIG: RankingConfig = {
  improvementWeights: {
    routing: 1.0,
    grounding: 1.0,
    compliance: 2.0,  // Safety-critical
    escalation: 2.0,  // Safety-critical
    response_quality: 1.0,
    latency: 0.5,
    token_usage: 0.3,
    cost: 0.3,
  },
  regressionPenalties: {
    routing: 2.0,
    grounding: 2.0,
    compliance: 10.0, // Safety-critical — heavy penalty
    escalation: 10.0, // Safety-critical — heavy penalty
    response_quality: 2.0,
    latency: 1.0,
    token_usage: 0.5,
    cost: 0.5,
  },
  criticalEvaluators: ["compliance", "escalation"],
};
