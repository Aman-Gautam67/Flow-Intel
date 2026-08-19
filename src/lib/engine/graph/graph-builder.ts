/**
 * FlowIntel Pre-Processing Graph Builder
 * ─────────────────────────────────────────────────────────────────────────────
 * Connection graph analysis module. Builds node adjacency maps, computes
 * in-degree and out-degree metrics, and identifies structural fan-out splitters.
 */

import type { NormalNode, NormalEdge } from "@/types";

export interface GraphNodeMetrics {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  inDegree: number;
  outDegree: number;
  incomingNodes: string[];
  outgoingNodes: string[];
  isFanOutSplitter: boolean;
}

export type ConnectionGraph = Record<string, GraphNodeMetrics>;

export function buildConnectionGraph(
  rawConnections: Record<string, unknown> | null | undefined,
  astNodes: NormalNode[] = [],
  astEdges: NormalEdge[] = []
): ConnectionGraph {
  const nodeMap = new Map<
    string,
    {
      id: string;
      name: string;
      type: string;
      incomingNodes: Set<string>;
      outgoingNodes: Set<string>;
    }
  >();

  // Helper to get or create node entry
  const getOrCreate = (key: string, defaultType = "unknown") => {
    if (!nodeMap.has(key)) {
      nodeMap.set(key, {
        id: key,
        name: key,
        type: defaultType,
        incomingNodes: new Set(),
        outgoingNodes: new Set(),
      });
    }
    return nodeMap.get(key)!;
  };

  // 1. Register all known nodes from AST
  for (const n of astNodes) {
    if (n.id) {
      const entry = getOrCreate(n.id, n.type);
      entry.name = n.name || n.id;
    }
    if (n.name && n.name !== n.id) {
      const entry = getOrCreate(n.name, n.type);
      entry.id = n.id || n.name;
    }
  }

  // 2. Parse N8N raw connections object if provided
  const connections = (rawConnections && typeof rawConnections === "object" ? rawConnections : {}) as Record<string, unknown>;

  for (const [sourceName, outputs] of Object.entries(connections)) {
    const sourceEntry = getOrCreate(sourceName);

    if (outputs && typeof outputs === "object") {
      for (const mainBranches of Object.values(outputs as Record<string, unknown>)) {
        if (!Array.isArray(mainBranches)) continue;
        for (const branch of mainBranches) {
          if (!Array.isArray(branch)) continue;
          for (const conn of branch) {
            if (!conn || typeof conn !== "object") continue;
            const targetName = (conn as any).node;
            if (!targetName || typeof targetName !== "string") continue;

            const targetEntry = getOrCreate(targetName);
            sourceEntry.outgoingNodes.add(targetName);
            targetEntry.incomingNodes.add(sourceName);
          }
        }
      }
    }
  }

  // 3. Fallback/Augment from AST Edges if rawConnections did not yield connections
  if (Array.isArray(astEdges)) {
    for (const edge of astEdges) {
      if (!edge.source || !edge.target) continue;
      const srcEntry = getOrCreate(edge.source);
      const tgtEntry = getOrCreate(edge.target);
      srcEntry.outgoingNodes.add(edge.target);
      tgtEntry.incomingNodes.add(edge.source);
    }
  }

  // 4. Compute final node metrics map
  const graphMap: ConnectionGraph = {};
  for (const [nameOrId, data] of nodeMap.entries()) {
    const inDegree = data.incomingNodes.size;
    const outDegree = data.outgoingNodes.size;
    const isSplitter = outDegree > 3;

    const metrics: GraphNodeMetrics = {
      nodeId: data.id,
      nodeName: data.name,
      nodeType: data.type,
      inDegree,
      outDegree,
      incomingNodes: Array.from(data.incomingNodes),
      outgoingNodes: Array.from(data.outgoingNodes),
      isFanOutSplitter: isSplitter,
    };

    graphMap[nameOrId] = metrics;
  }

  return graphMap;
}
