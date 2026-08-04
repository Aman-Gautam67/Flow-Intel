/**
 * Zapier workflow export parser.
 *
 * Zapier exports can take two forms:
 *
 * 1. Legacy step-array:
 *    { title, steps: [ { id, type_of, app, action, params, … } ] }
 *
 * 2. Modern "zap" format (node-map):
 *    { title, nodes: { "node_id": { type, app, action, params } }, edges: [ { source, target } ] }
 *
 * We detect which format is present and normalise both into NormalNode[]/NormalEdge[].
 */
import type { IWorkflowParser, ParsedWorkflow, NormalNode, NormalEdge, ExtractedParam } from "@/types";
import { flattenParams } from "./normalise";

// ─── Zapier step/node classification ─────────────────────────────────────────
const ZAPIER_AI_APPS = new Set(["openai", "anthropic", "ai-by-zapier", "chatgpt", "cohere", "jasper", "ai"]);
const ZAPIER_DB_APPS = new Set(["mysql", "postgresql", "mongodb", "airtable", "google-sheets", "notion", "salesforce"]);
const ZAPIER_COMM_APPS = new Set(["slack", "discord", "telegram", "microsoft-teams", "twilio"]);
const ZAPIER_EMAIL_APPS = new Set(["gmail", "outlook", "sendgrid", "mailchimp"]);
const ZAPIER_DEV_APPS = new Set(["github", "gitlab", "jira", "linear", "clickup", "trello", "asana"]);
const ZAPIER_PAYMENT_APPS = new Set(["stripe", "paypal", "shopify"]);

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/, /eyJ[A-Za-z0-9+/]{20,}/,
  /sk-[A-Za-z0-9]{20,}/, /AIza[A-Za-z0-9\-_]{35}/,
  /[Aa][Pp][Ii][_-]?[Kk][Ee][Yy]\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/,
];

function classifyZapierApp(app: string): {
  name: string;
  category: string;
  isAi: boolean;
  vendorType: "saas" | "community" | "selfhosted" | "core";
} {
  const lower = app.toLowerCase();
  if (ZAPIER_AI_APPS.has(lower) || lower.includes("openai") || lower.includes("anthropic"))
    return { name: app, category: "AI", isAi: true, vendorType: "saas" };
  if (lower.includes("webhook") || lower === "webhooks") return { name: "Webhook", category: "API", isAi: false, vendorType: "core" };
  if (lower.includes("code") || lower === "code-by-zapier") return { name: "Code by Zapier", category: "Core", isAi: false, vendorType: "core" };
  if (lower.includes("filter") || lower === "filter-by-zapier") return { name: "Filter", category: "Core", isAi: false, vendorType: "core" };
  if (lower.includes("delay") || lower === "delay-by-zapier") return { name: "Delay", category: "Core", isAi: false, vendorType: "core" };
  if (lower.includes("formatter") || lower === "formatter-by-zapier") return { name: "Formatter", category: "Core", isAi: false, vendorType: "core" };
  if (ZAPIER_DB_APPS.has(lower)) return { name: app, category: "Database", isAi: false, vendorType: lower === "airtable" || lower === "google-sheets" || lower === "notion" || lower === "salesforce" ? "saas" : "selfhosted" };
  if (ZAPIER_COMM_APPS.has(lower)) return { name: app, category: "Communication", isAi: false, vendorType: "saas" };
  if (ZAPIER_EMAIL_APPS.has(lower)) return { name: app, category: "Email", isAi: false, vendorType: "saas" };
  if (ZAPIER_DEV_APPS.has(lower)) return { name: app, category: "Development", isAi: false, vendorType: "saas" };
  if (ZAPIER_PAYMENT_APPS.has(lower)) return { name: app, category: "Payments", isAi: false, vendorType: "saas" };
  if (lower.includes("google")) return { name: app, category: "Productivity", isAi: false, vendorType: "saas" };
  return { name: app, category: "SaaS", isAi: false, vendorType: "saas" };
}

// ─── Step/node shapes ─────────────────────────────────────────────────────────
interface ZapierStep {
  id: string | number;
  type_of?: string;           // "read" | "write" | "search" | "trigger" etc.
  app?: string;
  action?: string;
  params?: Record<string, unknown>;
  selected_api?: string;
  meta?: Record<string, unknown>;
}

interface ZapierNodeMap {
  [id: string]: {
    type?: string;
    app?: string;
    action?: string;
    params?: Record<string, unknown>;
  };
}

interface ZapierEdgeSpec { source: string; target: string; type?: string; }

interface ZapierExport {
  title?: string;
  name?: string;
  description?: string;
  steps?: ZapierStep[];
  nodes?: ZapierNodeMap;
  edges?: ZapierEdgeSpec[];
}

