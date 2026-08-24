import { z } from "zod";

/** A chat message */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Request to complete a chat conversation */
export interface CompleteRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Optional Zod schema for structured output validation */
  responseSchema?: z.ZodType;
  /** Optional trace ID for grouping related LLM calls */
  traceId?: string;
}

/** Response from an LLM completion */
export interface CompleteResponse {
  content: string;
  /** Parsed structured output (if responseSchema was provided) */
  parsed?: unknown;
  model: string;
  tokens: { input: number; output: number; total: number };
  latencyMs: number;
  provider: string;
}

/** Request to generate embeddings */
export interface EmbedRequest {
  input: string | string[];
  model?: string;
  traceId?: string;
}

/** Response from embeddings generation */
export interface EmbedResponse {
  embeddings: number[][];
  model: string;
  tokens: number;
  latencyMs: number;
  provider: string;
}

/** Interface that all LLM providers must implement */
export interface LLMProvider {
  /** Provider name (e.g., "groq", "gemini") */
  readonly name: string;

  /** Complete a chat conversation */
  complete(request: CompleteRequest): Promise<CompleteResponse>;

  /** Generate embeddings (optional - not all providers support this) */
  embed?(request: EmbedRequest): Promise<EmbedResponse>;
}
