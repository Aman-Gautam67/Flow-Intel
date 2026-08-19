/**
 * AutoGen (Microsoft AG2) Multi-Agent Framework Parser.
 *
 * Supports AutoGen multi-agent configurations:
 * - Envelope: { name?, description?, agents: [...], groupchat?: { agents, max_round, speaker_selection_method }, manager?: ... }
 *   or { participants: [...], messages?: [...] }
 * - Agent schema:
 *   {
 *     name: string,
 *     type?: "UserProxyAgent" | "AssistantAgent" | "ConversableAgent" | "GroupChatManager" | string,
 *     human_input_mode?: "ALWAYS" | "NEVER" | "TERMINATE",
 *     max_consecutive_auto_reply?: number,
 *     system_message?: string,
 *     code_execution_config?: { work_dir?, use_docker?, timeout? } | false,
 *     llm_config?: { config_list: [{ model?, api_key?, temperature? }], timeout?, cache_seed? } | false
 *   }
 */
import type {
  IWorkflowParser,
  ParsedWorkflow,
  NormalNode,
  NormalEdge,
  ExtractedParam,
} from "@/types";
import { flattenParams, edgesToConnectionMap } from "./normalise";

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

// ─── AutoGen Types ───────────────────────────────────────────────────────────
interface AutoGenLlmConfigItem {
  model?: string;
  api_key?: string;
  temperature?: number;
  base_url?: string;
  api_type?: string;
  [key: string]: unknown;
}

interface AutoGenLlmConfig {
  config_list?: AutoGenLlmConfigItem[];
  model?: string;
  temperature?: number;
  timeout?: number;
  cache_seed?: number | null;
  [key: string]: unknown;
}

interface AutoGenCodeExecutionConfig {
  work_dir?: string;
  use_docker?: boolean | string;
  timeout?: number;
  last_n_messages?: number;
  [key: string]: unknown;
}

interface AutoGenAgent {
  name?: string;
  type?: string;
  human_input_mode?: "ALWAYS" | "NEVER" | "TERMINATE" | string;
  max_consecutive_auto_reply?: number;
  system_message?: string;
  code_execution_config?: AutoGenCodeExecutionConfig | boolean;
  llm_config?: AutoGenLlmConfig | boolean;
  description?: string;
  default_auto_reply?: string;
  [key: string]: unknown;
}

interface AutoGenGroupChat {
  agents?: Array<string | AutoGenAgent>;
  messages?: unknown[];
  max_round?: number;
  speaker_selection_method?: "auto" | "round_robin" | "random" | "manual" | string;
  admin_name?: string;
  allow_repeat_speaker?: boolean;
  [key: string]: unknown;
}

interface AutoGenExport {
  name?: string;
  description?: string;
  type?: string;
  agents?: AutoGenAgent[];
  participants?: AutoGenAgent[];
  groupchat?: AutoGenGroupChat;
  group_chat?: AutoGenGroupChat;
  manager?: AutoGenAgent;
  groupchat_manager?: AutoGenAgent;
  [key: string]: unknown;
}

const AUTOGEN_TYPE_NAMES = new Set([
  "userproxyagent",
  "assistantagent",
  "conversableagent",
  "groupchatmanager",
  "retrieveuserproxyagent",
  "societyofmindagent",
  "mathuserproxyagent",
  "teachableagent",
]);

function extractModel(llmConfig: unknown): string {
  if (!llmConfig || typeof llmConfig !== "object") return "gpt-4o";
  const cfg = llmConfig as AutoGenLlmConfig;
  if (Array.isArray(cfg.config_list) && cfg.config_list.length > 0) {
    return String(cfg.config_list[0]?.model ?? "gpt-4o");
  }
  if (cfg.model) return String(cfg.model);
  return "gpt-4o";
}

