import type {
  Regression,
  GraphDiff,
} from "./types";
import type { RunAggregate } from "@graphguard/evaluation";

/**
 * Root-cause analysis result — explains why a regression likely occurred.
 */
export interface RootCauseAnalysis {
  regressionId: string;
  /** Confidence score (0-1) in this root cause */
  confidence: number;
  /** The likely root cause node */
  likelyCauseNode: string;
  /** Specific change that likely caused the regression */
  likelyCauseChange: string;
  /** Supporting evidence */
  supportingEvidence: string[];
  /** Correlation strength between graph change and failure pattern */
  correlationStrength: "strong" | "moderate" | "weak";
}

/**
 * Analyze root causes for all regressions, correlating with graph diff.
 */
export function analyzeRootCauses(
  regressions: Regression[],
  graphDiff: GraphDiff,
  baseline: RunAggregate,
  current: RunAggregate,
): RootCauseAnalysis[] {
  return regressions.map((reg) =>
    analyzeSingleRootCause(reg, graphDiff, baseline, current),
  );
}

/**
 * Analyze root cause for a single regression.
 */
function analyzeSingleRootCause(
  regression: Regression,
  graphDiff: GraphDiff,
  _baseline: RunAggregate,
  _current: RunAggregate,
): RootCauseAnalysis {
  const evidence = regression.evidence;
  const cluster = evidence.cluster;
  const changedNodes = evidence.changedNodes;
  const semanticChanges = graphDiff.semanticChanges;

  let confidence = 0;
  let likelyCauseNode = regression.affectedNode;
  let likelyCauseChange = "Unknown";
  const supportingEvidence: string[] = [];

  // Strategy 1: Match cluster's node to a changed node
  if (cluster.clusterKey.startsWith("node:")) {
    const clusterNodeId = cluster.clusterKey.slice(5);
    const nodeChanged = changedNodes.includes(clusterNodeId);

    if (nodeChanged) {
      confidence = 0.9;
      likelyCauseNode = clusterNodeId;

      const nodeChanges = semanticChanges.filter(
        (sc) => sc.nodeId === clusterNodeId,
      );
      if (nodeChanges.length > 0) {
        likelyCauseChange = nodeChanges.map((sc) => sc.description).join("; ");
        supportingEvidence.push(
          `Node "${clusterNodeId}" was modified between baseline and current version.`,
        );
        for (const change of nodeChanges) {
          supportingEvidence.push(`  - ${change.description}`);
        }
      }
    } else {
      confidence = 0.3;
      likelyCauseChange = `Failures clustered at node "${clusterNodeId}" but no direct change detected.`;
      supportingEvidence.push(
        `Node "${clusterNodeId}" was not directly modified, suggesting indirect effects or data-dependent behavior.`,
      );
    }
  }

  // Strategy 2: Match cluster's intent to changed nodes
  if (cluster.clusterKey.startsWith("intent:") && changedNodes.length > 0) {
    const intent = cluster.clusterKey.slice(7);
    confidence = 0.6;

    const relatedChanges = semanticChanges.filter((sc) => {
      return (
        sc.description.toLowerCase().includes(intent.toLowerCase()) ||
        sc.nodeId.toLowerCase().includes(intent.split("_")[0] ?? "")
      );
    });

    if (relatedChanges.length > 0) {
      confidence = 0.75;
      likelyCauseNode = relatedChanges[0]!.nodeId;
      likelyCauseChange = relatedChanges
        .map((sc) => sc.description)
        .join("; ");
      supportingEvidence.push(
        `Intent "${intent}" correlates with changes to node "${likelyCauseNode}".`,
      );
    } else {
      likelyCauseChange = `Intent "${intent}" has increased failures, likely caused by changes to routing or retrieval logic.`;
      supportingEvidence.push(
        `Changed nodes: ${changedNodes.join(", ")}.`,
      );
    }
  }

  // Strategy 3: Prompt changes are high-confidence causes
  const promptChanges = semanticChanges.filter(
    (sc) => sc.changeType === "prompt",
  );
  if (promptChanges.length > 0) {
    for (const pc of promptChanges) {
      const nodeInCluster =
        cluster.clusterKey.includes(pc.nodeId) ||
        changedNodes.includes(pc.nodeId);
      if (nodeInCluster) {
        confidence = Math.max(confidence, 0.85);
        likelyCauseNode = pc.nodeId;
        likelyCauseChange = pc.description;
        supportingEvidence.push(
          `Prompt change in node "${pc.nodeId}" is the likely root cause.`,
        );
        break;
      }
    }
  }

  // Strategy 4: Routing rule changes
  const routingChanges = semanticChanges.filter(
    (sc) => sc.changeType === "routing_rules",
  );
  if (routingChanges.length > 0) {
    const evaluatorIsRouting = cluster.evaluators.includes("routing");
    if (evaluatorIsRouting) {
      confidence = Math.max(confidence, 0.9);
      likelyCauseNode = routingChanges[0]!.nodeId;
      likelyCauseChange = routingChanges[0]!.description;
      supportingEvidence.push(
        `Routing rules changed in node "${routingChanges[0]!.nodeId}", directly affecting routing evaluator results.`,
      );
    }
  }

  // Strategy 5: Model changes
  const modelChanges = semanticChanges.filter(
    (sc) => sc.changeType === "model",
  );
  if (modelChanges.length > 0) {
    const evaluatorIsQuality = cluster.evaluators.includes("response_quality");
    if (evaluatorIsQuality) {
      confidence = Math.max(confidence, 0.7);
      likelyCauseNode = modelChanges[0]!.nodeId;
      likelyCauseChange = modelChanges[0]!.description;
      supportingEvidence.push(
        `Model change in node "${modelChanges[0]!.nodeId}" likely affected response quality.`,
      );
    }
  }

  // Determine correlation strength
  let correlationStrength: "strong" | "moderate" | "weak";
  if (confidence >= 0.7) {
    correlationStrength = "strong";
  } else if (confidence >= 0.4) {
    correlationStrength = "moderate";
  } else {
    correlationStrength = "weak";
  }

  // Fallback explanation
  if (supportingEvidence.length === 0) {
    supportingEvidence.push(
      "No direct correlation found between graph changes and this regression.",
      "This may be caused by non-deterministic LLM behavior or data-dependent effects.",
    );
  }

  return {
    regressionId: regression.id,
    confidence,
    likelyCauseNode,
    likelyCauseChange,
    supportingEvidence,
    correlationStrength,
  };
}
