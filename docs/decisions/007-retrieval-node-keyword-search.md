# ADR-007: Retrieval Node Uses Keyword Search in Phase 2

## Status

Accepted (Phase 2 temporary decision — to be revisited in Phase 3)

## Context

The retrieval node needs to search a knowledge base for relevant evidence. In Phase 2, we have a small placeholder knowledge base (12 fictional pharmaceutical Q&A pairs). The real 100+ item dataset is built in Phase 3.

## Decision

Use **keyword/full-text search** for Phase 2's retrieval node, with embeddings-based search as an option that activates when a Gemini API key is available.

## Rationale

- **Simplicity.** Keyword search requires zero external API calls and zero infrastructure — it's pure in-memory string matching.
- **Sufficient for Phase 2.** The goal of Phase 2 is proving the *graph engine* works end-to-end, not building the final knowledge base.
- **Embeddings available as opt-in.** If `GEMINI_API_KEY` is set and `useEmbeddings: true` in the node config, the retrieval node will use Gemini embeddings + cosine similarity. This proves the integration works without requiring it.
- **Phase 3 will rebuild properly.** The full evaluation dataset, proper pgvector-backed retrieval, and embedding indexing are explicitly Phase 3's job.

## Alternatives Considered

- **pgvector from day one:** Would require embedding the full KB at graph creation time, which adds complexity not justified for a 12-item placeholder dataset.
- **External search API (Algolia, etc.):** Adds cost and dependency. Disqualified by $0 budget.
- **Full Postgres tsvector:** Viable but more complex than needed for a 12-item dataset.

## Consequences

- Retrieval quality is basic (keyword matching) — this is acceptable for Phase 2 testing
- Phase 3 must replace this with proper pgvector-backed retrieval
- The `useEmbeddings` config option proves the Gemini integration works
