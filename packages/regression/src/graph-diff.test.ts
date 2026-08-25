import { describe, it, expect } from "vitest";
import { computeGraphDiff, getChangedNodeIds, getSemanticChangeNodeIds } from "./graph-diff";
import type { GraphVersionInput } from "./types";

function makeGraph(
  id: string,
  nodes: GraphVersionInput["nodes"],
  edges: GraphVersionInput["edges"] = [],
): GraphVersionInput {
  return { id, nodes, edges };
}

describe("computeGraphDiff", () => {
  it("detects added nodes", () => {
    const baseline = makeGraph("v1", [
      { id: "n1", type: "router", prompt: "Route", activationConfig: {} },
    ]);
    const current = makeGraph("v2", [
      { id: "n1", type: "router", prompt: "Route", activationConfig: {} },
      { id: "n2", type: "retrieval", prompt: "Retrieve", activationConfig: {} },
    ]);

    const diff = computeGraphDiff(baseline, current);
    expect(diff.nodesAdded).toHaveLength(1);
    expect(diff.nodesAdded[0]!.nodeId).toBe("n2");
    expect(diff.nodesRemoved).toHaveLength(0);
  });

  it("detects removed nodes", () => {
    const baseline = makeGraph("v1", [
      { id: "n1", type: "router", prompt: "Route", activationConfig: {} },
      { id: "n2", type: "retrieval", prompt: "Retrieve", activationConfig: {} },
    ]);
    const current = makeGraph("v2", [
      { id: "n1", type: "router", prompt: "Route", activationConfig: {} },
    ]);

    const diff = computeGraphDiff(baseline, current);
    expect(diff.nodesRemoved).toHaveLength(1);
    expect(diff.nodesRemoved[0]!.nodeId).toBe("n2");
    expect(diff.nodesAdded).toHaveLength(0);
  });

  it("detects prompt changes", () => {
    const baseline = makeGraph("v1", [
      { id: "n1", type: "router", prompt: "Old prompt", activationConfig: {} },
    ]);
    const current = makeGraph("v2", [
      { id: "n1", type: "router", prompt: "New prompt", activationConfig: {} },
    ]);

    const diff = computeGraphDiff(baseline, current);
    expect(diff.nodesChanged).toHaveLength(1);
    expect(diff.nodesChanged[0]!.changes).toHaveLength(1);
    expect(diff.nodesChanged[0]!.changes[0]!.field).toBe("prompt");
    expect(diff.semanticChanges).toHaveLength(1);
    expect(diff.semanticChanges[0]!.changeType).toBe("prompt");
  });

  it("detects activation config changes", () => {
    const baseline = makeGraph("v1", [
      { id: "n1", type: "router", prompt: "Route", activationConfig: { mode: "rule" } },
    ]);
    const current = makeGraph("v2", [
      { id: "n1", type: "router", prompt: "Route", activationConfig: { mode: "llm" } },
    ]);

    const diff = computeGraphDiff(baseline, current);
    expect(diff.nodesChanged).toHaveLength(1);
    expect(diff.semanticChanges.length).toBeGreaterThan(0);
  });

  it("detects routing rule changes as semantic changes", () => {
    const baseline = makeGraph("v1", [
      { id: "n1", type: "router", prompt: "Route", activationConfig: { rules: [{ condition: "input contains help", targetNodeId: "n2" }] } },
    ]);
    const current = makeGraph("v2", [
      { id: "n1", type: "router", prompt: "Route", activationConfig: { rules: [{ condition: "input contains emergency", targetNodeId: "n3" }] } },
    ]);

    const diff = computeGraphDiff(baseline, current);
    const routingChanges = diff.semanticChanges.filter(
      (sc) => sc.changeType === "routing_rules",
    );
    expect(routingChanges).toHaveLength(1);
    expect(routingChanges[0]!.nodeId).toBe("n1");
  });

  it("detects model changes as semantic changes", () => {
    const baseline = makeGraph("v1", [
      { id: "n1", type: "specialist", prompt: "Answer", activationConfig: { model: "llama-3.1-8b-instant" } },
    ]);
    const current = makeGraph("v2", [
      { id: "n1", type: "specialist", prompt: "Answer", activationConfig: { model: "llama-3.3-70b-versatile" } },
    ]);

    const diff = computeGraphDiff(baseline, current);
    const modelChanges = diff.semanticChanges.filter(
      (sc) => sc.changeType === "model",
    );
    expect(modelChanges).toHaveLength(1);
    expect(modelChanges[0]!.description).toContain("llama-3.3-70b-versatile");
  });

  it("detects edge additions and removals", () => {
    const baseline = makeGraph("v1", [
      { id: "n1", type: "router", prompt: "R", activationConfig: {} },
      { id: "n2", type: "retrieval", prompt: "Ret", activationConfig: {} },
    ], [
      { id: "e1", sourceNodeId: "n1", targetNodeId: "n2", condition: null },
    ]);
    const current = makeGraph("v2", [
      { id: "n1", type: "router", prompt: "R", activationConfig: {} },
      { id: "n2", type: "retrieval", prompt: "Ret", activationConfig: {} },
    ], [
      { id: "e2", sourceNodeId: "n1", targetNodeId: "n2", condition: null },
    ]);

    const diff = computeGraphDiff(baseline, current);
    expect(diff.edgesRemoved).toHaveLength(1);
    expect(diff.edgesAdded).toHaveLength(1);
  });

  it("detects edge condition changes", () => {
    const baseline = makeGraph("v1", [
      { id: "n1", type: "router", prompt: "R", activationConfig: {} },
      { id: "n2", type: "retrieval", prompt: "Ret", activationConfig: {} },
    ], [
      { id: "e1", sourceNodeId: "n1", targetNodeId: "n2", condition: { type: "contains", value: "help" } },
    ]);
    const current = makeGraph("v2", [
      { id: "n1", type: "router", prompt: "R", activationConfig: {} },
      { id: "n2", type: "retrieval", prompt: "Ret", activationConfig: {} },
    ], [
      { id: "e1", sourceNodeId: "n1", targetNodeId: "n2", condition: { type: "contains", value: "emergency" } },
    ]);

    const diff = computeGraphDiff(baseline, current);
    expect(diff.edgesChanged).toHaveLength(1);
    expect(diff.edgesChanged[0]!.changes[0]!.field).toBe("condition");
  });

  it("handles no changes", () => {
    const graph = makeGraph("v1", [
      { id: "n1", type: "router", prompt: "Route", activationConfig: {} },
    ]);

    const diff = computeGraphDiff(graph, { ...graph, id: "v2" });
    expect(diff.nodesAdded).toHaveLength(0);
    expect(diff.nodesRemoved).toHaveLength(0);
    expect(diff.nodesChanged).toHaveLength(0);
    expect(diff.semanticChanges).toHaveLength(0);
  });
});

