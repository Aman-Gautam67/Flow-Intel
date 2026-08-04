# FlowIntel — Agent & Contributor Guide

This document is the authoritative reference for any AI agent or human contributor working on the FlowIntel codebase. Read it fully before writing a single line of code.

---

## 1. What FlowIntel Is

FlowIntel is a **Workflow Intelligence Platform** — not a workflow builder.

Its purpose is to:
- Discover and catalog automation workflows
- Analyze workflow quality deterministically (no AI in the scoring pipeline)
- Detect compatibility drift against documented platform changes
- Certify workflows that meet quality gates
- Expose findings via API, badges, and an MCP server

**Core rule: never guess undocumented behavior. Never invent migrations. Every finding must reference official documentation.**

---

## 2. Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16 App Router | |
| Runtime | Bun ≥ 1.1 | All scripts use `bun run` |
| Language | TypeScript strict | `noEmit` for type checking |
| Styling | Tailwind CSS v4 + inline styles | Dark theme, CSS variables |
| Database | PostgreSQL + Drizzle ORM | Standard `postgres` TCP driver |
| Auth | `@eazo/sdk` | `requireAuth()` on all user routes |

---

## 3. Commands

```bash
bun install                    # install dependencies
bun run dev                    # start dev server → localhost:3000
bun run build                  # production build
bun run lint                   # ESLint

# Database
bun run db:migrate             # apply pending migrations
bun run db:generate            # generate new migration from schema changes
bun run db:studio              # open Drizzle Studio

# Tests — all must pass before any deploy
bun run test:score             # 56 scoring simulation cases
bun run test:detect            # 7 security detection cases
bun run test:ai                # 17 AI guardrails cases
```

---

## 4. Project Structure

```
src/
├── app/
│   ├── api/                         ← All API routes
│   │   ├── parse/route.ts           ← Core analysis endpoint
│   │   ├── workflows/route.ts       ← Catalog GET
│   │   ├── workflows/[slug]/engage/ ← View/download/bookmark counters
│   │   ├── v1/audit/route.ts        ← CI/CD audit (pass/fail + violations)
│   │   ├── v2/analyze/route.ts      ← Full v2 engine analysis
│   │   ├── v2/certificate/[id]/     ← Certificate retrieval
│   │   ├── v2/marketplace/          ← Marketplace submission + status
│   │   ├── badge/[slug]/[metric]/   ← SVG badge generation
│   │   ├── fetch-url/route.ts       ← CORS proxy for remote workflow import
│   │   ├── admin/reanalyze/         ← Admin: re-run analysis on saved workflow
│   │   └── mcp/route.ts             ← MCP Streamable HTTP server
│   ├── page.tsx                     ← Landing page (thin shell)
│   ├── upload/page.tsx              ← Analyze page (thin shell)
│   ├── search/page.tsx              ← Catalog page (thin shell)
│   └── workflows/[slug]/page.tsx    ← Dashboard page (thin shell)
│
├── components/
│   ├── landing/                     ← Landing page sections
│   ├── upload/                      ← Analysis flow UI
│   ├── search/                      ← Catalog search UI
│   └── workflow/                    ← Workflow dashboard UI
│
└── lib/
    ├── engine/                      ← Core deterministic analysis engine
    │   ├── rule-engine.ts           ← Rule execution loop
    │   ├── rule-packs/              ← 252+ rules across 10 categories
    │   ├── drift-database.ts        ← Compatibility drift records
    │   ├── quality-gates.ts         ← 5-gate certification pipeline
    │   ├── certification.ts         ← Certificate generation
    │   ├── fingerprint.ts           ← Workflow SHA-256 fingerprinting
    │   ├── analysis-runner.ts       ← Orchestrates full analysis pipeline
    │   └── __tests__/              ← Test suite (must all pass)
    ├── parsers/                     ← Platform-specific AST parsers
    │   ├── n8n.parser.ts
    │   ├── make.parser.ts
    │   ├── zapier.parser.ts
    │   └── flowise.parser.ts
    ├── analyzer/                    ← V1 legacy analyzer (do not remove)
    │   └── rules/                   ← 9 dimension rule files
    ├── db/
    │   ├── client.ts                ← Drizzle DB client (postgres driver)
    │   ├── migrate.ts               ← Migration runner (Node.js only)
    │   ├── schema/                  ← Drizzle table definitions
    │   ├── queries/                 ← Query helpers
    │   └── migrations/              ← SQL migration files — COMMIT THESE
    └── mcp/server.ts                ← MCP server tool definitions
```

---

