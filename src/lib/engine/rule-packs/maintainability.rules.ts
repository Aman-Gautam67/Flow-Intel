/**
 * FlowIntel Rule Pack — MAINTAINABILITY
 * ─────────────────────────────────────────────────────────────────────────────
 * MNT-001  Dead / orphaned nodes (not connected to anything)
 * MNT-002  Giant code node (>80 lines)
 * MNT-003  Unnamed / default-named nodes
 * MNT-004  Duplicate node names
 * MNT-005  Disabled nodes in production workflow
 */

import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

const DEFAULT_NODE_NAMES = [
  /^(set|code|function|if|switch|merge|split|aggregate|http request|webhook|schedule trigger|manual trigger|start)\s*\d*$/i,
  /^node\s*\d+$/i,
  /^new node$/i,
  /^my node$/i,
];

function isDefaultName(name: string): boolean {
  return DEFAULT_NODE_NAMES.some((re) => re.test(name.trim()));
}

function isOrphaned(nodeName: string, ast: ParsedWorkflow): boolean {
  // A node is orphaned if it has no incoming AND no outgoing edges
  const hasEdge = ast.edges.some(
    (e) => e.source === nodeName || e.target === nodeName
  );
  return !hasEdge;
}

function countCodeLines(node: { parameters?: unknown; codeMeta?: { codeSnippet?: string } }): number {
  const code = node.codeMeta?.codeSnippet ??
    (node.parameters as Record<string, unknown> | undefined)?.jsCode ??
    (node.parameters as Record<string, unknown> | undefined)?.pythonCode ?? "";
  if (typeof code !== "string") return 0;
  return code.split("\n").filter((l) => l.trim()).length;
}

function makeFindingId(ruleId: string, nodeId: string, suffix?: string): string {
  return [ruleId, nodeId, suffix].filter(Boolean).join("-");
}

