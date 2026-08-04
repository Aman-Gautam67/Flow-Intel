/**
 * FlowIntel Rule Pack — RELIABILITY
 * ─────────────────────────────────────────────────────────────────────────────
 * REL-001  Missing error handling on network nodes
 * REL-002  Unbounded loop (no batch size limit)
 * REL-003  Unthrottled API calls inside loop
 * REL-004  Missing timeout configuration on HTTP requests
 * REL-005  No failure notification (silent failures)
 */

import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

const HTTP_TYPES = new Set([
  "n8n-nodes-base.httpRequest", "n8n-nodes-base.webhook",
  "n8n-nodes-base.slack", "n8n-nodes-base.gmail",
  "n8n-nodes-base.github", "n8n-nodes-base.stripe",
  "@n8n/n8n-nodes-langchain.openAi", "n8n-nodes-base.openAi",
]);

const LOOP_TYPES = new Set([
  "n8n-nodes-base.splitInBatches", "n8n-nodes-base.loopNode",
]);

const DELAY_TYPES = new Set([
  "n8n-nodes-base.wait", "n8n-nodes-base.delay",
]);

const NOTIFICATION_TYPES = new Set([
  "n8n-nodes-base.slack", "n8n-nodes-base.telegram", "n8n-nodes-base.discord",
  "n8n-nodes-base.gmail", "n8n-nodes-base.sendEmail", "n8n-nodes-base.emailSend",
  "n8n-nodes-base.pagerDuty", "n8n-nodes-base.opsgenie",
]);

function hasErrorHandling(nodeName: string, ast: ParsedWorkflow): boolean {
  // Check continueOnFail / onError in parameters
  const node = ast.nodes.find((n) => n.name === nodeName);
  if (!node) return false;
  const p = node.parameters as Record<string, unknown> | undefined;
  const opts = p?.options as Record<string, unknown> | undefined;
  if (p?.continueOnFail === true || opts?.continueOnFail === true) return true;
  if (p?.onError || opts?.onError) return true;
  // Check for error output branch in edges
  const errEdge = ast.edges.find((e) => e.source === nodeName && (e.sourceHandle === "error" || e.sourceHandle === "1"));
  return !!errEdge;
}

function hasRetry(node: { parameters?: unknown }): boolean {
  const p = node.parameters as Record<string, unknown> | undefined;
  const opts = p?.options as Record<string, unknown> | undefined;
  return p?.retryOnFail === true || opts?.retryOnFail === true ||
    (typeof p?.maxTries === "number" && p.maxTries > 1);
}

function makeFindingId(ruleId: string, nodeId: string, suffix?: string): string {
  return [ruleId, nodeId, suffix].filter(Boolean).join("-");
}

