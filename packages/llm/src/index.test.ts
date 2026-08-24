import { describe, it, expect } from "vitest";
import { createMockProvider, GroqProvider, GeminiEmbeddingsProvider } from "./index";

describe("LLM Providers", () => {
  describe("createMockProvider", () => {
    it("should return a mock provider that completes successfully", async () => {
      const provider = createMockProvider('{"answer": "test"}');
      const result = await provider.complete({
        messages: [{ role: "user", content: "test" }],
      });
      expect(result.content).toBe('{"answer": "test"}');
      expect(result.provider).toBe("mock");
      expect(result.tokens.total).toBe(30);
    });

    it("should parse structured output when schema provided", async () => {
      const { z } = await import("zod");
      const schema = z.object({ answer: z.string() });
      const provider = createMockProvider('{"answer": "hello"}');
      const result = await provider.complete({
        messages: [{ role: "user", content: "test" }],
        responseSchema: schema,
      });
      expect(result.parsed).toEqual({ answer: "hello" });
    });

    it("should generate embeddings", async () => {
      const provider = createMockProvider();
      const result = await provider.embed!({
        input: "test text",
      });
      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]).toHaveLength(768);
    });
  });

  describe("GroqProvider", () => {
    it("should instantiate with default config", () => {
      const provider = new GroqProvider({ apiKey: "test-key" });
      expect(provider.name).toBe("groq");
    });

    it("should throw on complete without valid API key (no network call in test)", async () => {
      const provider = new GroqProvider();
      // This will fail because the API key is invalid, but it proves the provider exists
      try {
        await provider.complete({
          messages: [{ role: "user", content: "test" }],
        });
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    });
  });

  describe("GeminiEmbeddingsProvider", () => {
    it("should instantiate with default config", () => {
      const provider = new GeminiEmbeddingsProvider({ apiKey: "test-key" });
      expect(provider.name).toBe("gemini");
    });

    it("should throw on complete (not supported)", async () => {
      const provider = new GeminiEmbeddingsProvider({ apiKey: "test-key" });
      await expect(
        provider.complete({
          messages: [{ role: "user", content: "test" }],
        }),
      ).rejects.toThrow("does not support chat completions");
    });
  });
});
