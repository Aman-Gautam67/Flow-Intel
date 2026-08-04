/**
 * FlowIntel QA — Platform Skeleton Builders
 * ─────────────────────────────────────────────────────────────────────────────
 * Each function returns a minimal valid workflow skeleton for the given
 * platform. The fixture generator splices flaw nodes into these skeletons.
 */

import type { Platform } from "./flaw-recipes";

// ─── n8n skeleton ─────────────────────────────────────────────────────────────
export function buildN8nSkeleton(name: string, nodes: unknown[], selfLoopNodeId?: string) {
  const typedNodes = nodes as Array<Record<string, unknown>>;

  // Build connections: linear chain from trigger → ... → last node
  const connections: Record<string, unknown> = {};
  for (let i = 0; i < typedNodes.length - 1; i++) {
    const src = typedNodes[i].name as string;
    const dst = typedNodes[i + 1].name as string;
    connections[src] = { main: [[{ node: dst, type: "main", index: 0 }]] };
  }

  // Inject self-loop for REL-011 test
  if (selfLoopNodeId) {
    const loopNode = typedNodes.find((n) => n.id === selfLoopNodeId);
    if (loopNode) {
      const nodeName = loopNode.name as string;
      connections[nodeName] = { main: [[{ node: nodeName, type: "main", index: 0 }]] };
    }
  }

  // Strip internal test flags before serializing
  const cleanNodes = typedNodes.map(({ _orphan, _selfLoop, _hasHttpChildInLoop, _noErrorTriggerWorkflow, ...rest }) => rest);

  return {
    name,
    nodes: cleanNodes,
    connections,
    settings: { executionOrder: "v1" },
    pinData: {},
    meta: { instanceId: "flowintel-qa" },
  };
}

// ─── Make (Integromat) skeleton ───────────────────────────────────────────────
export function buildMakeSkeleton(name: string, modules: unknown[]) {
  const typedMods = modules as Array<Record<string, unknown>>;
  return {
    name,
    flow: typedMods.map((mod, idx) => ({
      id: idx + 1,
      module: mod.type ?? "builtin:BasicFeeder",
      version: 1,
      parameters: (mod.parameters as Record<string, unknown>) ?? {},
      metadata: { designer: { x: 0, y: idx * 100 } },
    })),
    metadata: {
      instant: false,
      version: 1,
      scenario: { roundtrips: 1, maxErrors: 3, autoCommit: true, autoCommitTriggerLast: true },
      designer: { orphans: [] },
    },
  };
}

// ─── Zapier skeleton ──────────────────────────────────────────────────────────
export function buildZapierSkeleton(name: string, steps: unknown[]) {
  const typedSteps = steps as Array<Record<string, unknown>>;
  return {
    title: name,
    status: "off",
    steps: typedSteps.map((step, idx) => ({
      id: step.id ?? `step-${idx}`,
      type_of: idx === 0 ? "read" : "write",
      app_name: step.app ?? "code",
      params: (step.params as Record<string, unknown>) ?? {},
      selected_api: `${step.app ?? "code"}_v1`,
    })),
  };
}

// ─── Flowise skeleton ─────────────────────────────────────────────────────────
export function buildFlowiseSkeleton(name: string, nodes: unknown[]) {
  const typedNodes = nodes as Array<Record<string, unknown>>;
  const edges = typedNodes.slice(0, -1).map((n, i) => ({
    id: `e-${i}`,
    source: n.id as string,
    target: typedNodes[i + 1].id as string,
    type: "buttonedge",
  }));

  return {
    name,
    nodes: typedNodes.map((n, idx) => ({
      id: n.id as string,
      position: { x: 200 + idx * 250, y: 300 },
      type: n.type ?? "customNode",
      data: {
        id: n.id as string,
        label: n.name ?? `Node ${idx}`,
        name: n.type ?? "customNode",
        type: "Chain",
        ...(n.data as Record<string, unknown> ?? {}),
      },
    })),
    edges,
  };
}

export function buildSkeleton(platform: Platform, name: string, nodes: unknown[]): unknown {
  const selfLoopNodeId = (nodes as Array<Record<string, unknown>>)
    .find((n) => n._selfLoop)?.id as string | undefined;

  switch (platform) {
    case "n8n":    return buildN8nSkeleton(name, nodes, selfLoopNodeId);
    case "make":   return buildMakeSkeleton(name, nodes);
    case "zapier": return buildZapierSkeleton(name, nodes);
    case "flowise":return buildFlowiseSkeleton(name, nodes);
  }
}
