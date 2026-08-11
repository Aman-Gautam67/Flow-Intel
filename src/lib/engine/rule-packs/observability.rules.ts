/**
 * FlowIntel Rule Pack — OBSERVABILITY
 * ─────────────────────────────────────────────────────────────────────────────
 * OBS-001  No execution tracking (missing Set/Code node for audit trail)
 * OBS-002  No monitoring node (no logging / alert integration)
 * OBS-003  Missing workflow description / metadata
 */

import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

const LOGGING_TYPES = new Set([
  "n8n-nodes-base.syslog", "n8n-nodes-base.elasticsearch",
  "n8n-nodes-base.splunk", "n8n-nodes-base.datadog",
  "n8n-nodes-base.redis",  // often used as audit log sink
]);

const MONITORING_KEYWORDS = ["log", "monitor", "audit", "track", "observ", "metric", "alert", "notify"];

function hasMonitoringNode(ast: ParsedWorkflow): boolean {
  return ast.nodes.some(
    (n) =>
      LOGGING_TYPES.has(n.type) ||
      MONITORING_KEYWORDS.some(
        (kw) => n.name.toLowerCase().includes(kw) || n.type.toLowerCase().includes(kw)
      )
  );
}

function hasExecutionTracking(ast: ParsedWorkflow): boolean {
  // Accept: a Set node that captures execution context, a code node with date logging, or an explicit tracking node
  return ast.nodes.some((n) => {
    if (n.type === "n8n-nodes-base.set") {
      const p = JSON.stringify(n.parameters ?? {}).toLowerCase();
      return p.includes("executionid") || p.includes("execution_id") || p.includes("$execution") || p.includes("timestamp");
    }
    if (n.isCode) {
      const code = n.codeMeta?.codeSnippet ?? JSON.stringify(n.parameters ?? {});
      return /\$execution|executionId|Date\.now|new Date/i.test(code);
    }
    return false;
  });
}

export const OBSERVABILITY_PACK: RulePackManifest = {
  id: "flowintel-core-observability",
  name: "FlowIntel Observability Rules",
  version: "2.0.0",
  description: "Detects missing logs, monitoring nodes, and audit trail gaps.",
  rules: [
    // ── OBS-001: No Execution Tracking ────────────────────────────────────────
    {
      id: "OBS-001",
      name: "No Execution Tracking",
      category: "OBSERVABILITY",
      severity: "LOW",
      description: "Workflow contains no execution ID capture or timestamping for audit purposes.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/OBS-001",
      detect(ast: ParsedWorkflow): Finding[] {
        // Only flag workflows with more than 3 nodes to avoid noise on simple automations
        if (ast.nodes.length < 4) return [];
        if (hasExecutionTracking(ast)) return [];
        return [{
          id: "OBS-001-workflow",
          ruleId: "OBS-001",
          ruleName: "No Execution Tracking",
          severity: "LOW",
          category: "OBSERVABILITY",
          location: {},
          evidence: {
            summary: "No execution ID or timestamp captured",
            detail: "This workflow does not capture execution metadata (execution ID, timestamp) — debugging failures and auditing behavior is difficult.",
          },
          humanExplanation: "Without execution tracking, correlating logs with specific runs is impossible. This makes debugging, SLA reporting, and incident response significantly harder.",
          suggestedFix: "Add a 'Set' node at the start of the workflow to capture {{ $execution.id }} and {{ $now }} for downstream use.",
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/OBS-001",
          penaltyPoints: 8,
        }];
      },
    },

    // ── OBS-002: No Monitoring Integration ───────────────────────────────────
    {
      id: "OBS-002",
      name: "No Monitoring Integration",
      category: "OBSERVABILITY",
      severity: "LOW",
      description: "Workflow has no logging or monitoring node — production failures are invisible.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/OBS-002",
      detect(ast: ParsedWorkflow): Finding[] {
        // Only flag workflows with 5+ nodes — tiny automations don't need monitoring
        if (ast.nodes.length < 5) return [];
        if (hasMonitoringNode(ast)) return [];
        return [{
          id: "OBS-002-workflow",
          ruleId: "OBS-002",
          ruleName: "No Monitoring Integration",
          severity: "LOW",
          category: "OBSERVABILITY",
          location: {},
          evidence: {
            summary: "No logging, monitoring, or alerting node found",
            detail: "This workflow has no integration with any monitoring, logging, or observability platform.",
          },
          humanExplanation: "Without monitoring integration, workflow health is opaque. You cannot detect performance degradation, error spikes, or silent data quality issues.",
          suggestedFix: "Add a monitoring node (Datadog, Elasticsearch, Syslog) or instrument key steps with custom logging using a Code node.",
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/OBS-002",
          penaltyPoints: 5,
        }];
      },
    },

    // ── OBS-003: Missing Workflow Description ─────────────────────────────────
    {
      id: "OBS-003",
      name: "Missing Workflow Description",
      category: "OBSERVABILITY",
      severity: "INFO",
      description: "Workflow has no description metadata, making it hard to understand without reading every node.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 0,
      docReference: "https://flowintel.io/rules/OBS-003",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata;
        const hasDesc =
          (meta && typeof (meta as Record<string, unknown>).description === "string" &&
           ((meta as Record<string, unknown>).description as string).trim().length > 20) ||
          (ast.rawWorkflowName && ast.rawWorkflowName !== "My workflow" && ast.rawWorkflowName.length > 5);
        if (hasDesc) return [];
        return [{
          id: "OBS-003-workflow",
          ruleId: "OBS-003",
          ruleName: "Missing Workflow Description",
          severity: "INFO",
          category: "OBSERVABILITY",
          location: {},
          evidence: {
            summary: "No workflow description set",
            detail: "The workflow has no description or only a default name. Documentation makes workflows easier to maintain and audit.",
          },
          humanExplanation: "Undocumented workflows become black boxes over time. Without a description, new team members and reviewers cannot understand the workflow's purpose without reverse-engineering every node.",
          suggestedFix: "Add a description to the workflow in Settings → Workflow description. Include purpose, trigger conditions, and key data flows.",
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/OBS-003",
          penaltyPoints: 3,
        }];
      },
    },
  ],
};
