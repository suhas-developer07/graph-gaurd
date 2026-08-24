# GraphGuard — Architecture

## Overview

GraphGuard is a **modular monolith with a separate worker process** — clear module boundaries, no premature microservices.

```
Web (Next.js) → API (Fastify) → Domain modules → PostgreSQL + Redis → Evaluation Worker → Groq / Gemini
```

OpenTelemetry instrumentation crosses all boundaries (console exporter locally, pluggable APM later).

## Module Boundary Map

| Module | Responsibility | Owns Tables |
|---|---|---|
| **Graph Registry** | Create, validate, version, diff and publish agent graphs | `graphs`, `graph_versions`, `nodes`, `edges`, `projects` |
| **Graph Runtime** | Route input, execute nodes, manage state and transitions | _(stateless — reads from Graph Registry tables)_ |
| **Test Dataset** | Store cases, expected behaviors, tags, fixtures and versions | `datasets`, `test_cases` |
| **Evaluation Engine** | Run evaluators and aggregate scores | `evaluation_runs`, `evaluation_results` |
| **Regression Engine** | Compare baselines, detect degradation, localize failures | `regressions` |
| **Proposal Engine** | Generate candidate prompt/routing/config changes | `proposals` |
| **Release Gate** | Enforce thresholds before a graph version is promoted | `releases` |
| **Telemetry** | Trace requests, nodes, retrieval, LLM calls, evaluations | `llm_calls` |
| **Dashboard** | Graph explorer, run results, failures, diffs, release decisions | _(reads from all tables)_ |

## Data Ownership Rules

- **No two modules write to the same table.** Each module owns its tables exclusively.
- The Dashboard is **read-only** — it queries across all tables but writes nothing.
- The Graph Runtime is **stateless** — it reads graph definitions but doesn't persist state.

## Module Details

### Graph Registry
- **Owns:** Creating and versioning agent graphs (nodes, edges, prompts, routing rules)
- **Does NOT own:** Executing those graphs (that's the Runtime), or evaluating them (that's the Evaluation Engine)
- **Key operations:** `createGraph`, `addVersion`, `publishVersion`, `diffVersions`

### Graph Runtime
- **Owns:** Executing a graph against an input — routing through nodes, managing conversation state, returning the final response
- **Does NOT own:** Persisting graph definitions (reads from Registry), or scoring results (writes to Evaluation Engine tables)
- **Key operations:** `executeGraph`, `routeInput`, `transitionNode`

### Test Dataset
- **Owns:** Storing test cases with expected behaviors, tags, and fixtures
- **Does NOT own:** Running test cases (that's the Evaluation Engine), or defining what "correct" means (that's the graph definition in Registry)
- **Key operations:** `createDataset`, `addTestCase`, `tagCases`

### Evaluation Engine
- **Owns:** Running evaluators against test cases, aggregating scores, storing results
- **Does NOT own:** The test cases themselves (reads from Test Dataset), or detecting regressions (that's the Regression Engine)
- **Key operations:** `runEvaluation`, `scoreResult`, `aggregateScores`

### Regression Engine
- **Owns:** Comparing two evaluation runs, detecting degradation, localizing failures to specific nodes/edges
- **Does NOT own:** Running the evaluations (reads from Evaluation Engine), or proposing fixes (that's the Proposal Engine)
- **Key operations:** `compareRuns`, `detectRegressions`, `localizeFailure`

### Proposal Engine
- **Owns:** Generating candidate changes (prompt tweaks, routing rule updates) to fix regressions
- **Does NOT own:** Evaluating whether the fix works (that's the Evaluation Engine), or approving deployment (that's the Release Gate)
- **Key operations:** `proposeFix`, `validateProposal`

### Release Gate
- **Owns:** Enforcing pass/warn/block thresholds before a graph version is promoted to production
- **Does NOT own:** Running evaluations (reads from Evaluation Engine), or making the actual deployment
- **Key operations:** `evaluateGate`, `approveRelease`, `blockRelease`

### Telemetry
- **Owns:** Tracing all requests, node executions, LLM calls, and evaluation runs with OpenTelemetry
- **Does NOT own:** The business logic it traces — it's a cross-cutting concern
- **Key operations:** `traceRequest`, `recordLlmCall`

### Dashboard
- **Owns:** The user interface — graph explorer, run results, failure analysis, diffs, release decisions
- **Does NOT own:** Any data — it's purely a read-only consumer of the API
- **Key operations:** All read operations via the API layer

## Environment

- **Local development:** Docker Compose (Postgres with pgvector + Redis)
- **Deployment:** Free-tier PaaS (e.g., Render)
- **LLM providers:** Groq free tier (llama models), Google Gemini free tier (embeddings)
- **Observability:** OpenTelemetry with console exporter locally
