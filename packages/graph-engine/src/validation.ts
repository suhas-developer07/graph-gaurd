import type { Node, Edge, ValidationResult, ValidationError, NodeType } from "@graphguard/domain";

/**
 * Node types that are allowed to have incoming cycles (none by default).
 * Router nodes could theoretically loop, but we disallow it by default
 * to keep execution bounded. Add to this set if a specific use case requires it.
 */
const CYCLE_ALLOWED_TYPES: Set<NodeType> = new Set();

/**
 * Node types that can only appear once in a graph.
 */
const SINGLETON_TYPES: Set<NodeType> = new Set(["final_response", "escalation"]);

/**
 * Validate a graph version before it can be published or executed.
 * Returns a structured list of validation errors.
 */
export function validateGraph(nodes: Node[], edges: Edge[]): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Check for duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      errors.push({
        type: "duplicate_node_id",
        message: `Duplicate node ID: "${node.id}"`,
        nodeId: node.id,
      });
    }
    nodeIds.add(node.id);
  }

  // 2. Check for dangling edges
  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId)) {
      errors.push({
        type: "dangling_edge",
        message: `Edge "${edge.id}" references non-existent source node "${edge.sourceNodeId}"`,
        edgeId: edge.id,
      });
    }
    if (!nodeIds.has(edge.targetNodeId)) {
      errors.push({
        type: "dangling_edge",
        message: `Edge "${edge.id}" references non-existent target node "${edge.targetNodeId}"`,
        edgeId: edge.id,
      });
    }
  }

  // 3. Check for cycles (DFS-based cycle detection)
  const cycleErrors = detectCycles(nodes, edges);
  errors.push(...cycleErrors);

  // 4. Check entry node (exactly one node with no incoming edges)
  const entryErrors = validateEntryNode(nodes, edges);
  errors.push(...entryErrors);

  // 5. Check singleton node types (final_response, escalation should appear at most once)
  const typeCounts = new Map<NodeType, number>();
  for (const node of nodes) {
    typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
  }
  for (const [type, count] of typeCounts) {
    if (SINGLETON_TYPES.has(type) && count > 1) {
      errors.push({
        type: "invalid_transition",
        message: `Node type "${type}" should appear at most once, but found ${count}`,
      });
    }
  }

  // 6. Check that router nodes with rules mode have valid targets
  for (const node of nodes) {
    if (node.type === "router") {
      const config = node.activationConfig as { mode?: string; rules?: Array<{ targetNodeId: string }> };
      if (config.mode === "rule" && config.rules) {
        for (const rule of config.rules) {
          if (!nodeIds.has(rule.targetNodeId)) {
            errors.push({
              type: "invalid_transition",
              message: `Router node "${node.id}" has a rule targeting non-existent node "${rule.targetNodeId}"`,
              nodeId: node.id,
            });
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detect cycles in the graph using DFS.
 * Only nodes whose type is in CYCLE_ALLOWED_TYPES can participate in cycles.
 */
function detectCycles(nodes: Node[], edges: Edge[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    adj.set(node.id, []);
  }
  for (const edge of edges) {
    if (nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)) {
      adj.get(edge.sourceNodeId)!.push(edge.targetNodeId);
    }
  }

  // DFS cycle detection
  const WHITE = 0; // unvisited
  const GRAY = 1; // visiting (in current path)
  const BLACK = 2; // visited
  const color = new Map<string, number>();
  for (const node of nodes) {
    color.set(node.id, WHITE);
  }

  const nodeTypeMap = new Map(nodes.map((n) => [n.id, n.type]));

  function dfs(u: string, path: string[]): boolean {
    color.set(u, GRAY);
    path.push(u);

    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) {
        // Found a cycle — check if all nodes in the cycle allow cycles
        const cycleStart = path.indexOf(v);
        const cycleNodes = path.slice(cycleStart);
        const allAllowed = cycleNodes.every((nodeId) => {
          const nodeType = nodeTypeMap.get(nodeId);
          return nodeType && CYCLE_ALLOWED_TYPES.has(nodeType);
        });

        if (!allAllowed) {
          errors.push({
            type: "cycle_detected",
            message: `Cycle detected involving nodes: ${cycleNodes.join(" → ")} → ${v}`,
          });
        }
        path.pop();
        color.set(u, BLACK);
        return true;
      }

      if (color.get(v) === WHITE) {
        dfs(v, path);
      }
    }

    path.pop();
    color.set(u, BLACK);
    return false;
  }

  for (const node of nodes) {
    if (color.get(node.id) === WHITE) {
      dfs(node.id, []);
    }
  }

  return errors;
}

/**
 * Validate that there is exactly one entry node (a node with no incoming edges).
 */
function validateEntryNode(nodes: Node[], edges: Edge[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Find nodes with no incoming edges
  const hasIncoming = new Set<string>();
  for (const edge of edges) {
    if (nodeIds.has(edge.targetNodeId)) {
      hasIncoming.add(edge.targetNodeId);
    }
  }

  const entryNodes = nodes.filter((n) => !hasIncoming.has(n.id));

  if (entryNodes.length === 0) {
    errors.push({
      type: "missing_entry_node",
      message: "Graph has no entry node (every node has incoming edges)",
    });
  } else if (entryNodes.length > 1) {
    errors.push({
      type: "multiple_entry_nodes",
      message: `Graph has multiple entry nodes: ${entryNodes.map((n) => `"${n.id}" (${n.type})`).join(", ")}`,
    });
  }

  return errors;
}
