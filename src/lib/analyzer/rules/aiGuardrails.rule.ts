import type { AuditFlag, NormalNode, ParsedWorkflow } from "@/types";

// ─── N/A detection ─────────────────────────────────────────────────────────────
// The AI_GUARDRAILS pillar is marked N/A when the workflow has zero AI nodes.
// In that case the score is excluded from the overall mean denominator.
export function isAiApplicable(parsed: ParsedWorkflow): boolean {
  return parsed.aiNodesCount > 0;
}

const AGENT_TYPE = "@n8n/n8n-nodes-langchain.agent";

const LLM_OUTPUT_TYPES = new Set([
  "@n8n/n8n-nodes-langchain.chainLlm",
  "@n8n/n8n-nodes-langchain.chainRetrievalQa",
  "@n8n/n8n-nodes-langchain.openAiAssistant",
]);

const STRUCTURED_PARSER_TYPES = new Set([
  "@n8n/n8n-nodes-langchain.outputParserStructured",
  "@n8n/n8n-nodes-langchain.outputParserAutofixing",
  "@n8n/n8n-nodes-langchain.outputParserItemList",
  "@n8n/n8n-nodes-langchain.outputParserJson",
]);

// Destructive tool types that should never be autonomously accessible
const DESTRUCTIVE_TOOL_TYPES = new Set([
  "@n8n/n8n-nodes-langchain.toolSqlAgent",
  "@n8n/n8n-nodes-langchain.toolCode",
  "n8n-nodes-base.executeCommand",
  "n8n-nodes-base.ssh",
  "n8n-nodes-base.postgres",
  "n8n-nodes-base.mysql",
  "n8n-nodes-base.mongoDb",
  "n8n-nodes-base.redis",
]);

// ─── Connection graph builders ────────────────────────────────────────────────
// n8n connection architecture for AI nodes:
//
//   OUTGOING (standard):  source.main → target
//   INCOMING (ai tools):  toolNode.ai_tool → agentNode   ← tools declare themselves as inputs
//   INCOMING (ai LLM):    lmNode.ai_languageModel → agentNode
//   INCOMING (ai parser): parserNode.ai_outputParser → chainNode
//
// Key insight: ai_tool/ai_languageModel/ai_outputParser connections are stored
// under the TOOL/LLM SOURCE node, pointing TO the agent/chain as a target.
// To find what tools an agent has, we must build an INCOMING edge index
// (who points at me?) not walk outgoing edges from the agent.

/** Outgoing edges: nodeName → all targets across all connection types */
function buildOutgoingMap(
  connections: Record<string, unknown>
): Map<string, { node: string; connectionType: string }[]> {
  const map = new Map<string, { node: string; connectionType: string }[]>();
  for (const [srcName, outputs] of Object.entries(connections)) {
    if (!outputs || typeof outputs !== "object") continue;
    const allTargets: { node: string; connectionType: string }[] = [];
    for (const [connType, outputArr] of Object.entries(outputs as Record<string, unknown>)) {
      if (!Array.isArray(outputArr)) continue;
      for (const group of outputArr) {
        if (!Array.isArray(group)) continue;
        for (const target of group) {
          if (target && typeof target === "object" && "node" in target) {
            allTargets.push({ node: (target as { node: string }).node, connectionType: connType });
          }
        }
      }
    }
    if (allTargets.length > 0) map.set(srcName, allTargets);
  }
  return map;
}

/** Incoming edges: nodeName → all sources that point at it, with connectionType */
function buildIncomingMap(
  connections: Record<string, unknown>
): Map<string, { node: string; connectionType: string }[]> {
  const map = new Map<string, { node: string; connectionType: string }[]>();
  for (const [srcName, outputs] of Object.entries(connections)) {
    if (!outputs || typeof outputs !== "object") continue;
    for (const [connType, outputArr] of Object.entries(outputs as Record<string, unknown>)) {
      if (!Array.isArray(outputArr)) continue;
      for (const group of outputArr) {
        if (!Array.isArray(group)) continue;
        for (const target of group) {
          if (target && typeof target === "object" && "node" in target) {
            const targetName = (target as { node: string }).node;
            const existing = map.get(targetName) ?? [];
            existing.push({ node: srcName, connectionType: connType });
            map.set(targetName, existing);
          }
        }
      }
    }
  }
  return map;
}

