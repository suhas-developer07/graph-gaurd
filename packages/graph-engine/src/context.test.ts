import { describe, it, expect } from "vitest";
import {
  createExecutionContext,
  recordNodeExecution,
  addEvidence,
  setVariable,
  recordLLMCall,
  completeContext,
  errorContext,
  haltContext,
  getExecutionTrace,
} from "./context";

describe("ExecutionContext", () => {
  it("should create a new context with defaults", () => {
    const ctx = createExecutionContext("gv-1");
    expect(ctx.graphVersionId).toBe("gv-1");
    expect(ctx.conversationId).toBeDefined();
    expect(ctx.nodeHistory).toHaveLength(0);
    expect(ctx.variables).toEqual({});
    expect(ctx.retrievedEvidence).toHaveLength(0);
    expect(ctx.metadata.status).toBe("running");
  });

  it("should use provided conversationId", () => {
    const ctx = createExecutionContext("gv-1", "conv-123");
    expect(ctx.conversationId).toBe("conv-123");
  });

  it("should set initial variables", () => {
    const ctx = createExecutionContext("gv-1", undefined, { key: "value" });
    expect(ctx.variables.key).toBe("value");
  });

  it("should record node execution immutably", () => {
    const ctx = createExecutionContext("gv-1");
    const updated = recordNodeExecution(ctx, {
      nodeId: "n1",
      nodeType: "router",
      startedAt: new Date(),
      completedAt: new Date(),
      status: "success",
      input: {},
      output: {},
    });
    expect(ctx.nodeHistory).toHaveLength(0); // original unchanged
    expect(updated.nodeHistory).toHaveLength(1);
  });

  it("should add evidence immutably", () => {
    const ctx = createExecutionContext("gv-1");
    const updated = addEvidence(ctx, [
      { content: "test", source: "test", score: 0.9, retrievedAt: new Date() },
    ]);
    expect(ctx.retrievedEvidence).toHaveLength(0);
    expect(updated.retrievedEvidence).toHaveLength(1);
  });

  it("should set variables immutably", () => {
    const ctx = createExecutionContext("gv-1");
    const updated = setVariable(ctx, "key", "value");
    expect(ctx.variables.key).toBeUndefined();
    expect(updated.variables.key).toBe("value");
  });

  it("should track LLM call metadata", () => {
    const ctx = createExecutionContext("gv-1");
    const updated = recordLLMCall(ctx, {
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      tokens: 100,
      latencyMs: 500,
      estimatedCost: 0,
      traceId: "trace-1",
    });
    expect(updated.metadata.totalLlmCalls).toBe(1);
    expect(updated.metadata.totalTokens).toBe(100);
    expect(updated.metadata.estimatedCost).toBe(0);
  });

  it("should mark context as completed", () => {
    const ctx = createExecutionContext("gv-1");
    const completed = completeContext(ctx);
    expect(completed.metadata.status).toBe("completed");
    expect(completed.metadata.completedAt).toBeInstanceOf(Date);
  });

  it("should mark context as errored", () => {
    const ctx = createExecutionContext("gv-1");
    const errored = errorContext(ctx, "something went wrong");
    expect(errored.metadata.status).toBe("error");
    expect(errored.metadata.error).toBe("something went wrong");
  });

  it("should mark context as halted", () => {
    const ctx = createExecutionContext("gv-1");
    const halted = haltContext(ctx, "safety violation");
    expect(halted.metadata.status).toBe("halted");
    expect(halted.metadata.error).toBe("safety violation");
  });

  it("should generate a readable execution trace", () => {
    let ctx = createExecutionContext("gv-1", "conv-1");
    ctx = recordNodeExecution(ctx, {
      nodeId: "n1",
      nodeType: "router",
      startedAt: new Date(),
      completedAt: new Date(),
      status: "success",
      input: {},
      output: {},
    });
    const trace = getExecutionTrace(ctx);
    expect(trace).toContain("conv-1");
    expect(trace).toContain("n1");
    expect(trace).toContain("router");
    expect(trace).toContain("✓");
  });
});
