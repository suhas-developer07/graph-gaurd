import type {
  GraphDiff,
  NodeDiffSummary,
  NodeChangeDiff,
  EdgeDiffSummary,
  EdgeChangeDiff,
  FieldChange,
  SemanticChange,
  GraphVersionInput,
} from "./types";

/**
 * Compute the structural and semantic diff between two graph versions.
 */
export function computeGraphDiff(
  baseline: GraphVersionInput,
  current: GraphVersionInput,
): GraphDiff {
  const baselineNodeMap = new Map(baseline.nodes.map((n) => [n.id, n]));
  const currentNodeMap = new Map(current.nodes.map((n) => [n.id, n]));
  const baselineEdgeMap = new Map(baseline.edges.map((e) => [e.id, e]));
  const currentEdgeMap = new Map(current.edges.map((e) => [e.id, e]));

  // ── Node Diffs ───────────────────────────────────────────────────────────
  const nodesAdded: NodeDiffSummary[] = [];
  const nodesRemoved: NodeDiffSummary[] = [];
  const nodesChanged: NodeChangeDiff[] = [];
  const semanticChanges: SemanticChange[] = [];

  // Nodes in current but not in baseline = added
  for (const [id, node] of currentNodeMap) {
    if (!baselineNodeMap.has(id)) {
      nodesAdded.push({ nodeId: id, nodeType: node.type });
    }
  }

  // Nodes in baseline but not in current = removed
  for (const [id, node] of baselineNodeMap) {
    if (!currentNodeMap.has(id)) {
      nodesRemoved.push({ nodeId: id, nodeType: node.type });
    }
  }

  // Nodes in both = check for changes
  for (const [id, baselineNode] of baselineNodeMap) {
    const currentNode = currentNodeMap.get(id);
    if (!currentNode) continue;

    const changes: FieldChange[] = [];

    // Check prompt change
    if (baselineNode.prompt !== currentNode.prompt) {
      changes.push({
        field: "prompt",
        oldValue: baselineNode.prompt,
        newValue: currentNode.prompt,
      });
      semanticChanges.push({
        nodeId: id,
        nodeType: currentNode.type,
        changeType: "prompt",
        description: `Prompt changed for node "${id}"`,
        oldValue: baselineNode.prompt,
        newValue: currentNode.prompt,
      });
    }

    // Check type change
    if (baselineNode.type !== currentNode.type) {
      changes.push({
        field: "type",
        oldValue: baselineNode.type,
        newValue: currentNode.type,
      });
      semanticChanges.push({
        nodeId: id,
        nodeType: currentNode.type,
        changeType: "other",
        description: `Node type changed from "${baselineNode.type}" to "${currentNode.type}"`,
        oldValue: baselineNode.type,
        newValue: currentNode.type,
      });
    }

    // Check activationConfig change
    const configChanged = !deepEqual(
      baselineNode.activationConfig,
      currentNode.activationConfig,
    );
    if (configChanged) {
      changes.push({
        field: "activationConfig",
        oldValue: baselineNode.activationConfig,
        newValue: currentNode.activationConfig,
      });

      // Identify specific semantic sub-changes
      const configChanges = diffActivationConfig(
        id,
        currentNode.type,
        baselineNode.activationConfig,
        currentNode.activationConfig,
      );
      semanticChanges.push(...configChanges);
    }

    if (changes.length > 0) {
      nodesChanged.push({
        nodeId: id,
        nodeType: currentNode.type,
        changes,
      });
    }
  }

  // ── Edge Diffs ───────────────────────────────────────────────────────────
  const edgesAdded: EdgeDiffSummary[] = [];
  const edgesRemoved: EdgeDiffSummary[] = [];
  const edgesChanged: EdgeChangeDiff[] = [];

  for (const [id, edge] of currentEdgeMap) {
    if (!baselineEdgeMap.has(id)) {
      edgesAdded.push({
        edgeId: id,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
      });
    }
  }

  for (const [id, edge] of baselineEdgeMap) {
    if (!currentEdgeMap.has(id)) {
      edgesRemoved.push({
        edgeId: id,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
      });
    }
  }

  for (const [id, baselineEdge] of baselineEdgeMap) {
    const currentEdge = currentEdgeMap.get(id);
    if (!currentEdge) continue;

    const changes: FieldChange[] = [];

    if (baselineEdge.sourceNodeId !== currentEdge.sourceNodeId) {
      changes.push({
        field: "sourceNodeId",
        oldValue: baselineEdge.sourceNodeId,
        newValue: currentEdge.sourceNodeId,
      });
    }

    if (baselineEdge.targetNodeId !== currentEdge.targetNodeId) {
      changes.push({
        field: "targetNodeId",
        oldValue: baselineEdge.targetNodeId,
        newValue: currentEdge.targetNodeId,
      });
    }

    const conditionChanged = !deepEqual(
      baselineEdge.condition,
      currentEdge.condition,
    );
    if (conditionChanged) {
      changes.push({
        field: "condition",
        oldValue: baselineEdge.condition,
        newValue: currentEdge.condition,
      });
    }

    if (changes.length > 0) {
      edgesChanged.push({
        edgeId: id,
        sourceNodeId: currentEdge.sourceNodeId,
        targetNodeId: currentEdge.targetNodeId,
        changes,
      });
    }
  }

  return {
    baselineVersionId: baseline.id,
    currentVersionId: current.id,
    nodesAdded,
    nodesRemoved,
    nodesChanged,
    edgesAdded,
    edgesRemoved,
    edgesChanged,
    semanticChanges,
  };
}

