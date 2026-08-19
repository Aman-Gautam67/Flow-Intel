/**
 * Dify Workflow & Application DSL Parser.
 *
 * Supports Dify DSL exports (JSON/YAML-parsed):
 * - Outer envelope:
 *   {
 *     app: { name, mode: "workflow" | "advanced-chat" | "agent-chat" | "chat", ... },
 *     workflow: {
 *       version: "0.1.0" | "0.1.1",
 *       graph: { nodes: DifyNode[], edges: DifyEdge[] },
 *       environment_variables: DifyEnvVar[],
 *       conversation_variables?: unknown[],
 *     }
 *   }
 * - Also supports flat format or spec-wrapped format ({ kind: "app", spec: { workflow: { ... } } }).
 */
import type {
  IWorkflowParser,
  ParsedWorkflow,
  NormalNode,
  NormalEdge,
  ExtractedParam,
} from "@/types";
import { flattenParams, edgesToConnectionMap } from "./normalise";

// ─── Dify Node Type Categories ───────────────────────────────────────────────
const DIFY_AI_TYPES = new Set([
  "llm",
  "knowledge-retrieval",
  "question-classifier",
  "parameter-extractor",
  "agent",
]);

const DIFY_TRIGGER_TYPES = new Set([
  "start",
]);

const DIFY_CODE_TYPES = new Set([
  "code",
  "template-transform",
]);

const DIFY_HTTP_TYPES = new Set([
  "http-request",
  "tool",
]);

const DIFY_BRANCH_TYPES = new Set([
  "if-else",
  "question-classifier",
]);

