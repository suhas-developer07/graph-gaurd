import { randomUUID } from "crypto";
import type {
  ExecutionContext,
  NodeHistoryEntry,
  RetrievedEvidence,
  LLMCallRecord,
} from "@graphguard/domain";

/**
 * Create a new execution context for a graph execution.
 */
export function createExecutionContext(
  graphVersionId: string,
  conversationId?: string,
  initialVariables?: Record<string, unknown>,
): ExecutionContext {
  return {
    conversationId: conversationId ?? randomUUID(),
    graphVersionId,
    nodeHistory: [],
    variables: initialVariables ?? {},
    retrievedEvidence: [],
    metadata: {
      startedAt: new Date(),
      totalLlmCalls: 0,
      totalTokens: 0,
      estimatedCost: 0,
      status: "running",
    },
  };
}

/**
 * Record a node execution in the context history.
 */
export function recordNodeExecution(
  context: ExecutionContext,
  entry: NodeHistoryEntry,
): ExecutionContext {
  return {
    ...context,
    nodeHistory: [...context.nodeHistory, entry],
  };
}

/**
 * Add retrieved evidence to the context.
 */
export function addEvidence(
  context: ExecutionContext,
  evidence: RetrievedEvidence[],
): ExecutionContext {
  return {
    ...context,
    retrievedEvidence: [...context.retrievedEvidence, ...evidence],
  };
}

/**
 * Update a variable in the context.
 */
export function setVariable(
  context: ExecutionContext,
  key: string,
  value: unknown,
): ExecutionContext {
  return {
    ...context,
    variables: { ...context.variables, [key]: value },
  };
}

/**
 * Record an LLM call in the context metadata.
 */
export function recordLLMCall(
  context: ExecutionContext,
  call: LLMCallRecord,
): ExecutionContext {
  return {
    ...context,
    metadata: {
      ...context.metadata,
      totalLlmCalls: context.metadata.totalLlmCalls + 1,
      totalTokens: context.metadata.totalTokens + call.tokens,
      estimatedCost: context.metadata.estimatedCost + call.estimatedCost,
    },
  };
}

/**
 * Mark the context as completed.
 */
export function completeContext(context: ExecutionContext): ExecutionContext {
  return {
    ...context,
    metadata: {
      ...context.metadata,
      completedAt: new Date(),
      status: "completed",
    },
  };
}

/**
 * Mark the context as errored.
 */
export function errorContext(
  context: ExecutionContext,
  error: string,
): ExecutionContext {
  return {
    ...context,
    metadata: {
      ...context.metadata,
      completedAt: new Date(),
      status: "error",
      error,
    },
  };
}

/**
 * Mark the context as halted (by safety node).
 */
export function haltContext(
  context: ExecutionContext,
  reason: string,
): ExecutionContext {
  return {
    ...context,
    metadata: {
      ...context.metadata,
      completedAt: new Date(),
      status: "halted",
      error: reason,
    },
  };
}

/**
 * Get the node history formatted as a readable trace.
 */
export function getExecutionTrace(context: ExecutionContext): string {
  const lines: string[] = [];
  lines.push(`Execution Trace for conversation ${context.conversationId}`);
  lines.push(`Graph Version: ${context.graphVersionId}`);
  lines.push(`Status: ${context.metadata.status}`);
  lines.push(
    `Duration: ${context.metadata.completedAt ? context.metadata.completedAt.getTime() - context.metadata.startedAt.getTime() : "in progress"}ms`,
  );
  lines.push(`LLM Calls: ${context.metadata.totalLlmCalls}`);
  lines.push(`Total Tokens: ${context.metadata.totalTokens}`);
  lines.push(`Estimated Cost: $${context.metadata.estimatedCost.toFixed(6)}`);
  lines.push("");
  lines.push("Node Path:");

  for (let i = 0; i < context.nodeHistory.length; i++) {
    const entry = context.nodeHistory[i]!;
    const statusIcon = entry.status === "success" ? "✓" : entry.status === "error" ? "✗" : "○";
    lines.push(
      `  ${i + 1}. ${statusIcon} [${entry.nodeType}] ${entry.nodeId} (${entry.status})`,
    );
    if (entry.error) {
      lines.push(`     Error: ${entry.error}`);
    }
    if (entry.llmCalls && entry.llmCalls.length > 0) {
      lines.push(`     LLM Calls: ${entry.llmCalls.length}`);
    }
  }

  return lines.join("\n");
}
