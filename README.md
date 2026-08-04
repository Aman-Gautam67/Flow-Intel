# FlowIntel

**The most advanced Workflow Intelligence Platform.**

FlowIntel is not a workflow builder. It is a platform for **discovering, analyzing, verifying, comparing, and future-proofing automation workflows** across every major automation engine.

Think of it as **Google + GitHub + App Store for automation workflows** — combined with an industry-leading **Compatibility Drift & Migration Intelligence Engine**.

---

## What It Does

| Capability | Description |
|---|---|
| **Workflow Analysis** | Upload any n8n, Make, Zapier, Flowise, or LangFlow workflow and get a deterministic quality report in under 1 second |
| **Flow Quality Index (FQI)** | A single 0–100 score combining 9 dimensions: Health, Security, Simplicity, Reliability, Debt, Memory, Resilience, Privacy, AI Guardrails |
| **Security Audit** | 252+ rules detecting hardcoded secrets, unauthenticated webhooks, unsafe eval(), SQL injection, unencrypted HTTP, PII exposure |
| **AI Guardrails** | Detects prompt injection risk, missing maxTokens, no-timeout agents, unvalidated LLM outputs, dangerous tool attachments |
| **Compatibility Drift** | Detects deprecated nodes, broken typeVersions, removed APIs, and credential schema changes — all backed by official platform documentation |
| **Quality Gates** | 5 gates: Security, Production, Marketplace, Reliability, and Enterprise — workflows must pass all to earn certification |
| **Workflow Catalog** | Searchable, filterable catalog of every analyzed workflow with FQI badges, score bars, and engagement metrics |
| **Engagement Tracking** | Per-workflow view, download, and bookmark counters |
| **Badge API** | Embeddable SVG badges: `/api/badge/[slug]/security.svg` — live scores for READMEs |
| **CI/CD Audit** | `POST /api/v1/audit` — pass/fail + violations array for GitHub Actions, GitLab CI, or any HTTP step |
| **MCP Server** | Exposes workflow analysis as MCP tools for AI agents and LLM pipelines |

---

## Supported Platforms

- **n8n** — full node schema, typeVersion, expression, credential analysis
- **Make (Integromat)** — module analysis
- **Zapier** — action/trigger analysis
- **Flowise** — AI pipeline analysis
- **LangFlow** — AI flow analysis