function stepToNormal(step: ZapierStep, index: number): NormalNode {
  const app = step.app ?? step.selected_api ?? "unknown";
  const appLower = app.toLowerCase();
  const typeOf = step.type_of ?? "";
  const params = step.params ?? {};
  const isAi = ZAPIER_AI_APPS.has(appLower) || appLower.includes("openai") || appLower.includes("anthropic") || appLower.includes("ai");
  const isHttp = appLower.includes("webhook") || appLower.includes("http");
  const isCode = appLower === "code-by-zapier" || appLower.includes("code");
  const isBranch = appLower === "filter-by-zapier" || appLower.includes("filter") || appLower.includes("router") || appLower.includes("path");
  const isLoop = appLower.includes("loop") || typeOf === "loop";
  const isDelay = appLower === "delay-by-zapier" || appLower.includes("delay");
  const isTrigger = index === 0 || typeOf === "hook" || typeOf === "polling" || typeOf === "trigger" || appLower.includes("trigger") || appLower.includes("webhook");

  const httpMeta = isHttp ? {
    url: String(params.url ?? params.webhook_url ?? ""),
    method: ((params.method ?? "POST") as string).toUpperCase(),
  } : undefined;
  const aiMeta = isAi ? {
    maxIterations: undefined,
    hasStructuredOutput: !!(params.response_format || params.schema),
    model: String(params.model ?? params.engine ?? ""),
  } : undefined;

  return {
    id: String(step.id ?? index),
    name: `${app}: ${step.action ?? typeOf ?? "step"} (${step.id ?? index})`,
    type: `zapier.${appLower}.${step.action ?? typeOf ?? "step"}`,
    disabled: false,
    parameters: params,
    credentials: {},
    isTrigger, isHttp, isCode, isAi, isLoop, isBranch, isDelay,
    isAuthenticated: true, // Zapier always requires app auth
    httpMeta, aiMeta,
  };
}

function nodeMapEntryToNormal(id: string, entry: ZapierNodeMap[string], index: number): NormalNode {
  const fakeStep: ZapierStep = {
    id, type_of: entry.type, app: entry.app, action: entry.action, params: entry.params,
  };
  return stepToNormal(fakeStep, index);
}

export class ZapierParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;
    // Step-array form OR node-map form, neither must be an n8n/Make doc
    const hasSteps = Array.isArray(obj.steps);
    const hasNodeMap = !!(obj.nodes && typeof obj.nodes === "object" && !Array.isArray(obj.nodes));
    const notN8n = !Array.isArray((obj as Record<string,unknown>).nodes) || !obj.connections;
    const notMake = !Array.isArray((obj as Record<string,unknown>).flow);
    // Also accept the explicit platform tag
    const hasPlatformTag = (obj as Record<string,unknown>).platform === "ZAPIER" ||
      (obj as Record<string,unknown>).platform === "zapier";
    return (hasSteps || (hasNodeMap && notN8n && notMake) || hasPlatformTag);
  }

  parse(json: unknown): ParsedWorkflow {
    const doc = json as ZapierExport;
    let nodes: NormalNode[] = [];
    let edges: NormalEdge[] = [];
    let extractedParameters: ExtractedParam[] = [];

    if (Array.isArray(doc.steps)) {
      // ── Step-array form ──────────────────────────────────────────────────
      nodes = doc.steps.map((s, i) => stepToNormal(s, i));
      // Sequential edges
      for (let i = 0; i < doc.steps.length - 1; i++) {
        edges.push({
          source: String(doc.steps[i]!.id ?? i),
          target: String(doc.steps[i + 1]!.id ?? (i + 1)),
          type: "main",
        });
      }
      extractedParameters = doc.steps.flatMap((s, i) =>
        flattenParams(String(s.id ?? i), s.params ?? {})
      );
    } else if (doc.nodes && typeof doc.nodes === "object") {
      // ── Node-map form ────────────────────────────────────────────────────
      const nodeMapEntries = Object.entries(doc.nodes as ZapierNodeMap);
      nodes = nodeMapEntries.map(([id, entry], i) => nodeMapEntryToNormal(id, entry, i));
      edges = (doc.edges ?? []).map((e) => ({ source: e.source, target: e.target, type: e.type ?? "main" }));
      extractedParameters = nodeMapEntries.flatMap(([id, entry]) =>
        flattenParams(id, entry.params ?? {})
      );
    }

    const triggerNodes = nodes
      .filter((n) => n.isTrigger)
      .map((n) => ({ id: n.id, name: n.name, type: n.type, isAuthenticated: n.isAuthenticated ?? true }));

    const seenApps = new Set<string>();
    const integrations: ParsedWorkflow["integrations"] = [];
    for (const node of nodes) {
      // Extract app from type: "zapier.slack.create_message" → "slack"
      const appPart = node.type.split(".")[1] ?? "unknown";
      if (seenApps.has(appPart)) continue;
      seenApps.add(appPart);
      const classified = classifyZapierApp(appPart);
      if (classified.vendorType !== "core") integrations.push(classified);
    }

    const secretCount = nodes.reduce((s, n) => {
      const str = JSON.stringify(n.parameters);
      return s + SECRET_PATTERNS.filter((p) => p.test(str)).length;
    }, 0);

    const branchNodes = nodes.filter((n) => n.isBranch);
    const loopNodes   = nodes.filter((n) => n.isLoop);

    return {
      name: doc.title ?? doc.name ?? "Untitled Zap",
      rawWorkflowName: doc.title ?? doc.name ?? "Untitled Zap",
      description: doc.description,
      metadata: {
        description: doc.description ?? null,
      },
      platform: "ZAPIER",
      nodeCount: nodes.length,
      connectionCount: edges.length,
      nodes, edges, extractedParameters,
      triggerNodes, integrations,
      httpNodesCount: nodes.filter((n) => n.isHttp).length,
      codeNodesCount: nodes.filter((n) => n.isCode).length,
      aiNodesCount:   nodes.filter((n) => n.isAi).length,
      hasWebhooks: nodes.some((n) => n.type.includes("webhook")),
      hasSchedules: nodes.some((n) => n.type.includes("schedule") || n.type.includes("delay")),
      hasBranches: branchNodes.length > 0,
      hasLoops: loopNodes.length > 0,
      branchCount: branchNodes.length,
      loopCount: loopNodes.length,
      extractedSecretsCount: secretCount,
      rawNodes: [],
      rawConnections: {},
    };
  }
}
