import { describe, it, expect } from "vitest";
import { loadKBFromSeed, generateInsertSQL } from "./kb-loader";

describe("loadKBFromSeed", () => {
  it("loads snippets from the seed dataset", () => {
    const { product, snippets } = loadKBFromSeed();

    expect(product).toBeDefined();
    expect((product as Record<string, unknown>).name).toBe("NeuroCalm");

    expect(snippets.length).toBeGreaterThan(0);

    for (const snippet of snippets) {
      expect(snippet.id).toBeTruthy();
      expect(snippet.category).toBeTruthy();
      expect(snippet.content).toBeTruthy();
      expect(snippet.content.length).toBeGreaterThan(10);
    }
  });

  it("includes all expected KB categories", () => {
    const { snippets } = loadKBFromSeed();
    const categories = [...new Set(snippets.map((s) => s.category))];

    expect(categories).toContain("side_effects");
    expect(categories).toContain("dosage");
    expect(categories).toContain("contraindications");
    expect(categories).toContain("emergency");
    expect(categories).toContain("indications");
  });

  it("each snippet has proper metadata", () => {
    const { snippets } = loadKBFromSeed();
    for (const snippet of snippets) {
      expect(snippet.metadata.title).toBeTruthy();
      expect(snippet.metadata.source).toBeTruthy();
      expect(snippet.metadata.productName).toBe("NeuroCalm");
    }
  });
});

describe("generateInsertSQL", () => {
  it("generates valid INSERT SQL", () => {
    const snippets = [
      {
        id: "test-1",
        category: "side_effects",
        content: "Test content",
        metadata: {},
      },
    ];
    const embeddings = [[0.1, 0.2, 0.3]];

    const sql = generateInsertSQL(snippets, embeddings);

    expect(sql).toContain("INSERT INTO knowledge_base_snippets");
    expect(sql).toContain("test-1");
    expect(sql).toContain("side_effects");
    expect(sql).toContain("ON CONFLICT");
  });

  it("escapes single quotes in content", () => {
    const snippets = [
      {
        id: "test-2",
        category: "general",
        content: "It's a test with 'quotes'",
        metadata: {},
      },
    ];
    const embeddings = [[0.1]];

    const sql = generateInsertSQL(snippets, embeddings);

    expect(sql).toContain("It''s a test with ''quotes''");
  });
});
