/**
 * Generic DAG/workflow parser — last-resort fallback.
 *
 * Accepts any JSON that looks like a directed-acyclic-graph:
 *   { nodes/tasks/steps/jobs: [...] } with items having id/name/type fields.
 *
 * Edges are inferred from: depends_on[], dependencies[], upstream[], next[],
 * downstream_task_ids[], connections{}, or linear order as a last resort.
 *
 * This enables FlowIntel to analyse custom pipeline formats, unknown automation
 * tools, and future platforms without a dedicated parser.
 */
import type { IWorkflowParser, ParsedWorkflow, NormalNode, NormalEdge } from "@/types";
import { flattenParams } from "./normalise";

type RawItem = Record<string, unknown>;

// Keys that may hold the node/task array
const NODE_ARRAY_KEYS = [
  "nodes", "tasks", "steps", "jobs", "actions", "stages",
  "pipeline", "pipelines", "workflow", "workflows", "dag", "dags",
];
// Keys that declare upstream dependencies (dependency -> current)
const UPSTREAM_DEP_KEYS = [
  "depends_on", "dependencies", "upstream", "upstream_task_ids", "after", "requires",
];
// Keys that declare downstream targets (current -> target)
const DOWNSTREAM_DEP_KEYS = [
  "downstream_task_ids", "next",
];

function findNodeArray(obj: Record<string, unknown>): RawItem[] | null {
  if (!obj || typeof obj !== "object") return null;
  for (const key of NODE_ARRAY_KEYS) {
    if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0) {
      const arr = (obj[key] as unknown[]).filter(
        (x): x is Record<string, unknown> => Boolean(x && typeof x === "object")
      );
      if (arr.length === 0) continue;
      // Confirm items look like nodes (have at least one of id/name/type/task_id) or are inside a dedicated pipeline/dag/tasks key
      const first = arr[0];
      if (first && ("id" in first || "name" in first || "type" in first || "task_id" in first || "step" in first || "action" in first || "label" in first || ["pipeline", "pipelines", "workflow", "workflows", "dag", "dags", "tasks", "steps", "jobs", "actions", "stages"].includes(key))) {
        return arr;
      }
    }
  }
  return null;
}

function itemId(item: RawItem, idx: number): string {
  return String(item.id ?? item.task_id ?? item.name ?? item.slug ?? `node-${idx}`);
}

function itemName(item: RawItem, idx: number): string {
  return String(item.name ?? item.label ?? item.task_id ?? `Node ${idx}`);
}

function itemType(item: RawItem): string {
  return String(item.type ?? item.task_type ?? item.operator ?? item.kind ?? "generic_task");
}

function itemParams(item: RawItem): Record<string, unknown> {
  const p = item.parameters ?? item.params ?? item.config ?? item.options ?? item.kwargs ?? {};
  return (p && typeof p === "object" && !Array.isArray(p)) ? p as Record<string, unknown> : {};
}

function buildEdges(items: RawItem[], idxMap: Map<string, string>): NormalEdge[] {
  const edges: NormalEdge[] = [];
  const addedSet = new Set<string>();

  // Check if any explicit dependency is declared anywhere in the workflow
  let hasAnyExplicitDeps = false;
  for (const item of items) {
    for (const depKey of [...UPSTREAM_DEP_KEYS, ...DOWNSTREAM_DEP_KEYS]) {
      const deps = item[depKey];
      if (Array.isArray(deps) && deps.length > 0) {
        hasAnyExplicitDeps = true;
        break;
      }
    }
    if (hasAnyExplicitDeps) break;
  }

  if (hasAnyExplicitDeps) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const currentId = idxMap.get(String(i))!;

      // Upstream dependencies: dependency runs first, edge is upstream -> current
      for (const depKey of UPSTREAM_DEP_KEYS) {
        const deps = item[depKey];
        if (Array.isArray(deps)) {
          for (const d of deps) {
            if (d !== null && d !== undefined) {
              const upstreamId = String(d);
              const edgeKey = `${upstreamId}→${currentId}`;
              if (!addedSet.has(edgeKey)) {
                edges.push({ source: upstreamId, target: currentId, type: "main" });
                addedSet.add(edgeKey);
              }
            }
          }
        }
      }

      // Downstream dependencies: current runs first, edge is current -> downstream
      for (const depKey of DOWNSTREAM_DEP_KEYS) {
        const deps = item[depKey];
        if (Array.isArray(deps)) {
          for (const d of deps) {
            if (d !== null && d !== undefined) {
              const downstreamId = String(d);
              const edgeKey = `${currentId}→${downstreamId}`;
              if (!addedSet.has(edgeKey)) {
                edges.push({ source: currentId, target: downstreamId, type: "main" });
                addedSet.add(edgeKey);
              }
            }
          }
        }
      }
    }
  } else {
    // Linear chain fallback only when NO explicit dependencies are declared in the workflow
    for (let i = 0; i < items.length - 1; i++) {
      const srcId = idxMap.get(String(i))!;
      const nextId = idxMap.get(String(i + 1))!;
      const edgeKey = `${srcId}→${nextId}`;
      if (!addedSet.has(edgeKey)) {
        edges.push({ source: srcId, target: nextId, type: "main" });
        addedSet.add(edgeKey);
      }
    }
  }

  return edges;
}

