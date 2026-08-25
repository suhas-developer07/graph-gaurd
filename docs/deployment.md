# GraphGuard Deployment Guide

## Architecture

GraphGuard runs as three independent services:
- **API** (`apps/api`) — HTTP server for mutations, health checks, and queue management
- **Worker** (`apps/worker`) — BullMQ job processor for evaluation runs and proposals
- **Web** (`apps/web`) — Next.js dashboard

All services share PostgreSQL (with pgvector) and Redis.

## Free-Tier Infrastructure

### Database (PostgreSQL + pgvector)
- **Recommended**: Neon (free tier: 512MB storage, compute hours limited)
- **Alternative**: Supabase (free tier: 500MB, 500K rows)
- **Connection**: Set `DATABASE_URL` env var

### Cache/Queue (Redis)
- **Recommended**: Upstash (free tier: 10K commands/day)
- **Alternative**: Redis Cloud (free tier: 30MB)
- **Connection**: Set `REDIS_URL` env var

### Hosting
- **Recommended**: Render (free tier: 750 hours/month)
- **Alternative**: Railway (free tier: $5 credit/month)
- **Note**: Free tiers spin down idle services after inactivity. First request after idle may take 30-60 seconds (cold start). This is expected behavior — see [Cold Starts](#cold-starts) below.

## Environment Variables

### Required
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `GROQ_API_KEY` | Groq API key (free tier) |
| `GEMINI_API_KEY` | Google Gemini API key (free tier) |

### Optional
| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `4000` | API port |
| `API_AUTH_TOKEN` | (none) | Bearer token for mutation routes |
| `OTEL_EXPORTER` | `console` | OpenTelemetry exporter (`console` or `otlp`) |

## Local Development

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your API keys

# 4. Run migrations
pnpm db:migrate

# 5. Start all services
pnpm dev
```

## Docker Deployment

```bash
# Build all images
docker build -f Dockerfile.api -t graphguard-api .
docker build -f Dockerfile.worker -t graphguard-worker .
docker build -f Dockerfile.web -t graphguard-web .

# Run with docker-compose (add your services)
docker compose -f docker-compose.prod.yml up -d
```

## Render Deployment

1. Create a Render account (free tier)
2. Connect your GitHub repository
3. Create three Web Services:
   - **API**: Build command `pnpm install && pnpm build`, Start command `node apps/api/dist/index.js`
   - **Worker**: Build command `pnpm install && pnpm build`, Start command `node apps/worker/dist/index.js`
   - **Web**: Build command `pnpm install && pnpm build`, Start command `node apps/web/dist/server.js`
4. Set environment variables in Render dashboard
5. Deploy from main branch

## Cold Starts

Free-tier services spin down after 15-30 minutes of inactivity. On first request:

- **API**: Returns 503 with "waking up" message, then 200 after ~30 seconds
- **Worker**: Processes queued jobs after ~30 seconds
- **Web**: Shows loading state, then renders after ~30 seconds

This is documented behavior, not a bug. Design your demo script around it:
- Keep services warm during demos (periodic health checks)
- Show the cold start as a feature ("this is what free-tier looks like")

## Monitoring

### Health Checks
- `GET /health` — Process is alive
- `GET /ready` — Process + Postgres + Redis are reachable

### OpenTelemetry
- Default: Console exporter (logs traces to stdout)
- Optional: OTLP exporter (set `OTEL_EXPORTER=otlp` and configure endpoint)

### Logs
- Structured JSON logs (NDJSON format)
- Sensitive content redacted automatically
- Request IDs propagated through all services

## Rate Limits

- **API mutations**: 60 requests/minute per IP
- **LLM calls**: 30 requests/minute (Groq free tier)
- **Embeddings**: 15 requests/minute (Gemini free tier)

## Security

- Mutation routes require `API_AUTH_TOKEN` (Bearer token)
- GET routes are public (read-only)
- Health/readiness checks are always public
- No user management — single token for simplicity

## Troubleshooting

### "Cannot connect to PostgreSQL"
- Check `DATABASE_URL` format: `postgres://user:pass@host:port/dbname`
- Ensure pgvector extension is enabled
- Check if database is reachable from hosting platform

### "Cannot connect to Redis"
- Check `REDIS_URL` format: `redis://host:port`
- Ensure Redis supports BullMQ (requires Redis 6+)

### Worker not processing jobs
- Check worker logs for connection errors
- Verify Redis is accessible from worker
- Check BullMQ dashboard (if using Redis Commander)

### Cold start takes too long
- Free-tier cold starts are expected (30-60 seconds)
- Keep services warm during demos
- Consider upgrading to paid tier for production use
