/**
 * Flowise / LangFlow JSON parser.
 *
 * Both tools share a ReactFlow-derived schema:
 *   { nodes: FlowNode[], edges: FlowEdge[] }
 *
 * FlowNode shape:
 *   { id, type, position, data: { id, label, name, type, inputs, outputs, ... } }
 *
 * FlowEdge shape:
 *   { id, source, target, sourceHandle?, targetHandle? }
 *
 * This covers both Flowise (category/baseClasses) and LangFlow (node_type).
 */
import type { IWorkflowParser, ParsedWorkflow, NormalNode, NormalEdge, ExtractedParam } from "@/types";
import { flattenParams } from "./normalise";

// ─── Flowise/LangFlow node type classification ────────────────────────────────
// LLM / AI nodes
const FLOWISE_LLM_TYPES = new Set([
  "chatOpenAI", "openAI", "azureChatOpenAI", "chatAnthropic", "anthropic",
  "chatGooglePalm", "chatMistralAI", "ollama", "chatOllama",
  "openAIFunctionAgent", "conversationalAgent", "toolAgent",
  "openAIAssistant", "multiPromptChain", "conversationChain",
  "llmChain", "retrievalQAChain", "multiRetrievalQAChain",
  "ChatOpenAI", "OpenAI", "Anthropic", "ChatAnthropic", "Ollama",
]);

// Agent / executor nodes
const FLOWISE_AGENT_TYPES = new Set([
  "openAIFunctionAgent", "conversationalAgent", "toolAgent", "agentExecutor",
  "AgentExecutor", "ZeroShotAgent", "StructuredChatAgent",
]);

// Tool nodes
const FLOWISE_TOOL_TYPES = new Set([
  "calculator", "serpAPI", "webBrowser", "requestsGet", "requestsPost",
  "customTool", "apiChain", "openAPIChain",
  "Calculator", "SerpAPI", "WebBrowser", "RequestsGetTool",
]);

// Document store / DB nodes
const FLOWISE_DB_TYPES = new Set([
  "pinecone", "weaviate", "chroma", "qdrant", "milvus", "faiss",
  "postgres", "mysql", "mongodb", "redis", "supabase",
  "Pinecone", "Weaviate", "Chroma", "Qdrant", "Milvus",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Supabase",
]);

// HTTP / API integrations
const FLOWISE_HTTP_TYPES = new Set([
  "customTool", "apiChain", "openAPIChain", "requestsGet", "requestsPost",
  "zapierNLA", "gmailTool", "slackTool",
]);

// Structured output parsers
const FLOWISE_OUTPUT_PARSER_TYPES = new Set([
  "structuredOutputParser", "autoFixOutputParser", "csvOutputParser", "jsonOutputParser",
  "StructuredOutputParser", "AutoFixOutputParser",
]);

// Code execution nodes
const FLOWISE_CODE_TYPES = new Set([
  "customFunction", "pythonFunction", "customTool", "jsFunctionEvaluator",
]);

// Trigger-like nodes
const FLOWISE_TRIGGER_TYPES = new Set([
  "startChatflow", "webhookTrigger", "chatTrigger", "apiTrigger",
]);

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/, /eyJ[A-Za-z0-9+/]{20,}/,
  /sk-[A-Za-z0-9]{20,}/, /AIza[A-Za-z0-9\-_]{35}/,
  /[Aa][Pp][Ii][_-]?[Kk][Ee][Yy]\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/,
];

// ─── Flowise / LangFlow node shapes ──────────────────────────────────────────
interface FlowNodeData {
  id?: string;
  label?: string;
  name?: string;
  type?: string;
  node_type?: string;            // LangFlow
  category?: string;             // Flowise
  baseClasses?: string[];        // Flowise
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  [key: string]: unknown;
}

interface FlowNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: FlowNodeData;
}

interface FlowEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
}

interface FlowExport {
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  name?: string;
  description?: string;
  // LangFlow wraps in `data`
  data?: { nodes?: FlowNode[]; edges?: FlowEdge[] };
}

function resolveNodeType(node: FlowNode): string {
  // Flowise: data.name or data.type
  // LangFlow: node.type or data.node_type
  return (
    node.data?.name ??
    node.data?.type ??
    node.data?.node_type ??
    node.type ??
    "unknown"
  );
}

