# ADR-001: Fastify as the API Framework

## Status

Accepted

## Context

We need an HTTP API framework for GraphGuard that is fast, type-safe, and has a good plugin ecosystem. The API serves the Next.js dashboard and the evaluation worker, handling graph CRUD, evaluation runs, and release decisions.

## Decision

Use **Fastify** as the HTTP API framework.

## Rationale

- **Performance:** Fastify is significantly faster than Express due to its schema-based serialization and efficient routing. For a system that may handle hundreds of concurrent evaluation requests, this matters.
- **Type safety:** Fastify has first-class TypeScript support with JSON Schema-based type inference, which aligns with our strict TypeScript requirement.
- **Plugin architecture:** Fastify's plugin system naturally enforces module boundaries — each domain module can be a Fastify plugin with its own encapsulated scope.
- **Validation:** Built-in request/response validation via JSON Schema (complements our Zod-based env validation).
- **Ecosystem:** Good plugin ecosystem for CORS, logging, metrics, and OpenTelemetry integration.

## Alternatives Considered

- **Express:** More widely used but slower, less type-safe, and its callback-based middleware model is dated. Express 5 is still in alpha.
- **Hono:** Lightweight and fast, but newer with a smaller ecosystem. Good for edge runtimes, but we're running on Node.js.
- **tRPC:** Great for type-safe client-server communication, but adds complexity for a REST API that may need to be consumed by non-TypeScript clients.

## Consequences

- Team needs to learn Fastify's plugin and lifecycle model
- JSON Schema validation is used alongside Zod (Zod for env config, JSON Schema for request validation)
- Fastify's encapsulation model helps enforce module boundaries
