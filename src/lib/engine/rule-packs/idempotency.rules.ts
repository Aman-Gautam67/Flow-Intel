/**
 * FlowIntel Rule Pack — IDEMPOTENCY
 * ─────────────────────────────────────────────────────────────────────────────
 * IDP-001  Missing idempotency key on write operations
 * IDP-002  Non-idempotent retry on write node (may double-write)
 * IDP-003  Webhook without deduplication guard
 */

import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

const WRITE_TYPES = new Set([
  "n8n-nodes-base.postgres", "n8n-nodes-base.mysql", "n8n-nodes-base.mongodb",
  "n8n-nodes-base.redis", "n8n-nodes-base.airtable", "n8n-nodes-base.googleSheets",
  "n8n-nodes-base.notion", "n8n-nodes-base.httpRequest",
]);

const NON_IDEMPOTENT_HTTP_METHODS = new Set(["POST", "PATCH", "DELETE"]);

function isWriteOperation(node: { type: string; parameters?: unknown }): boolean {
  if (!WRITE_TYPES.has(node.type)) return false;
  const p = node.parameters as Record<string, unknown> | undefined;
  // For HTTP request: only POST/PATCH/DELETE are non-idempotent
  if (node.type === "n8n-nodes-base.httpRequest") {
    const method = String(p?.method ?? "GET").toUpperCase();
    return NON_IDEMPOTENT_HTTP_METHODS.has(method);
  }
  // For DB nodes: insert/upsert/create operations
  const op = String(p?.operation ?? p?.action ?? "").toLowerCase();
  return ["insert", "upsert", "create", "write", "add", "append"].some((v) => op.includes(v));
}

function hasIdempotencyKey(node: { parameters?: unknown }): boolean {
  const p = node.parameters as Record<string, unknown> | undefined;
  if (!p) return false;
  const headers = p.headers ?? p.headerParameters;
  if (headers && JSON.stringify(headers).toLowerCase().includes("idempotency")) return true;
  const paramStr = JSON.stringify(p).toLowerCase();
  return paramStr.includes("idempotencykey") || paramStr.includes("idempotency-key") || paramStr.includes("x-idempotency");
}

function hasRetry(node: { parameters?: unknown }): boolean {
  const p = node.parameters as Record<string, unknown> | undefined;
  const opts = p?.options as Record<string, unknown> | undefined;
  return p?.retryOnFail === true || opts?.retryOnFail === true ||
    (typeof p?.maxTries === "number" && p.maxTries > 1);
}

function makeFindingId(ruleId: string, nodeId: string): string {
  return `${ruleId}-${nodeId}`;
}