## 5. Critical Rules

### 5.1 Analysis Engine

- **The engine is deterministic. No AI in the scoring pipeline.**
- Every rule must return consistent results for the same input.
- Rule `detect()` functions must never throw — wrap in try/catch.
- Penalty points must be documented in the rule manifest.
- `penaltyPoints: 0` rules are informational only and must not affect scores.

### 5.2 Database Client

All DB access goes through `src/lib/db/client.ts`. Do not instantiate a new postgres client elsewhere — always import the shared `db` instance.

```ts
// ✅ CORRECT
import { db } from "@/lib/db/client";
```

### 5.3 API Routes

No special runtime directive needed — Next.js Node.js runtime is the default for all routes.

### 5.4 Crypto

Use `globalThis.crypto.subtle` (Web Crypto API) as the primary hashing path — it is available in Node.js 18+ and all browsers. `crypto` is the Node.js fallback. See `src/lib/engine/fingerprint.ts` for the correct fallback chain.

### 5.5 Navbars

All navbars are **static (document flow)** — not fixed or sticky. Do not add `fixed`, `sticky`, or `position: fixed` to any nav element. The pattern is:

```tsx
<nav className="flex items-center px-5 py-2.5"
  style={{ borderBottom: "1px solid var(--color-fi-border)", background: "rgba(10,10,10,0.96)" }}>
```

### 5.6 Compatibility Drift Rules

Every drift record in `src/lib/engine/drift-database.ts` **must** have:
- `docUrl` — a real official documentation URL
- `confidence` — 1 (guesswork, never ship), 2 (documented partial), 3 (fully documented)
- `detectable: false` if a `detect()` function cannot be written without false positives

**Never set `confidence: 1` on a shipped record.** If you cannot find official documentation, set `detectable: false` and add only as `INFO` severity.

---

## 6. Adding a New Rule

1. Decide which rule pack it belongs to (security, reliability, compatibility, etc.)
2. Add the rule to the appropriate `src/lib/engine/rule-packs/*.rules.ts` file
3. Follow the `RulePackManifest` type from `src/lib/engine/types.ts`
4. Required fields: `id`, `name`, `category`, `severity`, `description`, `enabled`, `marketplaceBlocking`, `penaltyPoints`, `docReference`, `detect()`
5. Add a test case to the relevant `__tests__/` file
6. Run `bun run test:score` and `bun run test:detect` — both must pass
7. Update `penaltyPoints` carefully — the FQI formula is calibrated; adding large penalties will break existing simulations

---

## 7. Adding a New Parser

1. Create `src/lib/parsers/<platform>.parser.ts`
2. Export a function `parse<Platform>(raw: unknown): ParsedWorkflow`
3. The `ParsedWorkflow` type is in `src/types/index.ts` — match it exactly
4. Import and wire the parser in `src/lib/parsers/index.ts`
5. Add the platform to the `platformEnum` in `src/lib/db/schema/workflows.ts`
6. Add detection logic in `src/lib/parsers/index.ts` `detectPlatform()`
7. Write at least 3 test cases in `src/lib/engine/__tests__/scoring-simulation.ts`

---

## 8. Adding a Compatibility Drift Record

1. Find the official documentation URL for the change
2. Add a `DriftRecord` to `src/lib/engine/drift-database.ts`
3. Required: `id` (unique, kebab-case), `platform`, `component`, `summary`, `detail`, `severity`, `since`, `docUrl`, `confidence`, `detectable`
4. If `detectable: true`, write a `detect()` function that returns `true` only when the workflow is affected
5. Never add `confidence: 1` records
6. Test manually by uploading a workflow that contains the affected pattern

---

## 9. Database Migrations

When adding columns or tables:

1. Update `src/lib/db/schema/workflows.ts` (or relevant schema file)
2. Run `bun run db:generate` to generate the SQL migration
3. Run `bun run db:migrate` to apply it locally
4. Commit both the schema change AND the generated SQL file in `src/lib/db/migrations/`
5. Never hand-edit generated migration files

Migration naming convention: `NNNN_description.sql` (e.g. `0003_engagement_counters.sql`).

---

## 10. Score Dimensions

The 9 scoring dimensions and their DB column names:

| Dimension | Column | Key in scores object |
|---|---|---|
| Health | `health_score` | `healthScore` |
| Security | `security_score` | `securityScore` |
| Simplicity | `complexity_score` | `complexityScore` |
| Reliability | `reliability_score` | `reliabilityScore` |
| Debt | `debt_score` | `debtScore` |
| Memory | `memory_score` | `memoryScore` |
| Resilience | `resilience_score` | `resilienceScore` |
| Privacy | `privacy_score` | `privacyScore` |
| AI Guardrails | `ai_guardrails_score` | `aiGuardrailsScore` |

