import type { Evaluator, EvaluationResult, EvaluationContext } from "../types";

// ─── Thresholds ──────────────────────────────────────────────────────────────

const LATENCY_THRESHOLD_MS = 5000; // 5 seconds
const TOKEN_THRESHOLD = 2000;
const COST_THRESHOLD_USD = 0.01; // $0.01 — effectively free tier

// ─── LatencyEvaluator ────────────────────────────────────────────────────────

export class LatencyEvaluator implements Evaluator {
  readonly name = "latency";
  readonly requiresLlm = false;

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const { executionResult } = context;
    const totalMs = executionResult.totalDurationMs;

    // Normalize: 0ms = 1.0, threshold = 0.0
    const score = Math.max(
      0,
      1 - totalMs / LATENCY_THRESHOLD_MS,
    );

    const passed = score >= 0.5;

    return {
      evaluator: this.name,
      score,
      passed,
      explanation: `Total execution time: ${totalMs}ms (threshold: ${LATENCY_THRESHOLD_MS}ms)`,
      confidence: 1.0,
      cleanJudgment: true,
    };
  }
}

// ─── TokenUsageEvaluator ─────────────────────────────────────────────────────

export class TokenUsageEvaluator implements Evaluator {
  readonly name = "token_usage";
  readonly requiresLlm = false;

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const { executionResult } = context;
    const totalTokens = executionResult.totalTokens;

    // Normalize: 0 tokens = 1.0, threshold = 0.0
    const score = Math.max(
      0,
      1 - totalTokens / TOKEN_THRESHOLD,
    );

    const passed = score >= 0.5;

    return {
      evaluator: this.name,
      score,
      passed,
      explanation: `Total tokens used: ${totalTokens} (threshold: ${TOKEN_THRESHOLD})`,
      confidence: 1.0,
      cleanJudgment: true,
    };
  }
}

// ─── CostEvaluator ───────────────────────────────────────────────────────────

export class CostEvaluator implements Evaluator {
  readonly name = "cost";
  readonly requiresLlm = false;

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const { executionResult } = context;
    const totalCost = executionResult.totalCost;

    // For free tier, cost is always $0
    // Score: lower cost = higher score
    const score =
      totalCost <= 0
        ? 1.0
        : Math.max(0, 1 - totalCost / COST_THRESHOLD_USD);

    const passed = score >= 0.5;

    return {
      evaluator: this.name,
      score,
      passed,
      explanation: `Estimated cost: $${totalCost.toFixed(4)} (free tier)`,
      confidence: 1.0,
      cleanJudgment: true,
    };
  }
}
