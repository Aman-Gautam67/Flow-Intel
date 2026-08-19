import type {
  IWorkflowParser,
  ParsedWorkflow,
  NormalNode,
  NormalEdge,
  N8nWorkflowJson,
  N8nNode,
} from "@/types";
import { flattenParams } from "./normalise";

// Known AI node type prefixes / exact types
const AI_NODE_TYPES = new Set([
  "@n8n/n8n-nodes-langchain.openAi",
  "@n8n/n8n-nodes-langchain.lmOpenAi",
  "@n8n/n8n-nodes-langchain.lmAnthropic",
  "@n8n/n8n-nodes-langchain.lmCohere",
  "@n8n/n8n-nodes-langchain.lmMistral",
  "@n8n/n8n-nodes-langchain.agent",
  "@n8n/n8n-nodes-langchain.chainLlm",
  "@n8n/n8n-nodes-langchain.chainRetrievalQa",
  "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  "@n8n/n8n-nodes-langchain.lmChatAnthropic",
  "@n8n/n8n-nodes-langchain.openAiAssistant",
  "n8n-nodes-base.openAi",
]);

const AI_NODE_PREFIXES = ["langchain", "openai", "anthropic", "cohere", "mistral", "gemini"];

const TRIGGER_TYPES = new Set([
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.cron",
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.emailTrigger",
  "n8n-nodes-base.slackTrigger",
  "n8n-nodes-base.githubTrigger",
  "n8n-nodes-base.stripeWebhook",
  "n8n-nodes-base.jiraTrigger",
  "n8n-nodes-base.telegramTrigger",
  // n8n-nodes-base.httpRequest intentionally removed — it is an outbound API call node,
  // NOT a trigger. Its presence here caused every httpRequest node to be classified as
  // isTrigger:true, causing SEC_UNAUTHENTICATED_WEBHOOK false-positives on all HTTP nodes.
]);

const HTTP_NODE_TYPES = new Set([
  "n8n-nodes-base.httpRequest",
  "n8n-nodes-base.webhook",
]);

const CODE_NODE_TYPES = new Set([
  "n8n-nodes-base.code",
  "n8n-nodes-base.function",
  "n8n-nodes-base.functionItem",
]);

const BRANCH_NODE_TYPES = new Set([
  "n8n-nodes-base.if",
  "n8n-nodes-base.switch",
  "n8n-nodes-base.filter",
]);

const LOOP_NODE_TYPES = new Set([
  "n8n-nodes-base.splitInBatches",
  "n8n-nodes-base.loopNode",
  "@n8n/n8n-nodes-langchain.recursiveCharacterTextSplitter",
]);

// Patterns that suggest hardcoded secrets
const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/,
  /eyJ[A-Za-z0-9+/]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AIza[A-Za-z0-9\-_]{35}/,
  /[Aa][Pp][Ii][_-]?[Kk][Ee][Yy]\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/,
  /[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]\s*[:=]\s*["'][^"']{6,}/,
  /[Ss][Ee][Cc][Rr][Ee][Tt]\s*[:=]\s*["'][^"']{8,}/,
  /[Tt][Oo][Kk][Ee][Nn]\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}/,
  /xox[baprs]-[A-Za-z0-9\-]{10,}/,
  /ghp_[A-Za-z0-9]{36}/,
];

// ─── Vendor classification ────────────────────────────────────────────────────
// vendorType:
//   "core"        — built-in n8n-nodes-base utilities (no external vendor)
//   "saas"        — known third-party SaaS API integration
//   "selfhosted"  — self-hosted open-source databases / servers
//   "community"   — unrecognized node package (potential supply-chain risk)
type VendorType = "saas" | "community" | "selfhosted" | "core";

interface ServiceEntry {
  name: string;
  category: string;
  isAi: boolean;
  vendorType: VendorType;
}