function flowNodeToNormal(node: FlowNode): NormalNode {
  const nodeType = resolveNodeType(node);
  const label = node.data?.label ?? node.data?.name ?? nodeType;
  const inputs = (node.data?.inputs ?? {}) as Record<string, unknown>;
  const params: Record<string, unknown> = { ...inputs, ...node.data };

  const isAi = FLOWISE_LLM_TYPES.has(nodeType) || FLOWISE_AGENT_TYPES.has(nodeType);
  const isHttp = FLOWISE_HTTP_TYPES.has(nodeType);
  const isCode = FLOWISE_CODE_TYPES.has(nodeType);
  const isBranch = nodeType.toLowerCase().includes("router") || nodeType.toLowerCase().includes("branch");
  const isLoop = nodeType.toLowerCase().includes("loop") || nodeType.toLowerCase().includes("iterate");
  const isDelay = nodeType.toLowerCase().includes("delay") || nodeType.toLowerCase().includes("wait");
  const isTrigger = FLOWISE_TRIGGER_TYPES.has(nodeType) || nodeType.toLowerCase().includes("trigger") || nodeType.toLowerCase().includes("start") ||
    // Flowise "Source" category nodes and chatInput are DAG entry points, not downstream consumers
    (node.data?.type === "Source") || nodeType === "chatInput";
  const isAgent = FLOWISE_AGENT_TYPES.has(nodeType);

  const httpMeta = isHttp ? {
    url: String(inputs.url ?? inputs.baseUrl ?? ""),
    method: ((inputs.method ?? "POST") as string).toUpperCase(),
  } : undefined;

  const aiMeta = isAi ? {
    maxIterations: (inputs.maxIterations ?? inputs.max_iterations) as number | undefined,
    hasStructuredOutput: FLOWISE_OUTPUT_PARSER_TYPES.has(nodeType) || !!(inputs.outputParser || inputs.structuredOutput),
    model: String(inputs.modelName ?? inputs.model ?? inputs.model_name ?? ""),
  } : undefined;

  // Agents have tools connected via edges — flag them for guardrails rule
  const credentials: Record<string, unknown> = {};
  if (inputs.openAIApiKey || inputs.openai_api_key) credentials.openAiApi = { id: "input" };
  if (inputs.anthropicApiKey || inputs.anthropic_api_key) credentials.anthropicApi = { id: "input" };
  if (inputs.pineconeApiKey) credentials.pineconeApi = { id: "input" };

  return {
    id: String(node.id ?? "node"),
    name: String(label ?? "node"),
    type: `flowise.${nodeType}`,
    disabled: false,
    position: node.position ? [node.position.x, node.position.y] : undefined,
    parameters: params,
    credentials,
    isTrigger, isHttp, isCode,
    isAi: isAi || isAgent,
    isLoop, isBranch, isDelay,
    isAuthenticated: Object.keys(credentials).length > 0,
    httpMeta, aiMeta,
  };
}

function classifyFlowiseNode(nodeType: string): {
  name: string; category: string; isAi: boolean; vendorType: "saas" | "community" | "selfhosted" | "core";
} {
  if (FLOWISE_LLM_TYPES.has(nodeType) || FLOWISE_AGENT_TYPES.has(nodeType))
    return { name: nodeType, category: "AI", isAi: true, vendorType: "saas" };
  if (FLOWISE_DB_TYPES.has(nodeType)) {
    const lower = nodeType.toLowerCase();
    const isCloud = lower === "pinecone" || lower === "weaviate" || lower === "supabase" || lower === "qdrant";
    return { name: nodeType, category: "Database", isAi: false, vendorType: isCloud ? "saas" : "selfhosted" };
  }
  if (FLOWISE_TOOL_TYPES.has(nodeType))
    return { name: nodeType, category: "Tools", isAi: false, vendorType: "saas" };
  if (FLOWISE_HTTP_TYPES.has(nodeType))
    return { name: nodeType, category: "API", isAi: false, vendorType: "core" };
  if (FLOWISE_CODE_TYPES.has(nodeType))
    return { name: nodeType, category: "Core", isAi: false, vendorType: "core" };
  return { name: nodeType, category: "AI Infrastructure", isAi: false, vendorType: "saas" };
}

