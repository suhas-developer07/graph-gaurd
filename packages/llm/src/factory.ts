import { randomUUID } from "crypto";
import type { LLMProvider, CompleteRequest, CompleteResponse, EmbedRequest, EmbedResponse } from "./types";
import { GroqProvider } from "./providers/groq";
import { GeminiEmbeddingsProvider } from "./providers/gemini";

/** Function to record an LLM call (writes to llm_calls table) */
export type LLMCallRecorder = (call: {
  traceId: string;
  provider: string;
  model: string;
  tokens: number;
  latencyMs: number;
  estimatedCost: number;
}) => Promise<void>;

/**
 * Create a Groq provider with automatic call recording.
 */
export function createGroqProvider(recorder?: LLMCallRecorder): LLMProvider {
  const groq = new GroqProvider();
  return wrapWithRecording(groq, recorder);
}

/**
 * Create a Gemini embeddings provider with automatic call recording.
 */
export function createGeminiProvider(recorder?: LLMCallRecorder): LLMProvider {
  const gemini = new GeminiEmbeddingsProvider();
  return wrapWithRecording(gemini, recorder);
}

/**
 * Wrap an LLM provider to automatically record every call.
 * Every single call through either adapter must write a row to llm_calls.
 */
function wrapWithRecording(provider: LLMProvider, recorder?: LLMCallRecorder): LLMProvider {
  const originalComplete = provider.complete.bind(provider);
  const originalEmbed = provider.embed?.bind(provider);

  return {
    ...provider,
    async complete(request: CompleteRequest): Promise<CompleteResponse> {
      const traceId = request.traceId ?? randomUUID();
      const result = await originalComplete(request);

      if (recorder) {
        await recorder({
          traceId,
          provider: result.provider,
          model: result.model,
          tokens: result.tokens.total,
          latencyMs: result.latencyMs,
          estimatedCost: 0, // free tier
        });
      }

      return result;
    },
    async embed(request: EmbedRequest): Promise<EmbedResponse> {
      if (!originalEmbed) {
        throw new Error(`Provider "${provider.name}" does not support embeddings`);
      }
      const traceId = request.traceId ?? randomUUID();
      const result = await originalEmbed(request);

      if (recorder) {
        await recorder({
          traceId,
          provider: result.provider,
          model: result.model,
          tokens: result.tokens,
          latencyMs: result.latencyMs,
          estimatedCost: 0, // free tier
        });
      }

      return result;
    },
  };
}

/**
 * Create a mock provider for testing (no API calls, returns configurable responses).
 */
export function createMockProvider(response?: string): LLMProvider {
  return {
    name: "mock",
    async complete(request: CompleteRequest): Promise<CompleteResponse> {
      const content = response ?? '{"response": "mock response"}';
      let parsed: unknown;
      if (request.responseSchema) {
        try {
          parsed = request.responseSchema.parse(JSON.parse(content));
        } catch {
          parsed = undefined;
        }
      }
      return {
        content,
        parsed,
        model: request.model ?? "mock-model",
        tokens: { input: 10, output: 20, total: 30 },
        latencyMs: 50,
        provider: "mock",
      };
    },
    async embed(request: EmbedRequest): Promise<EmbedResponse> {
      const inputs = Array.isArray(request.input) ? request.input : [request.input];
      return {
        embeddings: inputs.map(() => new Array(768).fill(0).map(() => Math.random())),
        model: request.model ?? "mock-embed",
        tokens: inputs.join("").length,
        latencyMs: 20,
        provider: "mock",
      };
    },
  };
}
