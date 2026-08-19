/**
 * CrewAI Multi-Agent Framework Parser.
 *
 * Supports CrewAI multi-agent configurations:
 * - Envelope: { crew: { name?, agents: [...], tasks: [...], process: "sequential" | "hierarchical", manager_llm? } }
 *   or { name?, agents: [...], tasks: [...], process?: "sequential" | "hierarchical" }
 * - Agent schema: { name, role, goal, backstory, tools?, llm?, verbose?, allow_delegation?, memory?, max_iter? }
 * - Task schema: { name, description, expected_output, agent?, tools?, async_execution?, context? }
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

// ─── CrewAI Schema Types ─────────────────────────────────────────────────────
interface CrewAiTool {
  name?: string;
  description?: string;
  func?: unknown;
  api_key?: string;
  [key: string]: unknown;
}

interface CrewAiAgent {
  name?: string;
  role?: string;
  goal?: string;
  backstory?: string;
  llm?: string | Record<string, unknown>;
  tools?: Array<string | CrewAiTool>;
  allow_delegation?: boolean;
  verbose?: boolean;
  memory?: boolean;
  max_iter?: number;
  max_rpm?: number;
  [key: string]: unknown;
}

interface CrewAiTask {
  name?: string;
  description?: string;
  expected_output?: string;
  agent?: string | CrewAiAgent;
  tools?: Array<string | CrewAiTool>;
  async_execution?: boolean;
  context?: Array<string | CrewAiTask>;
  output_json?: unknown;
  output_pydantic?: unknown;
  [key: string]: unknown;
}

interface CrewAiConfig {
  name?: string;
  description?: string;
  process?: "sequential" | "hierarchical" | string;
  manager_llm?: string | Record<string, unknown>;
  manager_agent?: CrewAiAgent | string;
  memory?: boolean;
  verbose?: boolean;
  max_rpm?: number;
  agents?: CrewAiAgent[];
  tasks?: CrewAiTask[];
  crew?: {
    name?: string;
    description?: string;
    process?: "sequential" | "hierarchical" | string;
    manager_llm?: string | Record<string, unknown>;
    manager_agent?: CrewAiAgent | string;
    memory?: boolean;
    verbose?: boolean;
    max_rpm?: number;
    agents?: CrewAiAgent[];
    tasks?: CrewAiTask[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function extractToolName(tool: string | CrewAiTool, index: number): string {
  if (typeof tool === "string") return tool;
  if (tool && typeof tool === "object") {
    return tool.name ?? `Tool_${index + 1}`;
  }
  return `Tool_${index + 1}`;
}

function resolveModelString(llm: unknown): string {
  if (typeof llm === "string") return llm;
  if (llm && typeof llm === "object") {
    const obj = llm as Record<string, unknown>;
    return String(obj.model ?? obj.model_name ?? obj.name ?? "gpt-4o");
  }
  return "gpt-4o";
}

export class CrewAiParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;

    // Explicit tag
    if (obj.platform === "CREWAI" || obj.platform === "crewai") return true;

    // Reject other known platforms
    if (obj.connections && typeof obj.connections === "object") return false;
    if (Array.isArray(obj.flow)) return false;
    if (obj.app && obj.workflow) return false;

    // Check crew envelope
    if (obj.crew && typeof obj.crew === "object") {
      const crew = obj.crew as Record<string, unknown>;
      if (Array.isArray(crew.agents) || Array.isArray(crew.tasks)) {
        return true;
      }
    }

    // Check root agents & tasks
    if (Array.isArray(obj.agents) && Array.isArray(obj.tasks)) {
      return true;
    }

    // Check agent role/goal/backstory characteristics
    if (Array.isArray(obj.agents) && obj.agents.length > 0) {
      const first = obj.agents[0];
      if (first && typeof first === "object") {
        const a = first as Record<string, unknown>;
        if (a.role !== undefined && (a.goal !== undefined || a.backstory !== undefined)) {
          return true;
        }
      }
    }

    // Check tasks expected_output
    if (Array.isArray(obj.tasks) && obj.tasks.length > 0) {
      const first = obj.tasks[0];
      if (first && typeof first === "object") {
        const t = first as Record<string, unknown>;
        if (t.expected_output !== undefined || (t.description !== undefined && t.agent !== undefined)) {
          return true;
        }
      }
    }

    return false;
  }

  parse(json: unknown): ParsedWorkflow {
    const doc = (json && typeof json === "object") ? (json as CrewAiConfig) : {};
    const crewConfig = (doc.crew && typeof doc.crew === "object") ? doc.crew : doc;

    const rawAgents: CrewAiAgent[] = (Array.isArray(crewConfig?.agents)
      ? crewConfig.agents
      : []).filter((a): a is CrewAiAgent => Boolean(a && typeof a === "object"));
    const rawTasks: CrewAiTask[] = (Array.isArray(crewConfig?.tasks)
      ? crewConfig.tasks
      : []).filter((t): t is CrewAiTask => Boolean(t && typeof t === "object"));

    const isHierarchical =
      crewConfig.process === "hierarchical" ||
      crewConfig.manager_llm !== undefined ||
      crewConfig.manager_agent !== undefined;

    const nodes: NormalNode[] = [];
    const edges: NormalEdge[] = [];
    const toolSet = new Set<string>();

    // 1. Hierarchical Manager Node (if applicable)
    let managerId: string | null = null;
    if (isHierarchical) {
      managerId = "node_manager_crew";
      const managerModel = resolveModelString(
        crewConfig.manager_llm ??
        (typeof crewConfig.manager_agent === "object" ? crewConfig.manager_agent?.llm : null) ??
        "gpt-4o"
      );

      nodes.push({
        id: managerId,
        name:
          typeof crewConfig.manager_agent === "object"
            ? (crewConfig.manager_agent?.name ?? "Hierarchical Crew Manager")
            : "Hierarchical Crew Manager",
        type: "crewai.manager",
        disabled: false,
        position: [100, 100],
        parameters: {
          process: "hierarchical",
          manager_llm: crewConfig.manager_llm,
          manager_agent: crewConfig.manager_agent,
        },
        credentials: {},
        isTrigger: true,
        isHttp: false,
        isCode: false,
        isAi: true,
        isLoop: false,
        isBranch: true,
        isDelay: false,
        isAuthenticated: false,
        aiMeta: {
          model: managerModel,
          maxIterations: crewConfig.max_rpm ?? 25,
          hasStructuredOutput: false,
        },
      });
    }

    // 2. Agent Nodes
    const agentIdMap = new Map<string, string>(); // name/role -> node ID
    rawAgents.forEach((agent, index) => {
      const agentName = String(
        agent.name ?? agent.role ?? `Agent_${index + 1}`
      );
      const nodeId = `agent_${agentName.replace(/\s+/g, "_")}`;
      agentIdMap.set(agentName, nodeId);
      if (agent.role) agentIdMap.set(agent.role, nodeId);

      const agentModel = resolveModelString(agent.llm);
      const credentials: Record<string, unknown> = {};

      // Scan agent for API credentials
      if (agent.llm && typeof agent.llm === "object") {
        const llmObj = agent.llm as Record<string, unknown>;
        if (llmObj.api_key || llmObj.apiKey) {
          credentials.apiKey = llmObj.api_key ?? llmObj.apiKey;
        }
      }

      nodes.push({
        id: nodeId,
        name: agent.role ? `${agentName} (${agent.role})` : agentName,
        type: "crewai.agent",
        disabled: false,
        position: [300, 100 + index * 160],
        parameters: {
          name: agent.name,
          role: agent.role,
          goal: agent.goal,
          backstory: agent.backstory,
          llm: agent.llm,
          allow_delegation: agent.allow_delegation,
          max_iter: agent.max_iter,
          memory: agent.memory,
          verbose: agent.verbose,
        },
        credentials,
        isTrigger: !isHierarchical && index === 0 && rawTasks.length === 0,
        isHttp: false,
        isCode: false,
        isAi: true,
        isLoop: false,
        isBranch: agent.allow_delegation === true,
        isDelay: false,
        isAuthenticated: Object.keys(credentials).length > 0,
        aiMeta: {
          model: agentModel,
          maxIterations: agent.max_iter ?? 25,
          hasStructuredOutput: false,
        },
      });

      // Manager -> Agent delegation edge
      if (managerId) {
        edges.push({
          source: managerId,
          target: nodeId,
          type: "delegation",
          sourceHandle: "delegation",
        });
      }

      // Collect Agent Tools
      if (Array.isArray(agent.tools)) {
        agent.tools.filter((t): t is NonNullable<typeof t> => Boolean(t)).forEach((t, tIdx) => {
          const toolName = extractToolName(t, tIdx);
          toolSet.add(toolName);
          const toolNodeId = `tool_${toolName.replace(/\s+/g, "_")}`;
          edges.push({
            source: nodeId,
            target: toolNodeId,
            type: "tool_use",
            sourceHandle: "tool",
          });
        });
      }
    });

    // 3. Task Nodes
    const taskIdMap = new Map<string, string>(); // task name/desc -> node ID
    rawTasks.forEach((task, index) => {
      const taskName = String(
        task.name ??
        (task.description ? task.description.slice(0, 30) : `Task_${index + 1}`)
      );
      const taskId = `task_${taskName.replace(/\s+/g, "_")}`;
      taskIdMap.set(taskName, taskId);
      if (task.name) taskIdMap.set(task.name, taskId);

      const isFirstTask = !isHierarchical && index === 0;
      const assignedAgentName =
        typeof task.agent === "string"
          ? task.agent
          : typeof task.agent === "object" && task.agent !== null
          ? (task.agent.name ?? task.agent.role)
          : null;

      const hasStructured =
        task.output_json !== undefined ||
        task.output_pydantic !== undefined ||
        (task.expected_output ? String(task.expected_output).toLowerCase().includes("json") : false);

      nodes.push({
        id: taskId,
        name: taskName,
        type: "crewai.task",
        disabled: false,
        position: [600, 100 + index * 160],
        parameters: {
          name: task.name,
          description: task.description,
          expected_output: task.expected_output,
          agent: assignedAgentName,
          async_execution: task.async_execution,
          context: task.context,
        },
        credentials: {},
        isTrigger: isFirstTask,
        isHttp: false,
        isCode: false,
        isAi: true,
        isLoop: false,
        isBranch: false,
        isDelay: false,
        isAuthenticated: false,
        aiMeta: {
          model: "gpt-4o",
          hasStructuredOutput: hasStructured,
        },
      });

      // Edge from Assigned Agent -> Task
      if (assignedAgentName) {
        const agentNodeId =
          agentIdMap.get(assignedAgentName) ??
          `agent_${assignedAgentName.replace(/\s+/g, "_")}`;
        edges.push({
          source: agentNodeId,
          target: taskId,
          type: "assigned_to",
          sourceHandle: "task_assignment",
        });
      }

      // Context Task Dependencies
      if (Array.isArray(task.context)) {
        task.context.filter((ctx): ctx is NonNullable<typeof ctx> => Boolean(ctx)).forEach((ctx) => {
          const ctxName = typeof ctx === "string" ? ctx : (ctx.name ?? "");
          const ctxNodeId =
            taskIdMap.get(ctxName) ?? `task_${ctxName.replace(/\s+/g, "_")}`;
          edges.push({
            source: ctxNodeId,
            target: taskId,
            type: "context_dependency",
            sourceHandle: "context",
          });
        });
      } else if (!isHierarchical && index > 0) {
        // Sequential fallback edge: Task[i-1] -> Task[i]
        const prevTask = rawTasks[index - 1];
        if (prevTask) {
          const prevTaskName = String(
            prevTask.name ??
            (prevTask.description ? prevTask.description.slice(0, 30) : `Task_${index}`)
          );
          const prevTaskId = `task_${prevTaskName.replace(/\s+/g, "_")}`;
          edges.push({
            source: prevTaskId,
            target: taskId,
            type: "sequence",
            sourceHandle: "main",
          });
        }
      }

      // Collect Task Tools
      if (Array.isArray(task.tools)) {
        task.tools.filter((t): t is NonNullable<typeof t> => Boolean(t)).forEach((t, tIdx) => {
          const toolName = extractToolName(t, tIdx);
          toolSet.add(toolName);
          const toolNodeId = `tool_${toolName.replace(/\s+/g, "_")}`;
          edges.push({
            source: taskId,
            target: toolNodeId,
            type: "tool_use",
            sourceHandle: "tool",
          });
        });
      }
    });

    // 4. Tool Nodes
    let toolIndex = 0;
    for (const toolName of toolSet) {
      const toolNodeId = `tool_${toolName.replace(/\s+/g, "_")}`;
      const lower = toolName.toLowerCase();
      const isCode = lower.includes("python") || lower.includes("code") || lower.includes("calculator");

      nodes.push({
        id: toolNodeId,
        name: toolName,
        type: "crewai.tool",
        disabled: false,
        position: [900, 100 + toolIndex * 120],
        parameters: { toolName },
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
      toolIndex++;
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
      { name: "CrewAI Multi-Agent Core", category: "AI", isAi: true, vendorType: "core" },
    ];
    for (const tool of toolSet) {
      integrations.push({
        name: tool,
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
      crewConfig.name ??
      doc.name ??
      "CrewAI Multi-Agent System";

    return {
      name: workflowName,
      rawWorkflowName: workflowName,
      description: crewConfig.description ?? doc.description,
      platformVersion: "0.1.0",
      metadata: {
        process: crewConfig.process ?? "sequential",
        isHierarchical,
        agentCount: rawAgents.length,
        taskCount: rawTasks.length,
        memory: crewConfig.memory ?? false,
      },
      platform: "CREWAI",
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
      hasBranches: branchNodes.length > 0 || isHierarchical,
      hasLoops: loopNodes.length > 0,
      branchCount: branchNodes.length,
      loopCount: loopNodes.length,
      extractedSecretsCount: secretCount,
      rawNodes: [...rawAgents, ...rawTasks],
      rawConnections,
    };
  }
}