export function runAiGuardrailRules(
  parsed: ParsedWorkflow,
  connections: Record<string, unknown>
): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const nodes = parsed.nodes;
  const nodeByName = new Map<string, NormalNode>(nodes.map((n) => [n.name, n]));

  // Build both outgoing (for downstream output) and incoming (for tool/LLM inputs to agent)
  const outgoingMap = buildOutgoingMap(connections);
  const incomingMap = buildIncomingMap(connections);

  for (const node of nodes) {
    if (node.type === AGENT_TYPE) {
      // ── Unbounded agent loop ────────────────────────────────────────────
      const p = node.parameters as Record<string, unknown> | undefined;
      const opts = p?.options as Record<string, unknown> | undefined;
      const maxIter = p?.maxIterations ?? opts?.maxIterations;
      if (maxIter === undefined || maxIter === null || maxIter === 0 || maxIter === -1) {
        flags.push({
          id: `AI_UNBOUNDED_${node.id}`,
          rule: "AI_UNBOUNDED_AGENT_LOOP",
          severity: "CRITICAL",
          category: "AI_GUARDRAILS",
          title: "Unbounded AI agent loop",
          detail: `AI Agent "${node.name}" has no maxIterations limit — it can loop indefinitely, incurring unbounded token cost and execution time.`,
          nodeName: node.name,
          nodeType: node.type,
          ptsDeducted: 30,
          remediation: {
            description: "Set maxIterations to a safe value (recommended: 10).",
            n8nUiInstruction: `Open "${node.name}" → Options → Max Iterations → set to 10.`,
            jsonPatch: [{ op: "replace", path: `/parameters/options/maxIterations`, value: 10 }],
          },
        });
      }

      // ── Destructive tools attached to agent ─────────────────────────────
      // ARCHITECTURE FIX: Tools declare themselves as inputs TO the agent via ai_tool connections.
      // They appear as INCOMING edges on the agent node (toolNode → agentNode via ai_tool).
      // We must look in the incoming map for nodes that connect to this agent via ai_tool.
      const agentIncoming = incomingMap.get(node.name) ?? [];
      const toolInputNodes = agentIncoming
        .filter((e) => e.connectionType === "ai_tool")
        .map((e) => nodeByName.get(e.node))
        .filter((n): n is NormalNode => n !== undefined);

      const destructiveTools = toolInputNodes.filter((n) => DESTRUCTIVE_TOOL_TYPES.has(n.type));

      if (destructiveTools.length > 0) {
        flags.push({
          id: `AI_DESTRUCTIVE_TOOLS_${node.id}`,
          rule: "AI_DANGEROUS_TOOL_PERMISSIVENESS",
          severity: "CRITICAL",
          category: "AI_GUARDRAILS",
          title: "Destructive tools on autonomous agent",
          detail: `AI Agent "${node.name}" has direct access to: ${destructiveTools.map((n) => n.name).join(", ")}. Without a human-approval gate the agent can autonomously mutate or delete data.`,
          nodeName: node.name,
          nodeType: node.type,
          ptsDeducted: 25,
          remediation: {
            description: "Add a human approval step before any destructive tool call.",
            n8nUiInstruction: "Insert a Form Trigger / Wait node between the agent and any destructive tool.",
          },
        });
      }
    }

    // ── Unvalidated LLM output ────────────────────────────────────────────
    if (LLM_OUTPUT_TYPES.has(node.type)) {
      // Check INCOMING edges for a structured output parser
      const chainIncoming = incomingMap.get(node.name) ?? [];
      const hasIncomingParser = chainIncoming.some((e) => {
        const nd = nodeByName.get(e.node);
        return nd && (STRUCTURED_PARSER_TYPES.has(nd.type) || e.connectionType === "ai_outputParser");
      });

      // Also check OUTGOING: some n8n versions wire parser as outgoing from chain
      const chainOutgoing = outgoingMap.get(node.name) ?? [];
      const hasOutgoingParser = chainOutgoing.some((e) => {
        const nd = nodeByName.get(e.node);
        return nd && STRUCTURED_PARSER_TYPES.has(nd.type);
      });

      // Check parameter references
      const paramStr = JSON.stringify(node.parameters ?? {});
      const hasParserRef =
        paramStr.includes("outputParser") ||
        paramStr.includes("structuredOutput") ||
        paramStr.includes("responseFormat");

      if (!hasIncomingParser && !hasOutgoingParser && !hasParserRef) {
        flags.push({
          id: `AI_UNVALIDATED_OUTPUT_${node.id}`,
          rule: "AI_UNVALIDATED_LLM_OUTPUT",
          severity: "WARNING",
          category: "AI_GUARDRAILS",
          title: "Unvalidated LLM output",
          detail: `Node "${node.name}" returns raw, unvalidated text from the LLM. Downstream nodes may break if the model deviates from expected formats.`,
          nodeName: node.name,
          nodeType: node.type,
          ptsDeducted: 15,
          remediation: {
            description: "Attach a Structured Output Parser to enforce a JSON schema.",
            n8nUiInstruction: `Add an Output Parser sub-node to "${node.name}" and define a JSON schema.`,
          },
        });
      }
    }
  }

  return flags;
}

export function computeAiGuardrailScore(
  flags: AuditFlag[],
  applicable: boolean
): number | null {
  if (!applicable) return null;
  let score = 100;
  for (const f of flags) {
    if (f.category === "AI_GUARDRAILS" && f.ptsDeducted) score -= f.ptsDeducted;
  }
  return Math.max(0, score);
}