const SERVICE_MAP: Record<string, ServiceEntry> = {
  // ── Core / built-in utilities ─────────────────────────────────────────────
  "n8n-nodes-base.code":            { name: "Code",          category: "Core",          isAi: false, vendorType: "core" },
  "n8n-nodes-base.function":        { name: "Function",      category: "Core",          isAi: false, vendorType: "core" },
  "n8n-nodes-base.functionItem":    { name: "Function Item", category: "Core",          isAi: false, vendorType: "core" },
  "n8n-nodes-base.if":              { name: "IF",            category: "Core",          isAi: false, vendorType: "core" },
  "n8n-nodes-base.switch":          { name: "Switch",        category: "Core",          isAi: false, vendorType: "core" },
  "n8n-nodes-base.filter":          { name: "Filter",        category: "Core",          isAi: false, vendorType: "core" },
  "n8n-nodes-base.set":             { name: "Set",           category: "Core",          isAi: false, vendorType: "core" },
  "n8n-nodes-base.merge":           { name: "Merge",         category: "Core",          isAi: false, vendorType: "core" },
  "n8n-nodes-base.splitInBatches":  { name: "Split in Batches", category: "Core",       isAi: false, vendorType: "core" },
  "n8n-nodes-base.noOp":            { name: "No Op",         category: "Core",          isAi: false, vendorType: "core" },
  "n8n-nodes-base.manualTrigger":   { name: "Manual Trigger", category: "Triggers",     isAi: false, vendorType: "core" },
  "n8n-nodes-base.scheduleTrigger": { name: "Schedule",      category: "Triggers",      isAi: false, vendorType: "core" },
  "n8n-nodes-base.cron":            { name: "Cron",          category: "Triggers",      isAi: false, vendorType: "core" },
  "n8n-nodes-base.webhook":         { name: "Webhook",       category: "Triggers",      isAi: false, vendorType: "core" },
  "n8n-nodes-base.httpRequest":     { name: "HTTP Request",  category: "API",           isAi: false, vendorType: "core" },
  "n8n-nodes-base.respondToWebhook":{ name: "Respond to Webhook", category: "Triggers", isAi: false, vendorType: "core" },
  "n8n-nodes-base.executeWorkflow": { name: "Execute Workflow", category: "Core",       isAi: false, vendorType: "core" },
  "n8n-nodes-base.wait":            { name: "Wait",          category: "Core",          isAi: false, vendorType: "core" },
  "n8n-nodes-base.stickyNote":      { name: "Sticky Note",   category: "Core",          isAi: false, vendorType: "core" },

  // ── Self-hosted databases ─────────────────────────────────────────────────
  "n8n-nodes-base.postgres":        { name: "PostgreSQL",    category: "Database",      isAi: false, vendorType: "selfhosted" },
  "n8n-nodes-base.mysql":           { name: "MySQL",         category: "Database",      isAi: false, vendorType: "selfhosted" },
  "n8n-nodes-base.mongodb":         { name: "MongoDB",       category: "Database",      isAi: false, vendorType: "selfhosted" },
  "n8n-nodes-base.redis":           { name: "Redis",         category: "Database",      isAi: false, vendorType: "selfhosted" },
  "n8n-nodes-base.mssql":           { name: "MS SQL",        category: "Database",      isAi: false, vendorType: "selfhosted" },
  "n8n-nodes-base.mariadb":         { name: "MariaDB",       category: "Database",      isAi: false, vendorType: "selfhosted" },
  "n8n-nodes-base.elasticsearch":   { name: "Elasticsearch", category: "Database",      isAi: false, vendorType: "selfhosted" },
  "n8n-nodes-base.questdb":         { name: "QuestDB",       category: "Database",      isAi: false, vendorType: "selfhosted" },

  // ── SaaS communication ────────────────────────────────────────────────────
  "n8n-nodes-base.slack":           { name: "Slack",         category: "Communication", isAi: false, vendorType: "saas" },
  "n8n-nodes-base.telegram":        { name: "Telegram",      category: "Communication", isAi: false, vendorType: "saas" },
  "n8n-nodes-base.discord":         { name: "Discord",       category: "Communication", isAi: false, vendorType: "saas" },
  "n8n-nodes-base.microsoftTeams":  { name: "MS Teams",      category: "Communication", isAi: false, vendorType: "saas" },
  "n8n-nodes-base.twilio":          { name: "Twilio",        category: "Communication", isAi: false, vendorType: "saas" },
  "n8n-nodes-base.sendgrid":        { name: "SendGrid",      category: "Email",         isAi: false, vendorType: "saas" },

  // ── SaaS email ────────────────────────────────────────────────────────────
  "n8n-nodes-base.gmail":           { name: "Gmail",         category: "Email",         isAi: false, vendorType: "saas" },
  "n8n-nodes-base.microsoftOutlook":{ name: "Outlook",       category: "Email",         isAi: false, vendorType: "saas" },
  "n8n-nodes-base.emailSend":       { name: "Send Email",    category: "Email",         isAi: false, vendorType: "saas" },

  // ── SaaS productivity ─────────────────────────────────────────────────────
  "n8n-nodes-base.googleSheets":    { name: "Google Sheets", category: "Productivity",  isAi: false, vendorType: "saas" },
  "n8n-nodes-base.googleDrive":     { name: "Google Drive",  category: "Productivity",  isAi: false, vendorType: "saas" },
  "n8n-nodes-base.notion":          { name: "Notion",        category: "Productivity",  isAi: false, vendorType: "saas" },
  "n8n-nodes-base.airtable":        { name: "Airtable",      category: "Database",      isAi: false, vendorType: "saas" },
  "n8n-nodes-base.trello":          { name: "Trello",        category: "Project Management", isAi: false, vendorType: "saas" },
  "n8n-nodes-base.asana":           { name: "Asana",         category: "Project Management", isAi: false, vendorType: "saas" },
  "n8n-nodes-base.clickUp":         { name: "ClickUp",       category: "Project Management", isAi: false, vendorType: "saas" },
  "n8n-nodes-base.hubspot":         { name: "HubSpot",       category: "CRM",           isAi: false, vendorType: "saas" },
  "n8n-nodes-base.salesforce":      { name: "Salesforce",    category: "CRM",           isAi: false, vendorType: "saas" },
  "n8n-nodes-base.pipedrive":       { name: "Pipedrive",     category: "CRM",           isAi: false, vendorType: "saas" },

  // ── SaaS payments ─────────────────────────────────────────────────────────
  "n8n-nodes-base.stripe":          { name: "Stripe",        category: "Payments",      isAi: false, vendorType: "saas" },

  // ── SaaS development ──────────────────────────────────────────────────────
  "n8n-nodes-base.github":          { name: "GitHub",        category: "Development",   isAi: false, vendorType: "saas" },
  "n8n-nodes-base.gitlab":          { name: "GitLab",        category: "Development",   isAi: false, vendorType: "saas" },
  "n8n-nodes-base.jira":            { name: "Jira",          category: "Project Management", isAi: false, vendorType: "saas" },
  "n8n-nodes-base.linear":          { name: "Linear",        category: "Development",   isAi: false, vendorType: "saas" },

  // ── AI / LangChain ────────────────────────────────────────────────────────
  "@n8n/n8n-nodes-langchain.openAi":          { name: "OpenAI",        category: "AI", isAi: true, vendorType: "saas" },
  "@n8n/n8n-nodes-langchain.lmOpenAi":        { name: "OpenAI LLM",    category: "AI", isAi: true, vendorType: "saas" },
  "@n8n/n8n-nodes-langchain.lmAnthropic":     { name: "Anthropic",     category: "AI", isAi: true, vendorType: "saas" },
  "@n8n/n8n-nodes-langchain.lmChatOpenAi":    { name: "OpenAI Chat",   category: "AI", isAi: true, vendorType: "saas" },
  "@n8n/n8n-nodes-langchain.lmChatAnthropic": { name: "Claude Chat",   category: "AI", isAi: true, vendorType: "saas" },
  "@n8n/n8n-nodes-langchain.agent":           { name: "AI Agent",      category: "AI", isAi: true, vendorType: "saas" },
  "@n8n/n8n-nodes-langchain.chainLlm":        { name: "LLM Chain",     category: "AI", isAi: true, vendorType: "saas" },
  "@n8n/n8n-nodes-langchain.chainRetrievalQa":{ name: "Retrieval QA",  category: "AI", isAi: true, vendorType: "saas" },
  "@n8n/n8n-nodes-langchain.openAiAssistant": { name: "OpenAI Asst.",  category: "AI", isAi: true, vendorType: "saas" },
  "@n8n/n8n-nodes-langchain.lmCohere":        { name: "Cohere",        category: "AI", isAi: true, vendorType: "saas" },
  "@n8n/n8n-nodes-langchain.lmMistral":       { name: "Mistral",       category: "AI", isAi: true, vendorType: "saas" },
  "n8n-nodes-base.openAi":                    { name: "OpenAI",        category: "AI", isAi: true, vendorType: "saas" },
};

