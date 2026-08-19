/**
 * LangFlow JSON AST Parser.
 *
 * Supports LangFlow ReactFlow component graphs:
 * - Nested envelope: { id?, name?, description?, data: { nodes: FlowNode[], edges: FlowEdge[] } }
 * - Root-level format: { nodes: FlowNode[], edges: FlowEdge[] }
 * - Node schema: { id, type, position, data: { type, node_type, node: { template, display_name, ... }, custom_fields } }
 * - Edge schema: { id, source, target, sourceHandle, targetHandle }
 */
import type {
  IWorkflowParser,
  ParsedWorkflow,
  NormalNode,
  NormalEdge,
  ExtractedParam,
} from "@/types";
import { flattenParams, edgesToConnectionMap } from "./normalise";

// ─── LangFlow Component Classification ───────────────────────────────────────
const LANGFLOW_TRIGGER_TYPES = new Set([
  "chatinput",
  "textinput",
  "webhook",
  "webhookcomponent",
  "apitrigger",
  "chattrigger",
  "inputnode",
]);

const LANGFLOW_LLM_TYPES = new Set([
  "chatopenai",
  "openai",
  "openaimodel",
  "azurechatopenai",
  "chatanthropic",
  "anthropic",
  "anthropicmodel",
  "ollama",
  "chatollama",
  "ollamamodel",
  "huggingfacemodel",
  "huggingface",
  "cohere",
  "coheremodel",
  "mistral",
  "mistralmodel",
  "groq",
  "groqmodel",
  "bedrock",
  "bedrockmodel",
]);

const LANGFLOW_AGENT_TYPES = new Set([
  "toolcallingagent",
  "conversationalagent",
  "agentinitializer",
  "agent",
  "openaiassistant",
  "vectorstorerouteragent",
  "cagent",
]);

const LANGFLOW_CHAIN_TYPES = new Set([
  "llmchain",
  "retrievalqachain",
  "conversationchain",
  "sequentialchain",
  "multipromptchain",
  "prompttemplate",
]);

const LANGFLOW_TOOL_TYPES = new Set([
  "calculator",
  "serpapi",
  "searchapi",
  "duckduckgosearch",
  "webbrowser",
  "customtool",
  "pythontool",
  "wikipediatool",
]);

const LANGFLOW_DB_TYPES = new Set([
  "chroma",
  "pinecone",
  "faiss",
  "astradb",
  "pgvector",
  "weaviate",
  "qdrant",
  "milvus",
  "supabasevectorstore",
  "mongodb",
  "redis",
  "postgres",
]);

const LANGFLOW_HTTP_TYPES = new Set([
  "urlcomponent",
  "apirequest",
  "searchcomponent",
  "requestsget",
  "requestspost",
  "webhookcomponent",
  "httpclient",
]);

const LANGFLOW_CODE_TYPES = new Set([
  "customcomponent",
  "pythonfunctioncomponent",
  "pythonfunction",
  "customtool",
  "codecomponent",
]);

const LANGFLOW_ROUTER_TYPES = new Set([
  "conditionalrouter",
  "branchcomponent",
  "router",
  "ifelsecomponent",
  "routercomponent",
]);

const LANGFLOW_LOOP_TYPES = new Set([
  "loopcomponent",
  "batchprocessor",
  "iterator",
  "batchrun",
]);

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]{10,}/,
  /eyJ[A-Za-z0-9+/]{20,}/,
  /sk-[A-Za-z0-9_\-]{16,}/,
  /sk-proj-[A-Za-z0-9\-_]{16,}/,
  /AIza[A-Za-z0-9\-_]{35}/,
  /[Aa][Pp][Ii][_-]?[Kk][Ee][Yy]\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/,
  /[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]\s*[:=]\s*["'][^"']{6,}/,
  /[Ss][Ee][Cc][Rr][Ee][Tt]\s*[:=]\s*["'][^"']{8,}/,
  /[Tt][Oo][Kk][Ee][Nn]\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}/,
  /xox[baprs]-[A-Za-z0-9\-]{10,}/,
  /ghp_[A-Za-z0-9]{36}/,
  /AKIA[0-9A-Z]{16}/,
  /sk_live_[A-Za-z0-9_\-]{16,}/,
  /pd_live_[A-Za-z0-9_\-]{16,}/,
];

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface LangflowTemplateField {
  type?: string;
  value?: unknown;
  show?: boolean;
  password?: boolean;
  advanced?: boolean;
  required?: boolean;
  placeholder?: string;
  [key: string]: unknown;
}