**AI Guardrails special case:** If a workflow has no AI nodes, `aiApplicable` is `false` and the score must display as N/A (null ring), not 100. See `src/components/upload/upload-page.tsx` for the correct rendering pattern.

**Stale score protection:** If a workflow has AI nodes but the stored `aiGuardrailsScore` is 100, this indicates it was analyzed before the AI guardrails engine was added. The dashboard shows a "re-analyze" warning instead of a fake A+ score. See `src/components/workflow/workflow-dashboard.tsx`.

---

## 11. FQI Grading Scale

| Score | Grade |
|---|---|
| 95–100 | A+ |
| 87–94 | A |
| 80–86 | A- |
| 73–79 | B+ |
| 67–72 | B |
| 60–66 | B- |
| 53–59 | C+ |
| 47–52 | C |
| 40–46 | C- |
| 20–39 | D |
| 0–19 | F |

Color thresholds: ≥80 = `#00ff88` (green), 60–79 = `#f7d774` (amber), <60 = `#ff5d5d` (red).

---

## 12. Engagement Counters

Three counters live on the `workflows` table (not `workflow_scores`):

- `view_count` — incremented on every dashboard page load (client-side, via `EngagementStrip`)
- `download_count` — incremented when user clicks Download
- `bookmark_count` — incremented once per session when user clicks Bookmark

API: `POST /api/workflows/:slug/engage` with `{ action: "view" | "download" | "bookmark" }`.

---

## 13. Design System

### Colors (CSS variables)

```css
--color-fi-accent:  #00ff88   /* primary green */
--color-fi-crit:    #ff5d5d   /* critical red */
--color-fi-warn:    #f7d774   /* warning amber */
--color-fi-info:    #86a7ff   /* info blue */
--color-fi-text:    #f0f0f0
--color-fi-muted:   rgba(240,240,240,0.45)
--color-fi-border:  rgba(255,255,255,0.1)
--color-fi-panel:   rgba(8,8,8,0.88)
```

### Typography

- Labels / metadata: `font-mono text-[9px] uppercase tracking-widest`
- Body: `font-sans text-[12px] leading-relaxed`
- Scores: `font-mono tabular-nums`
- Never use `font-bold` on monospace labels — use `tracking-widest` instead

### Background

Dark: `rgba(8,8,8,0.88)` panels on `#050505` base. Do not use pure black or pure white.

---

## 14. Testing Requirements

Before any commit that touches the engine:

```bash
bun run test:score    # must show: ✅ All simulations passed
bun run test:detect   # must show: Results: 7 passed, 0 failed
bun run test:ai       # must show: Results: 17 passed, 0 failed
npx tsc --noEmit      # must show: no output (0 errors)
```

All 80 tests passing + 0 TypeScript errors is the minimum bar for any PR.

---

## 15. What Not To Do

- **Do not add `fixed` or `sticky` positioning to navbars** — all navbars are static
- **Do not invent compatibility drift migrations** — only document what official docs confirm
- **Do not add AI to the scoring pipeline** — scoring is deterministic, not AI-generated
- **Do not silently show 100/A+ for stale AI scores** — show the re-analyze warning
- **Do not add `top-level await` to `next.config.ts`** — it crashes the config loader
- **Do not hardcode user-visible strings** without i18n keys (use `t()` from `react-i18next`)
- **Do not put heavy logic in `page.tsx` files** — they must be thin shells (<50 lines) that import from `src/components/`
- **Do not instantiate a new postgres client** in route handlers — always import `db` from `@/lib/db/client`

---

## 16. Auth & `@eazo/sdk`

### Server-side guard (API routes)

```ts
import { requireAuth } from "@/lib/auth"; // re-exports @eazo/sdk/server

export async function GET(request: NextRequest) {
  const r = requireAuth(request);
  if (!r.ok) return r.response;          // 401 if unauthenticated
  // r.user → { id, email, name, avatarUrl }
}
```

Apply `requireAuth` to **every** route that reads or writes user-specific data. Public read routes (catalog search, badge API, public workflow pages) do not need it.

### Client-side auth state

```tsx
"use client";
import { useEazo } from "@eazo/sdk/react";
import { auth } from "@eazo/sdk";

// Inside render — reactive
const user = useEazo((s) => s.auth.user);
const loading = useEazo((s) => s.auth.loading);

// Outside render (event handlers) — direct
<button onClick={() => auth.login()}>Sign in</button>
```

