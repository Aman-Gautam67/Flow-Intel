/**
 * OpenAI Agents SDK / Swarm Framework Parser.
 *
 * Supports OpenAI Agents SDK & Swarm multi-agent architectures:
 * - Envelope: { name?, description?, starting_agent?, max_turns?, agents: [...] }
 *   or single agent { name, model, instructions, functions?: [...], tools?: [...] }
 * - Agent schema:
 *   {
 *     name: string,
 *     model?: string,
 *     instructions?: string | unknown,
 *     functions?: Array<{ name, description, is_handoff?, target_agent?, parameters? }>,
 *     tools?: Array<{ type, function: { name, description, parameters } } | string>,
 *     handoffs?: Array<string | { name, target_agent }>
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

// ─── OpenAI Agent Types ──────────────────────────────────────────────────────
interface OpenAiFunctionDef {
  name?: string;
  description?: string;
  is_handoff?: boolean;
  target_agent?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

interface OpenAiToolDef {
  type?: string;
  function?: OpenAiFunctionDef;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

interface OpenAiAgentDef {
  name: string;
  model?: string;
  instructions?: string | Record<string, unknown>;
  functions?: OpenAiFunctionDef[];
  tools?: Array<OpenAiToolDef | string>;
  handoffs?: Array<string | { name?: string; target_agent?: string }>;
  [key: string]: unknown;
}

interface OpenAiAgentsExport {
  name?: string;
  description?: string;
  starting_agent?: string;
  startingAgent?: string;
  max_turns?: number;
  maxTurns?: number;
  execute_tools_async?: boolean;
  agents?: OpenAiAgentDef[];
  [key: string]: unknown;
}

export class OpenAiAgentsParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;

    // Explicit tag
    if (
      obj.platform === "OPENAI_AGENTS" ||
      obj.platform === "openai_agents" ||
      obj.platform === "SWARM" ||
      obj.platform === "swarm"
    ) {
      return true;
    }

    // Reject other platforms
    if (obj.connections && typeof obj.connections === "object") return false; // n8n
    if (Array.isArray(obj.flow)) return false; // Make
    if (obj.app && obj.workflow) return false; // Dify
    if (Array.isArray(obj.tasks)) return false; // CrewAI
    if (obj.groupchat || obj.group_chat) return false; // AutoGen

    // Check starting_agent + agents array
    if (
      (obj.starting_agent !== undefined || obj.startingAgent !== undefined) &&
      Array.isArray(obj.agents)
    ) {
      return true;
    }

    // Check agents array with instructions / handoffs
    if (Array.isArray(obj.agents) && obj.agents.length > 0) {
      const isAgentsSdk = obj.agents.some((a) => {
        if (!a || typeof a !== "object") return false;
        const agent = a as Record<string, unknown>;
        return (
          agent.instructions !== undefined ||
          Array.isArray(agent.handoffs) ||
          (Array.isArray(agent.functions) &&
            (agent.functions as unknown[]).some(
              (f) => f && typeof f === "object" && ((f as Record<string, unknown>).is_handoff !== undefined || (f as Record<string, unknown>).target_agent !== undefined)
            ))
        );
      });
      if (isAgentsSdk) return true;
    }

    // Single agent root check
    if (
      typeof obj.name === "string" &&
      obj.instructions !== undefined &&
      (obj.model !== undefined || Array.isArray(obj.tools) || Array.isArray(obj.functions))
    ) {
      return true;
    }

    return false;
  }

  parse(json: unknown): ParsedWorkflow {
    const doc = (json && typeof json === "object") ? (json as OpenAiAgentsExport) : {};
    const rawAgents: OpenAiAgentDef[] = (Array.isArray(doc.agents)
      ? doc.agents
      : typeof doc.name === "string" && doc.instructions !== undefined
      ? [doc as unknown as OpenAiAgentDef]
      : []).filter((a): a is OpenAiAgentDef => Boolean(a && typeof a === "object"));

    const startingAgentName = doc.starting_agent ?? doc.startingAgent ?? rawAgents[0]?.name;

    const nodes: NormalNode[] = [];
    const edges: NormalEdge[] = [];
    const toolSet = new Map<string, OpenAiToolDef>();

    // 1. Process Agents
    rawAgents.forEach((agent, index) => {
      const agentName = String(agent.name ?? `Agent_${index + 1}`);
      const agentId = `agent_${agentName.replace(/\s+/g, "_")}`;
      const isTrigger = agentName === startingAgentName || (index === 0 && !startingAgentName);

      const params: Record<string, unknown> = {
        name: agent.name,
        model: agent.model,
        instructions: agent.instructions,
        functions: agent.functions,
        tools: agent.tools,
        handoffs: agent.handoffs,
      };

      const credentials: Record<string, unknown> = {};
      const paramsStr = JSON.stringify(params);
      if (paramsStr.includes("api_key") || paramsStr.includes("apiKey") || paramsStr.includes("sk-")) {
        credentials.apiKey = { id: "configured" };
      }

      nodes.push({
        id: agentId,
        name: agentName,
        type: "openai_agents.agent",
        disabled: false,
        position: [200 + (index % 3) * 260, 150 + Math.floor(index / 3) * 200],
        parameters: params,
        credentials,
        isTrigger,
        isHttp: false,
        isCode: false,
        isAi: true,
        isLoop: false,
        isBranch: (agent.handoffs?.length ?? 0) > 1,
        isDelay: false,
        isAuthenticated: Object.keys(credentials).length > 0,
        aiMeta: {
          model: agent.model ?? "gpt-4o",
          maxIterations: doc.max_turns ?? doc.maxTurns ?? 20,
          hasStructuredOutput: true,
        },
      });

      // Process functions
      if (Array.isArray(agent.functions)) {
        agent.functions.filter((f): f is NonNullable<typeof f> => Boolean(f && typeof f === "object")).forEach((func) => {
          const funcName = String(func.name ?? "unnamed_function");

          // Handoff edge
          if (func.is_handoff || func.target_agent) {
            const targetName = String(func.target_agent ?? func.name);
            const targetId = `agent_${targetName.replace(/\s+/g, "_")}`;
            edges.push({
              source: agentId,
              target: targetId,
              type: "handoff",
              sourceHandle: funcName,
            });
          } else {
            // Standalone tool function
            toolSet.set(funcName, { function: func, name: funcName, description: func.description });
            const toolId = `tool_${funcName.replace(/\s+/g, "_")}`;
            edges.push({
              source: agentId,
              target: toolId,
              type: "tool_call",
              sourceHandle: funcName,
            });
          }
        });
      }

      // Process tools
      if (Array.isArray(agent.tools)) {
        agent.tools.filter((t): t is NonNullable<typeof t> => Boolean(t)).forEach((tool, tIdx) => {
          if (typeof tool === "string") {
            const toolName = tool;
            toolSet.set(toolName, { name: toolName });
            const toolId = `tool_${toolName.replace(/\s+/g, "_")}`;
            edges.push({
              source: agentId,
              target: toolId,
              type: "tool_call",
              sourceHandle: toolName,
            });
          } else if (tool && typeof tool === "object") {
            const toolName = String(tool.function?.name ?? tool.name ?? `tool_${tIdx + 1}`);
            toolSet.set(toolName, tool);
            const toolId = `tool_${toolName.replace(/\s+/g, "_")}`;
            edges.push({
              source: agentId,
              target: toolId,
              type: "tool_call",
              sourceHandle: toolName,
            });
          }
        });
      }

      // Process explicit handoffs array
      if (Array.isArray(agent.handoffs)) {
        agent.handoffs.filter((h): h is NonNullable<typeof h> => Boolean(h)).forEach((handoff) => {
          const targetName =
            typeof handoff === "string"
              ? handoff
              : typeof handoff === "object" && handoff !== null
              ? String(handoff.target_agent ?? handoff.name ?? "")
              : "";

          if (targetName) {
            const targetId = `agent_${targetName.replace(/\s+/g, "_")}`;
            edges.push({
              source: agentId,
              target: targetId,
              type: "handoff",
              sourceHandle: "handoff",
            });
          }
        });
      }
    });

    // 2. Process Tools
    let toolIdx = 0;
    for (const [toolName, toolDef] of toolSet.entries()) {
      const toolId = `tool_${toolName.replace(/\s+/g, "_")}`;
      const lower = toolName.toLowerCase();
      const isCode = lower.includes("python") || lower.includes("code") || lower.includes("eval");

      nodes.push({
        id: toolId,
        name: toolName,
        type: "openai_agents.tool",
        disabled: false,
        position: [800, 100 + toolIdx * 140],
        parameters: { ...toolDef },
        credentials: {},
        isTrigger: false,
        isHttp: !isCode,
        isCode,
        isAi: false,
        isLoop: false,
        isBranch: false,
        isDelay: false,
        isAuthenticated: false,
      });
      toolIdx++;
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
      { name: "OpenAI Agents SDK / Swarm", category: "AI", isAi: true, vendorType: "saas" },
    ];
    for (const toolName of toolSet.keys()) {
      integrations.push({
        name: toolName,
        category: "Tools",
        isAi: false,
        vendorType: "saas",
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
      "OpenAI Agents Swarm";

    return {
      name: workflowName,
      rawWorkflowName: workflowName,
      description: doc.description,
      platformVersion: "1.0.0",
      metadata: {
        startingAgent: startingAgentName ?? null,
        agentCount: rawAgents.length,
        toolCount: toolSet.size,
        maxTurns: doc.max_turns ?? doc.maxTurns ?? 20,
      },
      platform: "OPENAI_AGENTS",
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
      hasBranches: branchNodes.length > 0 || edges.filter((e) => e.type === "handoff").length > 1,
      hasLoops: loopNodes.length > 0,
      branchCount: branchNodes.length,
      loopCount: loopNodes.length,
      extractedSecretsCount: secretCount,
      rawNodes: rawAgents,
      rawConnections,
    };
  }
}