const HTTP_TYPE_HINTS = /http|request|api|fetch|curl|webhook|rest/i;
const CODE_TYPE_HINTS = /python|bash|shell|script|lambda|function|code|exec/i;
const AI_TYPE_HINTS   = /openai|anthropic|llm|gpt|claude|bedrock|gemini|vertex|langchain|ai_/i;

export class GenericParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    return findNodeArray(json as Record<string, unknown>) !== null;
  }

  parse(json: unknown): ParsedWorkflow {
    const obj   = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
    const items = (findNodeArray(obj) ?? []).filter(
      (x): x is Record<string, unknown> => Boolean(x && typeof x === "object")
    );

    // Build id map: index → canonical id string
    const idxMap = new Map<string, string>();
    items.forEach((item, i) => idxMap.set(String(i), itemId(item, i)));

    const nodes: NormalNode[] = items.map((item, idx) => {
      const type   = itemType(item);
      const params = itemParams(item);
      const isHttp = HTTP_TYPE_HINTS.test(type);
      const isAi   = AI_TYPE_HINTS.test(type);
      const isCode = !isHttp && !isAi && CODE_TYPE_HINTS.test(type);

      return {
        id:          itemId(item, idx),
        name:        itemName(item, idx),
        type,
        typeVersion: 1,
        disabled:    item.disabled === true,
        position:    [200 + idx * 220, 300],
        parameters:  params,
        credentials: {},
        isTrigger:   (item.is_trigger === true || item.trigger === true ||
                      type.toLowerCase().includes("trigger") || type.toLowerCase().includes("sensor")),
        isHttp,
        isCode,
        isAi,
        isLoop:      type.toLowerCase().includes("loop") || type.toLowerCase().includes("foreach"),
        isBranch:    type.toLowerCase().includes("branch") || type.toLowerCase().includes("switch"),
        isDelay:     type.toLowerCase().includes("delay") || type.toLowerCase().includes("sleep"),
        isAuthenticated: !!(item.credentials || item.auth || item.authentication),
        ...(isCode ? { codeMeta: {
          codeSnippet: String(params.code ?? params.script ?? params.command ?? ""),
          language: type.toLowerCase().includes("python") ? "python" as const : "other" as const,
        } } : {}),
        ...(isHttp ? { httpMeta: {
          url:    String(params.url ?? params.endpoint ?? ""),
          method: String(params.method ?? "GET"),
        } } : {}),
      };
    });

    const edges = buildEdges(items, idxMap);
    const extractedParameters = items.flatMap((item, i) =>
      flattenParams(itemId(item, i), itemParams(item))
    );

    const name = String(
      obj.name ?? obj.title ?? obj.dag_id ?? obj.flow_id ?? obj.pipeline_name ?? "Untitled Workflow"
    );

    return {
      name,
      rawWorkflowName: name,
      platform:        "GENERIC",
      platformVersion: String(obj.version ?? obj.schema_version ?? ""),
      description:     (obj.description ?? obj.doc ?? "") as string,
      metadata:        { source: "generic-parser" },
      nodeCount:       nodes.length,
      connectionCount: edges.length,
      nodes,
      edges,
      extractedParameters,
      triggerNodes:    nodes.filter((n) => n.isTrigger).map((n) => ({
        id: n.id, name: n.name, type: n.type, isAuthenticated: n.isAuthenticated ?? false,
      })),
      integrations:      [],
      httpNodesCount:    nodes.filter((n) => n.isHttp).length,
      codeNodesCount:    nodes.filter((n) => n.isCode).length,
      aiNodesCount:      nodes.filter((n) => n.isAi).length,
      hasWebhooks:       nodes.some((n) => n.type.toLowerCase().includes("webhook")),
      hasSchedules:      nodes.some((n) => n.isTrigger && n.type.toLowerCase().includes("schedule")),
      hasBranches:       nodes.some((n) => n.isBranch),
      hasLoops:          nodes.some((n) => n.isLoop),
      branchCount:       nodes.filter((n) => n.isBranch).length,
      loopCount:         nodes.filter((n) => n.isLoop).length,
      extractedSecretsCount: 0,
      rawNodes:          items,
      rawConnections:    {},
    };
  }
}
