import type { ParsedWorkflow, NormalNode } from "@/types";

// ─── Model cost table (USD per single LLM call) ───────────────────────────────
// Values are midpoint estimates between input+output cost per typical invocation
// assuming ~1000 input tokens + ~500 output tokens as a baseline conversation turn.
const AI_NODE_BASE_COST: Record<string, { name: string; baseUsd: number }> = {
  "@n8n/n8n-nodes-langchain.lmOpenAi":       { name: "OpenAI GPT (default)", baseUsd: 0.025 },
  "@n8n/n8n-nodes-langchain.lmChatOpenAi":   { name: "OpenAI Chat",          baseUsd: 0.020 },
  "@n8n/n8n-nodes-langchain.openAiAssistant":{ name: "OpenAI Assistant",     baseUsd: 0.030 },
  "@n8n/n8n-nodes-langchain.lmAnthropic":    { name: "Anthropic Claude",     baseUsd: 0.020 },
  "@n8n/n8n-nodes-langchain.lmChatAnthropic":{ name: "Anthropic Chat",       baseUsd: 0.018 },
  "@n8n/n8n-nodes-langchain.lmCohere":       { name: "Cohere",               baseUsd: 0.010 },
  "@n8n/n8n-nodes-langchain.lmMistral":      { name: "Mistral",              baseUsd: 0.008 },
  "@n8n/n8n-nodes-langchain.agent":          { name: "AI Agent (LLM calls)", baseUsd: 0.020 },
  "@n8n/n8n-nodes-langchain.chainLlm":       { name: "LLM Chain",            baseUsd: 0.015 },
  "@n8n/n8n-nodes-langchain.chainRetrievalQa":{ name: "Retrieval QA Chain",  baseUsd: 0.015 },
  "n8n-nodes-base.openAi":                   { name: "OpenAI Node",          baseUsd: 0.015 },
};

// ─── Per-model parameter overrides ───────────────────────────────────────────
// When a static model name is configured in parameters, we use the precise cost.
const MODEL_COST_OVERRIDES: [RegExp, number][] = [
  [/gpt-4o/i,                  0.025],
  [/gpt-4-turbo/i,             0.030],
  [/gpt-4(?!o)/i,              0.030],
  [/gpt-3\.5-turbo/i,          0.002],
  [/claude-3-opus/i,           0.030],
  [/claude-3[-.]5-sonnet/i,    0.018],
  [/claude-3-sonnet/i,         0.015],
  [/claude-3-haiku/i,          0.005],
  [/claude-2/i,                0.010],
  [/mistral-large/i,           0.012],
  [/mistral-small/i,           0.006],
  [/mistral-7b/i,              0.003],
  [/mixtral/i,                 0.008],
  [/command-r-plus/i,          0.015],
  [/command-r(?!-plus)/i,      0.005],
  [/gemini-1\.5-pro/i,         0.012],
  [/gemini-1\.5-flash/i,       0.004],
  [/deepseek-r1/i,             0.006],
  [/deepseek-v3/i,             0.004],
];

// ─── Expression detector ──────────────────────────────────────────────────────
// If the model parameter is a dynamic n8n expression, we cannot know the cost statically.
// We flag this and use the default cost for the node type.
function isExpression(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().startsWith("={{") || value.trim().startsWith("{{ ");
}

function getDynamicModelWarning(node: NormalNode): boolean {
  const p = node.parameters as Record<string, unknown> | undefined;
  if (!p) return false;
  const modelVal = p.model ?? p.modelId ?? p.modelName;
  return isExpression(modelVal);
}

function getStaticModelCost(node: NormalNode): number {
  const p = node.parameters as Record<string, unknown> | undefined;
  if (!p) return 0;
  const modelStr = String(p.model ?? p.modelId ?? p.modelName ?? "").toLowerCase();
  if (!modelStr || isExpression(p.model ?? "")) return 0;

  for (const [re, cost] of MODEL_COST_OVERRIDES) {
    if (re.test(modelStr)) return cost;
  }
  return 0;
}

// ─── Loop amplifier ───────────────────────────────────────────────────────────
// If an AI node is inside a loop (Split In Batches parent), multiply the cost estimate
// by an assumed loop iteration count. Without runtime data, we use:
//   - If batchSize is set: assume 5 batches/exec → multiplier = 5
//   - If batchSize is absent (unbounded): assume 10 iterations/exec → multiplier = 10
//   - Never apply multiplier > 20 to keep estimates conservative