interface LangflowNodeData {
  id?: string;
  type?: string;
  node_type?: string;
  custom_fields?: Record<string, unknown>;
  node?: {
    template?: Record<string, LangflowTemplateField>;
    description?: string;
    display_name?: string;
    documentation?: string;
    base_classes?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface LangflowRawNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: LangflowNodeData;
  [key: string]: unknown;
}

interface LangflowRawEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  data?: unknown;
  [key: string]: unknown;
}

interface LangflowExport {
  id?: string;
  name?: string;
  description?: string;
  data?: {
    nodes?: LangflowRawNode[];
    edges?: LangflowRawEdge[];
    viewport?: unknown;
  };
  nodes?: LangflowRawNode[];
  edges?: LangflowRawEdge[];
  [key: string]: unknown;
}

function resolveLangflowType(node: LangflowRawNode): string {
  return (
    node.data?.type ??
    node.data?.node_type ??
    node.data?.node?.display_name ??
    node.type ??
    "genericNode"
  );
}

function extractTemplateParams(
  template?: Record<string, LangflowTemplateField>
): Record<string, unknown> {
  if (!template || typeof template !== "object") return {};
  const params: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(template)) {
    if (field && typeof field === "object" && "value" in field) {
      params[key] = field.value;
    } else {
      params[key] = field;
    }
  }
  return params;
}

function classifyLangflowNode(nodeType: string): {
  name: string;
  category: string;
  isAi: boolean;
  vendorType: "saas" | "community" | "selfhosted" | "core";
} {
  const lower = nodeType.toLowerCase();
  if (
    LANGFLOW_LLM_TYPES.has(lower) ||
    LANGFLOW_AGENT_TYPES.has(lower) ||
    LANGFLOW_CHAIN_TYPES.has(lower) ||
    lower.includes("openai") ||
    lower.includes("anthropic") ||
    lower.includes("ollama")
  ) {
    return { name: nodeType, category: "AI", isAi: true, vendorType: "saas" };
  }
  if (LANGFLOW_DB_TYPES.has(lower)) {
    const isCloud =
      lower.includes("pinecone") ||
      lower.includes("astradb") ||
      lower.includes("weaviate") ||
      lower.includes("qdrant") ||
      lower.includes("supabase");
    return {
      name: nodeType,
      category: "Database",
      isAi: false,
      vendorType: isCloud ? "saas" : "selfhosted",
    };
  }
  if (LANGFLOW_TOOL_TYPES.has(lower)) {
    return { name: nodeType, category: "Tools", isAi: false, vendorType: "saas" };
  }
  if (LANGFLOW_HTTP_TYPES.has(lower)) {
    return { name: nodeType, category: "API", isAi: false, vendorType: "core" };
  }
  if (LANGFLOW_CODE_TYPES.has(lower)) {
    return { name: nodeType, category: "Core", isAi: false, vendorType: "core" };
  }
  return {
    name: nodeType,
    category: "AI Infrastructure",
    isAi: false,
    vendorType: "saas",
  };
}

