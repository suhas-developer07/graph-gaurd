# ADR-004: Provider Abstraction Pattern for LLM Calls

## Status

Accepted

## Context

GraphGuard needs to call LLMs for multiple purposes: graph execution (routing, specialization, safety checks), evaluation (judge tasks), and proposal generation. Different tasks may use different models (e.g., `llama-3.3-70b-versatile` for reasoning, `llama-3.1-8b-instant` for classification). The system must also support different providers (Groq for text, Gemini for embeddings).

## Decision

Implement a **provider abstraction interface** in `packages/llm` with concrete adapters for Groq and Gemini.

## Rationale

- **Swap providers without changing domain logic.** If Groq changes pricing or we want to test with a local model, we only change the adapter.
- **Consistent interface** for all LLM calls, regardless of provider. The rest of the codebase calls `llm.complete()` or `llm.embed()`, not `groq.chat.completions.create()`.
- **Observability built in.** The abstraction layer can intercept every call to record tokens, latency, and cost — which is a core success metric.
- **Testability.** A mock adapter makes tests deterministic without hitting real APIs.

## Implementation Pattern

```typescript
interface LLMProvider {
  complete(params: CompleteParams): Promise<CompleteResult>;
  embed(params: EmbedParams): Promise<EmbedResult>;
  name: string;
}
```

Concrete adapters: `GroqProvider`, `GeminiProvider`. The active provider is selected via configuration (environment variable or runtime config).

## Alternatives Considered

- **Vercel AI SDK:** Good abstraction but adds a large dependency. Our needs are simple enough (chat completions + embeddings) to warrant a lightweight custom abstraction.
- **LangChain:** Massive dependency for what we need. Overkill.
- **Direct API calls:** Would scatter provider-specific code throughout the codebase, making provider switching expensive.

## Consequences

- `packages/llm` is scaffolded in Phase 1, implemented in Phase 2
- All LLM calls in the system must go through this abstraction (enforced by code review, not lint rules)
- The abstraction must be thin — no ORM-like complexity, just a clean interface
