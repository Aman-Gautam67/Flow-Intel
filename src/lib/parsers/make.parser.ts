/**
 * Make (Integromat) scenario blueprint parser.
 *
 * Make exports use this shape:
 *   { name, flow: [ { id, module, version, parameters, mapper, routes? } ], ... }
 *
 * Each flow entry is a "module" (node). Routes arrays encode branches.
 * Connections are implicit: flow[i] → flow[i+1] unless a router branch overrides.
 */
import type { IWorkflowParser, ParsedWorkflow, NormalNode, NormalEdge, ExtractedParam } from "@/types";
import { flattenParams } from "./normalise";

// ─── Make module type classification ─────────────────────────────────────────
const MAKE_HTTP_MODULES = new Set([
  "http.ActionSendData", "http.ActionGetFile", "http.ActionSendDynamicData",
  "http.MakeRequest", "webhook.WebhookTrigger", "webhook.respond",
  "http:ActionSendData", "http:MakeRequest",
]);

const MAKE_CODE_MODULES = new Set([
  "builtin.BasicFeeder", "builtin.SetVariables", "tools.SetVariables",
  "tools.ParseJSON", "json.ParseJSON", "xml.ParseXML",
]);

const MAKE_BRANCH_MODULES = new Set([
  "flow.Router", "flow.Aggregator", "builtin.Router",
]);

const MAKE_LOOP_MODULES = new Set([
  "flow.Iterator", "builtin.BasicFeeder", "flow.ForeachAggregator",
]);

const MAKE_TRIGGER_MODULES = new Set([
  "webhook.WebhookTrigger", "schedule.ScheduleTrigger",
  "google-gmail:TriggerNewEmail", "slack:TriggerNewMessage",
]);

const MAKE_AI_PREFIXES = ["openai", "anthropic", "cohere", "mistral", "gemini", "ai"];

const MAKE_DELAY_MODULES = new Set(["builtin.Sleep", "tools.sleep"]);

// ─── Module → service name mapping ───────────────────────────────────────────
function classifyMakeModule(moduleType: string): {
  name: string;
  category: string;
  isAi: boolean;
  vendorType: "saas" | "community" | "selfhosted" | "core";
} {
  const lower = moduleType.toLowerCase();
  if (lower.startsWith("http") || lower.startsWith("webhook")) return { name: "HTTP / Webhook", category: "API", isAi: false, vendorType: "core" };
  if (lower.startsWith("google-sheets") || lower.startsWith("googlesheets")) return { name: "Google Sheets", category: "Productivity", isAi: false, vendorType: "saas" };
  if (lower.startsWith("google-gmail") || lower.startsWith("gmail")) return { name: "Gmail", category: "Email", isAi: false, vendorType: "saas" };
  if (lower.startsWith("google-drive") || lower.startsWith("googledrive")) return { name: "Google Drive", category: "Productivity", isAi: false, vendorType: "saas" };
  if (lower.startsWith("slack")) return { name: "Slack", category: "Communication", isAi: false, vendorType: "saas" };
  if (lower.startsWith("telegram")) return { name: "Telegram", category: "Communication", isAi: false, vendorType: "saas" };
  if (lower.startsWith("discord")) return { name: "Discord", category: "Communication", isAi: false, vendorType: "saas" };
  if (lower.startsWith("airtable")) return { name: "Airtable", category: "Database", isAi: false, vendorType: "saas" };
  if (lower.startsWith("notion")) return { name: "Notion", category: "Productivity", isAi: false, vendorType: "saas" };
  if (lower.startsWith("stripe")) return { name: "Stripe", category: "Payments", isAi: false, vendorType: "saas" };
  if (lower.startsWith("github")) return { name: "GitHub", category: "Development", isAi: false, vendorType: "saas" };
  if (lower.startsWith("jira")) return { name: "Jira", category: "Project Management", isAi: false, vendorType: "saas" };
  if (lower.startsWith("hubspot")) return { name: "HubSpot", category: "CRM", isAi: false, vendorType: "saas" };
  if (lower.startsWith("salesforce")) return { name: "Salesforce", category: "CRM", isAi: false, vendorType: "saas" };
  if (lower.startsWith("postgres") || lower.startsWith("postgresql")) return { name: "PostgreSQL", category: "Database", isAi: false, vendorType: "selfhosted" };
  if (lower.startsWith("mysql")) return { name: "MySQL", category: "Database", isAi: false, vendorType: "selfhosted" };
  if (lower.startsWith("mongodb")) return { name: "MongoDB", category: "Database", isAi: false, vendorType: "selfhosted" };
  if (MAKE_AI_PREFIXES.some((p) => lower.startsWith(p))) return { name: moduleType, category: "AI", isAi: true, vendorType: "saas" };
  if (lower.startsWith("builtin") || lower.startsWith("flow") || lower.startsWith("tools") || lower.startsWith("json") || lower.startsWith("xml")) {
    return { name: moduleType, category: "Core", isAi: false, vendorType: "core" };
  }
  return { name: moduleType, category: "Unknown", isAi: false, vendorType: "saas" };
}

