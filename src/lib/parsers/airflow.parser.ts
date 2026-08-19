/**
 * Apache Airflow DAG parser.
 *
 * Supports two common shapes:
 *  A. Airflow REST API /dags/{dag_id} response:
 *       { dag_id, tasks: [{ task_id, task_type, downstream_task_ids[] }] }
 *  B. Airflow serialized DAG export:
 *       { dag: { _dag_id, tasks: [...] } }
 *
 * Maps to the universal NormalNode shape so existing platform-agnostic rules
 * (PRV-017 word-boundary, SEC code-snippet checks, etc.) can analyse Python DAGs.
 */
import type { IWorkflowParser, ParsedWorkflow, NormalNode, NormalEdge } from "@/types";
import { flattenParams } from "./normalise";

interface AirflowTask {
  task_id?:            string;
  task_type?:          string;
  operator?:           string;          // older serialization format
  downstream_task_ids?: string[];
  params?:             Record<string, unknown>;
  op_kwargs?:          Record<string, unknown>;
  op_args?:            unknown[];
  doc?:                string;
  doc_md?:             string;
}

interface AirflowDagRoot {
  dag_id?:   string;
  dag?:      { _dag_id?: string; tasks?: AirflowTask[] };
  tasks?:    AirflowTask[];
  schedule_interval?: unknown;
  description?: string;
}

const CODE_OPERATORS = new Set([
  "PythonOperator", "PythonVirtualenvOperator", "BashOperator",
  "DockerOperator", "KubernetesPodOperator",
]);

const HTTP_OPERATORS = new Set([
  "HttpOperator", "SimpleHttpOperator", "HttpSensor",
]);

const AI_OPERATORS = new Set([
  "OpenAIPipelineOperator", "BedrockInvokeModelOperator",
  "VertexAIOperator", "SageMakerOperator",
]);

function toNormalNode(task: AirflowTask, idx: number): NormalNode {
  const safeTask = (task && typeof task === "object") ? task : ({} as AirflowTask);
  const opType = String(safeTask.task_type ?? safeTask.operator ?? "PythonOperator");
  const params: Record<string, unknown> = {
    ...(safeTask.params ?? {}),
    ...(safeTask.op_kwargs ?? {}),
    ...(safeTask.op_args ? { op_args: safeTask.op_args } : {}),
  };
  const isCode = CODE_OPERATORS.has(opType);
  const isHttp = HTTP_OPERATORS.has(opType);
  const isAi   = AI_OPERATORS.has(opType);

  return {
    id:          String(safeTask.task_id ?? `task-${idx}`),
    name:        String(safeTask.task_id ?? `Task ${idx}`),
    type:        opType,
    typeVersion: 1,
    disabled:    false,
    position:    [200 + idx * 220, 300],
    parameters:  params,
    credentials: {},
    isTrigger:   (Array.isArray(safeTask.downstream_task_ids) ? safeTask.downstream_task_ids.length === 0 : idx === 0) && opType.toLowerCase().includes("sensor"),
    isHttp,
    isCode,
    isAi,
    isLoop:      false,
    isBranch:    opType === "BranchPythonOperator" || opType === "BranchDayOfWeekOperator",
    isDelay:     opType === "TimeSensor" || opType === "DateTimeSensor",
    isAuthenticated: false,
    ...(isCode ? { codeMeta: { codeSnippet: String(params.python_callable ?? params.bash_command ?? ""), language: opType === "BashOperator" ? "other" : "python" as const } } : {}),
    ...(isHttp  ? { httpMeta: { url: String(params.endpoint ?? params.http_conn_id ?? ""), method: String(params.method ?? "GET") } } : {}),
  };
}

export class AirflowParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;
    // Shape A: direct dag_id + tasks
    if (typeof obj.dag_id === "string" && Array.isArray(obj.tasks)) return true;
    // Shape B: nested dag object
    if (obj.dag && typeof obj.dag === "object") {
      const dag = obj.dag as Record<string, unknown>;
      if (dag._dag_id || Array.isArray(dag.tasks)) return true;
    }
    return false;
  }

  parse(json: unknown): ParsedWorkflow {
    const root = (json && typeof json === "object") ? (json as AirflowDagRoot) : {};
    // Normalise shape B into shape A
    const dagId    = String(root.dag_id ?? root.dag?._dag_id ?? "unnamed_dag");
    const rawTasks: AirflowTask[] = (root.tasks ?? root.dag?.tasks ?? []).filter(
      (t): t is AirflowTask => Boolean(t && typeof t === "object")
    );

    const nodes   = rawTasks.map(toNormalNode);
    const edges: NormalEdge[] = [];
    for (const task of rawTasks) {
      for (const downstream of task.downstream_task_ids ?? []) {
        if (downstream !== null && downstream !== undefined) {
          edges.push({ source: String(task.task_id ?? ""), target: String(downstream), type: "main" });
        }
      }
    }

    const extractedParameters = rawTasks.flatMap((t, i) =>
      flattenParams(String(t.task_id ?? `task-${i}`), { ...(t.params ?? {}), ...(t.op_kwargs ?? {}) })
    );

    return {
      name:             dagId,
      rawWorkflowName:  dagId,
      platform:         "AIRFLOW",
      platformVersion:  String((root as Record<string, unknown>).dag_version ?? ""),
      description:      (root as Record<string, unknown>).description as string | undefined,
      metadata:         { schedule_interval: root.schedule_interval ?? null },
      nodeCount:        nodes.length,
      connectionCount:  edges.length,
      nodes,
      edges,
      extractedParameters,
      triggerNodes:     nodes.filter((n) => n.isTrigger).map((n) => ({
        id: n.id, name: n.name, type: n.type, isAuthenticated: n.isAuthenticated ?? false,
      })),
      integrations: [],
      httpNodesCount:   nodes.filter((n) => n.isHttp).length,
      codeNodesCount:   nodes.filter((n) => n.isCode).length,
      aiNodesCount:     nodes.filter((n) => n.isAi).length,
      hasWebhooks:      false,
      hasSchedules:     !!root.schedule_interval,
      hasBranches:      nodes.some((n) => n.isBranch),
      hasLoops:         false,
      branchCount:      nodes.filter((n) => n.isBranch).length,
      loopCount:        0,
      extractedSecretsCount: 0,
      rawNodes:         rawTasks,
      rawConnections:   {},
    };
  }
}
