/**
 * FlowIntel Rule Pack — COST OPTIMIZATION
 * ─────────────────────────────────────────────────────────────────────────────
 * CST-001  Duplicate AI calls (same prompt/model in two nodes)
 * CST-002  Redundant API calls (same HTTP endpoint called multiple times)
 * CST-003  Missing cache for repeated read-only API calls
 */

import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

const AI_NODE_TYPES = new Set([
  "@n8n/n8n-nodes-langchain.lmOpenAi",
  "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  "@n8n/n8n-nodes-langchain.openAiAssistant",
  "@n8n/n8n-nodes-langchain.lmAnthropic",
  "@n8n/n8n-nodes-langchain.lmChatAnthropic",
  "@n8n/n8n-nodes-langchain.lmCohere",
  "@n8n/n8n-nodes-langchain.chainLlm",
  "n8n-nodes-base.openAi",
]);

const CACHE_CAPABLE_TYPES = new Set([
  "n8n-nodes-base.httpRequest",
  "n8n-nodes-base.googleSheets",
  "n8n-nodes-base.airtable",
  "n8n-nodes-base.notion",
]);

const LOOP_TYPES = new Set(["n8n-nodes-base.splitInBatches", "n8n-nodes-base.loopNode"]);

function getModelKey(node: { type: string; parameters?: unknown }): string {
  const p = node.parameters as Record<string, unknown> | undefined;
  const model = String(p?.model ?? p?.modelId ?? p?.modelName ?? "default");
  const systemPrompt = String(p?.systemMessage ?? p?.prompt ?? "").slice(0, 50);
  return `${node.type}:${model}:${systemPrompt}`;
}

function getEndpointKey(node: { parameters?: unknown }): string {
  const p = node.parameters as Record<string, unknown> | undefined;
  const url = String(p?.url ?? p?.endpoint ?? p?.webhookUrl ?? "");
  const method = String(p?.method ?? "GET").toUpperCase();
  // Strip dynamic query parts to compare structural URLs
  const stripped = url.replace(/\{\{[^}]+\}\}/g, "{{expr}}").split("?")[0];
  return `${method}:${stripped}`;
}

function isInsideLoop(nodeName: string, ast: ParsedWorkflow): boolean {
  return ast.edges.some((e) => {
    const src = ast.nodes.find((n) => n.name === e.source);
    return e.target === nodeName && src && LOOP_TYPES.has(src.type);
  });
}

function makeFindingId(ruleId: string, key: string): string {
  return `${ruleId}-${key.replace(/[^a-z0-9]/gi, "-").slice(0, 40)}`;
}

export const COST_OPTIMIZATION_PACK: RulePackManifest = {
  id: "flowintel-core-cost-optimization",
  name: "FlowIntel Cost Optimization Rules",
  version: "2.0.0",
  description: "Detects duplicate AI calls, redundant API requests, and missing cache opportunities.",
  rules: [
    // ── CST-001: Duplicate AI Calls ───────────────────────────────────────────
    {
      id: "CST-001",
      name: "Duplicate AI Calls",
      category: "COST_OPTIMIZATION",
      severity: "MEDIUM",
      description: "Two or more AI nodes with the same model and prompt — duplicate cost with no benefit.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CST-001",
      detect(ast: ParsedWorkflow): Finding[] {
        const aiNodes = ast.nodes.filter((n) => AI_NODE_TYPES.has(n.type));
        if (aiNodes.length < 2) return [];
        const keyMap = new Map<string, string>();
        const findings: Finding[] = [];
        for (const node of aiNodes) {
          const key = getModelKey(node);
          if (keyMap.has(key)) {
            findings.push({
              id: makeFindingId("CST-001", key + node.id),
              ruleId: "CST-001",
              ruleName: "Duplicate AI Calls",
              severity: "MEDIUM",
              category: "COST_OPTIMIZATION",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: {
                summary: "Identical AI node configuration found in multiple places",
                detail: `Node "${node.name}" and "${keyMap.get(key)}" appear to use the same model and prompt configuration. This doubles AI costs.`,
              },
              humanExplanation: "Running the same AI prompt twice doubles costs. Cache the result of the first call and reference it in downstream nodes.",
              suggestedFix: `Remove the duplicate AI node and use the output of the first call via {{ $('${keyMap.get(key)}').item.json.output }}.`,
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/CST-001",
              penaltyPoints: 10,
            });
          } else {
            keyMap.set(key, node.name);
          }
        }
        return findings;
      },
    },

    // ── CST-002: Redundant API Calls ──────────────────────────────────────────
    {
      id: "CST-002",
      name: "Redundant API Calls",
      category: "COST_OPTIMIZATION",
      severity: "LOW",
      description: "Same HTTP endpoint is called multiple times in the same workflow execution.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 6,
      docReference: "https://flowintel.io/rules/CST-002",
      detect(ast: ParsedWorkflow): Finding[] {
        const httpNodes = ast.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
        if (httpNodes.length < 2) return [];
        const keyMap = new Map<string, string>();
        const findings: Finding[] = [];
        for (const node of httpNodes) {
          const key = getEndpointKey(node);
          if (!key || key === "GET:") continue;
          if (keyMap.has(key)) {
            findings.push({
              id: makeFindingId("CST-002", key + node.id),
              ruleId: "CST-002",
              ruleName: "Redundant API Calls",
              severity: "LOW",
              category: "COST_OPTIMIZATION",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: {
                summary: `Endpoint called multiple times: ${key}`,
                detail: `Nodes "${node.name}" and "${keyMap.get(key)}" call the same endpoint. This doubles API usage and request latency.`,
              },
              humanExplanation: "Calling the same read API twice in one workflow is wasteful. Cache the first result and reference it downstream.",
              suggestedFix: `Remove "${node.name}" and reference the output of "${keyMap.get(key)}" using an expression.`,
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/CST-002",
              penaltyPoints: 6,
            });
          } else {
            keyMap.set(key, node.name);
          }
        }
        return findings;
      },
    },

    // ── CST-003: Missing Cache for Repeated Read-Only Calls ───────────────────
    {
      id: "CST-003",
      name: "Missing Cache for Repeated Read-Only Calls",
      category: "COST_OPTIMIZATION",
      severity: "INFO",
      description: "Read-only API calls inside a loop could be cached outside the loop to save API quota.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 4,
      docReference: "https://flowintel.io/rules/CST-003",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!CACHE_CAPABLE_TYPES.has(node.type)) continue;
          const p = node.parameters as Record<string, unknown> | undefined;
          const method = String(p?.method ?? "GET").toUpperCase();
          if (method !== "GET") continue; // only read-only calls
          if (!isInsideLoop(node.name, ast)) continue;
          findings.push({
            id: makeFindingId("CST-003", node.id),
            ruleId: "CST-003",
            ruleName: "Missing Cache for Repeated Read-Only Calls",
            severity: "INFO",
            category: "COST_OPTIMIZATION",
            location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
            evidence: {
              summary: "GET request inside loop — cache opportunity",
              detail: `"${node.name}" makes the same GET request on every loop iteration. Moving it outside the loop and caching the result would reduce API calls proportionally to loop size.`,
            },
            humanExplanation: "A read-only API call inside a 100-item loop makes 100 API requests when 1 would suffice. This wastes API quota and increases execution time.",
            suggestedFix: `Move "${node.name}" before the loop and reference its output inside the loop using {{ $('${node.name}').item.json }}.`,
            marketplaceBlocking: false,
            docReference: "https://flowintel.io/rules/CST-003",
            penaltyPoints: 4,
          });
        }
        return findings;
      },
    },
  ],
};
