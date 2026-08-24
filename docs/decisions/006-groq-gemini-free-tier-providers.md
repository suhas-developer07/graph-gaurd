# ADR-006: Groq/Gemini as Free-Tier LLM/Embeddings Providers

## Status

Accepted

## Context

GraphGuard needs LLM providers for text generation (graph execution, evaluation, proposals) and embeddings (grounding/citation). The project has a hard $0 budget — no paid API keys, no credit-card-gated tiers.

## Decision

- **Text generation:** Groq free tier (`llama-3.3-70b-versatile` for reasoning, `llama-3.1-8b-instant` for classification)
- **Embeddings:** Google Gemini free tier (`text-embedding-004`)

## Rationale

### Groq for Text
- **Free tier is generous.** Groq offers free API access with reasonable rate limits (enough for a portfolio project).
- **OpenAI-compatible API.** Groq uses the same `/chat/completions` endpoint format as OpenAI, making the provider adapter straightforward.
- **Fast inference.** Groq's custom hardware (LPU) provides fast inference, which is nice for development velocity.
- **No credit card required.** Just sign up and get an API key.

### Gemini for Embeddings
- **Free tier available.** Google AI Studio provides free API access for `text-embedding-004`.
- **Good quality embeddings.** Competitive with OpenAI's embeddings on quality benchmarks.
- **Separate provider for embeddings.** Embeddings have different usage patterns (batch, high-throughput) than chat completions, so a separate provider makes sense.

## Why Not OpenAI?

The original architecture document mentioned OpenAI as the default LLM provider. This ADR **explicitly replaces that baseline**:

- OpenAI's free tier is extremely limited (or non-existent for API access)
- OpenAI requires a credit card for API access, violating the $0 budget constraint
- Groq provides a better free tier for the same use case (chat completions)
- Gemini provides a better free tier for embeddings
- The provider abstraction (ADR-004) means switching back to OpenAI later requires only implementing a new adapter

## Alternatives Considered

- **OpenAI:** Requires credit card. Disqualified by $0 budget.
- **Anthropic (Claude):** No free tier for API access. Disqualified.
- **Mistral AI:** Free tier exists but is more limited than Groq. Groq is preferred for chat completions.
- **Local models (Ollama):** Would require significant compute resources. Not viable for a portfolio project running on free-tier hosting.
- **Cohere:** Free tier exists but embeddings quality is not as well-established as Gemini.

## Consequences

- All LLM calls go through the provider abstraction (ADR-004)
- API keys stored as environment variables, validated at startup by `@graphguard/config`
- Rate limiting is a concern — evaluation runs with hundreds of test cases may hit rate limits. The worker should implement backoff/retry logic.
- Cost tracking column (`estimated_cost`) in `llm_calls` table will be `0` for free-tier calls but the column exists for when/if that changes
