import { describe, it, expect } from "vitest";
import { executeGraph } from "./runtime";
import { createExampleGraph, createInvalidGraph } from "./example-graph";
import { createMockProvider } from "@graphguard/llm";

describe("executeGraph", () => {
  it("should execute the example graph end-to-end", async () => {
    const graph = createExampleGraph();
    const mockLlm = createMockProvider(
      JSON.stringify({ nextNodeId: "retrieval-node", reason: "general question" }),
    );

    const result = await executeGraph(graph, "What is NeuroCalm?", {
      llmProvider: mockLlm,
    });

    expect(result.success).toBe(true);
    expect(result.context.nodeHistory.length).toBeGreaterThan(0);
    expect(result.context.metadata.status).toBe("completed");
    // Should have visited multiple nodes
    const nodeTypes = result.context.nodeHistory.map((h) => h.nodeType);
    expect(nodeTypes).toContain("router");
  });

  it("should reject an invalid graph before execution", async () => {
    const graph = createInvalidGraph();
    const result = await executeGraph(graph, "test input");

    expect(result.success).toBe(false);
    expect(result.error).toContain("validation failed");
  });

  it("should handle escalation path", async () => {
    const graph = createExampleGraph();
    const result = await executeGraph(graph, "I need emergency help immediately", {
      variables: { input: "I need emergency help immediately" },
    });

    // The router should route to escalation (keyword match)
    // or safety should redirect to escalation
    const nodeTypes = result.context.nodeHistory.map((h) => h.nodeType);
    const hasEscalation = nodeTypes.includes("escalation");
    expect(hasEscalation).toBe(true);
  });

  it("should record LLM calls in the trace", async () => {
    const graph = createExampleGraph();
    const mockLlm = createMockProvider(
      JSON.stringify({ nextNodeId: "retrieval-node", reason: "general" }),
    );

    const result = await executeGraph(graph, "What medications do you have?", {
      llmProvider: mockLlm,
    });

    expect(result.context.metadata.totalLlmCalls).toBeGreaterThan(0);
  });

  it("should handle safety node detecting violations", async () => {
    const graph = createExampleGraph();
    // Router → retrieval → specialist → safety
    // The specialist response should trigger a safety violation
    const mockLlm = createMockProvider("You should stop taking your current medication immediately.");

    const result = await executeGraph(graph, "What should I take?", {
      llmProvider: mockLlm,
      variables: { input: "What should I take?" },
    });

    // Safety should detect "stop taking" and redirect to escalation
    const nodeTypes = result.context.nodeHistory.map((h) => h.nodeType);
    const hasEscalation = nodeTypes.includes("escalation");
    expect(hasEscalation).toBe(true);
  });

  it("should return empty results when knowledge base is empty", async () => {
    const graph = createExampleGraph();
    const mockLlm = createMockProvider(
      JSON.stringify({ nextNodeId: "retrieval-node", reason: "general" }),
    );

    const result = await executeGraph(graph, "test", {
      llmProvider: mockLlm,
      knowledgeBase: [],
    });

    // Should still succeed, just with no evidence
    expect(result.success).toBe(true);
  });

  it("should track timing in node history", async () => {
    const graph = createExampleGraph();
    const mockLlm = createMockProvider(
      JSON.stringify({ nextNodeId: "retrieval-node", reason: "general" }),
    );

    const result = await executeGraph(graph, "test", {
      llmProvider: mockLlm,
    });

    for (const entry of result.context.nodeHistory) {
      expect(entry.startedAt).toBeInstanceOf(Date);
      expect(entry.completedAt).toBeInstanceOf(Date);
      expect(entry.completedAt.getTime()).toBeGreaterThanOrEqual(entry.startedAt.getTime());
    }
  });

  it("should produce a readable execution trace", async () => {
    const graph = createExampleGraph();
    const mockLlm = createMockProvider(
      JSON.stringify({ nextNodeId: "retrieval-node", reason: "general" }),
    );

    const result = await executeGraph(graph, "test", {
      llmProvider: mockLlm,
    });

    const { getExecutionTrace } = await import("./context");
    const trace = getExecutionTrace(result.context);
    expect(trace).toContain("Execution Trace");
    expect(trace).toContain("Node Path:");
  });
});
