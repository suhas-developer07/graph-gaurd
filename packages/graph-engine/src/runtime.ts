import { randomUUID } from "crypto";
import type {
  Node,
  Edge,
  GraphVersion,
  ExecutionContext,
  NodeExecutionResult,
  GraphExecutionResult,
  NodeHistoryEntry,
  RetrievedEvidence,
  RouterConfig,
  SpecialistConfig,
  SafetyConfig,
  FinalResponseConfig,
  RetrievalConfig,
} from "@graphguard/domain";
import type { LLMProvider } from "@graphguard/llm";
import {
  createExecutionContext,
  recordNodeExecution,
  addEvidence,
  recordLLMCall,
  completeContext,
  errorContext,
} from "./context";
import { validateGraph } from "./validation";
import { validateNodeConfig } from "./node-configs";

/** Maximum number of nodes to visit in a single execution (safety bound) */
const MAX_NODE_VISITS = 50;

/**
 * Execute a graph version against a given input.
 * Returns the full execution trace (node path, retrieved evidence, final response, all LLM calls).
 */
export async function executeGraph(
  graphVersion: GraphVersion,
  input: string,
  options: {
    llmProvider?: LLMProvider;
    knowledgeBase?: Array<{ id: string; content: string; source: string }>;
    conversationId?: string;
    variables?: Record<string, unknown>;
    traceId?: string;
  } = {},
): Promise<GraphExecutionResult> {
  // Validate the graph before execution
  const validation = validateGraph(graphVersion.nodes, graphVersion.edges);
  if (!validation.valid) {
    return {
      success: false,
      context: errorContext(
        createExecutionContext(graphVersion.id, options.conversationId),
        `Graph validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
      ),
      error: `Graph validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
    };
  }

  // Create execution context
  let context = createExecutionContext(
    graphVersion.id,
    options.conversationId,
    { ...options.variables, input },
  );

  // Find entry node (node with no incoming edges)
  const entryNode = findEntryNode(graphVersion.nodes, graphVersion.edges);
  if (!entryNode) {
    return {
      success: false,
      context: errorContext(context, "No entry node found"),
      error: "No entry node found",
    };
  }

  const traceId = options.traceId ?? randomUUID();
  let currentNodeId: string | null = entryNode.id;
  let nodeVisitCount = 0;

  // Execute nodes until we reach a terminal node or error
  while (currentNodeId && nodeVisitCount < MAX_NODE_VISITS) {
    nodeVisitCount++;

    const node = graphVersion.nodes.find((n) => n.id === currentNodeId);
    if (!node) {
      context = errorContext(context, `Node "${currentNodeId}" not found in graph`);
      break;
    }

    // Validate node config
    const configValidation = validateNodeConfig(node);
    if (!configValidation.valid) {
      context = errorContext(
        context,
        `Invalid config for node "${node.id}": ${configValidation.errors.join("; ")}`,
      );
      break;
    }

    // Execute the node
    const startTime = new Date();
    let result: NodeExecutionResult;

    try {
      result = await executeNode(node, context, options.llmProvider, options.knowledgeBase, traceId);
    } catch (err) {
      result = {
        nodeId: node.id,
        nodeType: node.type,
        success: false,
        output: {},
        nextNodeId: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const completedAt = new Date();

    // Record the execution
    const historyEntry: NodeHistoryEntry = {
      nodeId: node.id,
      nodeType: node.type,
      startedAt: startTime,
      completedAt,
      status: result.success ? "success" : "error",
      input: { input, variables: context.variables },
      output: result.output,
      error: result.error,
      llmCalls: result.llmCalls,
    };

    context = recordNodeExecution(context, historyEntry);

    // Add evidence if retrieved
    if (result.evidence && result.evidence.length > 0) {
      context = addEvidence(context, result.evidence);
    }

    // Record LLM calls
    if (result.llmCalls) {
      for (const call of result.llmCalls) {
        context = recordLLMCall(context, call);
      }
    }

    // Check for errors or halts
    if (!result.success) {
      context = errorContext(context, result.error ?? "Node execution failed");
      return {
        success: false,
        context,
        error: result.error ?? "Node execution failed",
      };
    }

    // Check if this is a terminal node
    if (node.type === "final_response") {
      context = completeContext(context);
      return {
        success: true,
        context,
        response: result.output.response as string | undefined,
      };
    }

    // Check if this is an escalation node
    if (node.type === "escalation") {
      context = completeContext(context);
      return {
        success: true,
        context,
        response: result.output.message as string ?? "This conversation requires human assistance.",
      };
    }

    // Move to next node
    if (result.nextNodeId) {
      currentNodeId = result.nextNodeId;
    } else {
      // Node didn't specify a next node — follow edges from this node
      // This handles retrieval, specialist, and safety nodes that don't
      // explicitly choose a routing target
      const outEdges = graphVersion.edges.filter((e) => e.sourceNodeId === node.id);
      currentNodeId = outEdges.length > 0 ? outEdges[0]!.targetNodeId : null;
    }
  }

  if (nodeVisitCount >= MAX_NODE_VISITS) {
    context = errorContext(
      context,
      `Execution exceeded maximum node visits (${MAX_NODE_VISITS})`,
    );
    return {
      success: false,
      context,
      error: `Execution exceeded maximum node visits (${MAX_NODE_VISITS})`,
    };
  }

  context = completeContext(context);
  return { success: true, context };
}

/**
 * Execute a single node and return the result.
 */
async function executeNode(
  node: Node,
  context: ExecutionContext,
  llmProvider?: LLMProvider,
  knowledgeBase?: Array<{ id: string; content: string; source: string }>,
  traceId?: string,
): Promise<NodeExecutionResult> {
  switch (node.type) {
    case "router":
      return executeRouter(node, context, llmProvider, traceId);
    case "retrieval":
      return executeRetrieval(node, context, llmProvider, knowledgeBase, traceId);
    case "specialist":
      return executeSpecialist(node, context, llmProvider, traceId);
    case "safety":
      return executeSafety(node, context);
    case "escalation":
      return executeEscalation(node, context);
    case "final_response":
      return executeFinalResponse(node, context);
    default:
      return {
        nodeId: node.id,
        nodeType: node.type,
        success: false,
        output: {},
        nextNodeId: null,
        error: `Unknown node type: ${node.type}`,
      };
  }
}

/**
 * Execute a router node.
 * Supports both deterministic (rule-based) and LLM-driven routing.
 */
async function executeRouter(
  node: Node,
  context: ExecutionContext,
  llmProvider?: LLMProvider,
  traceId?: string,
): Promise<NodeExecutionResult> {
  const config = node.activationConfig as RouterConfig;

  if (config.mode === "rule" && config.rules) {
    // Deterministic rule-based routing
    for (const rule of config.rules) {
      if (evaluateCondition(rule.condition, context.variables)) {
        return {
          nodeId: node.id,
          nodeType: "router",
          success: true,
          output: { routing: "rule", matchedRule: rule.condition, target: rule.targetNodeId },
          nextNodeId: rule.targetNodeId,
        };
      }
    }
    // No rule matched — use default target if configured, otherwise stop
    return {
      nodeId: node.id,
      nodeType: "router",
      success: true,
      output: { routing: "rule", matchedRule: "default", target: config.defaultTargetNodeId ?? null },
      nextNodeId: config.defaultTargetNodeId ?? null,
    };
  }

  // LLM-driven routing
  if (!llmProvider) {
    return {
      nodeId: node.id,
      nodeType: "router",
      success: false,
      output: {},
      nextNodeId: null,
      error: "LLM provider required for LLM-mode routing but none provided",
    };
  }

  // Get available next nodes
  // (In a full implementation, we'd look up edges from the graph version)
  // For now, we use the routing prompt to constrain the output

  const systemPrompt =
    config.routingPrompt ??
    `You are a router node. Based on the conversation, decide which node to go to next.
     Respond with a JSON object: { "nextNodeId": "<node_id>", "reason": "<brief reason>" }`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content: `Conversation context:\n${JSON.stringify(context.variables, null, 2)}\n\nInput: ${context.variables.input as string ?? ""}`,
    },
  ];

  const response = await llmProvider.complete({
    messages,
    model: "llama-3.1-8b-instant", // fast model for routing decisions
    temperature: 0,
    traceId,
    responseSchema: undefined, // We'll parse manually
  });

  // Parse the response
  let parsed: { nextNodeId?: string; reason?: string };
  try {
    parsed = JSON.parse(response.content);
  } catch {
    return {
      nodeId: node.id,
      nodeType: "router",
      success: false,
      output: { rawResponse: response.content },
      nextNodeId: null,
      error: `Failed to parse router response as JSON: ${response.content}`,
    };
  }

  const llmCall = {
    provider: response.provider,
    model: response.model,
    tokens: response.tokens.total,
    latencyMs: response.latencyMs,
    estimatedCost: 0,
    traceId: traceId ?? randomUUID(),
  };

  return {
    nodeId: node.id,
    nodeType: "router",
    success: true,
    output: { routing: "llm", ...parsed },
    nextNodeId: parsed.nextNodeId ?? null,
    llmCalls: [llmCall],
  };
}

/**
 * Execute a retrieval node.
 * Uses either keyword search or embeddings-based similarity search.
 */
async function executeRetrieval(
  node: Node,
  context: ExecutionContext,
  llmProvider?: LLMProvider,
  knowledgeBase?: Array<{ id: string; content: string; source: string }>,
  traceId?: string,
): Promise<NodeExecutionResult> {
  const config = node.activationConfig as RetrievalConfig;
  const query = (context.variables.input as string) ?? "";

  if (!knowledgeBase || knowledgeBase.length === 0) {
    return {
      nodeId: node.id,
      nodeType: "retrieval",
      success: true,
      output: { results: [], query },
      nextNodeId: null,
      evidence: [],
    };
  }

  let results: Array<{ id: string; content: string; source: string; score: number }> = [];

  if (config.useEmbeddings && llmProvider?.embed) {
    // Embeddings-based search
    try {
      const queryEmbedding = await llmProvider.embed({
        input: query,
        traceId,
      });

      // Simple cosine similarity search against knowledge base
      // (In production, this would use pgvector for efficiency)
      const kbEmbeddings = await Promise.all(
        knowledgeBase.slice(0, 20).map(async (entry) => {
          try {
            const emb = await llmProvider.embed!({
              input: entry.content,
              traceId,
            });
            return { ...entry, embedding: emb.embeddings[0] };
          } catch {
            return { ...entry, embedding: [] };
          }
        }),
      );

      const queryVec = queryEmbedding.embeddings[0]!;
      results = kbEmbeddings
        .map((entry) => ({
          id: entry.id,
          content: entry.content,
          source: entry.source,
          score: cosineSimilarity(queryVec, entry.embedding ?? []),
        }))
        .filter((r) => r.score >= (config.minScore ?? 0))
        .sort((a, b) => b.score - a.score)
        .slice(0, config.topK ?? 5);
    } catch {
      // Fall back to keyword search
      results = keywordSearch(query, knowledgeBase, config.topK);
    }
  } else {
    // Keyword/full-text search
    results = keywordSearch(query, knowledgeBase, config.topK);
  }

  const evidence: RetrievedEvidence[] = results.map((r) => ({
    content: r.content,
    source: r.source,
    score: r.score,
    retrievedAt: new Date(),
  }));

  return {
    nodeId: node.id,
    nodeType: "retrieval",
    success: true,
    output: { results, query, count: results.length },
    nextNodeId: null, // retrieval nodes don't determine the next node
    evidence,
  };
}

/**
 * Execute a specialist node.
 * Generates a domain-specific response using retrieved evidence + conversation context.
 */
async function executeSpecialist(
  node: Node,
  context: ExecutionContext,
  llmProvider?: LLMProvider,
  traceId?: string,
): Promise<NodeExecutionResult> {
  const config = node.activationConfig as SpecialistConfig;

  if (!llmProvider) {
    return {
      nodeId: node.id,
      nodeType: "specialist",
      success: false,
      output: {},
      nextNodeId: null,
      error: "LLM provider required for specialist node",
    };
  }

  // Build the prompt with retrieved evidence
  const evidenceText =
    context.retrievedEvidence.length > 0
      ? `\n\nRelevant evidence:\n${context.retrievedEvidence.map((e) => `- ${e.content} (source: ${e.source})`).join("\n")}`
      : "";

  const messages = [
    { role: "system" as const, content: config.systemPrompt + evidenceText },
    {
      role: "user" as const,
      content: (context.variables.input as string) ?? "",
    },
  ];

  const response = await llmProvider.complete({
    messages,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    traceId,
  });

  const llmCall = {
    provider: response.provider,
    model: response.model,
    tokens: response.tokens.total,
    latencyMs: response.latencyMs,
    estimatedCost: 0,
    traceId: traceId ?? randomUUID(),
  };

  return {
    nodeId: node.id,
    nodeType: "specialist",
    success: true,
    output: { response: response.content },
    nextNodeId: null, // specialist nodes don't determine routing
    llmCalls: [llmCall],
  };
}

/**
 * Execute a safety node.
 * Checks the current state/response against safety/compliance rules.
 */
function executeSafety(
  node: Node,
  context: ExecutionContext,
): NodeExecutionResult {
  const config = node.activationConfig as SafetyConfig;
  const input = (context.variables.input as string) ?? "";
  const lastResponse = context.nodeHistory.length > 0
    ? (context.nodeHistory[context.nodeHistory.length - 1]?.output.response as string ?? "")
    : "";

  const textToCheck = `${input} ${lastResponse}`.toLowerCase();

  for (const rule of config.rules) {
    if (rule.pattern) {
      const regex = new RegExp(rule.pattern, "i");
      if (regex.test(textToCheck)) {
        // Safety violation detected
        if (config.violationAction === "redirect" && config.redirectNodeId) {
          return {
            nodeId: node.id,
            nodeType: "safety",
            success: true,
            output: { violation: true, rule: rule.id, action: "redirect" },
            nextNodeId: config.redirectNodeId,
          };
        }
        // Halt
        return {
          nodeId: node.id,
          nodeType: "safety",
          success: true,
          output: { violation: true, rule: rule.id, action: "halt" },
          nextNodeId: null,
        };
      }
    }
  }

  // All safety checks passed
  return {
    nodeId: node.id,
    nodeType: "safety",
    success: true,
    output: { violation: false },
    nextNodeId: null, // safety nodes don't determine routing (they pass through)
  };
}

/**
 * Execute an escalation node.
 * Marks a conversation as needing human handoff.
 */
function executeEscalation(
  node: Node,
  _context: ExecutionContext,
): NodeExecutionResult {
  const config = node.activationConfig as { reason?: string };

  return {
    nodeId: node.id,
    nodeType: "escalation",
    success: true,
    output: {
      escalated: true,
      reason: config.reason ?? "Conversation requires human assistance",
      message: "This conversation requires human assistance. A specialist will follow up shortly.",
    },
    nextNodeId: null, // escalation is a terminal node
  };
}

/**
 * Execute a final_response node.
 * Produces the response returned to the caller.
 */
function executeFinalResponse(
  node: Node,
  _context: ExecutionContext,
): NodeExecutionResult {
  const config = node.activationConfig as FinalResponseConfig;

  // Get the last specialist response, or use the node's prompt as a template
  const lastSpecialistEntry = [..._context.nodeHistory]
    .reverse()
    .find((h) => h.nodeType === "specialist");

  let response = (lastSpecialistEntry?.output.response as string) ?? node.prompt;

  // Apply template if provided
  if (config.template) {
    response = config.template
      .replace("{{response}}", response)
      .replace("{{input}}", (_context.variables.input as string) ?? "");
  }

  return {
    nodeId: node.id,
    nodeType: "final_response",
    success: true,
    output: { response },
    nextNodeId: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find the entry node (node with no incoming edges).
 */
function findEntryNode(nodes: Node[], edges: Edge[]): Node | null {
  const hasIncoming = new Set(edges.map((e) => e.targetNodeId));
  return nodes.find((n) => !hasIncoming.has(n.id)) ?? null;
}

/**
 * Evaluate a simple condition expression against variables.
 * Supports basic operators: ==, !=, contains, !contains, starts_with
 */
function evaluateCondition(condition: string, variables: Record<string, unknown>): boolean {
  // Support OR: split on " OR " first, evaluate each sub-condition
  const orParts = condition.split(/\s+OR\s+/);
  return orParts.some((part) => evaluateSingleCondition(part.trim(), variables));
}

function evaluateSingleCondition(condition: string, variables: Record<string, unknown>): boolean {
  // Simple condition parser: "key == value", "key contains value", etc.
  const parts = condition.split(/\s+(==|!=|contains|!contains|starts_with)\s+/);
  if (parts.length !== 3) return false;

  const key = parts[0]!;
  const operator = parts[1]!;
  const value = parts[2]!;
  const actual = String(variables[key] ?? "").toLowerCase();
  const expected = value.replace(/^["']|["']$/g, "").toLowerCase();

  switch (operator) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case "contains":
      return actual.includes(expected);
    case "!contains":
      return !actual.includes(expected);
    case "starts_with":
      return actual.startsWith(expected);
    default:
      return false;
  }
}

/**
 * Simple keyword search against a knowledge base.
 */
function keywordSearch(
  query: string,
  knowledgeBase: Array<{ id: string; content: string; source: string }>,
  topK: number,
): Array<{ id: string; content: string; source: string; score: number }> {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  return knowledgeBase
    .map((entry) => {
      const contentLower = entry.content.toLowerCase();
      const matches = queryTerms.filter((term) => contentLower.includes(term));
      const score = matches.length / queryTerms.length;
      return { id: entry.id, content: entry.content, source: entry.source, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
