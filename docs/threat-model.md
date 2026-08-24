# GraphGuard — Threat Model

## Overview

This document identifies security considerations for GraphGuard. Since this is a portfolio project with a $0 budget and single-tenant deployment, the threat model is proportionate — but documenting these decisions now prevents bad habits from creeping in as the project grows.

## API Auth Boundary

### What's Public (No Auth Required)
- `GET /health` — Process liveness check. Returns only status and timestamp.
- `GET /ready` — Readiness check. Returns connectivity status for Postgres and Redis.

### What Requires Authentication (Built Later)
- All other API endpoints (graph CRUD, evaluation runs, release decisions, etc.)
- Authentication itself is **not implemented in Phase 1** — it's documented here as a required boundary
- Recommended approach: API key or JWT-based auth, enforced at the Fastify middleware layer
- The auth layer should be a Fastify plugin that can be toggled on/off for local development

### Authentication Design Notes
- Single-tenant deployment means no need for multi-tenant auth initially
- API keys are the simplest starting point; JWT can be added if needed later
- Auth middleware should reject unauthorized requests with `401 Unauthorized` before any business logic runs

## Secrets Handling

### Environment Variables Only
- All secrets (`GROQ_API_KEY`, `GEMINI_API_KEY`, `DATABASE_URL`, `REDIS_URL`) are loaded via environment variables
- The `@graphguard/config` package validates all required env vars at startup and fails fast if any are missing
- **Never hardcode secrets** in source code, config files, or Docker images

### Logging Policy
- **Never log secrets.** The config module validates env vars but does not print their values.
- **Never log API keys.** If an API key appears in an error message, redact it before logging.
- **LLM prompts and responses may contain sensitive content.** Logging should be configurable:
  - Development: full logging for debugging
  - Production: structured logs with PII redaction or logging disabled for prompt content

### .env File Handling
- `.env` is gitignored — never committed
- `.env.example` is committed as a template
- Docker Compose uses environment variables, not `.env` files, for container configuration

## Data Sensitivity

### LLM Prompts and Responses
- The demo domain is fictional (pharmaceutical knowledge base), but the system is designed for real production use
- Prompts and responses may contain user-provided content that could be sensitive
- **Risk:** Sensitive content in prompts/responses ending up in logs, traces, or database records
- **Mitigation:**
  - OpenTelemetry traces use console exporter locally (no external transmission)
  - Database stores prompts as text — encrypted-at-rest is a deployment concern, not an application concern
  - Log level for prompt content should be `debug` in development, `warn` or off in production

### Test Case Data
- Test cases may contain example conversations that reference real or realistic scenarios
- Stored in the database as structured JSON — same sensitivity rules as LLM prompts apply

## Tenant Isolation

### Single-Tenant Assumption (Documented Limitation)
- GraphGuard is designed for **single-tenant deployment** — one organization, one database
- There is no row-level security or tenant isolation in the current schema
- All data in the database is visible to all API consumers
- **This is an explicit limitation**, not an oversight — multi-tenant isolation would be added if the project scope changes

### Future Considerations
- If multi-tenancy is ever needed, add a `tenant_id` column to all tables and enforce row-level security at the database or application layer
- The modular architecture (clear module boundaries, single table ownership) makes this feasible to add later

## Dependency Risks

### LLM Provider Dependency
- Groq and Gemini free tiers may change their terms, rate limits, or pricing
- The provider-abstraction pattern (`@graphguard/llm`) means switching providers requires only implementing a new adapter
- No vendor lock-in at the application layer

### Database Dependency
- PostgreSQL with pgvector is the only supported database
- The `DATABASE_URL` connection string pattern means the database host can change without code changes
- pgvector is used only for Phase 3+ (grounding/citation evaluator) — the core system works without it

## Attack Surface Summary

| Vector | Risk | Mitigation |
|---|---|---|
| Unauthenticated API access | Medium | Auth boundary documented; implementation deferred to later phase |
| Secrets in logs | Low | Policy documented; env vars validated but not logged |
| LLM prompt injection | Medium | Safety nodes in graph; evaluation includes safety/compliance scoring |
| Prompt/response PII in DB | Low | Single-tenant; no external data transmission; encryption at rest is deployment concern |
| Dependency vulnerabilities | Low | Pin versions; use `pnpm` lockfile; regular updates |
| Docker image vulnerabilities | Low | Use official images; pin versions; scan periodically |