Architecture is extensible for MCP workflows, AutoGen, CrewAI, Dify, Pipedream, Node-RED, Activepieces, OpenAI Agents SDK.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Runtime | Bun |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL via Drizzle ORM + `@neondatabase/serverless` |
| Analysis Engine | 252+ deterministic rules across 10 rule packs |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- PostgreSQL database (local or [Neon](https://neon.tech) free tier)

### Local Development

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL to your Postgres connection string

# 3. Run database migrations
bun run db:migrate

# 4. Start dev server
bun run dev
# → http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `CRON_SECRET` | ✅ | Auth token for cron endpoints |

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── parse/route.ts              ← POST: analyze a workflow JSON
│   │   ├── workflows/route.ts          ← GET: catalog search + filters
│   │   ├── workflows/[slug]/engage/    ← GET/POST: view/download/bookmark counters
│   │   ├── v1/audit/route.ts           ← CI/CD audit endpoint
│   │   ├── v2/analyze/route.ts         ← Full v2 engine analysis
│   │   ├── v2/certificate/[id]/        ← Certificate fetch
│   │   ├── badge/[slug]/[metric]/      ← SVG badge generation
│   │   ├── fetch-url/route.ts          ← CORS proxy for remote workflow import
│   │   └── mcp/route.ts                ← MCP Streamable HTTP server
│   ├── page.tsx                        ← Landing page
│   ├── upload/page.tsx                 ← Workflow analysis page
│   ├── search/page.tsx                 ← Catalog discovery page
│   └── workflows/[slug]/page.tsx       ← Workflow dashboard
│
├── components/
│   ├── landing/                        ← Landing page sections
│   │   ├── landing-page.tsx
│   │   ├── engine-stats-bar.tsx
│   │   ├── engine-details-section.tsx
│   │   ├── how-it-works-section.tsx
│   │   └── compatibility-drift-section.tsx
│   ├── upload/                         ← Analysis upload flow
│   │   ├── upload-page.tsx
│   │   ├── inline-report-panel.tsx
│   │   ├── bulk-workspace.tsx
│   │   └── import-modal.tsx
│   ├── search/                         ← Catalog search UI
│   │   ├── search-page.tsx
│   │   ├── search-sidebar.tsx
│   │   ├── workflow-card.tsx
│   │   └── search-types.ts
│   └── workflow/                       ← Workflow dashboard
│       ├── workflow-dashboard.tsx
│       ├── engagement-strip.tsx
│       ├── drift-panel.tsx
│       ├── score-ring.tsx
│       ├── workflow-graph.tsx
│       └── remediation-drawer.tsx
│
└── lib/
    ├── engine/                         ← Core analysis engine
    │   ├── rule-engine.ts
    │   ├── rule-packs/                 ← 10 rule packs × 3 files each
    │   ├── drift-database.ts           ← Compatibility drift records
    │   ├── certification.ts
    │   ├── quality-gates.ts
    │   └── fingerprint.ts
    ├── parsers/                        ← Platform-specific parsers
    │   ├── n8n.parser.ts
    │   ├── make.parser.ts
    │   ├── zapier.parser.ts
    │   └── flowise.parser.ts
    └── db/
        ├── schema/                     ← Drizzle table definitions
        ├── queries/                    ← DB query helpers
        └── migrations/                 ← SQL migration files (commit these)
```

---

## Analysis Engine

The engine is **deterministic** — the same workflow always produces the same score. No AI is used in the scoring pipeline.

### 9 Score Dimensions

| Dimension | What It Measures |
|---|---|
| Health | Overall structural correctness and completeness |
| Security | Credentials, auth, injection risks, unsafe code |
| Simplicity | Complexity, loop depth, branching factor |
| Reliability | Error handling, retries, timeouts, fallbacks |
| Debt | Legacy nodes, deprecated APIs, outdated patterns |
| Memory | Node count, data volume, potential OOM risks |
| Resilience | Recovery paths, webhook reliability, circuit breakers |
| Privacy | PII detection, data flow to external services |
| AI Guardrails | Prompt injection, missing limits, unsafe tool use |

### 5 Quality Gates

A workflow must pass **all 5 gates** to earn FlowIntel Certification:

| Gate | Description |
|---|---|
| Security Gate | No CRITICAL security flags |
| Production Gate | Health ≥ 70, Reliability ≥ 60 |
| Marketplace Gate | FQI ≥ 80, Security ≥ 80, no CRITICAL flags |
| Reliability Gate | Reliability ≥ 70, Resilience ≥ 60 |
| Enterprise Gate | All scores ≥ 80, AI Guardrails pass |

### Compatibility Drift

Every workflow is checked against documented platform changes:

- Deprecated node types (e.g. `n8n-nodes-base.function` → Code node)
- Breaking typeVersion changes (e.g. HTTP Request v2 removed in n8n v1.0)
- Deprecated AI models (e.g. `gpt-3.5-turbo-0301`)
- Webhook auth policy changes
- Expression syntax migrations (`$items()` → `$input.all()`)

Every finding includes the official documentation URL and a confidence score (1–3).

---

## API Reference

### Analyze a workflow
```bash
POST /api/parse
Content-Type: application/json

{ "json": <workflow_json>, "save": true, "isPublic": true }
```

### CI/CD audit
```bash
POST /api/v1/audit
Content-Type: application/json

{ "json": <workflow_json> }
# Returns: { pass: boolean, fqi: number, violations: [...] }
```

### Search catalog
```bash
GET /api/workflows?q=discord+bot&platform=N8N&fqiMin=80&certifiedOnly=true
```

### Engagement counters
```bash
POST /api/workflows/:slug/engage
{ "action": "view" | "download" | "bookmark" }
```

### SVG Badge
```bash
GET /api/badge/:slug/security.svg
GET /api/badge/:slug/fqi.svg
GET /api/badge/:slug/health.svg
```

---

## Testing

```bash
# Scoring simulation (56 cases)
bun run test:score

# Security detection (7 cases)
bun run test:detect

# AI guardrails (17 cases)
bun run test:ai
```

All 80 tests must pass before any deploy.

---

## Database Migrations

```bash
# Generate a new migration from schema changes
bun run db:generate

# Apply all pending migrations
bun run db:migrate

# Open Drizzle Studio (DB GUI)
bun run db:studio
```

Migration files live in `src/lib/db/migrations/` — **always commit these to git**.

---

## License

GNU GPL v3.0


> Built with ❤️ by [Aman Gautam](https://github.com/Aman-Gautam67) and [Jivaansh Yadav](https://github.com/Jivaansh-Yadav)
