# GraphGuard — Product Specification

## Who It's For

GraphGuard is built for **engineers building and maintaining AI agent products** — specifically, teams working with multi-node agent graphs (routers, retrievers, specialists, safety checks, escalation logic) who need to ship changes safely without breaking existing conversation flows.

## The Problem

Modern AI applications are no longer a single prompt. They're graphs of interconnected nodes. A change to one node — a prompt tweak, a routing rule, a model swap — can silently break a completely different conversation flow. Traditional unit tests don't catch these failures because they're **semantic**, not syntactic. There's no CI safety net for agent behavior.

## End-to-End Workflow

1. **Define** an agent graph (nodes, edges, prompts, routing rules)
2. **Version** the graph with semantic versioning
3. **Run** the graph against a large set of realistic test conversations
4. **Score** results across multiple dimensions: routing correctness, grounding/citation accuracy, safety/compliance, escalation recall, response quality
5. **Compare** two graph versions against each other
6. **Localize** exactly why something regressed (which node, which edge, which prompt change)
7. **Propose** a fix for the regression
8. **Validate** the fix against the regression suite
9. **Gate** deployment — block or allow based on threshold criteria

## Non-Goals

- **NOT a real medical product** — the demo domain is a fictional pharmaceutical knowledge base (portfolio project)
- **NOT regulatory certification** — no claims of clinical validation
- **NOT a reproduction** of any real company's proprietary implementation
- **NOT a distributed system** — no Kubernetes, microservices, or cloud-native complexity
- **NOT a polished UI first** — the evaluation/regression engine works before the dashboard looks pretty

## Success Metrics

- A graph can be defined, versioned, executed, and visualized
- An evaluation run can execute hundreds of test cases asynchronously
- Every run produces deterministic, machine-readable metrics plus human-readable explanations
- Graph versions can be compared and regressions localized to specific nodes/edges
- A proposed graph change can be evaluated against a regression suite and marked PASS/FAIL
- Every LLM call is observable for latency, tokens, errors, and estimated cost
- The entire system runs locally with Docker and can be deployed on free-tier cloud hosting
- The project ends with a polished, founder-facing demo

## Constraints

- **$0 budget** — no paid API keys, no paid hosting, no credit-card-gated tiers
- **Free-tier LLM providers** — Groq (llama models) for reasoning, Google Gemini for embeddings
- **Local-first** — Docker Compose for Postgres + Redis, deployable to free-tier PaaS
- **Observable by default** — OpenTelemetry tracing on every call from day one
