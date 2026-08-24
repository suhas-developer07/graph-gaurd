# GraphGuard — Phase 1: Foundation & Architecture

> **How to use this file:** Paste this entire file as the instruction/context for your AI coding
> agent (opencode, freebuff, etc.) at the start of a fresh session. It is self-contained — the
> agent does not need any other document to complete this phase. Work top to bottom. Do not skip
> the "Do Not" section.

---

## 0. What GraphGuard Is (read this first)

GraphGuard is a **continuous evaluation and release-safety system for AI agent graphs**.

**The problem it solves:** Modern AI apps are not a single prompt anymore — they're graphs of
nodes (routers, retrievers, specialists, safety checks, escalation logic). A change to one node
(a prompt tweak, a routing rule, a model swap) can silently break a completely different
conversation flow. Normal unit tests don't catch this because the failures are *semantic*, not
syntactic.

**The solution:** GraphGuard lets you define an agent graph, run it against a large set of
realistic test conversations, score the results across multiple dimensions (routing correctness,
grounding/citation accuracy, safety/compliance, escalation recall, response quality), compare two
graph versions against each other, automatically localize *why* something regressed, propose a
fix, validate the fix, and block or allow deployment — all before anything reaches production.

**The demo domain** is a **fictional pharmaceutical product knowledge base**. This is a portfolio
project, not a real medical product.

**Non-goals (never do these, in any phase):**
- Do NOT build a real medical product or give real medical advice.
- Do NOT claim regulatory certification or clinical validation.
- Do NOT reproduce any real company's proprietary implementation.
- Do NOT start with Kubernetes, microservices, or a large distributed architecture.
- Do NOT polish the UI before the evaluation/regression engine actually works.

**Success criteria for the whole project** (context only — not all of this happens in Phase 1):
- A graph can be defined, versioned, executed, and visualized.
- An evaluation run can execute hundreds of test cases asynchronously.
- Every run produces deterministic, machine-readable metrics plus human-readable explanations.
- Graph versions can be compared and regressions localized to specific nodes/edges.
- A proposed graph change can be evaluated against a regression suite and marked PASS/FAIL.
- Every LLM call is observable for latency, tokens, errors, and estimated cost.
- The entire system runs locally with Docker and can be deployed on free-tier cloud hosting.
- The project ends with a polished, founder-facing demo.

---

## 1. Zero-Budget Rules (non-negotiable, apply to every phase)

This project has a **hard $0 budget**. No paid API keys, no paid hosting, no credit card–gated
tiers. This is a permanent constraint, not a Phase 1 detail — keep it in mind for every phase.

