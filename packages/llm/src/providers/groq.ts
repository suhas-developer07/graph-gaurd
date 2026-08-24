import type { LLMProvider, CompleteRequest, CompleteResponse } from "../types";

/**
 * Groq provider adapter.
 * Uses Groq's OpenAI-compatible chat completions API.
 * Default models: llama-3.3-70b-versatile (reasoning), llama-3.1-8b-instant (fast/classification).
 */
export class GroqProvider implements LLMProvider {
  readonly name = "groq";

  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config?: { apiKey?: string; baseUrl?: string; defaultModel?: string }) {
    this.apiKey = config?.apiKey ?? process.env.GROQ_API_KEY ?? "";
    this.baseUrl = config?.baseUrl ?? "https://api.groq.com/openai/v1";
    this.defaultModel = config?.defaultModel ?? "llama-3.3-70b-versatile";
  }

  async complete(request: CompleteRequest): Promise<CompleteResponse> {
    const model = request.model ?? this.defaultModel;
    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 1024,
    };

    // If a Zod schema is provided, request JSON mode
    if (request.responseSchema) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Groq API error (${response.status}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    const latencyMs = Date.now() - startTime;
    const content = data.choices[0]?.message?.content ?? "";

    let parsed: unknown;
    if (request.responseSchema) {
      try {
        const jsonContent = JSON.parse(content);
        parsed = request.responseSchema.parse(jsonContent);
      } catch (err) {
        throw new Error(
          `Failed to parse LLM response as structured output: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      content,
      parsed,
      model: data.model ?? model,
      tokens: {
        input: data.usage?.prompt_tokens ?? 0,
        output: data.usage?.completion_tokens ?? 0,
        total: data.usage?.total_tokens ?? 0,
      },
      latencyMs,
      provider: this.name,
    };
  }
}
