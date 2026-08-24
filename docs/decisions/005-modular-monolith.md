# ADR-005: Modular Monolith Approach

## Status

Accepted

## Context

GraphGuard has multiple domain modules (Graph Registry, Evaluation Engine, Regression Engine, etc.) that need to communicate. The question is whether to build this as a monolith, a modular monolith, or microservices.

## Decision

Use a **modular monolith** with a separate worker process.

## Rationale

- **Simplicity at $0 budget.** Microservices require service discovery, distributed tracing, network policies, and deployment orchestration — none of which are justified for a portfolio project.
- **Module boundaries enforce separation.** Each module is a separate package in the monorepo with clear ownership of its tables. This gives the organizational benefit of microservices without the operational cost.
- **Worker separation is the only process split needed.** The evaluation worker runs long-lived, CPU/IO-intensive jobs that shouldn't block API responses. A separate worker process handles this cleanly.
- **Docker Compose for local dev.** Postgres + Redis locally; the API, web, and worker all run as separate processes during development.
- **Deployable as units.** On Render or similar PaaS, the API and worker can be deployed as separate services from the same repo, sharing the same database.

## Alternatives Considered

- **Single process:** Would block API responses during evaluation runs. Not viable.
- **Microservices:** Overkill for this project's scope. Adds deployment complexity, network latency, and distributed system challenges that aren't justified.
- **Serverless (Lambda):** Cold starts are problematic for evaluation runs that may take minutes. Also adds vendor lock-in.

## Consequences

- All domain modules live in `packages/` and are imported directly by the API and worker
- No inter-service communication (HTTP/gRPC) — just function calls and shared database
- The monorepo structure (pnpm workspaces) enforces import boundaries
- If the project grows beyond a portfolio piece, modules can be extracted into services incrementally