// ─── Flat module interface ────────────────────────────────────────────────────
interface MakeModule {
  id: number;
  module: string;
  version?: number;
  parameters?: Record<string, unknown>;
  mapper?: Record<string, unknown>;
  routes?: Array<{ flow?: MakeModule[] }>;
}

interface MakeBlueprint {
  name?: string;
  description?: string;
  flow?: MakeModule[];
  metadata?: Record<string, unknown>;
}

/** Recursively flatten all modules (including branched routes) */
function flattenModules(flow: MakeModule[]): MakeModule[] {
  const result: MakeModule[] = [];
  for (const mod of flow) {
    result.push(mod);
    if (mod.routes) {
      for (const route of mod.routes) {
        if (route.flow) result.push(...flattenModules(route.flow));
      }
    }
  }
  return result;
}

/** Build edges: sequential within each flow, plus branch edges */
function buildMakeEdges(flow: MakeModule[]): NormalEdge[] {
  const edges: NormalEdge[] = [];
  function walk(modules: MakeModule[], parentId?: string) {
    for (let i = 0; i < modules.length; i++) {
      const mod = modules[i]!;
      const srcId = String(mod.id);
      if (parentId && i === 0) {
        edges.push({ source: parentId, target: srcId, type: "main" });
      } else if (i > 0) {
        edges.push({ source: String(modules[i - 1]!.id), target: srcId, type: "main" });
      }
      if (mod.routes) {
        mod.routes.forEach((route, ri) => {
          if (route.flow && route.flow.length > 0) {
            edges.push({ source: srcId, target: String(route.flow[0]!.id), type: `route_${ri}` });
            walk(route.flow);
          }
        });
      }
    }
  }
  walk(flow);
  return edges;
}

function makeModuleToNormal(mod: MakeModule): NormalNode {
  const params = { ...(mod.parameters ?? {}), ...(mod.mapper ?? {}) };
  const moduleType = mod.module ?? "unknown";
  const lower = moduleType.toLowerCase();
  const isHttp = MAKE_HTTP_MODULES.has(moduleType) || lower.includes("http") || lower.includes("webhook");
  const isCode = MAKE_CODE_MODULES.has(moduleType);
  const isAi = MAKE_AI_PREFIXES.some((p) => lower.includes(p));
  const isLoop = MAKE_LOOP_MODULES.has(moduleType);
  const isBranch = MAKE_BRANCH_MODULES.has(moduleType);
  const isDelay = MAKE_DELAY_MODULES.has(moduleType);
  const isTrigger = MAKE_TRIGGER_MODULES.has(moduleType) || lower.includes("trigger") || lower.includes("webhook");

  const httpMeta = isHttp ? {
    url: String(params.url ?? params.uri ?? ""),
    method: ((params.method ?? "GET") as string).toUpperCase(),
  } : undefined;
  const aiMeta = isAi ? {
    maxIterations: params.maxIterations as number | undefined,
    hasStructuredOutput: !!(params.responseFormat || params.schema),
    model: String(params.model ?? params.modelId ?? ""),
  } : undefined;

  return {
    id: String(mod.id),
    name: `${moduleType} (${mod.id})`,
    type: `make.${moduleType}`,
    typeVersion: mod.version,
    disabled: false,
    parameters: params,
    credentials: {},
    isTrigger, isHttp, isCode, isAi, isLoop, isBranch, isDelay,
    isAuthenticated: !!(params.connection || params.auth || params.credentials),
    httpMeta, aiMeta,
  };
}

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/, /eyJ[A-Za-z0-9+/]{20,}/,
  /sk-[A-Za-z0-9]{20,}/, /AIza[A-Za-z0-9\-_]{35}/,
  /[Aa][Pp][Ii][_-]?[Kk][Ee][Yy]\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/,
];

