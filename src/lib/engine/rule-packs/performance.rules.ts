/**
 * FlowIntel Rule Pack — PERFORMANCE
 * ─────────────────────────────────────────────────────────────────────────────
 * PER-001  Sequential API calls that could be parallelized
 * PER-002  Missing batch processing (item-by-item vs bulk)
 * PER-003  Expensive AI model without cheaper alternative signal
 */

import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

const PARALLELIZABLE_TYPES = new Set([
  "n8n-nodes-base.httpRequest",
  "n8n-nodes-base.slack",
  "n8n-nodes-base.gmail",
  "n8n-nodes-base.telegram",
]);

const EXPENSIVE_AI_MODELS = new Set([
  "gpt-4", "gpt-4-turbo", "gpt-4o", "claude-3-opus",
  "claude-opus", "gemini-1.5-pro",
]);

const BULK_CAPABLE_TYPES = new Set([
  "n8n-nodes-base.googleSheets",
  "n8n-nodes-base.airtable",
  "n8n-nodes-base.postgres",
  "n8n-nodes-base.mysql",
  "n8n-nodes-base.mongodb",
]);

function makeFindingId(ruleId: string, nodeId: string): string {
  return `${ruleId}-${nodeId}`;
}

export const PERFORMANCE_PACK: RulePackManifest = {
  id: "flowintel-core-performance",
  name: "FlowIntel Performance Rules",
  version: "2.0.0",
  description: "Detects sequential bottlenecks, missing batch processing, and expensive AI model configurations.",
  rules: [
    // ── PER-001: Sequential Parallelizable API Calls ───────────────────────────
    {
      id: "PER-001",
      name: "Sequential Parallelizable API Calls",
      category: "PERFORMANCE",
      severity: "LOW",
      description: "Two or more independent HTTP/API calls connected in sequence could be parallelized.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/PER-001",
      detect(ast: ParsedWorkflow): Finding[] {
        // Look for two or more HTTP nodes where one directly follows another
        // with no merge/aggregate between them (simple chain of HTTP→HTTP)
        const chains: Array<{ first: string; second: string; firstId: string; secondId: string }> = [];
        const nodeMap = new Map(ast.nodes.map((n) => [n.name, n]));
        for (const edge of ast.edges) {
          const src = nodeMap.get(edge.source);
          const tgt = nodeMap.get(edge.target);
          if (!src || !tgt) continue;
          if (PARALLELIZABLE_TYPES.has(src.type) && PARALLELIZABLE_TYPES.has(tgt.type)) {
            // Both are independent HTTP calls in sequence
            chains.push({ first: src.name, second: tgt.name, firstId: src.id, secondId: tgt.id });
          }
        }
        if (chains.length === 0) return [];
        // De-duplicate by first node
        const seen = new Set<string>();
        const findings: Finding[] = [];
        for (const { first, second, firstId } of chains) {
          if (seen.has(firstId)) continue;
          seen.add(firstId);
          findings.push({
            id: makeFindingId("PER-001", firstId),
            ruleId: "PER-001",
            ruleName: "Sequential Parallelizable API Calls",
            severity: "LOW",
            category: "PERFORMANCE",
            location: { nodeId: firstId, nodeName: first },
            evidence: {
              summary: `"${first}" → "${second}" are sequential independent API calls`,
              detail: `These two HTTP/API nodes are sequential but appear independent. Running them in parallel would reduce total execution time.`,
            },
            humanExplanation: "Sequential API calls that don't depend on each other double the latency. Parallelizing them reduces execution time and improves throughput.",
            suggestedFix: `Use n8n's built-in parallelization by connecting both "${first}" and "${second}" to a Merge node, then running from a single trigger.`,
            marketplaceBlocking: false,
            docReference: "https://flowintel.io/rules/PER-001",
            penaltyPoints: 6,
          });
        }
        return findings;
      },
    },

    // ── PER-002: Missing Batch Processing ────────────────────────────────────
    {
      id: "PER-002",
      name: "Missing Batch Processing",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "DB/sheet operations inside a loop should use bulk insert/update instead of item-by-item writes.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PER-002",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const LOOP_TYPES = new Set(["n8n-nodes-base.splitInBatches", "n8n-nodes-base.loopNode"]);
        const nodeMap = new Map(ast.nodes.map((n) => [n.name, n]));
        for (const loopNode of ast.nodes) {
          if (!LOOP_TYPES.has(loopNode.type)) continue;
          const children = ast.edges
            .filter((e) => e.source === loopNode.name)
            .map((e) => nodeMap.get(e.target))
            .filter(Boolean);
          for (const child of children) {
            if (!child || !BULK_CAPABLE_TYPES.has(child.type)) continue;
            const p = child.parameters as Record<string, unknown> | undefined;
            const op = String(p?.operation ?? p?.action ?? "").toLowerCase();
            // Flag single-row operations inside loops
            if (op.includes("insert") || op.includes("create") || op.includes("append")) {
              findings.push({
                id: makeFindingId("PER-002", child.id),
                ruleId: "PER-002",
                ruleName: "Missing Batch Processing",
                severity: "MEDIUM",
                category: "PERFORMANCE",
                location: { nodeId: child.id, nodeName: child.name, nodeType: child.type },
                evidence: {
                  summary: `Single-row ${op} inside loop`,
                  detail: `"${child.name}" performs a single-record ${op} inside loop "${loopNode.name}". Use a bulk operation instead.`,
                },
                humanExplanation: "Item-by-item database writes are 10-100x slower than bulk operations and consume significantly more API quota.",
                suggestedFix: `Aggregate all items before "${child.name}" and use the bulk append/insert operation instead of calling the node for each item.`,
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/PER-002",
                penaltyPoints: 10,
              });
            }
          }
        }
        return findings;
      },
    },

    // ── PER-003: Expensive AI Model ───────────────────────────────────────────
    {
      id: "PER-003",
      name: "Expensive AI Model Without Cost Justification",
      category: "PERFORMANCE",
      severity: "INFO",
      description: "GPT-4/Claude Opus level models used for tasks that a cheaper model could handle.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 0,
      docReference: "https://flowintel.io/rules/PER-003",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isAi) continue;
          const p = node.parameters as Record<string, unknown> | undefined;
          const model = String(p?.model ?? p?.modelId ?? p?.modelName ?? "").toLowerCase();
          if (!model) continue;
          const isExpensive = [...EXPENSIVE_AI_MODELS].some((m) => model.includes(m.toLowerCase()));
          if (isExpensive) {
            findings.push({
              id: makeFindingId("PER-003", node.id),
              ruleId: "PER-003",
              ruleName: "Expensive AI Model Without Cost Justification",
              severity: "INFO",
              category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type, paramPath: "/parameters/model" },
              evidence: {
                summary: `Expensive model: ${model}`,
                detail: `Node "${node.name}" uses ${model}. Consider whether a smaller model (GPT-4o-mini, Claude Haiku) could handle this task adequately at 10-20x lower cost.`,
              },
              humanExplanation: "Top-tier AI models are 10-50x more expensive per token than mid-tier models. For classification, summarization, or extraction tasks, a smaller model often achieves similar accuracy.",
              suggestedFix: `Evaluate whether GPT-4o-mini or Claude Haiku would be sufficient for the task in "${node.name}".`,
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/PER-003",
              penaltyPoints: 5,
            });
          }
        }
        return findings;
      },
    },
  ],
};
