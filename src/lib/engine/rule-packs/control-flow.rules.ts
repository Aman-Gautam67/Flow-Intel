/**
 * FlowIntel Rule Pack — CONTROL FLOW
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCH-CF-001  Unreachable node (BFS from triggers)
 * ARCH-CF-002  Merge expectedInputs > reachable inbound edges
 *
 * Fixes the false-negative where nodes with *outgoing* edges but no path from
 * any trigger were treated as connected (PharmaColdChain dead action branches).
 */

import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

const MERGE_TYPES = new Set([
  "n8n-nodes-base.merge",
  "n8n-nodes-base.mergeNode",
]);

const TRIGGER_HINTS = ["trigger", "webhook", "cron", "interval", "manual"];

function isTrigger(node: ParsedWorkflow["nodes"][number]): boolean {
  if (node.isTrigger) return true;
  const type = node.type.toLowerCase();
  return type === "n8n-nodes-base.webhook" || TRIGGER_HINTS.some((h) => type.includes(h));
}

function makeFindingId(ruleId: string, nodeId: string, suffix?: string): string {
  return [ruleId, nodeId, suffix].filter(Boolean).join("-");
}

/** Build directed adjacency from AST edges (source name → target names). */
function buildAdj(ast: ParsedWorkflow): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of ast.edges) {
    const list = adj.get(e.source) ?? [];
    if (!list.includes(e.target)) list.push(e.target);
    adj.set(e.source, list);
  }
  return adj;
}

/** Raw inbound degree per node name. */
function buildInbound(ast: ParsedWorkflow): Map<string, number> {
  const inbound = new Map<string, number>();
  for (const e of ast.edges) {
    inbound.set(e.target, (inbound.get(e.target) ?? 0) + 1);
  }
  return inbound;
}

/**
 * BFS from every non-disabled trigger.
 * Disabled nodes may be visited but are never expanded (they wall the path).
 *
 * Different parsers use different keys in edges:
 *   n8n      → edge source/target = node.name   ("Webhook", "HTTP Request")
 *   Make     → edge source/target = node.id      ("1", "2")
 *   Zapier   → edge source/target = node.id      ("step-1", "step-2")
 *   Flowise  → edge source/target = node.id      ("chat-input", "llm-chain")
 *
 * To be key-convention-agnostic we seed from BOTH node.id AND node.name so
 * the BFS always finds neighbors regardless of which convention the parser used.
 */
function reachableFromTriggers(ast: ParsedWorkflow, adj: Map<string, string[]>): Set<string> {
  const disabledNames = new Set(ast.nodes.filter((n) => n.disabled).map((n) => n.name));
  const disabledIds   = new Set(ast.nodes.filter((n) => n.disabled).map((n) => n.id));

  const visited = new Set<string>();
  const queue: string[] = [];
  let head = 0;

  for (const node of ast.nodes) {
    if (!isTrigger(node) || disabledNames.has(node.name) || disabledIds.has(node.id)) continue;
    // Seed from both id and name — one will match the edge convention used by the parser
    for (const key of [node.id, node.name]) {
      if (!visited.has(key)) { visited.add(key); queue.push(key); }
    }
  }

  while (head < queue.length) {
    const current = queue[head++]!;
    if (disabledNames.has(current) || disabledIds.has(current)) continue;

    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
    }
  }

  return visited;
}

/** Count inbound edges whose source is itself reachable. */
function countReachableInbound(
  nodeName: string,
  ast: ParsedWorkflow,
  reachable: Set<string>
): number {
  let count = 0;
  for (const e of ast.edges) {
    if (e.target === nodeName && reachable.has(e.source)) count++;
  }
  return count;
}

export const CONTROL_FLOW_PACK: RulePackManifest = {
  id: "flowintel-core-control-flow",
  name: "FlowIntel Control-Flow Rules",
  version: "1.0.0",
  description:
    "Detects unreachable nodes via BFS from triggers and Merge expectedInputs mismatches.",
  rules: [
    {
      id: "ARCH-CF-001",
      name: "Unreachable Node",
      category: "MAINTAINABILITY",
      severity: "HIGH",
      description:
        "Node is not reachable from any trigger via BFS. Outgoing-only nodes are dead code.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/ARCH-CF-001",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const adj = buildAdj(ast);
        const inbound = buildInbound(ast);
        const reachable = reachableFromTriggers(ast, adj);

        for (const node of ast.nodes) {
          if (node.disabled || isTrigger(node)) continue;
          // Check both id and name — parsers use different edge key conventions
          if (reachable.has(node.id) || reachable.has(node.name)) continue;

          findings.push({
            id: makeFindingId("ARCH-CF-001", node.id),
            ruleId: "ARCH-CF-001",
            ruleName: "Unreachable Node",
            severity: "HIGH",
            category: "MAINTAINABILITY",
            location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
            evidence: {
              summary: "Not reachable from any trigger",
              detail: `Node "${node.name}" (${node.type}) has no path from a trigger. Raw inbound edges: ${inbound.get(node.name) ?? 0}. It will never execute under normal flow.`,
            },
            humanExplanation:
              "Unreachable nodes are dead branches — often left after incomplete wiring of Switch/IF outputs. They inflate the graph and hide real control-flow bugs.",
            suggestedFix: `Wire an upstream node into "${node.name}" from a trigger path, or delete the node.`,
            autoFix: {
              description: `Remove unreachable node "${node.name}"`,
              manualInstruction: `Select "${node.name}" and press Delete, or connect it to a reachable upstream node.`,
            },
            marketplaceBlocking: true,
            docReference: "https://flowintel.io/rules/ARCH-CF-001",
            penaltyPoints: 20,
          });
        }
        return findings;
      },
    },
    {
      id: "ARCH-CF-002",
      name: "Merge Input Mismatch",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description:
        "Merge.expectedInputs is higher than the number of reachable inbound edges — wait mode will hang or time out.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/ARCH-CF-002",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const adj = buildAdj(ast);
        const reachable = reachableFromTriggers(ast, adj);

        for (const node of ast.nodes) {
          if (!MERGE_TYPES.has(node.type) || node.disabled) continue;

          const params = node.parameters as Record<string, unknown> | undefined;
          const options = params?.options as Record<string, unknown> | undefined;
          const expected =
            typeof params?.expectedInputs === "number"
              ? params.expectedInputs
              : typeof options?.expectedInputs === "number"
                ? (options.expectedInputs as number)
                : 2;

          const actual = countReachableInbound(node.name, ast, reachable);
          if (actual >= expected) continue;

          findings.push({
            id: makeFindingId("ARCH-CF-002", node.id),
            ruleId: "ARCH-CF-002",
            ruleName: "Merge Input Mismatch",
            severity: "MEDIUM",
            category: "MAINTAINABILITY",
            location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
            evidence: {
              summary: `expectedInputs=${expected}, reachable inbound=${actual}`,
              detail: `"${node.name}" waits for ${expected} inputs but only ${actual} inbound edge(s) are reachable from a trigger.`,
            },
            humanExplanation:
              "A Merge in wait mode blocks until expectedInputs arrive. If dead branches inflate the count, the workflow hangs or times out in production.",
            suggestedFix: `Set expectedInputs to ${actual} on "${node.name}", or wire the missing upstream nodes into a trigger path.`,
            autoFix: {
              description: `Set expectedInputs to ${actual}`,
              manualInstruction: `Open "${node.name}" → Expected Inputs → set to ${actual}.`,
            },
            marketplaceBlocking: false,
            docReference: "https://flowintel.io/rules/ARCH-CF-002",
            penaltyPoints: 12,
          });
        }
        return findings;
      },
    },
  ],
};
