/**
 * FlowIntel Observability Extension — OBS-004 to OBS-020
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

export const OBSERVABILITY_EXT: RulePackManifest = {
  id: "flowintel-observability-ext",
  name: "FlowIntel Observability Extension",
  version: "2.0.0",
  description: "OBS-004 through OBS-020: tracing, owner metadata, alerts, audit trail, health monitors.",
  rules: [
    {
      id: "OBS-004",
      name: "Missing Execution Correlation ID",
      category: "OBSERVABILITY",
      severity: "MEDIUM",
      description: "Workflow does not propagate a correlation ID through its HTTP calls for distributed tracing.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/OBS-004",
      detect(ast: ParsedWorkflow): Finding[] {
        const httpNodes = ast.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
        if (httpNodes.length === 0) return [];
        const hasCorrelationId = httpNodes.some((n) => {
          const s = ps(n);
          return /x-correlation-id|x-request-id|traceparent|tracestate|x-trace/i.test(s);
        });
        if (hasCorrelationId) return [];
        return httpNodes.slice(0, 1).map((node) => ({
          id: fid("OBS-004", node.id), ruleId: "OBS-004",
          ruleName: "Missing Execution Correlation ID",
          severity: "MEDIUM" as const, category: "OBSERVABILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "HTTP requests with no correlation ID header", detail: "Outbound HTTP calls do not include a correlation ID — tracing requests across systems is impossible." },
          humanExplanation: "Without correlation IDs, connecting an n8n execution to a request in downstream logs requires manual timestamp matching.",
          suggestedFix: "Add X-Correlation-ID: {{$execution.id}} header to all outbound HTTP Request nodes.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-004", penaltyPoints: 8,
        }));
      },
    },

    {
      id: "OBS-005",
      name: "Missing Workflow Owner / Contact Metadata",
      category: "OBSERVABILITY",
      severity: "LOW",
      description: "Workflow has no owner name or contact information in its metadata or description.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/OBS-005",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const desc = ast.rawWorkflowName ?? "";
        const hasOwner = meta?.owner || meta?.contact || meta?.author || meta?.team ||
          /owner:|contact:|maintained by:|team:/i.test(desc);
        if (hasOwner) return [];
        return [{
          id: "OBS-005-workflow", ruleId: "OBS-005",
          ruleName: "Missing Workflow Owner / Contact Metadata",
          severity: "LOW", category: "OBSERVABILITY",
          location: {},
          evidence: { summary: "No owner/contact in metadata", detail: "Workflow has no owner or contact information — impossible to know who to contact when it breaks." },
          humanExplanation: "Ownerless workflows become abandoned. When they fail in production, there is no one to notify.",
          suggestedFix: "Add owner, team, and contact fields to the workflow metadata or pinned notes node.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-005", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "OBS-006",
      name: "Missing Structured Logging",
      category: "OBSERVABILITY",
      severity: "MEDIUM",
      description: "Code nodes log unstructured plain strings instead of JSON-structured log entries.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/OBS-006",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          const hasLog = /console\.(log|info|warn|error)\s*\(/.test(code);
          const hasStructured = /console\.(log|info|warn|error)\s*\(\s*JSON\.stringify|console\.(log|info|warn|error)\s*\(\s*\{/.test(code);
          if (hasLog && !hasStructured) {
            findings.push({
              id: fid("OBS-006", node.id), ruleId: "OBS-006",
              ruleName: "Missing Structured Logging",
              severity: "MEDIUM", category: "OBSERVABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Unstructured console.log in code node", detail: `"${node.name}" logs plain strings — not parseable by log aggregation tools.` },
              humanExplanation: "Unstructured logs cannot be queried, filtered, or alerted on by log management systems like Datadog, Splunk, or CloudWatch.",
              suggestedFix: `Change console.log in "${node.name}" to output JSON objects: console.log(JSON.stringify({event:'...', nodeId:'...', data:...}))`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-006", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "OBS-007",
      name: "No Success Metric Logged",
      category: "OBSERVABILITY",
      severity: "LOW",
      description: "Workflow does not log or emit a success metric on completion.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/OBS-007",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasMetric = ast.nodes.some((n) => {
          const s = ps(n);
          return /metric|counter|gauge|statsd|datadog|prometheus|success.*count|processed.*count/i.test(s);
        });
        if (hasMetric) return [];
        if (ast.nodes.length < 5) return [];
        return [{
          id: "OBS-007-workflow", ruleId: "OBS-007",
          ruleName: "No Success Metric Logged",
          severity: "LOW", category: "OBSERVABILITY",
          location: {},
          evidence: { summary: "No success metric emission found", detail: "Workflow completes successfully but emits no metric or counter — impossible to trend success rate over time." },
          humanExplanation: "Without success metrics, you cannot detect gradual degradation — e.g. success rate dropping from 99% to 80% over a week.",
          suggestedFix: "Add a Code node at the end of the success path that increments a success counter metric via Datadog, Prometheus, or a custom DB counter.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-007", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "OBS-008",
      name: "Missing Execution Duration Tracking",
      category: "OBSERVABILITY",
      severity: "LOW",
      description: "Long workflow does not record execution duration for performance monitoring.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/OBS-008",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.nodes.length < 10) return [];
        const hasDuration = ast.nodes.some((n) => {
          const s = ps(n);
          return /duration|executionTime|elapsedMs|startTime|endTime|Date\.now/i.test(s);
        });
        if (hasDuration) return [];
        return [{
          id: "OBS-008-workflow", ruleId: "OBS-008",
          ruleName: "Missing Execution Duration Tracking",
          severity: "LOW", category: "OBSERVABILITY",
          location: {},
          evidence: { summary: "No duration tracking in long workflow", detail: `Workflow has ${ast.nodes.length} nodes but does not measure or log execution duration.` },
          humanExplanation: "Without duration tracking, detecting performance regressions requires manual log analysis.",
          suggestedFix: "Record Date.now() at the start and end of the workflow, then log the duration for trend analysis.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-008", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "OBS-009",
      name: "No Alert on Critical Failure",
      category: "OBSERVABILITY",
      severity: "HIGH",
      description: "Workflow with critical operations has no alerting node on the error path.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/OBS-009",
      detect(ast: ParsedWorkflow): Finding[] {
        const CRITICAL = new Set(["n8n-nodes-base.stripe","n8n-nodes-base.paypal","n8n-nodes-base.postgres","n8n-nodes-base.mysql"]);
        const hasCritical = ast.nodes.some((n) => CRITICAL.has(n.type));
        if (!hasCritical) return [];
        const ALERT = new Set(["n8n-nodes-base.slack","n8n-nodes-base.pagerDuty","n8n-nodes-base.opsgenie","n8n-nodes-base.telegram","n8n-nodes-base.discord"]);
        const hasAlert = ast.nodes.some((n) => ALERT.has(n.type));
        if (hasAlert) return [];
        return [{
          id: "OBS-009-workflow", ruleId: "OBS-009",
          ruleName: "No Alert on Critical Failure",
          severity: "HIGH", category: "OBSERVABILITY",
          location: {},
          evidence: { summary: "Critical operation with no alert node", detail: "Workflow performs critical operations (payments/DB) but has no alerting node — failures are silent in production." },
          humanExplanation: "Silent failures in critical business workflows can cause revenue loss, data inconsistency, or SLA violations going unnoticed for hours.",
          suggestedFix: "Add a Slack or PagerDuty alert node on the error path of all critical-operation nodes.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-009", penaltyPoints: 15,
        }];
      },
    },

    {
      id: "OBS-010",
      name: "Missing Workflow Description / Purpose Statement",
      category: "OBSERVABILITY",
      severity: "LOW",
      description: "Workflow has no description field explaining its purpose.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/OBS-010",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasDesc = meta?.description || meta?.purpose || meta?.notes;
        if (hasDesc) return [];
        return [{
          id: "OBS-010-workflow", ruleId: "OBS-010",
          ruleName: "Missing Workflow Description / Purpose Statement",
          severity: "LOW", category: "OBSERVABILITY",
          location: {},
          evidence: { summary: "No description in workflow metadata", detail: "Workflow metadata contains no description of what this workflow does or why it exists." },
          humanExplanation: "Undocumented workflows become mysterious black boxes that no one dares touch or modify.",
          suggestedFix: "Add a description to the workflow explaining: what it does, what triggers it, and what systems it integrates.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-010", penaltyPoints: 3,
        }];
      },
    },

    {
      id: "OBS-011",
      name: "Missing Error Rate Alerting Threshold",
      category: "OBSERVABILITY",
      severity: "MEDIUM",
      description: "No error rate or failure count threshold defined for operational alerting.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/OBS-011",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasErrorHandling = ast.edges.some((e) => e.sourceHandle === "error" || e.type === "error");
        if (!hasErrorHandling) return [];
        const hasThreshold = ast.nodes.some((n) => {
          const s = ps(n);
          return /errorRate|failureThreshold|maxErrors|alertAfter|errorCount.*>/i.test(s);
        });
        if (hasThreshold) return [];
        return [{
          id: "OBS-011-workflow", ruleId: "OBS-011",
          ruleName: "Missing Error Rate Alerting Threshold",
          severity: "MEDIUM", category: "OBSERVABILITY",
          location: {},
          evidence: { summary: "Error handling without threshold-based alerting", detail: "Workflow catches errors but has no error rate threshold to trigger alerts — cannot distinguish rare vs. widespread failures." },
          humanExplanation: "A single rare error is OK; 100 errors per minute is an incident. Without thresholds you cannot tell the difference automatically.",
          suggestedFix: "Track error counts in Redis/DB and send an alert when the error rate exceeds a defined threshold (e.g. 10/minute).",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-011", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "OBS-012",
      name: "No Audit Trail for Data Modification",
      category: "OBSERVABILITY",
      severity: "HIGH",
      description: "Workflow modifies database records without writing an audit trail entry.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/OBS-012",
      detect(ast: ParsedWorkflow): Finding[] {
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb","n8n-nodes-base.airtable"]);
        const hasModify = ast.nodes.some((n) => {
          if (!DB.has(n.type)) return false;
          const op = String((n.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          return ["update","delete","patch","modify","remove"].some((v) => op.includes(v));
        });
        if (!hasModify) return [];
        const hasAudit = ast.nodes.some((n) => {
          const s = ps(n);
          return /audit|auditLog|activityLog|changeLog|history/i.test(s);
        });
        if (hasAudit) return [];
        return [{
          id: "OBS-012-workflow", ruleId: "OBS-012",
          ruleName: "No Audit Trail for Data Modification",
          severity: "HIGH", category: "OBSERVABILITY",
          location: {},
          evidence: { summary: "Data modification without audit trail", detail: "Workflow modifies database records with no audit log — impossible to trace who changed what and when." },
          humanExplanation: "Regulatory frameworks (GDPR, SOX, HIPAA) require audit trails for data modifications. Without one, compliance audits will fail.",
          suggestedFix: "Before each UPDATE/DELETE, write an audit entry (user, action, before-value, timestamp) to an audit_log table.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-012", penaltyPoints: 15,
        }];
      },
    },

    {
      id: "OBS-013",
      name: "Missing SLA Tracking",
      category: "OBSERVABILITY",
      severity: "MEDIUM",
      description: "Customer-facing workflow does not measure or record latency against an SLA.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/OBS-013",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasWebhook = ast.nodes.some((n) => n.type === "n8n-nodes-base.webhook");
        if (!hasWebhook) return [];
        const hasSLA = ast.nodes.some((n) => {
          const s = ps(n);
          return /sla|latency|p99|p95|responseTime|targetMs/i.test(s);
        });
        if (hasSLA) return [];
        return [{
          id: "OBS-013-workflow", ruleId: "OBS-013",
          ruleName: "Missing SLA Tracking",
          severity: "MEDIUM", category: "OBSERVABILITY",
          location: {},
          evidence: { summary: "Webhook workflow with no SLA/latency tracking", detail: "Customer-facing webhook workflow does not measure execution latency against an SLA target." },
          humanExplanation: "Without SLA tracking, you cannot proactively detect when response times degrade before customers complain.",
          suggestedFix: "Record start/end timestamps and compare to your SLA target. Alert if execution exceeds the threshold.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-013", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "OBS-014",
      name: "Missing Workflow Version in Logs",
      category: "OBSERVABILITY",
      severity: "LOW",
      description: "Log entries do not include the workflow version — impossible to attribute issues to specific deployments.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/OBS-014",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasLogs = ast.nodes.some((n) => {
          const s = ps(n);
          return /console\.(log|info|warn|error)/i.test(s);
        });
        if (!hasLogs) return [];
        const hasVersion = ast.nodes.some((n) => {
          const s = ps(n);
          return /workflowVersion|version.*log|log.*version|\$workflow\.id/i.test(s);
        });
        if (hasVersion) return [];
        return [{
          id: "OBS-014-workflow", ruleId: "OBS-014",
          ruleName: "Missing Workflow Version in Logs",
          severity: "LOW", category: "OBSERVABILITY",
          location: {},
          evidence: { summary: "Logs do not include workflow version", detail: "Log entries cannot be tied to a specific workflow version — debugging regressions across deployments is difficult." },
          humanExplanation: "Without workflow version in logs, you cannot determine whether a bug appeared before or after a deployment.",
          suggestedFix: "Include $workflow.id and a version tag in all log entries.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-014", penaltyPoints: 3,
        }];
      },
    },

    {
      id: "OBS-015",
      name: "Silent Data Transformation — No Logging",
      category: "OBSERVABILITY",
      severity: "LOW",
      description: "Set/EditFields transform node with no logging — transformation errors are invisible.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/OBS-015",
      detect(ast: ParsedWorkflow): Finding[] {
        const transforms = ast.nodes.filter((n) =>
          n.type === "n8n-nodes-base.set" || n.type === "n8n-nodes-base.editFields"
        );
        if (transforms.length === 0) return [];
        const hasLog = ast.nodes.some((n) => {
          const s = ps(n);
          return /console\.(log|info)/.test(s);
        });
        if (hasLog) return [];
        return transforms.slice(0, 1).map((node) => ({
          id: fid("OBS-015", node.id), ruleId: "OBS-015",
          ruleName: "Silent Data Transformation — No Logging",
          severity: "LOW" as const, category: "OBSERVABILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Transform with no log node in workflow", detail: `"${node.name}" transforms data but no log node exists — data shape changes are invisible.` },
          humanExplanation: "Data transformation bugs are among the hardest to debug without logging the before/after shapes.",
          suggestedFix: "Add a Code node after key transforms that logs the output shape for debugging.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-015", penaltyPoints: 3,
        }));
      },
    },

    {
      id: "OBS-016",
      name: "No Execution ID in External API Calls",
      category: "OBSERVABILITY",
      severity: "LOW",
      description: "Outbound HTTP calls do not include the n8n execution ID for cross-system tracing.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/OBS-016",
      detect(ast: ParsedWorkflow): Finding[] {
        const httpNodes = ast.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
        if (httpNodes.length === 0) return [];
        const hasExecId = httpNodes.some((n) => {
          const s = ps(n);
          return /\$execution\.id|\$executionId|execution-id/i.test(s);
        });
        if (hasExecId) return [];
        return httpNodes.slice(0, 1).map((node) => ({
          id: fid("OBS-016", node.id), ruleId: "OBS-016",
          ruleName: "No Execution ID in External API Calls",
          severity: "LOW" as const, category: "OBSERVABILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "HTTP call without execution ID header", detail: `"${node.name}" does not pass the n8n execution ID in outbound calls.` },
          humanExplanation: "Without the execution ID in external calls, correlating n8n logs with downstream service logs requires manual timestamp matching.",
          suggestedFix: "Add X-N8N-Execution-ID: {{$execution.id}} header to outbound HTTP Request nodes.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-016", penaltyPoints: 3,
        }));
      },
    },

    {
      id: "OBS-017",
      name: "Missing Dead Node Annotation",
      category: "OBSERVABILITY",
      severity: "INFO",
      description: "Disabled nodes remain in the workflow without a comment explaining why.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 0,
      docReference: "https://flowintel.io/rules/OBS-017",
      detect(ast: ParsedWorkflow): Finding[] {
        const disabled = ast.nodes.filter((n) => n.disabled === true);
        if (disabled.length === 0) return [];
        return disabled.map((node) => ({
          id: fid("OBS-017", node.id), ruleId: "OBS-017",
          ruleName: "Missing Dead Node Annotation",
          severity: "INFO" as const, category: "OBSERVABILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Disabled node with no explanation", detail: `Node "${node.name}" is disabled but has no annotation explaining why it was kept.` },
          humanExplanation: "Disabled nodes confuse future maintainers — they cannot tell if it was intentionally disabled or accidentally forgotten.",
          suggestedFix: `Either remove "${node.name}" or add a sticky note explaining why it is kept disabled.`,
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-017", penaltyPoints: 2,
        }));
      },
    },

    {
      id: "OBS-018",
      name: "No Monitoring Heartbeat for Long-Running Workflow",
      category: "OBSERVABILITY",
      severity: "MEDIUM",
      description: "Long-running workflow does not emit periodic heartbeat signals for external monitoring.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/OBS-018",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.nodes.length < 12) return [];
        const hasHeartbeat = ast.nodes.some((n) => {
          const s = ps(n) + n.name.toLowerCase();
          return /heartbeat|healthPing|monitorPing|keepAlive|checkIn/i.test(s);
        });
        if (hasHeartbeat) return [];
        return [{
          id: "OBS-018-workflow", ruleId: "OBS-018",
          ruleName: "No Monitoring Heartbeat for Long-Running Workflow",
          severity: "MEDIUM", category: "OBSERVABILITY",
          location: {},
          evidence: { summary: "Long workflow with no heartbeat", detail: `Workflow has ${ast.nodes.length} nodes but emits no heartbeat — external monitors cannot verify it is still running.` },
          humanExplanation: "A workflow that silently hangs mid-execution looks the same as one that never started. Heartbeats let monitors detect stuck executions.",
          suggestedFix: "Add periodic HTTP Request nodes to a Dead Man's Switch service (e.g. Healthchecks.io) at key workflow milestones.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-018", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "OBS-019",
      name: "Log Entries Without Severity Levels",
      category: "OBSERVABILITY",
      severity: "LOW",
      description: "Code nodes use only console.log without differentiating severity (warn, error, info).",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/OBS-019",
      detect(ast: ParsedWorkflow): Finding[] {
        const codeNodes = ast.nodes.filter((n) => n.isCode);
        if (codeNodes.length === 0) return [];
        return codeNodes.filter((node) => {
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          return /console\.log/.test(code) && !/console\.(warn|error|info)/.test(code);
        }).map((node) => ({
          id: fid("OBS-019", node.id), ruleId: "OBS-019",
          ruleName: "Log Entries Without Severity Levels",
          severity: "LOW" as const, category: "OBSERVABILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Only console.log, no warn/error/info", detail: `"${node.name}" uses only console.log — all log entries have the same severity, making filtering impossible.` },
          humanExplanation: "Log management systems filter by severity. Without levels, every log line looks equally important.",
          suggestedFix: "Use console.info for normal events, console.warn for recoverable issues, and console.error for failures.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-019", penaltyPoints: 3,
        }));
      },
    },

    {
      id: "OBS-020",
      name: "Missing Workflow Tags for Environment Classification",
      category: "OBSERVABILITY",
      severity: "INFO",
      description: "Workflow has no environment or classification tags (prod, staging, dev, critical).",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 0,
      docReference: "https://flowintel.io/rules/OBS-020",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasTags = meta?.tags || meta?.environment || meta?.classification;
        if (hasTags) return [];
        return [{
          id: "OBS-020-workflow", ruleId: "OBS-020",
          ruleName: "Missing Workflow Tags for Environment Classification",
          severity: "INFO", category: "OBSERVABILITY",
          location: {},
          evidence: { summary: "No environment/classification tags", detail: "Workflow has no tags indicating its environment (prod/staging/dev) or criticality level." },
          humanExplanation: "Without environment tags, filtering and managing workflows across environments requires manual inspection.",
          suggestedFix: "Add tags to the workflow: environment (prod/staging/dev), team, and criticality (critical/high/medium/low).",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/OBS-020", penaltyPoints: 2,
        }];
      },
    },
  ],
};
