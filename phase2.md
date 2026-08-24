# GraphGuard — Phase 2: Agent Graph Engine

> **How to use this file:** Paste this entire file as the instruction/context for your AI coding
> agent at the start of a fresh session. It assumes Phase 1 is complete (monorepo scaffold,
> database schema, Docker Compose, health endpoints all working). It is otherwise self-contained.

---

## 0. What GraphGuard Is (recap)

GraphGuard is a continuous evaluation and release-safety system for AI agent graphs. It lets you
define an agent as a graph of nodes (routers, retrievers, specialists, safety checks, escalation
logic), run it against realistic test conversations, score the results, and catch regressions
before deployment. The demo domain is a **fictional pharmaceutical product knowledge base** — this
is a portfolio project, not a real medical product, and must never claim to be one.

**Phase 2's job specifically:** build the actual thing being evaluated — the agent graph runtime
itself. Phases 3+ build the measurement and safety system on top of what you build here.

## 1. Zero-Budget Rules (still non-negotiable)

- **LLM calls only ever go through Groq**, free tier, OpenAI-compatible chat completions API,
  via `GROQ_API_KEY`. Default models: `llama-3.3-70b-versatile` (reasoning/routing decisions where
  quality matters) and `llama-3.1-8b-instant` (cheap/fast classification). Never call any other
  LLM API for agent execution.
- **Embeddings** (used only by the Retrieval node — see Section 6) go through Google Gemini's
  free `text-embedding-004` model via `GEMINI_API_KEY`. This is the only reason Gemini is called
  in this phase.
- No paid service of any kind, for any reason. If Groq's free tier rate-limits you, the correct
  fix is bounded concurrency and retry/backoff (Section 8) — not switching to a paid provider.

## 2. Prerequisites From Phase 1 (assume these exist)

- Monorepo with `apps/{web,api,worker}` and `packages/{domain,graph-engine,evaluation,regression,
  llm,observability,db,config}`.
- Drizzle schema and working migrations for: `projects`, `graphs`, `graph_versions`, `nodes`,
  `edges`, `test_cases`, `evaluation_runs`, `evaluation_results`, `regressions`, `proposals`,
  `releases`, `llm_calls`, `datasets`.
- `packages/config` with Zod-validated env vars, `DATABASE_URL`/`REDIS_URL`/`GROQ_API_KEY`/
  `GEMINI_API_KEY` already wired.
- Docker Compose running Postgres (with pgvector enabled) + Redis.
- Fastify API with working `/health` and `/ready`.

If any of these are missing, stop and complete Phase 1 first — Phase 2 depends on all of it.

## 3. Phase 2 Objective

Build the real agent graph runtime: define nodes and edges, validate a graph before it can ever
run, version graphs immutably, execute a conversation through the graph deterministically (before
any LLM-driven routing is layered on top), and record every single node execution and LLM call
for later observability and evaluation.

## 4. Node Types (implement all six)

| Type | Responsibility |
|---|---|
| `router` | Decides which node to transition to next based on conversation state/intent |
| `retrieval` | Pulls relevant evidence from the knowledge base (Section 6) |
| `specialist` | Generates a domain-specific response using retrieved evidence + conversation context |
| `safety` | Checks the current state/response against safety/compliance rules; can halt or redirect the flow |
| `escalation` | Marks a conversation as needing human handoff |
| `final_response` | Terminal node — produces the response returned to the caller |

Each node type shares a common interface (same input/output contract) but has type-specific
config validated with its own Zod schema, stored in the `nodes.activation_config` jsonb column.

## 5. Task List (do these in order)

1. **`packages/domain`**: define the `Node`, `Edge`, `GraphVersion`, `ExecutionContext`, and
   `NodeExecutionResult` TypeScript types/interfaces. These are the types every other package
   imports — get them right before writing runtime logic.

2. **Graph validation** (`packages/graph-engine/validation.ts`): before a graph version can ever
   execute, validate:
   - No duplicate node IDs.
   - No dangling edges (every `source_node_id`/`target_node_id` must reference a real node in the
     same graph version).
   - No cycles, unless the node types involved explicitly allow a loop (document which types
     allow cycles and which don't — default to disallowed unless there's a clear reason).
   - Exactly one designated entry node.
   - No invalid transitions (e.g. an edge whose condition can never be satisfied given the source
     node's possible outputs — at minimum check for structurally impossible transitions, not full
     formal verification).
   Return a structured list of validation errors, not just a boolean — later phases (and the
   dashboard) need to show *why* a graph is invalid.

3. **Graph versioning** (`packages/graph-engine/versioning.ts` + API routes): a `graph_version` in
   `draft` status can be freely edited (nodes/edges added, removed, changed). Once a version is
   published (`status = 'published'`, `published_at` set), it becomes **immutable** — no code
   path should ever be able to mutate a published version's nodes or edges. Publishing must run
   the Section 2 validation first and refuse to publish an invalid graph.

4. **Execution context** (`packages/graph-engine/context.ts`): define and implement the object
   that flows through a graph execution — `conversationId`, `graphVersionId`, `nodeHistory`
   (ordered list of nodes visited with timestamps), `variables` (arbitrary key/value state the
   graph can read/write), `retrievedEvidence` (accumulated evidence from retrieval nodes), and
   `metadata`.

5. **Deterministic execution engine first** (`packages/graph-engine/runtime.ts`): implement graph
   execution using deterministic, rule-based transitions (e.g. keyword/intent matching, explicit
   conditions on `variables`) **before** wiring in LLM-driven routing. This lets you prove the
   engine itself is correct without an external API in the loop. Only once this works, layer LLM
   routing on top (Section 7).

