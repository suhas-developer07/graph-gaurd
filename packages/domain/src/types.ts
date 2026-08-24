import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const NodeTypeEnum = z.enum([
  "router",
  "retrieval",
  "specialist",
  "safety",
  "escalation",
  "final_response",
]);
export type NodeType = z.infer<typeof NodeTypeEnum>;

export const GraphVersionStatusEnum = z.enum(["draft", "published"]);
export type GraphVersionStatus = z.infer<typeof GraphVersionStatusEnum>;

// ─── Node Type Configs (Zod schemas for activation_config) ────────────────────

export const RouterConfigSchema = z.object({
  /** Routing mode: "llm" uses an LLM call, "rule" uses deterministic conditions */
  mode: z.enum(["llm", "rule"]).default("rule"),
  /** For LLM mode: the system prompt that constrains the router's decision */
  routingPrompt: z.string().optional(),
  /** For rule mode: ordered list of conditions to evaluate */
  rules: z
    .array(
      z.object({
        condition: z.string().describe("Expression to evaluate against context variables"),
        targetNodeId: z.string().describe("Node to transition to if condition is true"),
      }),
    )
    .optional(),
  /** Default target node when no rule matches (null = stop execution) */
  defaultTargetNodeId: z.string().optional(),
});
export type RouterConfig = z.infer<typeof RouterConfigSchema>;

export const RetrievalConfigSchema = z.object({
  /** Number of results to retrieve */
  topK: z.number().int().positive().default(3),
  /** Minimum similarity score threshold (0-1) */
  minScore: z.number().min(0).max(1).default(0.5),
  /** Whether to use embeddings (true) or keyword search (false) */
  useEmbeddings: z.boolean().default(false),
});
export type RetrievalConfig = z.infer<typeof RetrievalConfigSchema>;

export const SpecialistConfigSchema = z.object({
  /** The system prompt for the specialist */
  systemPrompt: z.string(),
  /** The model to use for generation */
  model: z.string().default("llama-3.3-70b-versatile"),
  /** Max tokens for the response */
  maxTokens: z.number().int().positive().default(1024),
  /** Temperature for generation */
  temperature: z.number().min(0).max(2).default(0.7),
});
export type SpecialistConfig = z.infer<typeof SpecialistConfigSchema>;

export const SafetyConfigSchema = z.object({
  /** Rules to check against */
  rules: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      pattern: z.string().optional(),
    }),
  ),
  /** Action to take if a safety rule is violated: "halt" stops execution, "redirect" goes to escalation */
  violationAction: z.enum(["halt", "redirect"]).default("redirect"),
  /** Node to redirect to on violation (if violationAction is "redirect") */
  redirectNodeId: z.string().optional(),
});
export type SafetyConfig = z.infer<typeof SafetyConfigSchema>;

export const EscalationConfigSchema = z.object({
  /** Reason for escalation */
  reason: z.string().optional(),
  /** Whether to automatically escalate or only under certain conditions */
  autoEscalate: z.boolean().default(false),
});
export type EscalationConfig = z.infer<typeof EscalationConfigSchema>;

export const FinalResponseConfigSchema = z.object({
  /** Optional template for the final response */
  template: z.string().optional(),
  /** Whether to include the conversation history in the response */
  includeHistory: z.boolean().default(false),
});
export type FinalResponseConfig = z.infer<typeof FinalResponseConfigSchema>;

/** Union of all node configs */
export const NodeConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("router"), ...RouterConfigSchema.shape }),
  z.object({ type: z.literal("retrieval"), ...RetrievalConfigSchema.shape }),
  z.object({ type: z.literal("specialist"), ...SpecialistConfigSchema.shape }),
  z.object({ type: z.literal("safety"), ...SafetyConfigSchema.shape }),
  z.object({ type: z.literal("escalation"), ...EscalationConfigSchema.shape }),
  z.object({ type: z.literal("final_response"), ...FinalResponseConfigSchema.shape }),
]);
export type NodeConfig = z.infer<typeof NodeConfigSchema>;

