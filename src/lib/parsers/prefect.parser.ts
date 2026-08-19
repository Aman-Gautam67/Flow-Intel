/**
 * Prefect flow parser.
 *
 * Supports Prefect 2.x/3.x flow definition JSON shapes:
 *   { type: "flow", name, tasks: [{ slug, task_type, upstream_dependencies[] }] }
 *   { name, flow_run: { state, task_runs: [...] } }          // run-graph export
 *   { name, parameters, deployments: [...], tasks: [...] }   // deployment manifest
 *
 * Python tasks and shell tasks are mapped to code/http NormalNodes respectively.
 */
import type { IWorkflowParser, ParsedWorkflow, NormalNode, NormalEdge } from "@/types";
import { flattenParams } from "./normalise";

interface PrefectTask {
  slug?:                   string;
  name?:                   string;
  task_type?:              string;    // e.g. "prefect_dbt.core.tasks.run_dbt_model"
  upstream_dependencies?:  Array<{ id?: string; input_type?: string }>;
  parameters?:             Record<string, unknown>;
  tags?:                   string[];
}

interface PrefectFlowJson {
  type?:        string;  // "flow"
  name?:        string;
  tasks?:       PrefectTask[];
  task_runs?:   PrefectTask[];
  flow_run?:    { task_runs?: PrefectTask[] };
  parameters?:  Record<string, unknown>;
  description?: string;
  version?:     string;
}

const HTTP_TASK_PREFIXES  = ["prefect_http", "requests", "httpx", "aiohttp"];
const AI_TASK_PREFIXES    = ["prefect_openai", "prefect_anthropic", "prefect_bedrock", "langchain"];
const SHELL_TASK_TYPES    = ["prefect.tasks.shell.ShellTask", "prefect_shell", "bash_task"];

function toNormalNode(task: PrefectTask, idx: number): NormalNode {
  const safeTask = (task && typeof task === "object") ? task : ({} as PrefectTask);
  const taskType = String(safeTask.task_type ?? "python_task");
  const lower    = taskType.toLowerCase();
  const isHttp   = HTTP_TASK_PREFIXES.some((p) => lower.includes(p));
  const isAi     = AI_TASK_PREFIXES.some((p) => lower.includes(p));
  const isShell  = SHELL_TASK_TYPES.some((p) => lower.includes(p));
  const isCode   = !isHttp && !isAi;

  const params   = (safeTask.parameters && typeof safeTask.parameters === "object") ? safeTask.parameters : {};

  return {
    id:          String(safeTask.slug ?? safeTask.name ?? `task-${idx}`),
    name:        String(safeTask.name ?? safeTask.slug ?? `Task ${idx}`),
    type:        taskType,
    typeVersion: 1,
    disabled:    false,
    position:    [200 + idx * 220, 300],
    parameters:  params,
    credentials: {},
    isTrigger:   (safeTask.upstream_dependencies ?? []).length === 0 && idx === 0,
    isHttp,
    isCode,
    isAi,
    isLoop:      false,
    isBranch:    false,
    isDelay:     lower.includes("delay") || lower.includes("sleep"),
    isAuthenticated: false,
    ...(isCode ? { codeMeta: {
      codeSnippet: String(params.python_callable ?? params.command ?? ""),
      language: isShell ? "other" as const : "python" as const,
    } } : {}),
    ...(isHttp ? { httpMeta: {
      url:    String(params.url ?? params.endpoint ?? ""),
      method: String(params.method ?? "GET"),
    } } : {}),
  };
}

function normalizeTasks(flow: PrefectFlowJson): PrefectTask[] {
  if (Array.isArray(flow.tasks))                  return flow.tasks.filter((t): t is PrefectTask => Boolean(t && typeof t === "object"));
  if (Array.isArray(flow.task_runs))              return flow.task_runs.filter((t): t is PrefectTask => Boolean(t && typeof t === "object"));
  if (flow.flow_run && Array.isArray(flow.flow_run.task_runs)) return flow.flow_run.task_runs.filter((t): t is PrefectTask => Boolean(t && typeof t === "object"));
  return [];
}

export class PrefectParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;
    // type: "flow" is the clearest signal
    if (obj.type === "flow") return true;
    // Prefect flow_run export
    if (obj.flow_run && typeof obj.flow_run === "object") return true;
    // Deployment manifest with tasks array containing slug/task_type fields
    if (Array.isArray(obj.tasks)) {
      const first = (obj.tasks as unknown[]).find((t) => Boolean(t && typeof t === "object")) as Record<string, unknown> | undefined;
      if (first) {
        if ("slug" in first || "task_type" in first || "upstream_dependencies" in first) return true;
      }
    }
    return false;
  }

  parse(json: unknown): ParsedWorkflow {
    const flow  = (json && typeof json === "object") ? (json as PrefectFlowJson) : {};
    const rawTasks = normalizeTasks(flow);
    const nodes = rawTasks.map(toNormalNode);

    const edges: NormalEdge[] = [];
    for (const task of rawTasks) {
      for (const dep of task.upstream_dependencies ?? []) {
        if (dep && dep.id) edges.push({ source: String(dep.id), target: String(task.slug ?? task.name ?? ""), type: "main" });
      }
    }

    const extractedParameters = rawTasks.flatMap((t, i) =>
      flattenParams(String(t.slug ?? t.name ?? `task-${i}`), (t.parameters && typeof t.parameters === "object" ? t.parameters : {}))
    );

    const name = flow.name ?? "Untitled Prefect Flow";
    return {
      name,
      rawWorkflowName: name,
      platform:        "PREFECT",
      platformVersion: flow.version ?? "",
      description:     flow.description,
      metadata:        { parameters: flow.parameters ?? null },
      nodeCount:       nodes.length,
      connectionCount: edges.length,
      nodes,
      edges,
      extractedParameters,
      triggerNodes:    nodes.filter((n) => n.isTrigger).map((n) => ({
        id: n.id, name: n.name, type: n.type, isAuthenticated: false,
      })),
      integrations:      [],
      httpNodesCount:    nodes.filter((n) => n.isHttp).length,
      codeNodesCount:    nodes.filter((n) => n.isCode).length,
      aiNodesCount:      nodes.filter((n) => n.isAi).length,
      hasWebhooks:       false,
      hasSchedules:      false,
      hasBranches:       false,
      hasLoops:          false,
      branchCount:       0,
      loopCount:         0,
      extractedSecretsCount: 0,
      rawNodes:          rawTasks,
      rawConnections:    {},
    };
  }
}
