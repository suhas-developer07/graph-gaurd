import { describe, it, expect } from "vitest";
import { validateGraph } from "./validation";
import type { Node, Edge } from "@graphguard/domain";

describe("validateGraph", () => {
  it("should pass a valid simple graph", () => {
    const nodes: Node[] = [
      { id: "n1", graphVersionId: "gv1", type: "router", prompt: "", activationConfig: { mode: "rule", rules: [] } },
      { id: "n2", graphVersionId: "gv1", type: "final_response", prompt: "", activationConfig: {} },
    ];
    const edges: Edge[] = [
      { id: "e1", graphVersionId: "gv1", sourceNodeId: "n1", targetNodeId: "n2", condition: null },
    ];
    const result = validateGraph(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should detect duplicate node IDs", () => {
    const nodes: Node[] = [
      { id: "n1", graphVersionId: "gv1", type: "router", prompt: "", activationConfig: {} },
      { id: "n1", graphVersionId: "gv1", type: "specialist", prompt: "", activationConfig: {} },
    ];
    const result = validateGraph(nodes, []);
    expect(result.valid).toBe(false);
    // Duplicate IDs detected + multiple entry nodes (both have no incoming edges)
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.type === "duplicate_node_id")).toBe(true);
  });

  it("should detect dangling edges (non-existent source)", () => {
    const nodes: Node[] = [
      { id: "n1", graphVersionId: "gv1", type: "router", prompt: "", activationConfig: {} },
    ];
    const edges: Edge[] = [
      { id: "e1", graphVersionId: "gv1", sourceNodeId: "nonexistent", targetNodeId: "n1", condition: null },
    ];
    const result = validateGraph(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("dangling_edge");
  });

  it("should detect dangling edges (non-existent target)", () => {
    const nodes: Node[] = [
      { id: "n1", graphVersionId: "gv1", type: "router", prompt: "", activationConfig: {} },
    ];
    const edges: Edge[] = [
      { id: "e1", graphVersionId: "gv1", sourceNodeId: "n1", targetNodeId: "nonexistent", condition: null },
    ];
    const result = validateGraph(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("dangling_edge");
  });

  it("should detect cycles", () => {
    const nodes: Node[] = [
      { id: "n1", graphVersionId: "gv1", type: "router", prompt: "", activationConfig: {} },
      { id: "n2", graphVersionId: "gv1", type: "specialist", prompt: "", activationConfig: {} },
    ];
    const edges: Edge[] = [
      { id: "e1", graphVersionId: "gv1", sourceNodeId: "n1", targetNodeId: "n2", condition: null },
      { id: "e2", graphVersionId: "gv1", sourceNodeId: "n2", targetNodeId: "n1", condition: null },
    ];
    const result = validateGraph(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "cycle_detected")).toBe(true);
  });

  it("should detect missing entry node", () => {
    const nodes: Node[] = [
      { id: "n1", graphVersionId: "gv1", type: "router", prompt: "", activationConfig: {} },
      { id: "n2", graphVersionId: "gv1", type: "final_response", prompt: "", activationConfig: {} },
    ];
    // Both nodes have incoming edges — no entry node
    const edges: Edge[] = [
      { id: "e1", graphVersionId: "gv1", sourceNodeId: "n1", targetNodeId: "n2", condition: null },
      { id: "e2", graphVersionId: "gv1", sourceNodeId: "n2", targetNodeId: "n1", condition: null },
    ];
    const result = validateGraph(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "missing_entry_node" || e.type === "cycle_detected")).toBe(true);
  });

  it("should detect multiple entry nodes", () => {
    const nodes: Node[] = [
      { id: "n1", graphVersionId: "gv1", type: "router", prompt: "", activationConfig: {} },
      { id: "n2", graphVersionId: "gv1", type: "specialist", prompt: "", activationConfig: {} },
    ];
    // No edges — both are entry nodes
    const result = validateGraph(nodes, []);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("multiple_entry_nodes");
  });

  it("should detect multiple final_response nodes", () => {
    const nodes: Node[] = [
      { id: "n1", graphVersionId: "gv1", type: "router", prompt: "", activationConfig: {} },
      { id: "n2", graphVersionId: "gv1", type: "final_response", prompt: "", activationConfig: {} },
      { id: "n3", graphVersionId: "gv1", type: "final_response", prompt: "", activationConfig: {} },
    ];
    const edges: Edge[] = [
      { id: "e1", graphVersionId: "gv1", sourceNodeId: "n1", targetNodeId: "n2", condition: null },
      { id: "e2", graphVersionId: "gv1", sourceNodeId: "n1", targetNodeId: "n3", condition: null },
    ];
    const result = validateGraph(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("final_response"))).toBe(true);
  });
});
