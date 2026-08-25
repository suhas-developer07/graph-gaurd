# GraphGuard

**Continuous evaluation and release-safety for AI agent graphs.**

GraphGuard lets you define agent graphs, run them against realistic test conversations, score results across multiple dimensions, compare versions, localize regressions, propose fixes, and gate deployment — all before anything reaches production.

## Quick Start

### Prerequisites

- Node.js 20 LTS
- pnpm 9+
- Docker & Docker Compose

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd graphguard

# Copy environment variables
cp .env.example .env
# Edit .env and fill in your API keys:
#   GROQ_API_KEY=your-groq-key
#   GEMINI_API_KEY=your-gemini-key

# Start local infrastructure
docker compose up -d

# Install dependencies
pnpm install

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

### Available Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start all apps in development mode |
| `pnpm dev:api` | Start only the Fastify API |
| `pnpm dev:web` | Start only the Next.js dashboard |
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all files |
| `pnpm format` | Format all files with Prettier |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:generate` | Generate new migration files |

## Architecture

```
Web (Next.js) → API (Fastify) → Domain modules → PostgreSQL + Redis → Evaluation Worker → Groq / Gemini
```

See [docs/architecture.md](docs/architecture.md) for the full architecture documentation.

## Project Structure

```
graphguard/
├── apps/
│   ├── web/                  # Next.js dashboard
│   ├── api/                  # Fastify HTTP API
│   └── worker/               # Evaluation worker
├── packages/
│   ├── domain/                # TypeScript types
│   ├── graph-engine/          # Runtime + routing (Phase 2)
│   ├── evaluation/            # Evaluators (Phase 3)
│   ├── regression/            # Diffs + gates (Phase 4)
│   ├── llm/                   # Provider abstraction (Phase 2)
│   ├── observability/         # OpenTelemetry helpers
│   ├── db/                    # Drizzle schema + migrations
│   └── config/                # Zod-validated configuration
├── datasets/                  # Test case data
├── infra/                     # Infrastructure configs
├── docs/                      # Documentation & ADRs
└── docker-compose.yml         # Local Postgres + Redis
```

## Environment Variables

See [`.env.example`](.env.example) for all required environment variables.

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `GROQ_API_KEY` | Groq API key (free tier) |
| `GEMINI_API_KEY` | Google Gemini API key (free tier) |
| `NODE_ENV` | `development` / `production` / `test` |
| `PORT` | API port (default: 4000) |

## Tech Stack

- **Runtime:** Node.js 20 LTS
- **Language:** TypeScript (strict mode)
- **Package Manager:** pnpm workspaces
- **API:** Fastify
- **Web:** Next.js + Tailwind CSS
- **Database:** PostgreSQL + pgvector
- **ORM:** Drizzle
- **Queue:** Redis + BullMQ
- **LLM:** Groq (text), Gemini (embeddings)
- **Observability:** OpenTelemetry
- **Testing:** Vitest
freebuff --continue 2026-08-24T18-36-37.980Z

## License

MIT
