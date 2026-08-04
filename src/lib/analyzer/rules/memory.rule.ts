import type { AuditFlag, MemoryProfile, NormalNode, ParsedWorkflow } from "@/types";

const FILTER_NODE_TYPES = new Set([
  "n8n-nodes-base.set",
  "n8n-nodes-base.editFields",
  "n8n-nodes-base.itemLists",
  "n8n-nodes-base.filter",
  "n8n-nodes-base.if",
  "n8n-nodes-base.limit",
  // splitInBatches is intentionally NOT here — it limits execution batch size but does NOT
  // reduce the field count of each item, so payload accumulation can still occur inside the loop.
  // It lives in LOOP_NODE_TYPES below which triggers the accumulation check independently.
]);

const LOOP_NODE_TYPES = new Set([
  "n8n-nodes-base.splitInBatches",
  "n8n-nodes-base.loopNode",
]);

const CODE_NODE_TYPES = new Set([
  "n8n-nodes-base.code",
  "n8n-nodes-base.function",
  "n8n-nodes-base.functionItem",
]);

// High-cardinality array iteration patterns
// Require ≥2 distinct patterns to fire (reduces false positives on simple single-map transforms)
const ARRAY_ITER_PATTERNS = [
  /\.map\s*\(/,
  /\.reduce\s*\(/,
  /\.forEach\s*\(/,
  /\.flatMap\s*\(/,
  /for\s*\(.+of\s/,
  /for\s*\(\s*(?:let|var|const)\s+\w+\s*=\s*0/,
  /while\s*\(\s*(?!\s*false\s*\))/,  // while(...) but not while(false)
];

function estimateOutputKeys(node: NormalNode): number {
  const p = node.parameters as Record<string, unknown> | undefined;
  if (!p) return 3;
  // Set/EditFields: count explicit output keys
  const values = p.values as Array<unknown> | undefined;
  if (Array.isArray(values)) return Math.max(1, values.length);
  const fields = p.fields as Array<unknown> | undefined;
  if (Array.isArray(fields)) return Math.max(1, fields.length);
  // HTTP requests typically return 5–15 fields
  if (node.type === "n8n-nodes-base.httpRequest") return 8;
  return 3;
}

function estimateBatchSize(node: NormalNode): number {
  const p = node.parameters as Record<string, unknown> | undefined;
  if (!p) return 10;
  const bs = p.batchSize ?? p.limit ?? p.maxItems;
  const n = Number(bs);
  if (!isNaN(n) && n > 0) return n;
  return 10; // default estimate
}

// ─── Build a per-node adjacency map for main output only ─────────────────────
// Uses the nodeName → nextNodeName structure.
// FIX: Visited set is now LOCAL per chain-walk, not global.
// This prevents nodes that appear in multiple branches from being skipped
// prematurely, while still guarding against circular references.

function buildMainAdjacency(
  rawConnections: Record<string, unknown>
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const [src, outputs] of Object.entries(rawConnections)) {
    const connsObj = outputs as Record<string, unknown>;
    const mainOut = connsObj?.main;
    if (!Array.isArray(mainOut)) continue;
    const targets: string[] = [];
    for (const group of mainOut) {
      if (!Array.isArray(group)) continue;
      for (const t of group) {
        if (t && typeof t === "object" && "node" in t) {
          targets.push((t as { node: string }).node);
        }
      }
    }
    if (targets.length > 0) adj.set(src, targets);
  }
  return adj;
}

// ─── Chain walker (LOCAL visited set per walk) ────────────────────────────────
function walkChainForAccumulation(
  startName: string,
  nodeByName: Map<string, NormalNode>,
  adj: Map<string, string[]>,
  maxDepth = 30
): { hasAccumulation: boolean; chainLength: number; chainDesc: string } {
  const visited = new Set<string>(); // LOCAL — not shared across walks
  let cur = startName;
  const chain: string[] = [];
  let filterSeen = false;

  while (cur && !visited.has(cur) && chain.length < maxDepth) {
    visited.add(cur);
    const node = nodeByName.get(cur);
    if (!node) break;

    if (FILTER_NODE_TYPES.has(node.type)) {
      filterSeen = true;
      chain.length = 0; // Reset accumulation window after a filter
    } else {
      chain.push(cur);
    }

    // If a loop node is encountered WITHOUT a filter in the preceding chain, flag it
    if (LOOP_NODE_TYPES.has(node.type) && !filterSeen && chain.length > 3) {
      return {
        hasAccumulation: true,
        chainLength: chain.length,
        chainDesc: `${chain[0]} → ... → ${cur}`,
      };
    }

    // Linear chain accumulation: >5 non-filter nodes without any filter
    if (chain.length > 5 && !filterSeen) {
      return {
        hasAccumulation: true,
        chainLength: chain.length,
        chainDesc: `${chain[0]} → ... → ${chain[chain.length - 1]}`,
      };
    }

    const nexts = adj.get(cur) ?? [];
    // Follow the first main output only (linear chain detection)
    cur = nexts[0] ?? "";
  }

  return { hasAccumulation: false, chainLength: chain.length, chainDesc: "" };
}

export function runMemoryRules(parsed: ParsedWorkflow, rawConnections: Record<string, unknown>): { flags: AuditFlag[]; profile: MemoryProfile } {
  const flags: AuditFlag[] = [];
  const nodes = parsed.nodes;
  const connections = rawConnections as Record<string, unknown>;

  const nodeByName = new Map<string, NormalNode>(nodes.map((n) => [n.name, n]));
  const adj = buildMainAdjacency(connections);

  const accumulationChains: string[] = [];
  let payloadAccumulationRisk = false;
  let subprocessRisk = false;

  // ── Payload accumulation: walk from every trigger node ───────────────────
  // FIX: Walk from each trigger independently with its own visited set.
  const triggerNodes = nodes.filter(
    (n) => n.isTrigger
  );

  // If no trigger nodes identified, start from nodes with no incoming edges
  const nodesWithIncoming = new Set<string>();
  for (const targets of adj.values()) {
    for (const t of targets) nodesWithIncoming.add(t);
  }
  const startNodes =
    triggerNodes.length > 0
      ? triggerNodes
      : nodes.filter((n) => !nodesWithIncoming.has(n.name));

  // Deduplicate start points to avoid flagging same chain multiple times
  const flaggedChains = new Set<string>();

  for (const startNode of startNodes) {
    const { hasAccumulation, chainDesc } = walkChainForAccumulation(
      startNode.name,
      nodeByName,
      adj
    );
    if (hasAccumulation && !flaggedChains.has(chainDesc)) {
      flaggedChains.add(chainDesc);
      payloadAccumulationRisk = true;
      accumulationChains.push(chainDesc);
      flags.push({
        id: `MEM_ACCUM_${startNode.id}`,
        rule: "MEMORY_PAYLOAD_ACCUMULATION",
        severity: "WARNING",
        category: "MEMORY",
        title: "Potential payload accumulation",
        detail: `Chain "${chainDesc}" passes data through >5 nodes without an explicit filter/reduce step, risking memory bloat on large datasets.`,
        nodeName: startNode.name,
        ptsDeducted: 10,
        remediation: {
          description: "Insert an Edit Fields or Item Lists node to trim data before passing downstream.",
          n8nUiInstruction: "Add an 'Edit Fields' node after your data source to limit which fields propagate.",
        },
      });
    }
  }

  // ── Subprocess / code iteration risk ─────────────────────────────────────
  // FIX: Require ≥2 distinct iteration patterns to fire (avoids single .map() false positives)
  for (const node of nodes) {
    if (!CODE_NODE_TYPES.has(node.type)) continue;
    const codeStr = JSON.stringify(node.parameters ?? {});
    const matchedCount = ARRAY_ITER_PATTERNS.filter((p) => p.test(codeStr)).length;
    if (matchedCount >= 2) {
      subprocessRisk = true;
      flags.push({
        id: `MEM_SUBPROCESS_${node.id}`,
        rule: "MEMORY_SUBPROCESS_RISK",
        severity: "WARNING",
        category: "MEMORY",
        title: "High-cardinality array iteration in code node",
        detail: `Node "${node.name}" contains ${matchedCount} array iteration patterns. On unbounded inputs this risks excessive memory use or execution timeout.`,
        nodeName: node.name,
        nodeType: node.type,
        ptsDeducted: 10,
        remediation: {
          description: "Add input size guards before the code node.",
          n8nUiInstruction: `In "${node.name}", add: if (items.length > 1000) throw new Error('Input too large');`,
        },
      });
    }
  }

  // ── State footprint estimate ──────────────────────────────────────────────
  // Formula: Σ (outputKeys × batchSize × 128 bytes per key-value pair)
  // 128 bytes = conservative estimate for avg JSON field including key+value+overhead
  let estimatedBytesPerRun = 0;
  for (const node of nodes) {
    const outputKeys = estimateOutputKeys(node);
    const batchSize = estimateBatchSize(node);
    estimatedBytesPerRun += outputKeys * batchSize * 128;
  }

  const profile: MemoryProfile = {
    payloadAccumulationRisk,
    subprocessRisk,
    estimatedBytesPerRun,
    accumulationChains,
  };

  return { flags, profile };
}

export function computeMemoryScore(flags: AuditFlag[]): number {
  let score = 100;
  for (const f of flags) {
    if (f.category === "MEMORY" && f.ptsDeducted) score -= f.ptsDeducted;
  }
  return Math.max(0, score);
}