export const MAINTAINABILITY_PACK: RulePackManifest = {
  id: "flowintel-core-maintainability",
  name: "FlowIntel Maintainability Rules",
  version: "2.0.0",
  description: "Detects dead nodes, giant code, unnamed nodes, and other maintenance issues.",
  rules: [
    // ── MNT-001: Orphaned Node ─────────────────────────────────────────────────
    {
      id: "MNT-001",
      name: "Orphaned Node",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Nodes with no incoming or outgoing connections are dead weight — they never execute.",
      enabled: false,
      marketplaceBlocking: false,
      penaltyPoints: 6,
      docReference: "https://flowintel.io/rules/MNT-001",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.isTrigger) continue; // triggers may have no incoming edges
          if (isOrphaned(node.name, ast)) {
            findings.push({
              id: makeFindingId("MNT-001", node.id),
              ruleId: "MNT-001",
              ruleName: "Orphaned Node",
              severity: "LOW",
              category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: {
                summary: "Node has no connections",
                detail: `Node "${node.name}" (${node.type}) has no incoming or outgoing edges — it will never execute.`,
              },
              humanExplanation: "Orphaned nodes are dead code in your workflow. They add visual noise and confuse maintainers.",
              suggestedFix: `Delete node "${node.name}" or connect it to the workflow.`,
              autoFix: {
                description: `Remove orphaned node "${node.name}"`,
                manualInstruction: `Select "${node.name}" and press Delete.`,
              },
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/MNT-001",
              penaltyPoints: 6,
            });
          }
        }
        return findings;
      },
    },

    // ── MNT-002: Giant Code Node ───────────────────────────────────────────────
    {
      id: "MNT-002",
      name: "Giant Code Node",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Code nodes with more than 80 non-empty lines should be split into smaller, testable units.",
      enabled: false,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/MNT-002",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const lines = countCodeLines(node);
          if (lines > 80) {
            findings.push({
              id: makeFindingId("MNT-002", node.id),
              ruleId: "MNT-002",
              ruleName: "Giant Code Node",
              severity: "MEDIUM",
              category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: {
                summary: `${lines} non-empty lines of code`,
                detail: `Code node "${node.name}" contains ${lines} lines. Large code nodes are hard to review, test, and maintain.`,
              },
              humanExplanation: "Code nodes over 80 lines typically contain multiple responsibilities. This violates single-responsibility and makes the node fragile and hard to debug.",
              suggestedFix: `Split "${node.name}" into multiple focused code nodes, each under 50 lines. Extract reusable logic into separate Code nodes.`,
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/MNT-002",
              penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    // ── MNT-003: Unnamed Nodes ─────────────────────────────────────────────────
    {
      id: "MNT-003",
      name: "Unnamed / Default-Named Nodes",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Nodes still using default generated names are harder to understand at a glance.",
      enabled: false,
      marketplaceBlocking: false,
      penaltyPoints: 4,
      docReference: "https://flowintel.io/rules/MNT-003",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (isDefaultName(node.name)) {
            findings.push({
              id: makeFindingId("MNT-003", node.id),
              ruleId: "MNT-003",
              ruleName: "Unnamed / Default-Named Nodes",
              severity: "LOW",
              category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: {
                summary: `Default node name: "${node.name}"`,
                detail: `Node "${node.name}" uses a generated default name that doesn't describe its purpose.`,
              },
              humanExplanation: "Descriptive node names make workflows self-documenting. Default names like 'HTTP Request 3' provide no business context.",
              suggestedFix: `Rename "${node.name}" to describe what it does, e.g. 'Fetch Customer Data from Stripe'.`,
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/MNT-003",
              penaltyPoints: 4,
            });
          }
        }
        return findings;
      },
    },

    // ── MNT-004: Duplicate Node Names ─────────────────────────────────────────
    {
      id: "MNT-004",
      name: "Duplicate Node Names",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Duplicate node names cause confusion in expressions and debugging.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/MNT-004",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const seen = new Map<string, string>();
        for (const node of ast.nodes) {
          const lower = node.name.toLowerCase().trim();
          if (seen.has(lower)) {
            findings.push({
              id: makeFindingId("MNT-004", node.id),
              ruleId: "MNT-004",
              ruleName: "Duplicate Node Names",
              severity: "MEDIUM",
              category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: {
                summary: `Duplicate name: "${node.name}"`,
                detail: `Node "${node.name}" shares its name with another node in the workflow. n8n expressions reference nodes by name — duplicates cause unpredictable behavior.`,
              },
              humanExplanation: "n8n resolves node references by name. Duplicate names make expression outputs ambiguous and can cause silent data errors.",
              suggestedFix: `Rename one of the nodes named "${node.name}" to be unique.`,
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/MNT-004",
              penaltyPoints: 8,
            });
          } else {
            seen.set(lower, node.id);
          }
        }
        return findings;
      },
    },

    // ── MNT-005: Disabled Nodes in Workflow ───────────────────────────────────
    {
      id: "MNT-005",
      name: "Disabled Nodes in Workflow",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Disabled nodes in a production workflow indicate incomplete development or forgotten debug code.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/MNT-005",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.disabled) {
            findings.push({
              id: makeFindingId("MNT-005", node.id),
              ruleId: "MNT-005",
              ruleName: "Disabled Nodes in Workflow",
              severity: "LOW",
              category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: {
                summary: `Node "${node.name}" is disabled`,
                detail: `Node "${node.name}" is disabled but still present in the workflow. This is typically debug code that was never cleaned up.`,
              },
              humanExplanation: "Disabled nodes in published workflows are confusing for users who try to understand the automation. They may also hide security or logic issues.",
              suggestedFix: `Either re-enable "${node.name}" (if it should be active) or delete it (if it was leftover debugging code).`,
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/MNT-005",
              penaltyPoints: 5,
            });
          }
        }
        return findings;
      },
    },
  ],
};