export const IDEMPOTENCY_PACK: RulePackManifest = {
  id: "flowintel-core-idempotency",
  name: "FlowIntel Idempotency Rules",
  version: "2.0.0",
  description: "Detects replay vulnerabilities, missing idempotency keys, and duplicate write risks.",
  rules: [
    // ── IDP-001: Missing Idempotency Key ──────────────────────────────────────
    {
      id: "IDP-001",
      name: "Missing Idempotency Key on Write Operation",
      category: "IDEMPOTENCY",
      severity: "MEDIUM",
      description: "POST/PATCH HTTP requests or DB write nodes without an idempotency key may produce duplicate records on retry.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/IDP-001",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!isWriteOperation(node)) continue;
          if (hasIdempotencyKey(node)) continue;
          // Only flag if there's also retry enabled (without idempotency, retry = double-write risk)
          if (!hasRetry(node)) continue;
          findings.push({
            id: makeFindingId("IDP-001", node.id),
            ruleId: "IDP-001",
            ruleName: "Missing Idempotency Key on Write Operation",
            severity: "MEDIUM",
            category: "IDEMPOTENCY",
            location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
            evidence: {
              summary: "Write operation with retry but no idempotency key",
              detail: `Node "${node.name}" performs a write operation with retry enabled but no idempotency key. A network failure after a successful write could trigger a duplicate operation.`,
            },
            humanExplanation: "Without an idempotency key, a retried write operation may execute twice — creating duplicate records, double-charging customers, or sending duplicate emails.",
            suggestedFix: `Add an Idempotency-Key header (e.g. {{ $workflow.id }}-{{ $execution.id }}) to "${node.name}" to make retries safe.`,
            marketplaceBlocking: false,
            docReference: "https://flowintel.io/rules/IDP-001",
            penaltyPoints: 15,
          });
        }
        return findings;
      },
    },

    // ── IDP-002: Non-Idempotent Retry ─────────────────────────────────────────
    {
      id: "IDP-002",
      name: "Non-Idempotent Retry on Write Node",
      category: "IDEMPOTENCY",
      severity: "HIGH",
      description: "Retry is enabled on a write node that has no idempotency protection — guaranteed double-write risk.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/IDP-002",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!isWriteOperation(node)) continue;
          if (!hasRetry(node)) continue;
          if (hasIdempotencyKey(node)) continue;
          // This is more severe than IDP-001 — retry is explicitly configured without guard
          const p = node.parameters as Record<string, unknown> | undefined;
          const method = node.type === "n8n-nodes-base.httpRequest"
            ? String(p?.method ?? "POST").toUpperCase() : "write";
          findings.push({
            id: makeFindingId("IDP-002", node.id),
            ruleId: "IDP-002",
            ruleName: "Non-Idempotent Retry on Write Node",
            severity: "HIGH",
            category: "IDEMPOTENCY",
            location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
            evidence: {
              summary: `Retry enabled on ${method} operation without idempotency guard`,
              detail: `"${node.name}" retries a ${method} request without any idempotency mechanism. Each retry may duplicate the operation.`,
            },
            humanExplanation: "Retrying a non-idempotent operation (POST, PATCH, DB insert) can result in duplicate data, duplicate charges, or duplicate notifications.",
            suggestedFix: `Either remove retry from "${node.name}" or add an idempotency key header so retries are safe.`,
            marketplaceBlocking: false,
            docReference: "https://flowintel.io/rules/IDP-002",
            penaltyPoints: 20,
          });
        }
        return findings;
      },
    },

    // ── IDP-003: Webhook Without Deduplication ────────────────────────────────
    {
      id: "IDP-003",
      name: "Webhook Without Deduplication Guard",
      category: "IDEMPOTENCY",
      severity: "MEDIUM",
      description: "Webhook triggers without deduplication may process the same event multiple times if the sender retries delivery.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/IDP-003",
      detect(ast: ParsedWorkflow): Finding[] {
        const webhooks = ast.nodes.filter(
          (n) => n.type === "n8n-nodes-base.webhook" || (n.isTrigger && n.isHttp)
        );
        if (webhooks.length === 0) return [];
        // Check if there's any deduplication node in the workflow
        const hasDedup = ast.nodes.some((n) =>
          n.type === "n8n-nodes-base.removeDuplicates" ||
          n.type === "n8n-nodes-base.redis" ||
          (n.isCode && JSON.stringify(n.parameters ?? {}).toLowerCase().includes("dedup"))
        );
        if (hasDedup) return [];
        return webhooks.map((node) => ({
          id: makeFindingId("IDP-003", node.id),
          ruleId: "IDP-003",
          ruleName: "Webhook Without Deduplication Guard",
          severity: "MEDIUM" as const,
          category: "IDEMPOTENCY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: {
            summary: "Webhook with no deduplication mechanism found",
            detail: `Webhook "${node.name}" has no deduplication logic. Services like Stripe, GitHub, and Shopify retry webhook delivery on failure.`,
          },
          humanExplanation: "Most webhook providers retry delivery on network failures. Without deduplication, the same event may be processed multiple times.",
          suggestedFix: "Add a 'Remove Duplicates' node after the webhook trigger using the event ID as the deduplication key.",
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/IDP-003",
          penaltyPoints: 10,
        }));
      },
    },
  ],
};