export class FlowiseParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;
    // Accept explicit FLOWISE tag
    if (obj.platform === "FLOWISE" || obj.platform === "flowise") return true;
    // Accept Flowise/LangFlow structure (data.nodes or top-level nodes with ReactFlow shape)
    const topNodes = Array.isArray(obj.nodes) ? obj.nodes : null;
    const dataNodes = obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>).nodes
      : null;
    const rawNodes = (topNodes ?? dataNodes);
    if (!Array.isArray(rawNodes) || rawNodes.length === 0) return false;

    const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));

    // n8n has `type` as a string property directly; Flowise nodes have `data.category`, `data.baseClasses`, `data.label`, `data.inputs`, or `data.name`/`data.type`
    const isFlowiseShape = (rawNodes as unknown[]).some(
      (n: any) => isRecord(n) && isRecord(n.data) && (
        typeof n.data.category === "string" ||
        Array.isArray(n.data.baseClasses) ||
        typeof n.data.label === "string" ||
        isRecord(n.data.inputs) ||
        typeof n.data.name === "string" ||
        typeof n.data.type === "string"
      )
    );
    const hasN8nConnections = !!(obj as Record<string, unknown>).connections;
    const hasMakeFlow = Array.isArray((obj as Record<string, unknown>).flow);
    return isFlowiseShape && !hasN8nConnections && !hasMakeFlow;
  }

  parse(json: unknown): ParsedWorkflow {
    const doc = (json && typeof json === "object") ? (json as FlowExport) : {};
    // Support both top-level and LangFlow's `data` wrapper
    const rawNodes: FlowNode[] = (doc.nodes ?? doc.data?.nodes ?? []).filter(
      (n): n is FlowNode => Boolean(n && typeof n === "object")
    );
    const rawEdges: FlowEdge[] = (doc.edges ?? doc.data?.edges ?? []).filter(
      (e): e is FlowEdge => Boolean(e && typeof e === "object")
    );

    const nodes: NormalNode[] = rawNodes.map(flowNodeToNormal);
    const edges: NormalEdge[] = rawEdges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.sourceHandle ?? e.type ?? "main",
    }));

    const extractedParameters: ExtractedParam[] = rawNodes.flatMap((n) =>
      flattenParams(n.id, (n.data?.inputs ?? {}) as Record<string, unknown>)
    );

    const triggerNodes = nodes
      .filter((n) => n.isTrigger)
      .map((n) => ({ id: n.id, name: n.name, type: n.type, isAuthenticated: n.isAuthenticated ?? false }));

    const seenTypes = new Set<string>();
    const integrations: ParsedWorkflow["integrations"] = [];
    for (const node of nodes) {
      const nodeType = resolveNodeType(rawNodes.find((rn) => rn.id === node.id) ?? { id: node.id });
      if (seenTypes.has(nodeType)) continue;
      seenTypes.add(nodeType);
      integrations.push(classifyFlowiseNode(nodeType));
    }

    const branchNodes = nodes.filter((n) => n.isBranch);
    const loopNodes   = nodes.filter((n) => n.isLoop);
    const aiNodes     = nodes.filter((n) => n.isAi);

    const secretCount = nodes.reduce((s, n) => {
      const str = JSON.stringify(n.parameters);
      return s + SECRET_PATTERNS.filter((p) => p.test(str)).length;
    }, 0);

    return {
      name: doc.name ?? "Untitled Flowise Flow",
      rawWorkflowName: doc.name ?? "Untitled Flowise Flow",
      description: doc.description,
      metadata: {
        description: doc.description ?? null,
        chatflowDomain: (doc as Record<string, unknown>).chatflowDomain ?? null,
      },
      platform: "FLOWISE",
      nodeCount: nodes.length,
      connectionCount: edges.length,
      nodes, edges, extractedParameters,
      triggerNodes, integrations,
      httpNodesCount: nodes.filter((n) => n.isHttp).length,
      codeNodesCount: nodes.filter((n) => n.isCode).length,
      aiNodesCount: aiNodes.length,
      hasWebhooks: nodes.some((n) => n.type.includes("webhook")),
      hasSchedules: nodes.some((n) => n.type.includes("schedule") || n.type.includes("cron")),
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
