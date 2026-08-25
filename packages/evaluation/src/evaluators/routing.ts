import type { Evaluator, EvaluationResult, EvaluationContext } from "../types";

/**
 * RoutingEvaluator — deterministic check comparing the actual node path
 * against the expected route from the test case.
 */
export class RoutingEvaluator implements Evaluator {
  readonly name = "routing";
  readonly requiresLlm = false;

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const { executionResult, testCase } = context;
    const expectedRoute = testCase.expectedRoute;

    // Find the last routing-relevant node in the path (skip "router" itself)
    const routingNodes = executionResult.nodePath.filter(
      (n) => n.nodeType !== "router",
    );

    // The "key routing decision" is which non-router node was reached first
    const actualRoute = routingNodes[0]?.nodeId ?? "none";

    const passed = actualRoute === expectedRoute;

    return {
      evaluator: this.name,
      score: passed ? 1.0 : 0.0,
      passed,
      explanation: passed
        ? `Route matched: expected "${expectedRoute}", got "${actualRoute}"`
        : `Route mismatch: expected "${expectedRoute}", got "${actualRoute}"`,
      confidence: 1.0, // Deterministic — always confident
      cleanJudgment: true,
    };
  }
}
