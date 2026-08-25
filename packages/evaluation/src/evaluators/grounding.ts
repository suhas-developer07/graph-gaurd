import type { Evaluator, EvaluationResult, EvaluationContext } from "../types";

/**
 * GroundingEvaluator — checks if the response is grounded in retrieved evidence.
 * Uses cosine similarity between response claims and evidence snippets.
 */
export class GroundingEvaluator implements Evaluator {
  readonly name = "grounding";
  readonly requiresLlm = false;

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const { executionResult, testCase } = context;

    const response = executionResult.response ?? "";
    const evidence = executionResult.evidence;

    if (!response) {
      return {
        evaluator: this.name,
        score: 0,
        passed: false,
        explanation: "No response produced to evaluate for grounding",
        confidence: 1.0,
        cleanJudgment: true,
      };
    }

    if (evidence.length === 0) {
      return {
        evaluator: this.name,
        score: 0,
        passed: false,
        explanation: "No evidence retrieved — response cannot be grounded",
        confidence: 1.0,
        cleanJudgment: true,
      };
    }

    // Simple word-overlap grounding check
    const responseWords = new Set(
      response.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
    );
    const evidenceWords = new Set(
      evidence
        .map((e) => e.content.toLowerCase())
        .join(" ")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );

    // Calculate overlap
    let overlapCount = 0;
    for (const word of responseWords) {
      if (evidenceWords.has(word)) overlapCount++;
    }

    const score =
      responseWords.size > 0 ? overlapCount / responseWords.size : 0;

    // Check if expected evidence IDs are covered
    const expectedEvidence = testCase.expectedBehavior.expectedRoute;
    const hasExpectedEvidence =
      !expectedEvidence ||
      evidence.some((e) => e.source === expectedEvidence || e.score > 0.5);

    const passed = score >= 0.5 && hasExpectedEvidence;

    const ungroundedWords = [...responseWords].filter(
      (w) => !evidenceWords.has(w),
    );

    return {
      evaluator: this.name,
      score,
      passed,
      explanation: passed
        ? `Response is grounded (${(score * 100).toFixed(0)}% word overlap with evidence)`
        : `Response has ${(score * 100).toFixed(0)}% word overlap with evidence. Ungrounded terms include: ${ungroundedWords.slice(0, 5).join(", ")}`,
      evidenceSnippets: evidence.map((e) => e.content),
      confidence: 0.85, // Heuristic-based — moderate confidence
      cleanJudgment: true,
    };
  }
}