function getLoopMultiplier(node: NormalNode, allNodes: NormalNode[], connections: Record<string, unknown>): number {
  // Check if any upstream node is a loop type
  const loopTypes = new Set(["n8n-nodes-base.splitInBatches", "n8n-nodes-base.loopNode"]);

  // Build reverse map: for each node, which nodes connect TO it via main edges
  const reverseMap = new Map<string, string[]>();
  for (const [src, outputs] of Object.entries(connections)) {
    const connsObj = outputs as Record<string, unknown>;
    // `main` is an array of output-groups (not an object) — iterate it directly
    const mainArr = connsObj?.main;
    if (!Array.isArray(mainArr)) continue;
    for (const group of mainArr) {
      if (!Array.isArray(group)) continue;
      for (const t of group as Array<{ node: string }>) {
        if (t?.node) {
          const existing = reverseMap.get(t.node) ?? [];
          existing.push(src);
          reverseMap.set(t.node, existing);
        }
      }
    }
  }

  // Walk up the graph to check for loop ancestry (max 5 hops)
  const visited = new Set<string>();
  const queue = [node.name];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const parents = reverseMap.get(cur) ?? [];
    for (const p of parents) {
      const pNode = allNodes.find((n) => n.name === p);
      if (!pNode) continue;
      if (loopTypes.has(pNode.type)) {
        // Found a loop ancestor
        const params = pNode.parameters as Record<string, unknown> | undefined;
        const bs = Number(params?.batchSize ?? 0);
        return bs > 0 ? 5 : 10; // 5 batches if bounded, 10 if unbounded
      }
      if (visited.size < 5) queue.push(p);
    }
  }

  return 1; // not inside a loop
}

// ─── Agent iteration multiplier ──────────────────────────────────────────────
// AI Agents run multiple LLM calls per execution (one per iteration).
// Use maxIterations if set, otherwise default to 3 (conservative estimate).
function getAgentIterations(node: NormalNode): number {
  const p = node.parameters as Record<string, unknown> | undefined;
  const opts = p?.options as Record<string, unknown> | undefined;
  const maxIter = p?.maxIterations ?? opts?.maxIterations;
  if (typeof maxIter === "number" && maxIter > 0 && maxIter <= 50) {
    return maxIter;
  }
  return 3; // default estimate when unset (could be unbounded, but we stay conservative)
}

/**
 * Estimate monthly cost in USD at 1,000 executions/month.
 *
 * Formula per AI node:
 *   costPerExec = baseCost × loopMultiplier × agentIterations
 *   monthlyUsd  = Σ(costPerExec) × 1000
 *
 * Notes:
 *   - Dynamic model expressions (={{ $json.model }}) use the node-type base cost
 *     with a flag that the estimate may understate actual cost.
 *   - Chain/LLM nodes that are children of an Agent node are not double-counted
 *     since the agent's own multiplier already approximates the chain calls.
 */
export function estimateCost(
  parsed: ParsedWorkflow,
  connections: Record<string, unknown>
): { totalUsd: number; hasDynamicModels: boolean } {
  const nodes = parsed.nodes;

  // Build set of nodes that are sub-components of an agent (avoid double-counting).
  // Agent tool/LLM children are declared as INCOMING edges on the agent node
  // (toolNode → agentNode via ai_tool/ai_languageModel), not as outgoing edges from agent.
  // So we must also look for agent INCOMING connections, not just outgoing.
  const agentChildNodes = new Set<string>();
  for (const node of nodes) {
    if (node.type !== "@n8n/n8n-nodes-langchain.agent") continue;
    // Outgoing: direct downstream of agent (standard main output)
    const connsObj = (connections as Record<string, Record<string, unknown>>)[node.name];
    if (connsObj) {
      const mainArr = connsObj.main;
      // main is an array of output-groups, not an object — iterate directly
      if (Array.isArray(mainArr)) {
        for (const group of mainArr) {
          if (!Array.isArray(group)) continue;
          for (const t of group as Array<{ node: string }>) {
            if (t?.node) agentChildNodes.add(t.node);
          }
        }
      }
    }
    // Incoming ai_tool / ai_languageModel connections: the tool node declares itself
    // by pointing to this agent, so scan ALL source nodes for such edges.
    for (const [srcName, srcOutputs] of Object.entries(connections)) {
      if (!srcOutputs || typeof srcOutputs !== "object") continue;
      for (const [connType, outputArr] of Object.entries(srcOutputs as Record<string, unknown>)) {
        if (connType === "main") continue; // main edges are not tool declarations
        if (!Array.isArray(outputArr)) continue;
        for (const group of outputArr) {
          if (!Array.isArray(group)) continue;
          for (const t of group as Array<{ node: string }>) {
            if (t?.node === node.name) agentChildNodes.add(srcName);
          }
        }
      }
    }
  }

  let totalCostPerExec = 0;
  let hasDynamicModels = false;

  for (const node of nodes) {
    const entry = AI_NODE_BASE_COST[node.type];
    if (!entry) {
      const lower = node.type.toLowerCase();
      if (!lower.includes("openai") && !lower.includes("anthropic") && !lower.includes("langchain") && !node.isAi) continue;
    }

    // Skip LLM/chain nodes that are already counted inside an agent
    if (agentChildNodes.has(node.name) && node.type !== "@n8n/n8n-nodes-langchain.agent") continue;

    const baseCost = getStaticModelCost(node) || entry?.baseUsd || 0.015;
    const loopMult = getLoopMultiplier(node, nodes, connections);
    const agentIter = node.type === "@n8n/n8n-nodes-langchain.agent" ? getAgentIterations(node) : 1;

    if (getDynamicModelWarning(node)) hasDynamicModels = true;

    totalCostPerExec += baseCost * loopMult * agentIter;
  }

  const totalUsd = Math.round(totalCostPerExec * 1000 * 100) / 100;
  return { totalUsd, hasDynamicModels };
}
