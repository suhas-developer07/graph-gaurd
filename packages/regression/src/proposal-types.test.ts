import { describe, it, expect } from "vitest";
import { DEFAULT_RANKING_CONFIG } from "./proposal-types";

describe("DEFAULT_RANKING_CONFIG", () => {
  it("has improvement weights for all standard evaluators", () => {
    expect(DEFAULT_RANKING_CONFIG.improvementWeights.routing).toBe(1.0);
    expect(DEFAULT_RANKING_CONFIG.improvementWeights.grounding).toBe(1.0);
    expect(DEFAULT_RANKING_CONFIG.improvementWeights.response_quality).toBe(1.0);
  });

  it("has higher weights for safety-critical evaluators", () => {
    expect(DEFAULT_RANKING_CONFIG.improvementWeights.compliance).toBe(2.0);
    expect(DEFAULT_RANKING_CONFIG.improvementWeights.escalation).toBe(2.0);
  });

  it("has heavier penalties for safety-critical evaluators", () => {
    expect(DEFAULT_RANKING_CONFIG.regressionPenalties.compliance).toBe(10.0);
    expect(DEFAULT_RANKING_CONFIG.regressionPenalties.escalation).toBe(10.0);
  });

  it("identifies critical evaluators", () => {
    expect(DEFAULT_RANKING_CONFIG.criticalEvaluators).toContain("compliance");
    expect(DEFAULT_RANKING_CONFIG.criticalEvaluators).toContain("escalation");
  });
});