// ─── Core Domain Types ────────────────────────────────────────────────────────

export interface Node {
  id: string;
  graphVersionId: string;
  type: NodeType;
  prompt: string;
  activationConfig: Record<string, unknown>;
}

export interface Edge {
  id: string;
  graphVersionId: string;
  sourceNodeId: string;
  targetNodeId: string;
  condition: Record<string, unknown> | null;
}

export interface GraphVersion {
  id: string;
  graphId: string;
  version: number;
  status: GraphVersionStatus;
  createdBy: string;
  publishedAt: Date | null;
  nodes: Node[];
  edges: Edge[];
}

// ─── Execution Types ──────────────────────────────────────────────────────────

/** A single step in the execution trace */
export interface NodeHistoryEntry {
  nodeId: string;
  nodeType: NodeType;
  startedAt: Date;
  completedAt: Date;
  status: "success" | "error" | "skipped";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
  llmCalls?: LLMCallRecord[];
}

/** Record of an LLM call made during execution */
export interface LLMCallRecord {
  provider: string;
  model: string;
  tokens: number;
  latencyMs: number;
  estimatedCost: number;
  traceId: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

/** Evidence retrieved by a retrieval node */
export interface RetrievedEvidence {
  content: string;
  source: string;
  score: number;
  retrievedAt: Date;
}

/** The context that flows through graph execution */
export interface ExecutionContext {
  /** Unique ID for this conversation/execution */
  conversationId: string;
  /** The graph version being executed */
  graphVersionId: string;
  /** Ordered list of nodes visited */
  nodeHistory: NodeHistoryEntry[];
  /** Arbitrary key/value state the graph can read/write */
  variables: Record<string, unknown>;
  /** Accumulated evidence from retrieval nodes */
  retrievedEvidence: RetrievedEvidence[];
  /** Metadata about the execution */
  metadata: ExecutionMetadata;
}

/** Metadata about an execution */
export interface ExecutionMetadata {
  startedAt: Date;
  completedAt?: Date;
  totalLlmCalls: number;
  totalTokens: number;
  estimatedCost: number;
  status: "running" | "completed" | "error" | "halted";
  error?: string;
}

/** The result of executing a single node */
export interface NodeExecutionResult {
  /** The node that was executed */
  nodeId: string;
  /** The node type */
  nodeType: NodeType;
  /** Whether the node executed successfully */
  success: boolean;
  /** The output produced by the node */
  output: Record<string, unknown>;
  /** The ID of the next node to transition to (null if terminal) */
  nextNodeId: string | null;
  /** Any evidence retrieved (only for retrieval nodes) */
  evidence?: RetrievedEvidence[];
  /** Error message if the node failed */
  error?: string;
  /** LLM calls made during this node's execution */
  llmCalls?: LLMCallRecord[];
}

/** The result of executing an entire graph */
export interface GraphExecutionResult {
  /** Whether the execution completed successfully */
  success: boolean;
  /** The full execution context (with history) */
  context: ExecutionContext;
  /** The final response text (from final_response node) */
  response?: string;
  /** Error message if execution failed */
  error?: string;
}

// ─── Validation Types ─────────────────────────────────────────────────────────

export interface ValidationError {
  /** Category of error */
  type:
    | "duplicate_node_id"
    | "dangling_edge"
    | "cycle_detected"
    | "missing_entry_node"
    | "multiple_entry_nodes"
    | "invalid_transition"
    | "missing_node_config";
  /** Human-readable description */
  message: string;
  /** The node or edge ID involved */
  nodeId?: string;
  edgeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ─── Knowledge Base Types (for retrieval node) ────────────────────────────────

export interface KBEntry {
  id: string;
  content: string;
  source: string;
  metadata?: Record<string, unknown>;
}
