import type { Evaluator, EvaluationResult, EvaluationContext } from "../types";

/**
 * ResponseQualityEvaluator — scores the quality of the final response.
 * Uses heuristic scoring (length, structure, relevance indicators) without LLM dependency.
 * Phase 3 note: this evaluator doesn't require an LLM — it uses structural heuristics.
 */
export class ResponseQualityEvaluator implements Evaluator {
  readonly name = "response_quality";
  readonly requiresLlm = false;

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const { executionResult, testCase } = context;
    const response = executionResult.response ?? "";

    if (!response) {
      return {
        evaluator: this.name,
        score: 0,
        passed: false,
        explanation: "No response produced",
        confidence: 1.0,
        cleanJudgment: true,
      };
    }

    let score = 0;
    const factors: string[] = [];

    // Factor 1: Length — reasonable response (50-2000 chars)
    const len = response.length;
    if (len >= 50 && len <= 2000) {
      score += 0.3;
      factors.push("reasonable length");
    } else if (len < 50) {
      score += 0.1;
      factors.push("too short");
    } else {
      score += 0.2;
      factors.push("very long");
    }

    // Factor 2: Contains helpful phrases
    const helpfulPhrases = [
      "generally",
      "common",
      "may include",
      "consult",
      "healthcare",
      "professional",
      "recommend",
      "important",
      "note that",
    ];
    const helpfulCount = helpfulPhrases.filter((p) =>
      response.toLowerCase().includes(p),
    ).length;
    score += Math.min(helpfulCount * 0.05, 0.25);
    if (helpfulCount > 0) factors.push("helpful language");

    // Factor 3: No forbidden phrases (uncertainty indicators)
    const badPhrases = [
      "I don't know",
      "I'm not sure",
      "I cannot",
      "I can't",
      "no information",
    ];
    const badCount = badPhrases.filter((p) =>
      response.toLowerCase().includes(p),
    ).length;
    if (badCount > 0) {
      score -= badCount * 0.1;
      factors.push(`${badCount} uncertainty phrase(s)`);
    }

    // Factor 4: Addresses the question (word overlap with input)
    const inputWords = new Set(
      testCase.input
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
    const responseWords = response.toLowerCase().split(/\s+/);
    let overlap = 0;
    for (const word of responseWords) {
      if (inputWords.has(word)) overlap++;
    }
    if (inputWords.size > 0) {
      const relevance = overlap / inputWords.size;
      score += Math.min(relevance * 0.2, 0.2);
      if (relevance > 0.3) factors.push("relevant to question");
    }

    // Factor 5: References evidence if available
    if (
      executionResult.evidence.length > 0 &&
      response.length > 100
    ) {
      score += 0.1;
      factors.push("evidence-backed response");
    }

    // Clamp to 0-1
    score = Math.max(0, Math.min(1, score));

    const passed = score >= 0.6;

    return {
      evaluator: this.name,
      score,
      passed,
      explanation: `Quality score: ${(score * 100).toFixed(0)}% — ${factors.join(", ")}`,
      confidence: 0.7, // Heuristic-based — lower confidence than deterministic evaluators
      cleanJudgment: true,
    };
  }
}
