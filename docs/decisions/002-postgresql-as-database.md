# ADR-002: PostgreSQL as the Database

## Status

Accepted

## Context

GraphGuard needs a relational database to store graph definitions, evaluation results, regressions, proposals, and releases. The schema has complex foreign key relationships and requires vector similarity search for the grounding/citation evaluator (Phase 3).

## Decision

Use **PostgreSQL 16** with the **pgvector** extension.

## Rationale

- **Relational model fits the domain:** Graphs, nodes, edges, evaluation runs, and results have complex FK relationships that are natural in a relational database.
- **pgvector for embeddings:** The grounding/citation evaluator (Phase 3) needs vector similarity search. pgvector adds this to Postgres without requiring a separate vector database.
- **JSONB support:** Flexible storage for `activation_config`, `tags`, `expected_behavior`, `change`, `evidence` — structured data that varies per entity.
- **Maturity:** PostgreSQL is battle-tested, well-understood, and has excellent tooling (Drizzle ORM, migration tools, GUI clients).
- **Free tier availability:** Multiple free-tier Postgres providers exist (Neon, Supabase, Render) for later deployment.

## Alternatives Considered

- **SQLite:** Simpler but lacks pgvector, concurrent write support, and network access for the worker process.
- **MySQL:** Viable but PostgreSQL has better JSONB support, pgvector, and is more common in the TypeScript/Node.js ecosystem.
- **MongoDB:** Document model doesn't fit the relational graph structure well. No native vector search without Atlas (paid).
- **Dedicated vector DB (Pinecone, Weaviate):** Overkill for this project's scale and adds cost/complexity. pgvector is sufficient.

## Consequences

- All data access through Drizzle ORM (type-safe, SQL-like API)
- pgvector extension enabled from day one even though it's not used until Phase 3
- Migration-based schema management via Drizzle Kit