export class MakeParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;
    // Make blueprints always have a `flow` array; may have `metadata.version`
    return Array.isArray(obj.flow) && !Array.isArray((obj as Record<string,unknown>).nodes);
  }

  parse(json: unknown): ParsedWorkflow {
    const bp = json as MakeBlueprint;
    const rawFlow: MakeModule[] = bp.flow ?? [];
    const allModules = flattenModules(rawFlow);

    const nodes: NormalNode[] = allModules.map(makeModuleToNormal);
    const edges: NormalEdge[] = buildMakeEdges(rawFlow);
    const extractedParameters: ExtractedParam[] = allModules.flatMap((m) =>
      flattenParams(String(m.id), { ...(m.parameters ?? {}), ...(m.mapper ?? {}) })
    );

    const triggerNodes = allModules
      .filter((m) => MAKE_TRIGGER_MODULES.has(m.module) || m.module.toLowerCase().includes("trigger"))
      .map((m) => ({
        id: String(m.id), name: `${m.module} (${m.id})`, type: `make.${m.module}`,
        isAuthenticated: !!(m.parameters?.connection || m.parameters?.auth),
      }));

    const httpMods   = allModules.filter((m) => MAKE_HTTP_MODULES.has(m.module) || m.module.toLowerCase().includes("http"));
    const codeMods   = allModules.filter((m) => MAKE_CODE_MODULES.has(m.module));
    const aiMods     = allModules.filter((m) => MAKE_AI_PREFIXES.some((p) => m.module.toLowerCase().includes(p)));
    const branchMods = allModules.filter((m) => MAKE_BRANCH_MODULES.has(m.module));
    const loopMods   = allModules.filter((m) => MAKE_LOOP_MODULES.has(m.module));

    const seenModules = new Set<string>();
    const integrations: ParsedWorkflow["integrations"] = [];
    for (const mod of allModules) {
      if (seenModules.has(mod.module)) continue;
      seenModules.add(mod.module);
      const classified = classifyMakeModule(mod.module);
      if (classified.vendorType !== "core") integrations.push(classified);
    }

    const extractedSecretsCount = allModules.reduce((s, m) => {
      const str = JSON.stringify({ ...(m.parameters ?? {}), ...(m.mapper ?? {}) });
      return s + SECRET_PATTERNS.filter((p) => p.test(str)).length;
    }, 0);

    return {
      name: bp.name ?? "Untitled Make Scenario",
      rawWorkflowName: bp.name ?? "Untitled Make Scenario",
      description: bp.description,
      metadata: {
        description: bp.description ?? null,
        makeVersion: (bp.metadata as Record<string, unknown> | undefined)?.version ?? null,
      },
      platform: "MAKE",
      nodeCount: allModules.length,
      connectionCount: edges.length,
      nodes, edges, extractedParameters,
      triggerNodes, integrations,
      httpNodesCount: httpMods.length,
      codeNodesCount: codeMods.length,
      aiNodesCount: aiMods.length,
      hasWebhooks: allModules.some((m) => m.module.toLowerCase().includes("webhook")),
      hasSchedules: allModules.some((m) => m.module.toLowerCase().includes("schedule") || m.module.toLowerCase().includes("cron")),
      hasBranches: branchMods.length > 0,
      hasLoops: loopMods.length > 0,
      branchCount: branchMods.length,
      loopCount: loopMods.length,
      extractedSecretsCount,
      // No n8n-specific fields — provide empty shims so rules degrade gracefully
      rawNodes: [],
      rawConnections: {},
    };
  }
}