### Authenticated API calls from the client

Always use the `request()` helper — it injects the session header automatically:

```ts
import { request } from "@/lib/api/request";
const res = await request("/api/workflows", { method: "GET" });
```

Never call `fetch()` directly from components for protected routes.

---

## 17. DB Schema Overview

Four primary tables in `src/lib/db/schema/`:

| Table | File | Purpose |
|---|---|---|
| `users` | `users.ts` | Authenticated user records — upserted on every login |
| `workflows` | `workflows.ts` | Workflow metadata + engagement counters |
| `workflow_versions` | `workflows.ts` | Raw JSON + node count per version |
| `workflow_scores` | `workflows.ts` | All 9 dimension scores + flags per version |

Plus three v2 tables created by migration `0002`:

| Table | Purpose |
|---|---|
| `workflow_analysis_v2` | FQI, gate results, 10-category scores |
| `workflow_certificates` | Certification records bound to fingerprints |
| `workflow_passports` | Structured metadata passports |

### Key relationships

```
workflows (1) → (n) workflow_versions
workflow_versions (1) → (1) workflow_scores
workflow_versions (1) → (1) workflow_analysis_v2
workflows (1) → (n) workflow_certificates
```

### Engagement counters location

`view_count`, `download_count`, `bookmark_count` live on `workflows` — **not** `workflow_scores`. They are workflow-level, not version-level metrics.

---

## 18. Adding a New DB Table

1. Add the table definition to the relevant file in `src/lib/db/schema/`
2. Export it from `src/lib/db/schema/index.ts`
3. Run `bun run db:generate` → inspect the generated SQL in `src/lib/db/migrations/`
4. Run `bun run db:migrate` to apply locally
5. Add typed query helpers in `src/lib/db/queries/`
6. Export helpers from `src/lib/db/queries/index.ts`
7. **Commit both** the schema `.ts` change and the generated `.sql` migration file

Never use `db.execute(sql\`raw SQL\`)` for application queries — use Drizzle's typed query builder.

---

## 19. Rule Pack Architecture

Ten rule packs, each split across 2–3 files:

| Category | Base file | Ext files |
|---|---|---|
| SECURITY | `security.rules.ts` | `security-ext-a`, `security-ext-b` |
| RELIABILITY | `reliability.rules.ts` | `reliability-ext-a`, `reliability-ext-b` |
| COMPATIBILITY | `compatibility.rules.ts` | `compatibility-ext-a`, `compatibility-ext-b` |
| PRIVACY | `privacy.rules.ts` | `privacy-ext-a`, `privacy-ext-b` |
| PERFORMANCE | `performance.rules.ts` | `performance-ext-a`, `performance-ext-b` |
| MAINTAINABILITY | `maintainability.rules.ts` | `maintainability-ext-a`, `maintainability-ext-b` |
| OBSERVABILITY | `observability.rules.ts` | `observability-ext` |
| IDEMPOTENCY | `idempotency.rules.ts` | `idempotency-ext` |
| DOCUMENTATION | `documentation.rules.ts` | `documentation-ext` |
| COST_OPTIMIZATION | `cost-optimization.rules.ts` | `cost-optimization-ext` |

All packs are registered in `src/lib/engine/rule-packs/index.ts` and loaded by `rule-engine.ts`.

### Penalty point budget

The FQI formula is calibrated so a clean workflow scores 100. Guidelines:

| Severity | Typical penalty |
|---|---|
| CRITICAL | 20–35 pts |
| HIGH | 10–20 pts |
| MEDIUM | 5–10 pts |
| LOW | 1–5 pts |
| INFO | 0 pts |

Never add a new CRITICAL rule with > 35 pts without running `bun run test:score` — it will break existing simulations.

### Skip sets (performance optimisation)

`rule-engine.ts` maintains three skip sets:
- `AI_ONLY_RULES` — skipped when workflow has no AI nodes
- `HTTP_ONLY_RULES` — skipped when workflow has no HTTP nodes
- `CODE_ONLY_RULES` — skipped when workflow has no code nodes

When adding a new rule that only applies to AI/HTTP/code workflows, add its ID to the relevant skip set.

---

## 20. Component Architecture

### One component per file — strictly enforced

```
✅ src/components/search/workflow-card.tsx   → exports WorkflowCard
✅ src/components/search/search-sidebar.tsx  → exports SearchSidebar
✅ src/components/search/search-page.tsx     → exports SearchPage

❌ Never export two components from the same file
```