6. **Retrieval node — simple version for now**: implement a basic retrieval mechanism against a
   small placeholder knowledge base (a handful of fictional pharma product Q&A pairs / fact
   snippets is enough — the *real* 100+ item dataset is built in Phase 3). For Phase 2, either
   plain keyword/full-text search (Postgres `tsvector`) or a minimal pgvector similarity search
   using Gemini embeddings is acceptable — pick whichever is less code, since this will be
   properly rebuilt with the full dataset in Phase 3. Document which one you chose and why in
   `docs/decisions/`.

7. **`packages/llm`** — the provider abstraction (this is the most important piece of this phase):
   - Define a `LLMProvider` interface: something like `complete(request): Promise<LLMResponse>`
     where `request` includes messages, model, and an optional Zod schema for structured output.
   - Implement a `GroqProvider` adapter that calls Groq's chat completions endpoint.
   - Implement a `GeminiEmbeddingsProvider` adapter (used only by the retrieval node).
   - **Every single call through either adapter must write a row to `llm_calls`** — provider,
     model, tokens, latency_ms, estimated_cost (0 for now), trace_id. No exceptions. This table is
     the backbone of Phase 6's cost/latency observability, so get it recording from day one.
   - Design the interface so that swapping in another provider later (paid or free) is a
     one-file change, not a rewrite. Don't hardcode "Groq" anywhere outside the Groq adapter file.

8. **Structured output enforcement**: any LLM call whose output is allowed to influence routing or
   runtime state **must** use a Zod schema and validated/parsed structured output (Groq supports
   JSON mode / structured outputs — use it). Never let raw, unvalidated LLM text mutate
   `variables`, choose the next node, or write to the database. If the model returns something
   that doesn't match the schema, treat it as an error and handle it explicitly (retry once, then
   fail the node execution with a clear error) — never silently coerce garbage into valid state.

9. **LLM-driven routing** (now that Section 5 and 8 are solid): implement the `router` node type's
   LLM-backed mode, where a Groq call (with structured output constrained to the set of valid
   next-node IDs) decides the transition. Deterministic/rule-based routing should still be
   supported as an option per-node — not every router needs an LLM call.

10. **Record every node execution**: every time a node runs, write a record (timing, status,
    input/output summary, any LLM calls it triggered) so a full conversation can be reconstructed
    node-by-node after the fact. This is what "traceable node path" in the Definition of Done
    means.

11. **Build a minimal example graph** for testing: a 4–6 node graph (e.g. `router` →
    `retrieval`/`specialist` branches → `safety` → `final_response`, with one `escalation` branch)
    using the placeholder pharma knowledge base from step 6. This is your integration test
    fixture, not the real demo dataset.

## 6. Retrieval Node — Scope Note

Keep Phase 2's retrieval intentionally minimal (Section 5, step 6). The point of Phase 2 is
proving the *graph engine* works end-to-end, not building the final knowledge base — that's
explicitly Phase 3's job, where the full fictional pharma product, the controlled knowledge base,
and the 100–500 test cases get built properly.

## 7. Reliability Rules for This Phase

- Every Groq call needs a timeout and a retry policy (small bounded number of retries with
  backoff — free-tier rate limits will trigger this in normal use, so handle it gracefully rather
  than letting a single 429 fail an entire execution).
- Bound concurrency of simultaneous LLM calls (e.g. a simple semaphore/limit — a library like
  `p-limit` is fine) so you don't blow through Groq's free-tier rate limits when multiple node
  executions happen close together.
- Do not retry non-idempotent operations blindly — a node execution that already wrote
  side-effecting state should not be blindly re-run on retry; retry the LLM call itself, not the
  whole node, wherever possible.

## 8. Environment Variables Introduced in This Phase

No new env vars beyond Phase 1's `GROQ_API_KEY` and `GEMINI_API_KEY` — this phase is where they
actually get used for the first time.

## 9. Do Not (Phase 2 specific)

- Do not build the full evaluator suite — that's Phase 3.
- Do not build the full pharma dataset/knowledge base — that's Phase 3 (a small placeholder is
  fine here, see Section 6).
- Do not wire up BullMQ queues yet — the engine should be directly invokable synchronously/locally
  for now; async job orchestration is Phase 6.
- Do not call any LLM/embeddings provider other than Groq/Gemini.
- Do not let unvalidated LLM output touch routing decisions or database state (Section 5, step 8
  is a hard rule, not a suggestion).

## 10. Definition of Done

- [ ] The example pharma-like graph (Section 5, step 11) can execute an end-to-end conversation
      through multiple node types, including at least one LLM-routed decision.
- [ ] Running the same graph version against the same input twice produces the same node path
      (deterministic parts are actually deterministic; LLM-routed parts are at least structurally
      valid every time even if wording varies).
- [ ] An intentionally invalid graph (duplicate node ID, dangling edge, missing entry node —
      write a test for each) is rejected by validation before it can execute.
- [ ] Every execution produces a complete, inspectable node-by-node trace.
- [ ] Every LLM call made during any execution has a corresponding row in `llm_calls`.
- [ ] A published graph version cannot be mutated by any code path (write a test that attempts it
      and confirms it's rejected).

## 11. Handoff to Phase 3

Phase 3 will run hundreds of test cases through the runtime you built here and score the results.
It needs: a reliable way to execute a graph version against a given input and get back the full
execution trace (node path, retrieved evidence, final response, all LLM calls made). If any of
that isn't cleanly available as a function/API from `packages/graph-engine`, expose it now rather
than making Phase 3 reach into internals.