const DELAY_NODE_TYPES = new Set([
  "n8n-nodes-base.wait", "n8n-nodes-base.delay", "n8n-nodes-base.dateTime",
]);

function isAiNode(type: string): boolean {
  if (!type || typeof type !== "string") return false;
  if (AI_NODE_TYPES.has(type)) return true;
  const lower = type.toLowerCase();
  return AI_NODE_PREFIXES.some((p) => lower.includes(p));
}
function isTriggerNode(type: string): boolean {
  if (!type || typeof type !== "string") return false;
  return type.toLowerCase().includes("trigger") || type === "n8n-nodes-base.webhook" || TRIGGER_TYPES.has(type);
}
function classifyNodeVendorType(type: string): "saas"|"community"|"selfhosted"|"core" {
  if (!type || typeof type !== "string") return "core";
  if (SERVICE_MAP[type]) return SERVICE_MAP[type]!.vendorType;
  if (type.startsWith("@n8n/")) return "saas";
  if (type.startsWith("n8n-nodes-base.")) return "core";
  if (type.startsWith("n8n-nodes-")) return "community";
  if (type.includes(".")) return "community";
  return "core";
}
function countSecretsInParams(params: unknown): number {
  const str = JSON.stringify(params ?? {});
  return SECRET_PATTERNS.filter((p) => p.test(str)).length;
}

