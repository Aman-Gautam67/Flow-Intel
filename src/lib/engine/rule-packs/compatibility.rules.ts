/**
 * FlowIntel Rule Pack — COMPATIBILITY
 * ─────────────────────────────────────────────────────────────────────────────
 * CMP-001  Deprecated node types detected
 * CMP-002  Community node dependency (may not be installed)
 * CMP-003  Missing n8n version metadata
 */

import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

// Confirmed deprecated n8n node types and their replacements
const DEPRECATED_NODES: Record<string, { replacement: string; since: string }> = {
  "n8n-nodes-base.function":           { replacement: "n8n-nodes-base.code", since: "0.198" },
  "n8n-nodes-base.functionItem":       { replacement: "n8n-nodes-base.code", since: "0.198" },
  "n8n-nodes-base.itemLists":          { replacement: "n8n-nodes-base.splitOut", since: "1.0" },
  "n8n-nodes-base.merge2":             { replacement: "n8n-nodes-base.merge", since: "0.220" },
  "n8n-nodes-base.dateTime":           { replacement: "n8n-nodes-base.dateTime (v2)", since: "1.2" },
  "n8n-nodes-base.httpRequestV2":      { replacement: "n8n-nodes-base.httpRequest (v4)", since: "0.200" },
  "@n8n/n8n-nodes-langchain.lmOpenAi": { replacement: "@n8n/n8n-nodes-langchain.lmChatOpenAi", since: "1.3" },
};

// Community (non-core) node prefixes that indicate optional dependencies
const COMMUNITY_PREFIXES = [
  "n8n-nodes-", // third-party packages not in n8n-nodes-base
];
const OFFICIAL_PREFIXES = [
  "n8n-nodes-base.",
  "@n8n/n8n-nodes-langchain.",
  "n8n-nodes-base",
];

function isCommunityNode(nodeType: string): boolean {
  if (OFFICIAL_PREFIXES.some((p) => nodeType.startsWith(p))) return false;
  return COMMUNITY_PREFIXES.some((p) => nodeType.startsWith(p));
}

function makeFindingId(ruleId: string, nodeId: string): string {
  return `${ruleId}-${nodeId}`;
}

export const COMPATIBILITY_PACK: RulePackManifest = {
  id: "flowintel-core-compatibility",
  name: "FlowIntel Compatibility Rules",
  version: "2.0.0",
  description: "Detects deprecated node types, community node dependencies, and version incompatibilities.",
  rules: [
    // ── CMP-001: Deprecated Node Types ────────────────────────────────────────
    {
      id: "CMP-001",
      name: "Deprecated Node Type",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Workflow uses officially deprecated node types that may be removed in future versions.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/CMP-001",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const info = DEPRECATED_NODES[node.type];
          if (!info) continue;
          findings.push({
            id: makeFindingId("CMP-001", node.id),
            ruleId: "CMP-001",
            ruleName: "Deprecated Node Type",
            severity: "HIGH",
            category: "COMPATIBILITY",
            location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
            evidence: {
              summary: `${node.type} deprecated since n8n v${info.since}`,
              detail: `Node "${node.name}" uses the deprecated type "${node.type}". Recommended replacement: "${info.replacement}".`,
            },
            humanExplanation: `This node type was deprecated in n8n v${info.since}. It may be removed in a future version, breaking this workflow without warning.`,
            suggestedFix: `Replace "${node.name}" with a "${info.replacement}" node. Most parameters map directly.`,
            marketplaceBlocking: true,
            docReference: "https://flowintel.io/rules/CMP-001",
            penaltyPoints: 20,
          });
        }
        return findings;
      },
    },

    // ── CMP-002: Community Node Dependency ────────────────────────────────────
    {
      id: "CMP-002",
      name: "Community Node Dependency",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "Workflow depends on community nodes that may not be installed on the target n8n instance.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/CMP-002",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const seen = new Set<string>();
        for (const node of ast.nodes) {
          if (!isCommunityNode(node.type)) continue;
          if (seen.has(node.type)) continue;
          seen.add(node.type);
          findings.push({
            id: makeFindingId("CMP-002", node.id),
            ruleId: "CMP-002",
            ruleName: "Community Node Dependency",
            severity: "MEDIUM",
            category: "COMPATIBILITY",
            location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
            evidence: {
              summary: `Community node: ${node.type}`,
              detail: `Node "${node.name}" uses "${node.type}", which is a community/third-party package. It must be manually installed on every n8n instance.`,
            },
            humanExplanation: "Community nodes are not bundled with n8n. Users who import this workflow must install the community package separately, and availability may change without notice.",
            suggestedFix: `Document the required community node "${node.type}" in the workflow README. Consider whether a built-in node can replace it.`,
            marketplaceBlocking: false,
            docReference: "https://flowintel.io/rules/CMP-002",
            penaltyPoints: 12,
          });
        }
        return findings;
      },
    },

    // ── CMP-003: Missing Version Metadata ─────────────────────────────────────
    {
      id: "CMP-003",
      name: "Missing Version Metadata",
      category: "COMPATIBILITY",
      severity: "INFO",
      description: "Workflow has no recorded n8n version — compatibility cannot be verified.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 0,
      docReference: "https://flowintel.io/rules/CMP-003",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string, unknown> | undefined;
        const hasVersion = meta?.n8nVersion || meta?.version || meta?.engineVersion || ast.platformVersion;
        if (hasVersion) return [];
        return [{
          id: "CMP-003-workflow",
          ruleId: "CMP-003",
          ruleName: "Missing Version Metadata",
          severity: "INFO",
          category: "COMPATIBILITY",
          location: {},
          evidence: {
            summary: "No n8n version recorded in workflow metadata",
            detail: "This workflow was exported without version metadata. It cannot be verified whether it is compatible with the current n8n version.",
          },
          humanExplanation: "Without version metadata, FlowIntel cannot warn if the workflow uses features that changed between the authoring version and the installed version.",
          suggestedFix: "Export the workflow from an up-to-date n8n instance to include version metadata.",
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/CMP-003",
          penaltyPoints: 0,
        }];
      },
    },
  ],
};
