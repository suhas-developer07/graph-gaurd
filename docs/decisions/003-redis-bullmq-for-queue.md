# ADR-003: Redis/BullMQ for the Queue

## Status

Accepted

## Context

GraphGuard needs an asynchronous job queue for evaluation runs. Evaluations may execute hundreds of test cases, each involving multiple LLM calls. These cannot run synchronously in the API request path — they need to be queued and processed by a separate worker.

## Decision

Use **Redis** as the backing store and **BullMQ** as the job queue library.

## Rationale

- **BullMQ is the standard** Node.js job queue built on Redis. It's mature, well-documented, and handles retries, rate limiting, priorities, and concurrency out of the box.
- **Redis is already needed** for caching and real-time features (later phases). Using it as the queue backend avoids adding another infrastructure dependency.
- **Separation of concerns:** The API enqueues jobs; the worker process dequeues and executes them. This naturally maps to our modular monolith architecture.
- **Free tier:** Redis is available locally via Docker Compose and via free-tier managed providers (Upstash, Redis Cloud) for later deployment.

## Alternatives Considered

- ** pg-boss:** Uses PostgreSQL as the queue backend. Avoids Redis dependency, but PostgreSQL is not optimized for high-throughput queue workloads. BullMQ + Redis is more performant for our use case.
- **Agenda (MongoDB):** Requires MongoDB, which we're not using.
- **Custom solution with pg_notify:** Too low-level; would need to reimplement retries, rate limiting, and concurrency control.

## Consequences

- Redis must be running for the worker to process jobs (documented dependency)
- BullMQ wired fully in Phase 6; Phase 1 only needs Redis reachable
- Worker process is separate from the API process (both run locally during development)
