/**
 * Knowledge Base retrieval via pgvector semantic search.
 * Falls back to keyword search when pgvector is unavailable.
 */

export interface KBRetrievalResult {
  snippetId: string;
  content: string;
  category: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

/**
 * Retrieve relevant knowledge base snippets via keyword search.
 * This is the fallback when pgvector embeddings are not available.
 */
export function keywordSearch(
  query: string,
  kb: KBRetrievalResult[],
  maxResults: number = 5,
): KBRetrievalResult[] {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

  const scored = kb.map((snippet) => {
    const contentLower = snippet.content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        score += 1;
      }
    }

    // Boost for exact phrase match
    if (contentLower.includes(queryLower)) {
      score += 3;
    }

    return { ...snippet, similarity: score / Math.max(queryTerms.length, 1) };
  });

  return scored
    .filter((s) => s.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
}

/**
 * Retrieve relevant knowledge base snippets via pgvector cosine similarity.
 * Requires an embedding function and database connection.
 */
export async function vectorSearch(
  query: string,
  embedFn: (text: string) => Promise<number[]>,
  searchFn: (
    embedding: number[],
    maxResults: number,
  ) => Promise<KBRetrievalResult[]>,
  maxResults: number = 5,
): Promise<KBRetrievalResult[]> {
  const queryEmbedding = await embedFn(query);
  return searchFn(queryEmbedding, maxResults);
}

/**
 * Combined retrieval: try vector search first, fall back to keyword search.
 */
export async function retrieveKnowledge(
  query: string,
  kb: KBRetrievalResult[],
  options: {
    embedFn?: (text: string) => Promise<number[]>;
    searchFn?: (
      embedding: number[],
      maxResults: number,
    ) => Promise<KBRetrievalResult[]>;
    maxResults?: number;
  } = {},
): Promise<KBRetrievalResult[]> {
  const { embedFn, searchFn, maxResults = 5 } = options;

  // Try vector search if both functions are provided
  if (embedFn && searchFn) {
    try {
      const results = await vectorSearch(query, embedFn, searchFn, maxResults);
      if (results.length > 0) return results;
    } catch {
      // Fall through to keyword search
    }
  }

  // Fallback to keyword search
  return keywordSearch(query, kb, maxResults);
}