// ── Build NormalEdge[] from n8n raw connections ───────────────────────────────
function buildEdges(connections: Record<string, unknown>): NormalEdge[] {
  const edges: NormalEdge[] = [];
  for (const [srcName, outputs] of Object.entries(connections)) {
    if (!outputs || typeof outputs !== "object") continue;
    for (const [connType, outputArr] of Object.entries(outputs as Record<string, unknown>)) {
      if (!Array.isArray(outputArr)) continue;
      outputArr.forEach((group, groupIdx) => {
        if (!Array.isArray(group)) return;
        for (const target of group) {
          if (target && typeof target === "object" && "node" in target) {
            edges.push({
              source: srcName,
              target: (target as { node: string }).node,
              type: connType === "main" ? (groupIdx === 0 ? "main" : "error") : connType,
            });
          }
        }
      });
    }
  }
  return edges;
}

// ── Map N8nNode → NormalNode ──────────────────────────────────────────────────
function toNormalNode(node: N8nNode, idx: number): NormalNode {
  const nodeType = String(node.type ?? "unknown");
  const params = (node.parameters && typeof node.parameters === "object" ? node.parameters : {}) as Record<string, unknown>;
  const opts = (params.options && typeof params.options === "object") ? (params.options as Record<string, unknown>) : undefined;
  const aiPkg = isAiNode(nodeType);
  const httpMeta = HTTP_NODE_TYPES.has(nodeType) ? {
    url: String(params.url ?? params.webhookUrl ?? ""),
    method: ((params.method ?? opts?.method ?? "GET") as string).toUpperCase(),
  } : undefined;
  const codeMeta = CODE_NODE_TYPES.has(nodeType) ? {
    codeSnippet: String(params.jsCode ?? params.code ?? params.functionCode ?? params.pythonCode ?? ""),
    language: nodeType.includes("python") ? "python" as const : "javascript" as const,
  } : undefined;
  const aiMeta = aiPkg ? {
    maxIterations: (params.maxIterations ?? opts?.maxIterations) as number | undefined,
    hasStructuredOutput: !!(params.outputParser || params.structuredOutput || params.responseFormat),
    model: String(params.model ?? params.modelId ?? params.modelName ?? ""),
  } : undefined;
  return {
    id: String(node.id ?? `node_${idx}`),
    name: String(node.name ?? node.id ?? `Node ${idx}`),
    type: nodeType,
    typeVersion: node.typeVersion,
    disabled: node.disabled,
    position: node.position,
    parameters: params,
    credentials: (node.credentials && typeof node.credentials === "object" ? node.credentials : {}) as Record<string, unknown>,
    isTrigger: isTriggerNode(nodeType),
    isHttp: HTTP_NODE_TYPES.has(nodeType),
    isCode: CODE_NODE_TYPES.has(nodeType),
    isAi: aiPkg,
    isLoop: LOOP_NODE_TYPES.has(nodeType),
    isBranch: BRANCH_NODE_TYPES.has(nodeType),
    isDelay: DELAY_NODE_TYPES.has(nodeType),
    isAuthenticated: !!(node.credentials && Object.keys(node.credentials).length > 0),
    httpMeta, codeMeta, aiMeta,
  };
}