/**
 * Diff activation config between baseline and current, producing semantic change descriptors.
 */
function diffActivationConfig(
  nodeId: string,
  nodeType: string,
  baseline: Record<string, unknown>,
  current: Record<string, unknown>,
): SemanticChange[] {
  const changes: SemanticChange[] = [];

  // Check for routing rules changes (router nodes)
  if (nodeType === "router") {
    const baselineRules = baseline.rules as
      | Array<{ condition: string; targetNodeId: string }>
      | undefined;
    const currentRules = current.rules as
      | Array<{ condition: string; targetNodeId: string }>
      | undefined;

    if (!deepEqual(baselineRules, currentRules)) {
      changes.push({
        nodeId,
        nodeType,
        changeType: "routing_rules",
        description: `Routing rules changed for router node "${nodeId}"`,
        oldValue: baselineRules ?? [],
        newValue: currentRules ?? [],
      });
    }
  }

  // Check for model changes (specialist nodes)
  if (nodeType === "specialist") {
    if (baseline.model !== current.model) {
      changes.push({
        nodeId,
        nodeType,
        changeType: "model",
        description: `Model changed from "${String(baseline.model)}" to "${String(current.model)}"`,
        oldValue: baseline.model,
        newValue: current.model,
      });
    }
  }

  // Check for top-level config changes
  const allKeys = new Set([
    ...Object.keys(baseline),
    ...Object.keys(current),
  ]);
  for (const key of allKeys) {
    if (key === "rules" || key === "model") continue; // Already handled
    if (!deepEqual(baseline[key], current[key])) {
      changes.push({
        nodeId,
        nodeType,
        changeType: "activation_config",
        description: `Config "${key}" changed for node "${nodeId}"`,
        oldValue: baseline[key],
        newValue: current[key],
      });
    }
  }

  return changes;
}

/**
 * Deep equality check for plain objects/arrays.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a !== "object" || typeof b !== "object") return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!deepEqual(objA[key], objB[key])) return false;
  }

  return true;
}

/**
 * Get a summary of changed node IDs from a graph diff.
 */
export function getChangedNodeIds(diff: GraphDiff): string[] {
  const ids = new Set<string>();
  for (const n of diff.nodesAdded) ids.add(n.nodeId);
  for (const n of diff.nodesRemoved) ids.add(n.nodeId);
  for (const n of diff.nodesChanged) ids.add(n.nodeId);
  return [...ids];
}

/**
 * Get semantic change node IDs (nodes with prompt or config changes).
 */
export function getSemanticChangeNodeIds(diff: GraphDiff): string[] {
  return [...new Set(diff.semanticChanges.map((sc) => sc.nodeId))];
}