const DIFY_LOOP_TYPES = new Set([
  "iteration",
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

// ─── Dify Schema Interfaces ──────────────────────────────────────────────────
interface DifyEnvVar {
  name: string;
  value?: string;
  value_type?: "string" | "number" | "secret";
  [key: string]: unknown;
}

interface DifyModelConfig {
  provider?: string;
  name?: string;
  mode?: string;
  completion_params?: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    response_format?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface DifyNodeData {
  type?: string;
  title?: string;
  desc?: string;
  model?: DifyModelConfig;
  prompt_template?: unknown;
  memory?: unknown;
  context?: unknown;
  vision?: unknown;
  code?: string;
  code_language?: string;
  variables?: unknown[];
  outputs?: unknown[];
  conditions?: unknown[];
  logical_operator?: string;
  url?: string;
  method?: string;
  authorization?: {
    type?: string;
    config?: {
      api_key?: string;
      header?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  headers?: unknown;
  params?: unknown;
  body?: unknown;
  provider_id?: string;
  provider_type?: string;
  provider_name?: string;
  tool_name?: string;
  tool_parameters?: unknown;
  [key: string]: unknown;
}

interface DifyRawNode {
  id: string;
  title?: string;
  type?: string;
  position?: { x: number; y: number };
  data?: DifyNodeData;
  [key: string]: unknown;
}

interface DifyRawEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: {
    sourceHandle?: string;
    targetHandle?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface DifyWorkflowData {
  version?: string;
  graph?: {
    nodes?: DifyRawNode[];
    edges?: DifyRawEdge[];
  };
  nodes?: DifyRawNode[];
  edges?: DifyRawEdge[];
  environment_variables?: DifyEnvVar[];
  conversation_variables?: unknown[];
  [key: string]: unknown;
}

interface DifyExport {
  app?: {
    name?: string;
    description?: string;
    mode?: string;
    icon?: string;
    [key: string]: unknown;
  };
  workflow?: DifyWorkflowData;
  kind?: string;
  spec?: {
    workflow?: DifyWorkflowData;
    [key: string]: unknown;
  };
  graph?: {
    nodes?: DifyRawNode[];
    edges?: DifyRawEdge[];
  };
  nodes?: DifyRawNode[];
  edges?: DifyRawEdge[];
  environment_variables?: DifyEnvVar[];
  version?: string;
  dsl_version?: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

function classifyDifyNode(nodeType: string): {
  name: string;
  category: string;
  isAi: boolean;
  vendorType: "saas" | "community" | "selfhosted" | "core";
} {
  const lower = nodeType.toLowerCase();
  if (DIFY_AI_TYPES.has(lower)) {
    return { name: nodeType, category: "AI", isAi: true, vendorType: "saas" };
  }
  if (lower === "http-request") {
    return { name: nodeType, category: "API", isAi: false, vendorType: "core" };
  }
  if (lower === "tool") {
    return { name: nodeType, category: "Tools", isAi: false, vendorType: "saas" };
  }
  if (DIFY_CODE_TYPES.has(lower)) {
    return { name: nodeType, category: "Core", isAi: false, vendorType: "core" };
  }
  if (DIFY_TRIGGER_TYPES.has(lower)) {
    return { name: nodeType, category: "Triggers", isAi: false, vendorType: "core" };
  }
  return { name: nodeType, category: "Logic", isAi: false, vendorType: "core" };
}

export class DifyParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;

    // Explicit tag
    if (obj.platform === "DIFY" || obj.platform === "dify") return true;

    // Dify format signatures
    if (
      obj.app &&
      typeof obj.app === "object" &&
      (obj.workflow || obj.graph)
    ) {
      return true;
    }

    if (
      obj.kind === "app" &&
      typeof obj.spec === "object" &&
      (obj.spec as Record<string, unknown>)?.workflow !== undefined
    ) {
      return true;
    }

    if (obj.dsl_version !== undefined) {
      return true;
    }

    // Top-level workflow graph with Dify nodes
    const workflowObj = obj.workflow as DifyWorkflowData | undefined;
    if (workflowObj && typeof workflowObj === "object") {
      if (
        Array.isArray(workflowObj.graph?.nodes) ||
        Array.isArray(workflowObj.nodes) ||
        Array.isArray(workflowObj.environment_variables)
      ) {
        return true;
      }
    }

    return false;
  }

  parse(json: unknown): ParsedWorkflow {
    const doc = (json && typeof json === "object") ? (json as DifyExport) : {};
    const workflow = (doc.workflow ?? doc.spec?.workflow ?? doc) as DifyWorkflowData;

    const rawNodes: DifyRawNode[] = (
      workflow?.graph?.nodes ??
      workflow?.nodes ??
      doc?.graph?.nodes ??
      doc?.nodes ??
      []
    ).filter((n): n is DifyRawNode => Boolean(n && typeof n === "object"));

    const rawEdges: DifyRawEdge[] = (
      workflow?.graph?.edges ??
      workflow?.edges ??
      doc?.graph?.edges ??
      doc?.edges ??
      []
    ).filter((e): e is DifyRawEdge => Boolean(e && typeof e === "object"));

    const envVars: DifyEnvVar[] = (
      workflow?.environment_variables ??
      doc?.environment_variables ??
      []
    ).filter((ev): ev is DifyEnvVar => Boolean(ev && typeof ev === "object"));

    const nodes: NormalNode[] = rawNodes.map((rawNode, idx) => {
      const nodeType = String(rawNode.data?.type ?? rawNode.type ?? "unknown").toLowerCase();
      const nodeTitle = String(rawNode.data?.title ?? rawNode.title ?? rawNode.id ?? `node_${idx}`);
      const data = (rawNode.data && typeof rawNode.data === "object") ? rawNode.data : {};

      const isTrigger = DIFY_TRIGGER_TYPES.has(nodeType);
      const isAi = DIFY_AI_TYPES.has(nodeType);
      const isCode = DIFY_CODE_TYPES.has(nodeType);
      const isHttp = DIFY_HTTP_TYPES.has(nodeType);
      const isBranch = DIFY_BRANCH_TYPES.has(nodeType);
      const isLoop = DIFY_LOOP_TYPES.has(nodeType);
      const isDelay = nodeType.includes("delay") || nodeType.includes("wait");

      const params: Record<string, unknown> = {
        ...data,
        nodeType,
        title: nodeTitle,
      };

      // HTTP metadata
      let httpMeta: NormalNode["httpMeta"];
      if (isHttp) {
        httpMeta = {
          url: String(data.url ?? data.provider_name ?? ""),
          method: String(data.method ?? "POST").toUpperCase(),
          headers:
            typeof data.headers === "object" && data.headers !== null
              ? (data.headers as Record<string, string>)
              : undefined,
        };
      }

      // Code metadata
      let codeMeta: NormalNode["codeMeta"];
      if (isCode) {
        const lang = String(data.code_language ?? "javascript").toLowerCase();
        codeMeta = {
          codeSnippet: String(data.code ?? ""),
          language: lang.includes("python") ? "python" : "javascript",
        };
      }

      // AI metadata
      let aiMeta: NormalNode["aiMeta"];
      if (isAi) {
        const model = (data.model && typeof data.model === "object") ? data.model : undefined;
        const modelName = String(model?.name ?? model?.provider ?? "");
        const maxTokens = model?.completion_params?.max_tokens;
        const hasStructured =
          nodeType === "parameter-extractor" ||
          !!(model?.completion_params?.response_format);

        aiMeta = {
          model: modelName,
          maxIterations: typeof maxTokens === "number" ? maxTokens : undefined,
          hasStructuredOutput: hasStructured,
        };
      }

      // Credentials extraction
      const credentials: Record<string, unknown> = {};
      if (data.authorization) {
        credentials.authorization = data.authorization;
      }

      return {
        id: String(rawNode.id ?? `node_${idx}`),
        name: nodeTitle,
        type: `dify.${nodeType}`,
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

    // Extract edges with sourceHandles (e.g. true/false for branches)
    const edges: NormalEdge[] = rawEdges.map((e) => {
      const handle =
        e.sourceHandle ??
        e.data?.sourceHandle ??
        (e as Record<string, unknown>).source_handle;
      const handleStr = typeof handle === "string" ? handle : undefined;

      return {
        source: String(e.source ?? ""),
        target: String(e.target ?? ""),
        sourceHandle: handleStr,
        type: handleStr ?? (e.type ? String(e.type) : "main"),
      };
    });

    // Flatten parameters across nodes
    const extractedParameters: ExtractedParam[] = nodes.flatMap((n) =>
      flattenParams(n.id, n.parameters)
    );

    // Also include environment variables in extracted parameters for secret auditing
    envVars.forEach((ev) => {
      if (ev && ev.name) {
        extractedParameters.push({
          nodeId: "env_variables",
          key: String(ev.name),
          value: String(ev.value ?? ""),
        });
      }
    });

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
      const typeStr = node.type.replace(/^dify\./, "");
      if (seenTypes.has(typeStr)) continue;
      seenTypes.add(typeStr);
      integrations.push(classifyDifyNode(typeStr));
    }

    const branchNodes = nodes.filter((n) => n.isBranch);
    const loopNodes = nodes.filter((n) => n.isLoop);
    const aiNodes = nodes.filter((n) => n.isAi);

    // Count secrets in nodes and env vars
    const secretCount =
      nodes.reduce((count, n) => {
        const paramStr = JSON.stringify(n.parameters);
        const credStr = JSON.stringify(n.credentials);
        return (
          count +
          SECRET_PATTERNS.filter((p) => p.test(paramStr) || p.test(credStr)).length
        );
      }, 0) +
      envVars.reduce((count, ev) => {
        const valStr = String(ev.value ?? "");
        return count + SECRET_PATTERNS.filter((p) => p.test(valStr)).length;
      }, 0);

    const rawConnections = edgesToConnectionMap(edges);
    const workflowName =
      doc.app?.name ??
      doc.name ??
      (workflow as Record<string, unknown>).name as string ??
      "Untitled Dify Workflow";

    return {
      name: workflowName,
      rawWorkflowName: workflowName,
      description: doc.app?.description ?? doc.description,
      platformVersion: String(workflow.version ?? doc.version ?? doc.dsl_version ?? "0.1.0"),
      metadata: {
        mode: doc.app?.mode ?? null,
        icon: doc.app?.icon ?? null,
        description: doc.app?.description ?? doc.description ?? null,
        version: workflow.version ?? doc.version ?? null,
        environmentVariablesCount: envVars.length,
      },
      platform: "DIFY",
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
      hasWebhooks: nodes.some((n) => n.isTrigger || n.type.includes("webhook")),
      hasSchedules: nodes.some((n) => n.type.includes("schedule") || n.type.includes("cron")),
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