export class N8nParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;
    return Array.isArray(obj.nodes) || (obj.connections !== null && typeof obj.connections === "object");
  }

  parse(json: unknown): ParsedWorkflow {
    const wf = (json && typeof json === "object") ? (json as N8nWorkflowJson) : {};
    const rawNodes: N8nNode[] = (wf.nodes ?? []).filter((n): n is N8nNode => Boolean(n && typeof n === "object"));
    const rawConnections = (wf.connections && typeof wf.connections === "object" ? wf.connections : {}) as Record<string, unknown>;

    let connectionCount = 0;
    for (const outputs of Object.values(rawConnections)) {
      if (outputs && typeof outputs === "object") {
        for (const outputArr of Object.values(outputs as Record<string, unknown>)) {
          if (Array.isArray(outputArr)) {
            for (const targets of outputArr) {
              if (Array.isArray(targets)) connectionCount += targets.length;
            }
          }
        }
      }
    }

    const normalNodes: NormalNode[] = rawNodes.map(toNormalNode);
    const edges: NormalEdge[] = buildEdges(rawConnections);
    const extractedParameters = rawNodes.flatMap((n) => flattenParams(n.id, n.parameters ?? {}));

    const triggerNodes = rawNodes
      .filter((n) => isTriggerNode(n.type))
      .map((n) => ({
        id: n.id, name: n.name, type: n.type,
        isAuthenticated: !!(n.credentials && Object.keys(n.credentials).length > 0),
      }));

    const branchNodes = rawNodes.filter((n) => BRANCH_NODE_TYPES.has(n.type));
    const loopNodes   = rawNodes.filter((n) => LOOP_NODE_TYPES.has(n.type));
    const webhookNodes = rawNodes.filter((n) => n.type === "n8n-nodes-base.webhook");

    const seenTypes = new Set<string>();
    const integrations: ParsedWorkflow["integrations"] = [];
    for (const node of rawNodes) {
      if (seenTypes.has(node.type)) continue;
      seenTypes.add(node.type);
      const mapped = SERVICE_MAP[node.type];
      if (mapped) {
        integrations.push(mapped);
      } else if (isAiNode(node.type)) {
        integrations.push({ name: node.name, category: "AI", isAi: true,
          vendorType: node.type.startsWith("@n8n/") ? "saas" : "community" });
      } else {
        const vendorType = classifyNodeVendorType(node.type);
        if (vendorType !== "core") {
          integrations.push({ name: node.name, category: "Unknown", isAi: false, vendorType });
        }
      }
    }

    const extractedSecretsCount = rawNodes.reduce((s, n) => s + countSecretsInParams(n.parameters), 0);

    const settings = (wf.settings ?? {}) as Record<string, unknown>;

    return {
      name: wf.name ?? "Untitled Workflow",
      rawWorkflowName: wf.name ?? "Untitled Workflow",
      description: wf.description,
      platformVersion: String((wf as Record<string, unknown>).versionId ?? settings.executionOrder ?? ""),
      metadata: {
        description: wf.description ?? null,
        notes:       settings.notes   ?? null,
        readme:      settings.readme  ?? null,
        n8nVersion:  (wf as Record<string, unknown>).versionId ?? null,
      },
      platform: "N8N",
      nodeCount: rawNodes.length,
      connectionCount,
      nodes: normalNodes,
      edges,
      extractedParameters,
      triggerNodes,
      integrations,
      httpNodesCount: rawNodes.filter((n) => HTTP_NODE_TYPES.has(n.type)).length,
      codeNodesCount: rawNodes.filter((n) => CODE_NODE_TYPES.has(n.type)).length,
      aiNodesCount:   rawNodes.filter((n) => isAiNode(n.type)).length,
      hasWebhooks: webhookNodes.length > 0,
      hasSchedules: rawNodes.some((n) =>
        n.type === "n8n-nodes-base.scheduleTrigger" || n.type === "n8n-nodes-base.cron"
      ),
      hasBranches: branchNodes.length > 0,
      hasLoops: loopNodes.length > 0,
      branchCount: branchNodes.length,
      loopCount: loopNodes.length,
      extractedSecretsCount,
      rawNodes,
      rawConnections,
    };
  }
}