export class LangflowParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;

    // Explicit tag
    if (obj.platform === "LANGFLOW" || obj.platform === "langflow") return true;

    // Discard other specific top-level structures
    if (obj.connections && typeof obj.connections === "object") return false; // n8n
    if (Array.isArray(obj.flow)) return false; // Make
    if (Array.isArray(obj.steps)) return false; // Zapier/Pipedream
    if (obj.app && obj.workflow) return false; // Dify
    if (Array.isArray(obj.agents) && Array.isArray(obj.tasks)) return false; // CrewAI

    // Extract potential nodes
    const topNodes = Array.isArray(obj.nodes)
      ? (obj.nodes as unknown[])
      : null;
    const dataNodes =
      obj.data && typeof obj.data === "object" && Array.isArray((obj.data as Record<string, unknown>).nodes)
        ? ((obj.data as Record<string, unknown>).nodes as unknown[])
        : null;

    const rawNodesList = topNodes ?? dataNodes;
    if (!rawNodesList || rawNodesList.length === 0) return false;
    const nodes = rawNodesList.filter((n): n is LangflowRawNode => Boolean(n && typeof n === "object"));
    if (nodes.length === 0) return false;

    // Check LangFlow-specific signals on nodes
    return nodes.some((node) => {
      if (!node || typeof node !== "object") return false;
      const d = node.data;
      if (!d || typeof d !== "object") return false;

      // LangFlow signature: node.data.node.template
      if (d.node && typeof d.node === "object" && typeof d.node.template === "object") {
        return true;
      }
      // LangFlow node_type or custom_fields
      if (d.node_type !== undefined || d.custom_fields !== undefined) {
        return true;
      }
      // Type name matches LangFlow components
      const typeStr = (d.type ?? node.type ?? "").toLowerCase();
      if (
        LANGFLOW_TRIGGER_TYPES.has(typeStr) ||
        LANGFLOW_LLM_TYPES.has(typeStr) ||
        LANGFLOW_AGENT_TYPES.has(typeStr) ||
        LANGFLOW_ROUTER_TYPES.has(typeStr)
      ) {
        // Disambiguate from Flowise: Flowise has data.inputs / data.category
        return d.category === undefined || typeof d.node === "object";
      }
      return false;
    });
  }

  parse(json: unknown): ParsedWorkflow {
    const doc = (json && typeof json === "object") ? (json as LangflowExport) : {};
    const rawNodes: LangflowRawNode[] = (
      doc.nodes ?? doc.data?.nodes ?? []
    ).filter((n): n is LangflowRawNode => Boolean(n && typeof n === "object"));
    const rawEdges: LangflowRawEdge[] = (
      doc.edges ?? doc.data?.edges ?? []
    ).filter((e): e is LangflowRawEdge => Boolean(e && typeof e === "object"));

    const nodes: NormalNode[] = rawNodes.map((rawNode, idx) => {
      const nodeType = resolveLangflowType(rawNode);
      const lower = nodeType.toLowerCase();
      const template = rawNode.data?.node?.template;
      const templateParams = typeof template === "object" && template !== null
        ? extractTemplateParams(template as Record<string, LangflowTemplateField>)
        : {};
      const nodeObj = (rawNode.data?.node && typeof rawNode.data.node === "object") ? (rawNode.data.node as Record<string, unknown>) : {};

      const params: Record<string, unknown> = {
        ...nodeObj,
        ...templateParams,
        ...(rawNode.data?.custom_fields ?? {}),
        displayName: rawNode.data?.node?.display_name,
        description: rawNode.data?.node?.description,
      };

      // Classification flags
      const isTrigger =
        LANGFLOW_TRIGGER_TYPES.has(lower) ||
        rawNode.type === "chatInput" ||
        lower.includes("input") ||
        lower.includes("trigger") ||
        lower.includes("webhook");

      const isAi =
        LANGFLOW_LLM_TYPES.has(lower) ||
        LANGFLOW_AGENT_TYPES.has(lower) ||
        LANGFLOW_CHAIN_TYPES.has(lower) ||
        lower.includes("openai") ||
        lower.includes("anthropic") ||
        lower.includes("ollama") ||
        lower.includes("agent") ||
        lower.includes("llm") ||
        lower.includes("prompt") ||
        lower.includes("chain");

      const isCode =
        LANGFLOW_CODE_TYPES.has(lower) ||
        lower.includes("customcomponent") ||
        lower.includes("pythonfunction") ||
        lower.includes("code") ||
        params.code !== undefined ||
        params.python_code !== undefined;

      const isHttp =
        LANGFLOW_HTTP_TYPES.has(lower) ||
        lower.includes("url") ||
        lower.includes("api") ||
        lower.includes("request") ||
        lower.includes("webhook") ||
        params.url !== undefined ||
        params.base_url !== undefined;

      const isBranch =
        LANGFLOW_ROUTER_TYPES.has(lower) ||
        lower.includes("router") ||
        lower.includes("branch") ||
        lower.includes("condition");

      const isLoop =
        LANGFLOW_LOOP_TYPES.has(lower) ||
        lower.includes("loop") ||
        lower.includes("iterate") ||
        lower.includes("batch");

      const isDelay = lower.includes("delay") || lower.includes("sleep") || lower.includes("wait");

      // HTTP metadata
      let httpMeta: NormalNode["httpMeta"];
      if (isHttp) {
        httpMeta = {
          url: String(params.url ?? params.base_url ?? params.endpoint ?? ""),
          method: String(params.method ?? params.http_method ?? "GET").toUpperCase(),
          headers:
            typeof params.headers === "object" && params.headers !== null
              ? (params.headers as Record<string, string>)
              : undefined,
        };
      }

      // Code metadata
      let codeMeta: NormalNode["codeMeta"];
      if (isCode) {
        codeMeta = {
          codeSnippet: String(params.code ?? params.python_code ?? params.function ?? ""),
          language: "python",
        };
      }

      // AI metadata
      let aiMeta: NormalNode["aiMeta"];
      if (isAi) {
        const modelName = String(
          params.model_name ??
          params.model ??
          params.model_id ??
          params.openai_model ??
          ""
        );
        const maxIter =
          typeof params.max_iterations === "number"
            ? params.max_iterations
            : typeof params.max_tokens === "number"
            ? params.max_tokens
            : undefined;
        const hasStructured =
          !!(params.format_instructions || params.structured_output || params.response_format) ||
          lower.includes("structured");

        aiMeta = {
          model: modelName,
          maxIterations: maxIter,
          hasStructuredOutput: hasStructured,
        };
      }

      // Credentials extraction
      const credentials: Record<string, unknown> = {};
      if (template && typeof template === "object") {
        for (const [k, field] of Object.entries(template as Record<string, LangflowTemplateField>)) {
          if (field && typeof field === "object") {
            if (field.password === true || k.toLowerCase().includes("api_key") || k.toLowerCase().includes("secret") || k.toLowerCase().includes("token")) {
              if (field.value) credentials[k] = field.value;
            }
          }
        }
      }
      if (nodeObj && typeof nodeObj === "object") {
        for (const [k, v] of Object.entries(nodeObj)) {
          if (typeof v === "string" && (k.toLowerCase().includes("api_key") || k.toLowerCase().includes("secret") || k.toLowerCase().includes("token") || k.toLowerCase().includes("key"))) {
            credentials[k] = v;
          }
        }
      }
      if (params.openai_api_key) credentials.openAiApi = { id: "input" };
      if (params.anthropic_api_key) credentials.anthropicApi = { id: "input" };
      if (params.api_key) credentials.apiKey = { id: "input" };

      const displayName =
        rawNode.data?.node?.display_name ??
        rawNode.data?.type ??
        rawNode.data?.node_type ??
        nodeType;

      return {
        id: String(rawNode.id ?? `node_${idx}`),
        name: String(displayName ?? `Node ${idx}`),
        type: `langflow.${nodeType}`,
        disabled: false,
        position: rawNode.position
          ? [rawNode.position.x, rawNode.position.y]
          : undefined,
        parameters: params,
        credentials,
        isTrigger,
        isHttp,
        isCode,
        isAi,
        isLoop,
        isBranch,
        isDelay,
        isAuthenticated: Object.keys(credentials).length > 0,
        httpMeta,
        codeMeta,
        aiMeta,
      };
    });

    // Edges
    const edges: NormalEdge[] = rawEdges.map((e) => {
      let handle = e.sourceHandle;
      if (typeof handle === "string" && handle.startsWith("{")) {
        try {
          const parsedHandle = JSON.parse(handle);
          handle = parsedHandle.name ?? parsedHandle.id ?? handle;
        } catch {
          // Keep raw string handle
        }
      }
      return {
        source: String(e.source ?? ""),
        target: String(e.target ?? ""),
        sourceHandle: handle,
        type: handle ?? e.type ?? "main",
      };
    });

    const extractedParameters: ExtractedParam[] = nodes.flatMap((n) =>
      flattenParams(n.id, n.parameters)
    );

    const triggerNodes = nodes
      .filter((n) => n.isTrigger)
      .map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        isAuthenticated: n.isAuthenticated ?? false,
      }));

    const seenTypes = new Set<string>();
    const integrations: ParsedWorkflow["integrations"] = [];
    for (const node of nodes) {
      const rawNode = rawNodes.find((rn) => rn.id === node.id);
      const rawType = rawNode ? resolveLangflowType(rawNode) : node.type;
      if (seenTypes.has(rawType)) continue;
      seenTypes.add(rawType);
      integrations.push(classifyLangflowNode(rawType));
    }

    const branchNodes = nodes.filter((n) => n.isBranch);
    const loopNodes = nodes.filter((n) => n.isLoop);
    const aiNodes = nodes.filter((n) => n.isAi);

    const secretCount = nodes.reduce((count, n) => {
      const paramStr = JSON.stringify(n.parameters);
      const credStr = JSON.stringify(n.credentials);
      return (
        count +
        SECRET_PATTERNS.filter((p) => p.test(paramStr) || p.test(credStr)).length
      );
    }, 0);

    const rawConnections = edgesToConnectionMap(edges);
    const workflowName = doc.name ?? "Untitled LangFlow";

    return {
      name: workflowName,
      rawWorkflowName: workflowName,
      description: doc.description,
      metadata: {
        id: doc.id ?? null,
        description: doc.description ?? null,
      },
      platform: "LANGFLOW",
      nodeCount: nodes.length,
      connectionCount: edges.length,
      nodes,
      edges,
      extractedParameters,
      triggerNodes,
      integrations,
      httpNodesCount: nodes.filter((n) => n.isHttp).length,
      codeNodesCount: nodes.filter((n) => n.isCode).length,
      aiNodesCount: aiNodes.length,
      hasWebhooks: nodes.some(
        (n) => n.type.toLowerCase().includes("webhook") || n.isTrigger
      ),
      hasSchedules: nodes.some(
        (n) =>
          n.type.toLowerCase().includes("schedule") ||
          n.type.toLowerCase().includes("cron")
      ),
      hasBranches: branchNodes.length > 0,
      hasLoops: loopNodes.length > 0,
      branchCount: branchNodes.length,
      loopCount: loopNodes.length,
      extractedSecretsCount: secretCount,
      rawNodes,
      rawConnections,
    };
  }
}