### Page files are thin shells

`src/app/**/page.tsx` files must be under 50 lines. They import from `src/components/` and render — nothing else.

```tsx
// ✅ correct page.tsx pattern
import { SearchPage } from "@/components/search/search-page";
export default function Page() { return <SearchPage />; }
```

### Feature folder structure

```
src/components/<feature>/
  index.tsx          ← top-level component (imported by page.tsx)
  <feature>-header.tsx
  <feature>-card.tsx
  <feature>-types.ts  ← shared types (no React, no imports from this feature)
```

### Client vs server components

- Default to **server components** for data-fetching pages
- Add `"use client"` only when the component needs `useState`, `useEffect`, event handlers, or browser APIs
- Never import `db` or server-only modules in `"use client"` files

---

## 21. i18n Rules

FlowIntel ships `react-i18next` with `en-US` and `zh-CN` locales.

### When to use `t()`

- All user-visible strings in UI components must go through `t()`
- String keys live in `src/i18n/locales/en-US.json` and `zh-CN.json`
- Never hardcode English strings directly in JSX

```tsx
// ✅ correct
import { useTranslation } from "react-i18next";
const { t } = useTranslation();
<p>{t("search.noResults")}</p>

// ❌ wrong
<p>No workflows found.</p>
```

### Adding new strings

1. Add the key to `src/i18n/locales/en-US.json`
2. Add the same key to `src/i18n/locales/zh-CN.json`
3. Use dot-notation keys grouped by feature: `"search.placeholder"`, `"dashboard.reanalyze"`

### Exception

Error messages returned from API routes (server-side) do not need i18n — they are for developers, not end users.

---

## 22. Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Component files | `kebab-case.tsx` | `workflow-card.tsx` |
| Component exports | `PascalCase` named export | `export function WorkflowCard` |
| API route helpers | `camelCase` in `src/lib/api/` | `listWorkflows()` |
| DB query helpers | `camelCase` verbs | `getWorkflowBySlug()`, `upsertUser()` |
| Rule IDs | `CATEGORY-NNN` | `SEC-001`, `CMP-017` |
| Migration files | `NNNN_snake_case.sql` | `0003_engagement_counters.sql` |
| Drift record IDs | `platform-description` kebab | `n8n-function-deprecated` |
| CSS variable names | `--color-fi-<name>` | `--color-fi-accent` |
| i18n keys | `feature.subkey` dot-notation | `search.noResults` |

### Import aliases

Always use `@/` path aliases — never relative `../../` chains:

```ts
// ✅
import { db } from "@/lib/db/client";
import { WorkflowCard } from "@/components/search/workflow-card";

// ❌
import { db } from "../../lib/db/client";
```

---

## 23. Analysis Pipeline (end-to-end)

When a workflow JSON is submitted to `POST /api/parse`:

```
1. parseWorkflow(raw)         → ParsedWorkflow AST (src/lib/parsers/index.ts)
2. analyzerService.analyze()  → legacy 9-dimension scores (src/lib/analyzer/engine.ts)
3. runV2Analysis()            → v2 engine: 252 rules + FQI + gates (src/lib/engine/)
   ├── rule-engine.ts         → runs all 10 rule packs, applies skip sets
   ├── quality-gates.ts       → evaluates 5 gates
   ├── certification.ts       → issues certificate if all gates pass
   ├── fingerprint.ts         → SHA-256 hash of canonical AST
   └── passport.ts            → structured metadata passport
4. saveWorkflow()             → persists to workflows + workflow_versions + workflow_scores + workflow_analysis_v2
5. return AnalysisResult      → full result including scores, flags, gates, FQI
```

The v1 analyzer (`src/lib/analyzer/`) and v2 engine (`src/lib/engine/`) both run. v1 scores populate `workflow_scores`. v2 results populate `workflow_analysis_v2`. The dashboard prefers v2 data when available.

---

## 24. Supported Platforms & Parser Detection

| Platform | Enum value | Detection signal |
|---|---|---|
| n8n | `N8N` | `nodes` array + `connections` object at root |
| Make | `MAKE` | `flow` array with `module` strings |
| Zapier | `ZAPIER` | `steps` array with `type: "action"\|"trigger"` |
| Flowise | `FLOWISE` | `nodes` array with `data.category` present |
| LangFlow | `LANGFLOW` | `data.nodes` nested under root |

Platform detection happens in `src/lib/parsers/index.ts` `detectPlatform()`. When adding a new platform, add a detection check there first — a misdetected platform sends the AST to the wrong parser and produces garbage scores.