export const RELIABILITY_PACK: RulePackManifest = {
  id: "flowintel-core-reliability",
  name: "FlowIntel Reliability Rules",
  version: "2.0.0",
  description: "Ensures workflows handle failures, throttle loops, and notify on errors.",
  rules: [
    // ── REL-001: Missing Error Handling ───────────────────────────────────────
    {
      id: "REL-001",
      name: "Missing Error Handling on Network Node",
      category: "RELIABILITY",
      severity: "HIGH",
      description: "Network nodes with no error branch or continueOnFail halt the entire workflow on failure.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/REL-001",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!HTTP_TYPES.has(node.type)) continue;
          if (!hasErrorHandling(node.name, ast)) {
            findings.push({
              id: makeFindingId("REL-001", node.id),
              ruleId: "REL-001",
              ruleName: "Missing Error Handling on Network Node",
              severity: "HIGH",
              category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: {
                summary: "No continueOnFail or error output branch",
                detail: `"${node.name}" makes external calls but has no error handling — a single API failure stops the entire workflow.`,
              },
              humanExplanation: "Production workflows must tolerate transient failures. Without error handling, any temporary API outage causes a full workflow failure.",
              suggestedFix: `Enable 'Continue On Fail' on "${node.name}" or connect an error output branch to a fallback node.`,
              autoFix: {
                description: "Enable continueOnFail",
                patches: [{ op: "replace", path: "/parameters/continueOnFail", value: true }],
              },
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/REL-001",
              penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    // ── REL-002: Unbounded Loop ───────────────────────────────────────────────
    {
      id: "REL-002",
      name: "Unbounded Loop",
      category: "RELIABILITY",
      severity: "HIGH",
      description: "Loop nodes without an explicit item limit can exhaust memory on large inputs.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/REL-002",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!LOOP_TYPES.has(node.type)) continue;
          const p = node.parameters as Record<string, unknown> | undefined;
          const bounded =
            (typeof p?.batchSize === "number" && p.batchSize > 0) ||
            (typeof p?.batchSize === "string" && parseInt(p.batchSize, 10) > 0) ||
            (typeof p?.maxItems === "number" && p.maxItems > 0);
          if (!bounded) {
            findings.push({
              id: makeFindingId("REL-002", node.id),
              ruleId: "REL-002",
              ruleName: "Unbounded Loop",
              severity: "HIGH",
              category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type, paramPath: "/parameters/batchSize" },
              evidence: {
                summary: "batchSize not set",
                detail: `Loop node "${node.name}" has no batchSize configured. On large inputs this will process all items in a single execution and may exhaust memory.`,
              },
              humanExplanation: "Unbounded loops can trigger out-of-memory errors and workflow timeouts on real-world data volumes.",
              suggestedFix: `Set batchSize on "${node.name}" to a reasonable value (e.g. 100).`,
              autoFix: {
                description: "Set batchSize to 100",
                patches: [{ op: "replace", path: "/parameters/batchSize", value: 100 }],
              },
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/REL-002",
              penaltyPoints: 12,
            });
          }
        }
        return findings;
      },
    },

    // ── REL-003: Unthrottled API Inside Loop ──────────────────────────────────
    {
      id: "REL-003",
      name: "Unthrottled API Calls Inside Loop",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "HTTP calls inside a loop with no delay risk rate-limit errors from external APIs.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/REL-003",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const nodeMap = new Map(ast.nodes.map((n) => [n.name, n]));
        for (const loopNode of ast.nodes) {
          if (!LOOP_TYPES.has(loopNode.type)) continue;
          // Find direct children of this loop
          const children = ast.edges
            .filter((e) => e.source === loopNode.name)
            .map((e) => nodeMap.get(e.target))
            .filter(Boolean);
          const hasHttpChild = children.some((n) => n && HTTP_TYPES.has(n.type));
          if (!hasHttpChild) continue;
          const hasDelay = children.some((n) => n && DELAY_TYPES.has(n.type));
          if (!hasDelay) {
            const httpChild = children.find((n) => n && HTTP_TYPES.has(n.type))!;
            findings.push({
              id: makeFindingId("REL-003", loopNode.id),
              ruleId: "REL-003",
              ruleName: "Unthrottled API Calls Inside Loop",
              severity: "MEDIUM",
              category: "RELIABILITY",
              location: { nodeId: loopNode.id, nodeName: loopNode.name, nodeType: loopNode.type },
              evidence: {
                summary: "HTTP node inside loop without delay",
                detail: `Loop "${loopNode.name}" calls "${httpChild?.name}" on every iteration without a delay node — this can trigger API rate limits.`,
              },
              humanExplanation: "Most external APIs enforce rate limits. Without throttling, batch loops often hit 429 errors and fail silently.",
              suggestedFix: `Insert a 'Wait' node (1-second delay) between "${loopNode.name}" and "${httpChild?.name}".`,
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/REL-003",
              penaltyPoints: 12,
            });
          }
        }
        return findings;
      },
    },

    // ── REL-004: Missing HTTP Timeout ─────────────────────────────────────────
    {
      id: "REL-004",
      name: "Missing HTTP Timeout",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "HTTP Request nodes without an explicit timeout can block workflow execution indefinitely.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/REL-004",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const p = node.parameters as Record<string, unknown> | undefined;
          const opts = p?.options as Record<string, unknown> | undefined;
          const timeout = p?.timeout ?? opts?.timeout;
          if (!timeout || timeout === 0) {
            findings.push({
              id: makeFindingId("REL-004", node.id),
              ruleId: "REL-004",
              ruleName: "Missing HTTP Timeout",
              severity: "MEDIUM",
              category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type, paramPath: "/parameters/options/timeout" },
              evidence: {
                summary: "No timeout configured on HTTP Request",
                detail: `Node "${node.name}" has no timeout configured. A slow or hung endpoint will block the workflow indefinitely.`,
              },
              humanExplanation: "Without a timeout, a single slow API call can pin a workflow execution indefinitely, consuming concurrency slots and delaying other runs.",
              suggestedFix: `Set a timeout (e.g. 30000ms) in "${node.name}" → Options → Timeout.`,
              autoFix: {
                description: "Set 30 second timeout",
                patches: [{ op: "replace", path: "/parameters/options/timeout", value: 30000 }],
              },
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/REL-004",
              penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    // ── REL-005: No Failure Notification ─────────────────────────────────────
    {
      id: "REL-005",
      name: "No Failure Notification",
      category: "RELIABILITY",
      severity: "LOW",
      description: "Workflows without a notification node on the error path fail silently in production.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/REL-005",
      detect(ast: ParsedWorkflow): Finding[] {
        // Applicable only to workflows with at least one network node
        const hasNetwork = ast.nodes.some((n) => HTTP_TYPES.has(n.type));
        if (!hasNetwork) return [];
        // Check if workflow contains any notification node
        const hasNotification = ast.nodes.some((n) => NOTIFICATION_TYPES.has(n.type));
        // Also check for error trigger node
        const hasErrorTrigger = ast.nodes.some((n) =>
          n.type === "n8n-nodes-base.errorTrigger" || n.type.includes("errorTrigger")
        );
        if (!hasNotification && !hasErrorTrigger) {
          return [{
            id: "REL-005-workflow",
            ruleId: "REL-005",
            ruleName: "No Failure Notification",
            severity: "LOW",
            category: "RELIABILITY",
            location: {},
            evidence: {
              summary: "No notification node or error trigger found",
              detail: "This workflow has network nodes but no error trigger or notification node. Failures in production will be silent.",
            },
            humanExplanation: "Silent failures in automated workflows can go undetected for hours or days, causing data loss or missed business events.",
            suggestedFix: "Add an Error Trigger workflow or connect a Slack/Email notification to the error output of critical nodes.",
            marketplaceBlocking: false,
            docReference: "https://flowintel.io/rules/REL-005",
            penaltyPoints: 8,
          }];
        }
        return [];
      },
    },
  ],
};