- **LLM provider:** [Groq](https://groq.com) free tier, OpenAI-compatible chat completions API.
  Default models: `llama-3.3-70b-versatile` for reasoning/judge tasks, `llama-3.1-8b-instant` for
  cheap/fast classification. Access via `GROQ_API_KEY` env var only — never hardcode.
- **Embeddings provider:** Google Gemini free tier (`text-embedding-004`) via `GEMINI_API_KEY`.
  Used later for the grounding/citation evaluator.
- **Database:** PostgreSQL. Local dev = Docker Compose. Later hosting is the user's own choice
  (e.g. a free-tier Postgres provider) — the app must never assume a specific host, only a
  `DATABASE_URL` connection string.
- **Queue/cache:** Redis. Local dev = Docker Compose. Hosting later is the user's own choice
  (e.g. a free-tier managed Redis) — the app must only assume a `REDIS_URL` connection string.
- **Hosting (relevant from Phase 6 onward, mentioned now so nothing in the architecture assumes
  otherwise):** free-tier PaaS hosting (e.g. Render's free web service tier) for the web, api, and
  worker processes. **Do not design anything that assumes AWS, ECS, RDS, or Kubernetes** — the
  original architecture doc mentioned AWS, but this build replaces that entirely with free-tier
  PaaS + Docker.
- **Observability:** OpenTelemetry with a **console/local exporter** by default — no paid APM
  SaaS. If the user later wants a hosted trace viewer, that's a free-tier choice they make
  themselves.
- Every external dependency must be justified by "does this have a genuinely free tier with no
  credit card required for what we need." If in doubt, prefer no dependency over a
  maybe-free one.

---

## 2. Technology Stack (final — do not substitute without a strong reason)

| Layer | Choice | Notes |
|---|---|---|
| Language/runtime | TypeScript (strict mode) + Node.js 20 LTS | |
| Package manager | **pnpm** workspaces (monorepo, no Turborepo — keep it simple) | |
| API | Fastify | |
| Web | Next.js + Tailwind CSS | |
| Database | PostgreSQL (+ `pgvector` extension enabled from day one) | |
| ORM | Drizzle | |
| Queue | Redis + BullMQ | Full queue wiring happens in Phase 6; Phase 1 just needs Redis reachable |
| LLM | Groq, via a provider-abstraction interface (implemented Phase 2) | |
| Embeddings | Google Gemini `text-embedding-004`, via the same style of abstraction | |
| Observability | OpenTelemetry, console exporter locally | |
| Metrics | Prometheus-compatible `/metrics` endpoint | |
| Testing | Vitest | |
| Containers | Docker Compose (Postgres + Redis locally) | |
| CI/CD | GitHub Actions (free minutes) | |
| Validation | Zod (env validation + structured LLM outputs) | |

---

## 3. Target Architecture

Modular monolith with a separate worker process — clear module boundaries, no premature
microservices.

```
Web (Next.js) → API (Fastify) → Domain modules → PostgreSQL + Redis → Evaluation Worker → Groq / Gemini
```

OpenTelemetry instrumentation crosses all of these boundaries (wired properly in Phase 6, but the
package should exist from Phase 1 so later phases just consume it).

### Core modules (own this boundary map — it governs the whole project)

| Module | Responsibility |
|---|---|
| Graph Registry | Create, validate, version, diff and publish agent graphs |
| Graph Runtime | Route input, execute nodes, manage state and transitions |
| Test Dataset | Store cases, expected behaviors, tags, fixtures and versions |
| Evaluation Engine | Run evaluators and aggregate scores |
| Regression Engine | Compare baselines, detect degradation, localize failures |
| Proposal Engine | Generate candidate prompt/routing/config changes |
| Release Gate | Enforce thresholds before a graph version is promoted |
| Telemetry | Trace requests, nodes, retrieval, LLM calls, evaluations |
| Dashboard | Graph explorer, run results, failures, diffs, release decisions |

---

## 4. Target Repository Structure (create this exact layout in Phase 1)

```
graphguard/
├── apps/
│   ├── web/                  # Next.js dashboard
│   ├── api/                  # Fastify HTTP API
│   └── worker/               # Evaluation worker (BullMQ wired fully in Phase 6)
├── packages/
│   ├── domain/                # Graph, version, run, proposal TS types
│   ├── graph-engine/          # Runtime + routing + transitions (built Phase 2)
│   ├── evaluation/            # Evaluators + aggregation (built Phase 3)
│   ├── regression/            # Diffs + release gates (built Phase 4)
│   ├── llm/                   # Provider abstraction + Groq/Gemini adapters (built Phase 2)
│   ├── observability/         # OpenTelemetry helpers
│   ├── db/                    # Drizzle schema + migrations
│   └── config/                # Shared, Zod-validated configuration
├── datasets/
│   ├── seed/
│   ├── evaluation/
│   └── canary/
├── infra/
│   └── docker/
├── docs/
│   ├── architecture.md
│   ├── threat-model.md
│   ├── evaluation-methodology.md
│   └── decisions/              # ADRs, one markdown file per decision
├── .github/workflows/
├── docker-compose.yml
├── pnpm-workspace.yaml
└── README.md
```

In Phase 1, `graph-engine`, `evaluation`, `regression` only need empty scaffolding (package.json +
tsconfig + an `index.ts` placeholder + a passing placeholder test). Real logic starts Phase 2/3/4.

---

## 5. Phase 1 Objective

Define the system properly before writing substantial application logic. By the end of this
phase there should be a clean, working monorepo skeleton with a real database schema, working
local infra, and written architecture documentation — but no graph runtime and no evaluators yet.

## 6. Phase 1 Task List (do these in order)

1. **Write `docs/product-spec.md`** — a one-page spec covering: who the user is (an engineer
   building/maintaining an AI agent product), the problem, the end-to-end workflow, the
   non-goals (copy from Section 0 above), and the success metrics (copy from Section 0 above).

2. **Write `docs/architecture.md`** — the module boundary table from Section 3, the data-flow
   diagram from Section 3, and one paragraph per module explaining what it owns and does NOT own
   (data ownership must be unambiguous — no two modules should write to the same table).

3. **Scaffold the monorepo** exactly as in Section 4, using pnpm workspaces
   (`pnpm-workspace.yaml` listing `apps/*` and `packages/*`).

4. **Configure the toolchain**: TypeScript strict mode across all packages (shared
   `tsconfig.base.json`), ESLint + Prettier, Vitest, and Conventional Commits (document the
   convention in `docs/decisions/` or `CONTRIBUTING.md`).

5. **Build `packages/config`**: a single Zod schema that validates all required environment
   variables at process startup and fails fast with a clear error if one is missing. At minimum
   validate: `DATABASE_URL`, `REDIS_URL`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `NODE_ENV`, `PORT`.
   Ship a `.env.example` at the repo root listing every variable with a one-line comment — never
   commit a real `.env`.

6. **Build `packages/db`**: Drizzle schema for the full domain model below (Section 7), a
   migration that creates all tables, and a script to run migrations against a clean database.
   Enable the `pgvector` extension in the initial migration even though nothing uses it yet
   (Phase 3 will).

7. **Create `docker-compose.yml`** with `postgres:16` (with pgvector — use the
   `pgvector/pgvector:pg16` image) and `redis:7`, both with named volumes so local data persists
   across restarts, and both exposing standard ports for local dev.

8. **Create the Fastify API shell** (`apps/api`) with `GET /health` (process is up) and
   `GET /ready` (process is up **and** can reach Postgres and Redis) endpoints. Wire in the
   `packages/config` env validation at startup.

9. **Create the Next.js shell** (`apps/web`) — an empty dashboard page is fine, just prove the
   app boots and can be pointed at the API's health endpoint.

10. **Write Architecture Decision Records** in `docs/decisions/`, one short markdown file per
    decision, for at least: Fastify as the API framework, PostgreSQL as the database, Redis/BullMQ
    for the queue, the provider-abstraction pattern for LLM calls, the modular-monolith approach,
    and Groq/Gemini as the free-tier LLM/embeddings providers (explicitly note this replaces a
    paid-OpenAI baseline and why).

11. **Write `docs/threat-model.md`** covering: the API auth boundary (what's public vs.
    authenticated — authentication itself is built later, just document the intended boundary
    now), secrets handling (env vars only, never logged), the risk of prompts/responses containing
    sensitive content ending up in logs, and tenant-isolation assumptions (single-tenant for this
    project — state that explicitly as a documented limitation).

## 7. Domain Model — Drizzle Schema (implement all of this now)

Create these tables in `packages/db`. Every table gets `id` (uuid, default random), and
`created_at`/`updated_at` timestamps unless noted otherwise. Foreign keys and indexes are required
wherever an `_id` field is listed.

- **datasets** — `id`, `name`, `kind` (enum: `seed` | `evaluation` | `canary`), `created_at`
- **projects** — `id`, `name`, `environment`, `created_at`
- **graphs** — `id`, `project_id` (fk→projects), `name`, `active_version_id` (nullable, fk→graph_versions)
- **graph_versions** — `id`, `graph_id` (fk→graphs), `version` (int), `status` (enum:
  `draft` | `published`), `created_by`, `published_at` (nullable)
- **nodes** — `id`, `graph_version_id` (fk→graph_versions), `type` (enum: `router` | `retrieval` |
  `specialist` | `safety` | `escalation` | `final_response`), `prompt` (text), `activation_config`
  (jsonb)
- **edges** — `id`, `graph_version_id` (fk→graph_versions), `source_node_id` (fk→nodes),
  `target_node_id` (fk→nodes), `condition` (jsonb, nullable)
- **test_cases** — `id`, `dataset_id` (fk→datasets), `input` (text), `expected_route` (text),
  `tags` (jsonb array), `expected_behavior` (jsonb)
- **evaluation_runs** — `id`, `graph_version_id` (fk→graph_versions), `baseline_run_id` (nullable,
  fk→evaluation_runs), `status` (enum: `pending`|`running`|`completed`|`failed`), `started_at`,
  `completed_at` (nullable)
- **evaluation_results** — `id`, `run_id` (fk→evaluation_runs), `test_case_id` (fk→test_cases),
  `evaluator` (text), `score` (numeric), `passed` (boolean), `explanation` (text)
- **regressions** — `id`, `run_id` (fk→evaluation_runs), `severity` (enum:
  `low`|`medium`|`high`|`critical`), `affected_node` (nullable, fk→nodes), `cause` (text),
  `evidence` (jsonb)
- **proposals** — `id`, `graph_version_id` (fk→graph_versions), `target_node` (fk→nodes),
  `change` (jsonb), `rationale` (text), `status` (enum:
  `draft`|`evaluating`|`canary`|`approved`|`rejected`)
- **releases** — `id`, `graph_version_id` (fk→graph_versions), `gate_status` (enum:
  `pass`|`warn`|`block`), `approved_by` (nullable)
- **llm_calls** — `id`, `trace_id`, `provider` (text — `groq` or `gemini`), `model`, `tokens`
  (int), `latency_ms` (int), `estimated_cost` (numeric, will be `0` for free-tier calls but keep
  the column for when/if that changes)

Add indexes on every foreign key column, plus `evaluation_results(run_id)`,
`evaluation_results(test_case_id)`, and `evaluation_runs(graph_version_id)` since those will be
queried heavily from Phase 3 onward.

## 8. Environment Variables Introduced in This Phase

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/graphguard
REDIS_URL=redis://localhost:6379
GROQ_API_KEY=
GEMINI_API_KEY=
NODE_ENV=development
PORT=4000
```

## 9. Do Not (Phase 1 specific)

- Do not implement any graph execution logic yet — that's Phase 2.
- Do not implement any evaluator logic yet — that's Phase 3.
- Do not add authentication yet — just document the intended boundary in the threat model.
- Do not add Turborepo, Nx, or any build-orchestration tool beyond pnpm workspaces — unnecessary
  complexity for this project's size.
- Do not reach for any paid service for any reason, even "just for now."

## 10. Definition of Done (all must be true before moving to Phase 2)

- [ ] Repository builds cleanly (`pnpm install && pnpm build` succeeds with no errors).
- [ ] `docker compose up` starts Postgres (with pgvector) and Redis with no errors.
- [ ] Database migrations run successfully from a clean database.
- [ ] `GET /health` and `GET /ready` both return correctly (`/ready` genuinely checks Postgres and
      Redis connectivity, not just that the process is alive).
- [ ] `docs/architecture.md` and `docs/product-spec.md` exist and are accurate to what was built.
- [ ] All domain tables from Section 7 exist in the database with correct foreign keys and
      indexes.
- [ ] `.env.example` is complete and a fresh clone + `cp .env.example .env` + fill-in-keys +
      `docker compose up` + `pnpm dev` works end to end.

## 11. Handoff to Phase 2

Phase 2 will build the actual graph runtime on top of the `nodes`/`edges`/`graph_versions` tables
created here, and will implement `packages/llm` (the Groq/Gemini provider abstraction whose
scaffold you created in Phase 1). Nothing in Phase 1 should need to be redone — if you found
yourself unsure about a schema field while building this, resolve it now rather than leaving a
TODO for Phase 2.