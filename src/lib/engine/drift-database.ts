/**
 * Compatibility Drift — shared types and evidence-based data.
 *
 * All drift records reference official documentation.
 * Never invent migrations. Never assume older workflows are broken.
 */

export type DriftSeverity = "BREAKING" | "DEPRECATED" | "WARNING" | "INFO";

export interface DriftRecord {
  /** Unique stable ID */
  id: string;
  platform: "n8n" | "make" | "zapier" | "flowise" | "langflow" | "all";
  /** Node type or platform feature that has drifted */
  component: string;
  /** Human-readable description of the change */
  summary: string;
  /** Full detail */
  detail: string;
  severity: DriftSeverity;
  /** Version or release where this change was introduced */
  since: string;
  /** Official documentation URL — REQUIRED for all records */
  docUrl: string;
  /** Old value / pattern */
  old?: string;
  /** New value / pattern */
  suggested?: string;
  /** Migration confidence: 1=guesswork (never ship), 2=documented partial, 3=documented full */
  confidence: 1 | 2 | 3;
  /** Whether the engine can auto-detect this from AST */
  detectable: boolean;
  /** Detector function (returns true if this workflow is affected) */
  detect?: (ast: { nodes: Array<{ type: string; typeVersion?: number; parameters?: Record<string, unknown> }> }) => boolean;
}

// ─── n8n documented drift records ─────────────────────────────────────────────
// Sources:
//   https://docs.n8n.io/release-notes/
//   https://github.com/n8n-io/n8n/blob/master/CHANGELOG.md
// ──────────────────────────────────────────────────────────────────────────────

