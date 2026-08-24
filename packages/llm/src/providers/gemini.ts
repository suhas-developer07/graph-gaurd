import type { LLMProvider, EmbedRequest, EmbedResponse } from "../types";

/**
 * Gemini embeddings provider adapter.
 * Uses Google's text-embedding-004 model via the Generative Language API.
 * This is the only reason Gemini is called in Phase 2.
 */
export class GeminiEmbeddingsProvider implements LLMProvider {
  readonly name = "gemini";

  private apiKey: string;
  private model: string;

  constructor(config?: { apiKey?: string; model?: string }) {
    this.apiKey = config?.apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.model = config?.model ?? "text-embedding-004";
  }

  /**
   * Generate embeddings for the given input.
   * Note: This provider does not support chat completions (complete() throws).
   */
  async complete(): Promise<never> {
    throw new Error(
      "GeminiEmbeddingsProvider does not support chat completions. Use embed() instead.",
    );
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const model = request.model ?? this.model;
    const startTime = Date.now();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text: inputs[0] }] },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      embedding: { values: number[] };
    };

    const latencyMs = Date.now() - startTime;

    return {
      embeddings: [data.embedding.values],
      model,
      tokens: inputs.join("").length, // approximate token count
      latencyMs,
      provider: this.name,
    };
  }
}
