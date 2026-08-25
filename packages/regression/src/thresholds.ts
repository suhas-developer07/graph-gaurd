/**
 * Regression detection thresholds.
 * These determine when a score change triggers WARN vs BLOCK.
 *
 * Two types of thresholds:
 * 1. Absolute: raw change in pass rate (e.g. drop from 0.95 to 0.80 = 0.15 absolute)
 * 2. Relative: percentage change relative to baseline (e.g. 0.95 → 0.80 = 15.8% relative drop)
 *
 * Critical safety violations always force BLOCK regardless of thresholds.
 */

export interface RegressionThresholds {
  /** Per-evaluator absolute thresholds */
  evaluatorThresholds: Record<string, EvaluatorThreshold>;
  /** Overall run thresholds */
  overallThresholds: OverallThresholds;
  /** Critical evaluators — any regression here is automatically BLOCK */
  criticalEvaluators: string[];
}

export interface EvaluatorThreshold {
  /** Absolute drop that triggers WARN (e.g. 0.05 = 5 percentage point drop) */
  warnAbsolute: number;
  /** Absolute drop that triggers BLOCK (e.g. 0.15 = 15 percentage point drop) */
  blockAbsolute: number;
  /** Relative drop (%) that triggers WARN (e.g. 10 = 10% relative drop) */
  warnRelative: number;
  /** Relative drop (%) that triggers BLOCK (e.g. 25 = 25% relative drop) */
  blockRelative: number;
}

export interface OverallThresholds {
  /** Overall pass rate drop that triggers WARN */
  warnAbsolute: number;
  /** Overall pass rate drop that triggers BLOCK */
  blockAbsolute: number;
  /** Overall pass rate relative drop (%) that triggers WARN */
  warnRelative: number;
  /** Overall pass rate relative drop (%) that triggers BLOCK */
  blockRelative: number;
}

/**
 * Default regression thresholds for GraphGuard.
 */
export const DEFAULT_REGRESSION_THRESHOLDS: RegressionThresholds = {
  evaluatorThresholds: {
    routing: {
      warnAbsolute: 0.05, // 5 percentage point drop
      blockAbsolute: 0.15, // 15 percentage point drop
      warnRelative: 5, // 5% relative drop
      blockRelative: 15, // 15% relative drop
    },
    grounding: {
      warnAbsolute: 0.10,
      blockAbsolute: 0.25,
      warnRelative: 10,
      blockRelative: 25,
    },
    compliance: {
      warnAbsolute: 0.0, // Any compliance regression is at least WARN
      blockAbsolute: 0.0, // Any compliance regression is BLOCK (critical)
      warnRelative: 0,
      blockRelative: 0,
    },
    escalation: {
      warnAbsolute: 0.0, // Any escalation regression is at least WARN
      blockAbsolute: 0.0, // Any escalation regression is BLOCK (critical)
      warnRelative: 0,
      blockRelative: 0,
    },
    response_quality: {
      warnAbsolute: 0.10,
      blockAbsolute: 0.25,
      warnRelative: 10,
      blockRelative: 25,
    },
  },
  overallThresholds: {
    warnAbsolute: 0.05,
    blockAbsolute: 0.15,
    warnRelative: 5,
    blockRelative: 15,
  },
  criticalEvaluators: ["compliance", "escalation"],
};

/**
 * Determine the severity of a regression for a specific evaluator.
 */
export function classifyRegressionSeverity(
  evaluator: string,
  absoluteDelta: number,
  relativeDelta: number,
  thresholds: RegressionThresholds = DEFAULT_REGRESSION_THRESHOLDS,
): "low" | "medium" | "high" | "critical" {
  // Critical evaluators — any regression is critical
  if (thresholds.criticalEvaluators.includes(evaluator)) {
    if (absoluteDelta < 0) return "critical";
    return "low";
  }

  const evalThreshold = thresholds.evaluatorThresholds[evaluator];
  if (!evalThreshold) {
    // Default thresholds for unknown evaluators
    if (absoluteDelta < -0.15 || relativeDelta < -15) return "high";
    if (absoluteDelta < -0.05 || relativeDelta < -5) return "medium";
    return "low";
  }

  // Check BLOCK thresholds first
  if (
    absoluteDelta <= -evalThreshold.blockAbsolute ||
    relativeDelta <= -evalThreshold.blockRelative
  ) {
    return "high";
  }

  // Check WARN thresholds
  if (
    absoluteDelta <= -evalThreshold.warnAbsolute ||
    relativeDelta <= -evalThreshold.warnRelative
  ) {
    return "medium";
  }

  return "low";
}

/**
 * Determine the gate status based on all regressions.
 */
export function determineGateStatus(
  severityCounts: Record<string, number>,
): "pass" | "warn" | "block" {
  // Any critical or high severity regression = BLOCK
  if ((severityCounts.critical ?? 0) > 0 || (severityCounts.high ?? 0) > 0) {
    return "block";
  }

  // Medium severity regressions = WARN
  if ((severityCounts.medium ?? 0) > 0) {
    return "warn";
  }

  return "pass";
}