export class AutoGenParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;

    // Explicit tag
    if (obj.platform === "AUTOGEN" || obj.platform === "autogen") return true;

    // Reject other platforms
    if (obj.connections && typeof obj.connections === "object") return false;
    if (Array.isArray(obj.flow)) return false;
    if (obj.app && obj.workflow) return false;
    if (Array.isArray(obj.tasks)) return false; // CrewAI

    // Check AutoGen groupchat or manager
    if (obj.groupchat || obj.group_chat || obj.manager || obj.groupchat_manager) {
      return true;
    }

    // Check agent array signatures
    const rawAgentsList = Array.isArray(obj.agents)
      ? (obj.agents as unknown[])
      : Array.isArray(obj.participants)
      ? (obj.participants as unknown[])
      : null;

    if (rawAgentsList && rawAgentsList.length > 0) {
      const rawAgents = rawAgentsList.filter((a): a is AutoGenAgent => Boolean(a && typeof a === "object"));
      if (rawAgents.length > 0) {
        return rawAgents.some((a) => {
          if (a.human_input_mode !== undefined) return true;
          if (a.code_execution_config !== undefined) return true;
          if (a.llm_config !== undefined) return true;
          if (a.max_consecutive_auto_reply !== undefined) return true;
          const typeStr = String(a.type ?? "").toLowerCase();
          if (AUTOGEN_TYPE_NAMES.has(typeStr)) return true;
          return false;
        });
      }
    }

    return false;
  }

  parse(json: unknown): ParsedWorkflow {
    const doc = (json && typeof json === "object") ? (json as AutoGenExport) : {};
    const rawAgents: AutoGenAgent[] = (Array.isArray(doc.agents)
      ? doc.agents
      : Array.isArray(doc.participants)
      ? doc.participants
      : []).filter((a): a is AutoGenAgent => Boolean(a && typeof a === "object"));

    const groupChat = (doc.groupchat ?? doc.group_chat) as AutoGenGroupChat | undefined;
    const managerDef = (doc.manager ?? doc.groupchat_manager) as AutoGenAgent | undefined;

    const nodes: NormalNode[] = [];
    const edges: NormalEdge[] = [];
    const agentNodeIds: string[] = [];

    // 1. Parse Manager Node (if defined)
    let managerNodeId: string | null = null;
    if (managerDef && typeof managerDef === "object") {
      managerNodeId = `manager_${String(managerDef.name ?? "GroupChat_Manager").replace(/\s+/g, "_")}`;
      const managerModel = extractModel(managerDef.llm_config);

      nodes.push({
        id: managerNodeId,
        name: String(managerDef.name ?? "GroupChat Manager"),
        type: "autogen.GroupChatManager",
        disabled: false,
        position: [400, 50],
        parameters: { ...managerDef },
        credentials: {},
        isTrigger: false,
        isHttp: false,
        isCode: false,
        isAi: true,
        isLoop: false,
        isBranch: true,
        isDelay: false,
        isAuthenticated: false,
        aiMeta: {
          model: managerModel,
          maxIterations: groupChat?.max_round ?? 20,
          hasStructuredOutput: false,
        },
      });
    }

    // 2. Parse Agents
    rawAgents.forEach((agent, index) => {
      const agentName = String(agent.name ?? `Agent_${index + 1}`);
      const nodeId = `agent_${agentName.replace(/\s+/g, "_")}`;
      agentNodeIds.push(nodeId);

      const agentType = String(
        agent.type ??
        (agent.human_input_mode ? "UserProxyAgent" : "AssistantAgent")
      );
      const lowerType = agentType.toLowerCase();

      const isUserProxy =
        lowerType.includes("userproxy") ||
        agent.human_input_mode === "ALWAYS" ||
        agent.human_input_mode === "TERMINATE";

      const hasCodeExec =
        agent.code_execution_config !== false &&
        agent.code_execution_config !== undefined &&
        agent.code_execution_config !== null;

      const isAi =
        agent.llm_config !== false &&
        agent.llm_config !== undefined &&
        !isUserProxy;

      const isTrigger =
        isUserProxy ||
        agent.human_input_mode === "ALWAYS" ||
        index === 0;

      const isBranch =
        lowerType.includes("groupchatmanager") ||
        lowerType.includes("manager");

      // Extract credentials and models from llm_config
      const credentials: Record<string, unknown> = {};
      let modelName = "gpt-4o";
      if (agent.llm_config && typeof agent.llm_config === "object") {
        const cfg = agent.llm_config as AutoGenLlmConfig;
        modelName = extractModel(cfg);
        if (Array.isArray(cfg.config_list)) {
          cfg.config_list.filter((item): item is NonNullable<typeof item> => Boolean(item && typeof item === "object")).forEach((item) => {
            if (item.api_key) {
              credentials.apiKey = item.api_key;
            }
          });
        }
      }

      // Code metadata
      let codeMeta: NormalNode["codeMeta"];
      if (hasCodeExec) {
        const codeConfigStr =
          typeof agent.code_execution_config === "object"
            ? JSON.stringify(agent.code_execution_config)
            : "code_execution: true";
        codeMeta = {
          codeSnippet: codeConfigStr,
          language: "python",
        };
      }

      // AI metadata
      let aiMeta: NormalNode["aiMeta"];
      if (isAi || isBranch) {
        aiMeta = {
          model: modelName,
          maxIterations: agent.max_consecutive_auto_reply ?? groupChat?.max_round ?? 20,
          hasStructuredOutput: false,
        };
      }

      nodes.push({
        id: nodeId,
        name: agentName,
        type: `autogen.${agentType}`,
        disabled: false,
        position: [200 + (index % 3) * 240, 200 + Math.floor(index / 3) * 180],
        parameters: { ...agent },
        credentials,
        isTrigger,
        isHttp: false,
        isCode: hasCodeExec,
        isAi,
        isLoop: false,
        isBranch,
        isDelay: false,
        isAuthenticated: Object.keys(credentials).length > 0,
        codeMeta,
        aiMeta,
      });

      // Connect Manager <-> Agent
      if (managerNodeId) {
        edges.push({
          source: managerNodeId,
          target: nodeId,
          type: "chat_turn",
          sourceHandle: "broadcast",
        });
        edges.push({
          source: nodeId,
          target: managerNodeId,
          type: "chat_turn",
          sourceHandle: "reply",
        });
      }
    });

    // 3. Connect Conversation Edges (when no separate manager)
    if (!managerNodeId) {
      if (agentNodeIds.length === 2) {
        // Direct 2-Agent conversation
        edges.push({
          source: agentNodeIds[0],
          target: agentNodeIds[1],
          type: "chat_turn",
          sourceHandle: "message",
        });
        edges.push({
          source: agentNodeIds[1],
          target: agentNodeIds[0],
          type: "chat_turn",
          sourceHandle: "reply",
        });
      } else if (agentNodeIds.length > 2) {
        // Multi-Agent Round Robin / Mesh
        for (let i = 0; i < agentNodeIds.length; i++) {
          const nextIdx = (i + 1) % agentNodeIds.length;
          edges.push({
            source: agentNodeIds[i],
            target: agentNodeIds[nextIdx],
            type: "chat_turn",
            sourceHandle: "next_turn",
          });
        }
      }
    }

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

    const integrations: ParsedWorkflow["integrations"] = [
      { name: "AutoGen Conversational Engine", category: "AI", isAi: true, vendorType: "core" },
    ];
    if (nodes.some((n) => n.isCode)) {
      integrations.push({
        name: "Docker/Code Execution Sandbox",
        category: "Core",
        isAi: false,
        vendorType: "core",
      });
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
    const workflowName =
      doc.name ??
      "AutoGen Multi-Agent System";

    return {
      name: workflowName,
      rawWorkflowName: workflowName,
      description: doc.description,
      platformVersion: "0.2.0",
      metadata: {
        agentCount: rawAgents.length,
        hasManager: managerNodeId !== null,
        speakerSelectionMethod: groupChat?.speaker_selection_method ?? "auto",
        maxRound: groupChat?.max_round ?? 20,
      },
      platform: "AUTOGEN",
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
      hasWebhooks: false,
      hasSchedules: false,
      hasBranches: branchNodes.length > 0 || groupChat !== undefined,
      hasLoops: loopNodes.length > 0,
      branchCount: branchNodes.length,
      loopCount: loopNodes.length,
      extractedSecretsCount: secretCount,
      rawNodes: rawAgents,
      rawConnections,
    };
  }
}