describe("getChangedNodeIds", () => {
  it("returns all changed node IDs", () => {
    const baseline = makeGraph("v1", [
      { id: "n1", type: "router", prompt: "Old", activationConfig: {} },
      { id: "n2", type: "retrieval", prompt: "Ret", activationConfig: {} },
    ]);
    const current = makeGraph("v2", [
      { id: "n1", type: "router", prompt: "New", activationConfig: {} },
      { id: "n3", type: "specialist", prompt: "Spec", activationConfig: {} },
    ]);

    const diff = computeGraphDiff(baseline, current);
    const changedIds = getChangedNodeIds(diff);
    expect(changedIds).toContain("n1"); // changed
    expect(changedIds).toContain("n2"); // removed
    expect(changedIds).toContain("n3"); // added
  });
});

describe("getSemanticChangeNodeIds", () => {
  it("returns only nodes with semantic changes", () => {
    const baseline = makeGraph("v1", [
      { id: "n1", type: "router", prompt: "Old prompt", activationConfig: {} },
      { id: "n2", type: "retrieval", prompt: "Ret", activationConfig: {} },
    ]);
    const current = makeGraph("v2", [
      { id: "n1", type: "router", prompt: "New prompt", activationConfig: {} },
      { id: "n2", type: "retrieval", prompt: "Ret", activationConfig: {} },
    ]);

    const diff = computeGraphDiff(baseline, current);
    const semanticIds = getSemanticChangeNodeIds(diff);
    expect(semanticIds).toContain("n1");
    expect(semanticIds).not.toContain("n2");
  });
});
