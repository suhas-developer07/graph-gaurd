import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Represents a knowledge base snippet ready for embedding and storage.
 */
export interface KBSnippet {
  id: string;
  category: string;
  content: string;
  metadata: Record<string, unknown>;
}

interface KBEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  source: string;
}

interface KBData {
  product: Record<string, unknown>;
  knowledge: KBEntry[];
}

/**
 * Load KB snippets from the seed dataset JSON file.
 * @param seedPath - Path to the JSON file. Defaults to datasets/seed/neurocalm-kb.json
 */
export function loadKBFromSeed(
  seedPath?: string,
): { product: Record<string, unknown>; snippets: KBSnippet[] } {
  const resolvedPath =
    seedPath ?? resolve(process.cwd(), "datasets/seed/neurocalm-kb.json");
  const raw = readFileSync(resolvedPath, "utf-8");
  const data: KBData = JSON.parse(raw);

  const product = data.product;
  const snippets: KBSnippet[] = [];

  for (const entry of data.knowledge) {
    snippets.push({
      id: entry.id,
      category: entry.category,
      content: entry.content.trim(),
      metadata: {
        title: entry.title,
        source: entry.source,
        productName: product.name,
        version: product.version,
      },
    });
  }

  return { product, snippets };
}

/**
 * Generate SQL INSERT statements for embedding knowledge base snippets.
 */
export function generateInsertSQL(
  snippets: KBSnippet[],
  embeddings: number[][],
): string {
  const rows: string[] = [];
  for (let i = 0; i < snippets.length; i++) {
    const snippet = snippets[i];
    const embedding = embeddings[i];
    if (!snippet || !embedding) continue;
    const embeddingStr = `[${embedding.join(",")}]`;
    const contentEscaped = snippet.content.replace(/'/g, "''");
    rows.push(
      `('${snippet.id}', '${snippet.category}', '${contentEscaped}', '${embeddingStr}'::vector)`,
    );
  }

  return `INSERT INTO knowledge_base_snippets (id, category, content, embedding)\nVALUES\n${rows.join(",\n")}\nON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  content = EXCLUDED.content,
  embedding = EXCLUDED.embedding;`;
}