export const DRIFT_DATABASE: DriftRecord[] = [

  // ── Node deprecations ──────────────────────────────────────────────────────
  {
    id: "n8n-function-deprecated",
    platform: "n8n",
    component: "n8n-nodes-base.function",
    summary: "Function node deprecated — replaced by Code node",
    detail: "n8n deprecated the Function node in v0.198. It still runs but shows a deprecation warning. New workflows should use the Code node instead.",
    severity: "DEPRECATED",
    since: "0.198",
    docUrl: "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/",
    old: "n8n-nodes-base.function",
    suggested: "n8n-nodes-base.code",
    confidence: 3,
    detectable: true,
    detect: (ast) => ast.nodes.some((n) => n.type === "n8n-nodes-base.function"),
  },
  {
    id: "n8n-functionitem-deprecated",
    platform: "n8n",
    component: "n8n-nodes-base.functionItem",
    summary: "Function Item node deprecated — replaced by Code node (Run Once for Each Item)",
    detail: "n8n deprecated the Function Item node in v0.198. Use the Code node with 'Run Once for Each Item' mode.",
    severity: "DEPRECATED",
    since: "0.198",
    docUrl: "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/",
    old: "n8n-nodes-base.functionItem",
    suggested: "n8n-nodes-base.code (Run Once for Each Item)",
    confidence: 3,
    detectable: true,
    detect: (ast) => ast.nodes.some((n) => n.type === "n8n-nodes-base.functionItem"),
  },

  // ── typeVersion drift ──────────────────────────────────────────────────────
  {
    id: "n8n-httprequest-v2-breaking",
    platform: "n8n",
    component: "n8n-nodes-base.httpRequest",
    summary: "HTTP Request v2 removed — must upgrade to v3 or v4",
    detail: "HTTP Request typeVersion 2 was removed in n8n v1.0. Workflows using v2 will fail on any n8n instance running v1.0+. Upgrade to typeVersion 4.",
    severity: "BREAKING",
    since: "1.0",
    docUrl: "https://docs.n8n.io/release-notes/",
    old: "typeVersion: 2",
    suggested: "typeVersion: 4",
    confidence: 3,
    detectable: true,
    detect: (ast) => ast.nodes.some((n) => n.type === "n8n-nodes-base.httpRequest" && (n.typeVersion ?? 1) <= 2),
  },
  {
    id: "n8n-googsheets-v2-breaking",
    platform: "n8n",
    component: "n8n-nodes-base.googleSheets",
    summary: "Google Sheets v2 deprecated — use v4",
    detail: "Google Sheets typeVersion 2 is deprecated. v4 uses a completely different parameter schema and the gid parameter was removed.",
    severity: "DEPRECATED",
    since: "1.2",
    docUrl: "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/",
    old: "typeVersion: 2",
    suggested: "typeVersion: 4",
    confidence: 2,
    detectable: true,
    detect: (ast) => ast.nodes.some((n) => n.type === "n8n-nodes-base.googleSheets" && (n.typeVersion ?? 1) <= 2),
  },
  {
    id: "n8n-datetime-v1-breaking",
    platform: "n8n",
    component: "n8n-nodes-base.dateTime",
    summary: "Date & Time v1 removed — must upgrade to v2",
    detail: "The Date & Time node v1 was removed in n8n v1.0. The v2 node uses Luxon instead of Moment.js and has a different parameter schema.",
    severity: "BREAKING",
    since: "1.0",
    docUrl: "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datetime/",
    old: "typeVersion: 1",
    suggested: "typeVersion: 2 (Luxon-based)",
    confidence: 3,
    detectable: true,
    detect: (ast) => ast.nodes.some((n) => n.type === "n8n-nodes-base.dateTime" && (n.typeVersion ?? 1) === 1),
  },

  // ── LangChain / AI model drift ─────────────────────────────────────────────
  {
    id: "n8n-openai-lmOpenAi-deprecated",
    platform: "n8n",
    component: "@n8n/n8n-nodes-langchain.lmOpenAi",
    summary: "lmOpenAi deprecated — use lmChatOpenAi",
    detail: "The lmOpenAi node was deprecated when n8n switched to OpenAI's chat-completion API as default. Use lmChatOpenAi instead for GPT-3.5+/GPT-4.",
    severity: "DEPRECATED",
    since: "1.3",
    docUrl: "https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatopenai/",
    old: "@n8n/n8n-nodes-langchain.lmOpenAi",
    suggested: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    confidence: 3,
    detectable: true,
    detect: (ast) => ast.nodes.some((n) => n.type === "@n8n/n8n-nodes-langchain.lmOpenAi"),
  },
  {
    id: "n8n-openai-model-gpt3-deprecated",
    platform: "n8n",
    component: "OpenAI model gpt-3.5-turbo-0301",
    summary: "GPT-3.5-turbo-0301 model deprecated by OpenAI",
    detail: "OpenAI deprecated gpt-3.5-turbo-0301 on June 13 2024. Workflows using this exact model ID will receive errors after the deprecation date.",
    severity: "BREAKING",
    since: "2024-06",
    docUrl: "https://platform.openai.com/docs/deprecations",
    old: "gpt-3.5-turbo-0301",
    suggested: "gpt-3.5-turbo",
    confidence: 3,
    detectable: true,
    detect: (ast) => ast.nodes.some((n) => {
      const p = n.parameters ?? {};
      const model = String(p["model"] ?? p["modelId"] ?? "");
      return model === "gpt-3.5-turbo-0301";
    }),
  },

  // ── Webhook auth drift ─────────────────────────────────────────────────────
  {
    id: "n8n-webhook-auth-none-warn",
    platform: "n8n",
    component: "n8n-nodes-base.webhook",
    summary: "Unauthenticated webhook — security policy change in v1.x",
    detail: "n8n v1.x added stricter webhook security recommendations. Using authentication: 'none' on public-facing webhooks is flagged in n8n cloud audits.",
    severity: "WARNING",
    since: "1.0",
    docUrl: "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/",
    old: "authentication: none",
    suggested: "authentication: headerAuth or jwtAuth",
    confidence: 2,
    detectable: true,
    detect: (ast) => ast.nodes.some((n) => {
      if (n.type !== "n8n-nodes-base.webhook") return false;
      const p = n.parameters ?? {};
      return !p["authentication"] || p["authentication"] === "none";
    }),
  },

  // ── Expression engine drift ────────────────────────────────────────────────
  {
    id: "n8n-expression-items-deprecated",
    platform: "n8n",
    component: "n8n expression engine",
    summary: "$items() expression deprecated — use $input.all()",
    detail: "$items() was the legacy way to access all items in n8n expressions. From n8n v0.200+, $input.all() is the preferred syntax. $items() still works but is undocumented.",
    severity: "WARNING",
    since: "0.200",
    docUrl: "https://docs.n8n.io/code/builtin/current-node-input-methods/",
    old: "$items()",
    suggested: "$input.all()",
    confidence: 2,
    detectable: false, // expressions are in string parameters, not typed fields
  },
];

// ─── Helper: get all drift affecting a workflow AST ──────────────────────────
export interface DriftResult {
  record: DriftRecord;
  affectedNodes: string[];
}

export function detectDrift(
  ast: { nodes: Array<{ id: string; name: string; type: string; typeVersion?: number; parameters?: Record<string, unknown> }> },
  platform: string
): DriftResult[] {
  const results: DriftResult[] = [];
  for (const record of DRIFT_DATABASE) {
    if (record.platform !== "all" && record.platform !== platform.toLowerCase()) continue;
    if (!record.detectable || !record.detect) continue;
    try {
      const affected = record.detect(ast);
      if (affected) {
        const affectedNodes = ast.nodes
          .filter((n) => record.detect!({ nodes: [n] }))
          .map((n) => n.name);
        results.push({ record, affectedNodes });
      }
    } catch {/* skip crashing detectors */}
  }
  return results;
}

/** Severity order for sorting (BREAKING first) */
const SEV_ORDER: Record<DriftSeverity, number> = { BREAKING: 0, DEPRECATED: 1, WARNING: 2, INFO: 3 };
export function sortDrift(drift: DriftResult[]): DriftResult[] {
  return [...drift].sort((a, b) => SEV_ORDER[a.record.severity] - SEV_ORDER[b.record.severity]);
}
