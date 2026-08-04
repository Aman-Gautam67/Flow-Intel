import type { AuditFlag, DebtProfile, ParsedWorkflow } from "@/types";

// ─── PILLAR 6: HYGIENE (was: Health + Debt-node-level) ────────────────────────
//
// Owns:
//   • Orphaned / disconnected nodes (was HEALTH_ORPHAN_NODE)
//   • Disabled nodes left in graph   (was DEBT_DISABLED_NODE)
//   • Deprecated node types          (was HEALTH_DEPRECATED_NODE)
//   • Version lag                    (was DEBT_VERSION_LAG)
//   • Missing credentials            (was HEALTH_MISSING_CREDENTIAL)
//
// DOUBLE-JEOPARDY FIX:
//   - Orphan nodes no longer fire in debt.rule.ts (removed from there entirely)
//   - Disabled nodes no longer fire in health.rule.ts (removed from there)
//   - They each fire in EXACTLY ONE pillar (HYGIENE) under the HYGIENE category
//
// CONTEXT-AWARE FIX:
//   - Missing credential check now skips nodes whose URL field contains
//     an expression ({{ $json.apiKey }}), because credentials can be
//     injected dynamically at runtime.

const DEPRECATED_VERSIONS: Record<string, number> = {
  "n8n-nodes-base.httpRequest":    3,
  "n8n-nodes-base.function":       1,  // fully deprecated → Code node
  "n8n-nodes-base.functionItem":   1,  // fully deprecated → Code node
  "n8n-nodes-base.set":            3,
  "n8n-nodes-base.editFields":     1,
  "n8n-nodes-base.spreadsheetFile":2,
  "n8n-nodes-base.code":           2,
  "n8n-nodes-base.if":             2,
  "n8n-nodes-base.splitInBatches": 3,
};

const CRED_REQUIRED_TYPES = new Set([
  "n8n-nodes-base.slack", "n8n-nodes-base.gmail", "n8n-nodes-base.github",
  "n8n-nodes-base.stripe", "n8n-nodes-base.postgres", "n8n-nodes-base.mysql",
  "n8n-nodes-base.mongodb", "n8n-nodes-base.notion", "n8n-nodes-base.airtable",
  "@n8n/n8n-nodes-langchain.openAi", "@n8n/n8n-nodes-langchain.lmOpenAi",
  "@n8n/n8n-nodes-langchain.lmAnthropic", "n8n-nodes-base.openAi",
]);

/** Returns true if any URL-like field in the node's parameters contains an expression */
function nodeUrlIsExpression(params: unknown): boolean {
  if (!params || typeof params !== "object") return false;
  const p = params as Record<string, unknown>;
  const urlFields = ["url", "webhookUrl", "endpoint", "baseUrl", "apiUrl", "uri"];
  for (const k of urlFields) {
    const v = p[k];
    if (typeof v === "string" && (v.includes("={{") || v.includes("{{"))) return true;
  }
  return false;
}

export function runHealthRules(
  parsed: ParsedWorkflow,
  connections: Record<string, unknown>
): { flags: AuditFlag[]; profile: DebtProfile } {
  const flags: AuditFlag[] = [];
  const nodes = parsed.nodes;

  const disabledNodes: string[] = [];
  const orphanNodes: string[] = [];
  let versionLagCount = 0;

  // ── Build connected node set ──────────────────────────────────────────────
  const connectedIds = new Set<string>();
  for (const [srcName, outputs] of Object.entries(connections)) {
    connectedIds.add(srcName);
    if (!outputs || typeof outputs !== "object") continue;
    for (const outputArr of Object.values(outputs as Record<string, unknown>)) {
      if (!Array.isArray(outputArr)) continue;
      for (const targets of outputArr) {
        if (!Array.isArray(targets)) continue;
        for (const t of targets) {
          if (t && typeof t === "object" && "node" in t) {
            connectedIds.add((t as { node: string }).node);
          }
        }
      }
    }
  }

  for (const node of nodes) {
    const isTrigger = node.isTrigger || node.type.toLowerCase().includes("trigger");
    const isConnected = connectedIds.has(node.name) || connectedIds.has(node.id);

    // ── Orphan nodes (NOT disabled; disconnected from execution path) ────────
    if (!isTrigger && !node.disabled && !isConnected) {
      orphanNodes.push(node.name);
      flags.push({
        id: `HYGIENE_ORPHAN_${node.id}`,
        rule: "HYGIENE_ORPHAN_NODE",
        severity: "WARNING",
        category: "HYGIENE",
        title: "Disconnected node",
        detail: `Node "${node.name}" (${node.type}) is not connected to any other node and will never execute.`,
        nodeName: node.name, nodeType: node.type, ptsDeducted: 15,
        remediation: {
          description: "Connect this node or delete it if unused.",
          n8nUiInstruction: `Right-click "${node.name}" → Delete, or connect it to the preceding step.`,
        },
      });
    }

    // ── Disabled nodes ───────────────────────────────────────────────────────
    if (node.disabled) {
      disabledNodes.push(node.name);
      flags.push({
        id: `HYGIENE_DISABLED_${node.id}`,
        rule: "HYGIENE_DISABLED_NODE",
        severity: "INFO",
        category: "HYGIENE",
        title: "Disabled node",
        detail: `Node "${node.name}" is disabled and will not execute. Remove it if no longer needed.`,
        nodeName: node.name, nodeType: node.type, ptsDeducted: 8,
        remediation: {
          description: "Delete permanently disabled nodes or re-enable them.",
          n8nUiInstruction: `Right-click "${node.name}" → Delete, or toggle the disable switch.`,
        },
      });
    }

    // ── Deprecated node types ────────────────────────────────────────────────
    const minVersion = DEPRECATED_VERSIONS[node.type];
    if (minVersion) {
      const ver = node.typeVersion ?? 1;
      if (ver < minVersion) {
        versionLagCount++;
        flags.push({
          id: `HYGIENE_DEPRECATED_${node.id}`,
          rule: "HYGIENE_DEPRECATED_NODE",
          severity: "WARNING",
          category: "HYGIENE",
          title: `Deprecated node version (v${ver} < v${minVersion})`,
          detail: `"${node.name}" uses ${node.type} v${ver}. Minimum recommended: v${minVersion}.`,
          nodeName: node.name, nodeType: node.type, ptsDeducted: 12,
          remediation: {
            description: `Upgrade to the latest version of ${node.type}.`,
            n8nUiInstruction: `Right-click "${node.name}" → Update node version.`,
          },
        });
      }
    }

    // ── Missing credentials (context-aware: skip expression-injected URLs) ──
    if (CRED_REQUIRED_TYPES.has(node.type)) {
      const creds = node.credentials;
      const hasExpression = nodeUrlIsExpression(node.parameters);
      if ((!creds || Object.keys(creds).length === 0) && !hasExpression) {
        flags.push({
          id: `HYGIENE_NO_CRED_${node.id}`,
          rule: "HYGIENE_MISSING_CREDENTIAL",
          severity: "CRITICAL",
          category: "HYGIENE",
          title: "Missing credential binding",
          detail: `"${node.name}" requires credentials but none are configured.`,
          nodeName: node.name, nodeType: node.type, ptsDeducted: 20,
          remediation: {
            description: "Create and assign the required credential.",
            n8nUiInstruction: `Open "${node.name}" → Credential → Create new.`,
          },
        });
      }
    }
  }

  const profile: DebtProfile = {
    disabledNodeCount: disabledNodes.length,
    orphanNodeCount: orphanNodes.length,
    deadVariableCount: 0,  // owned by complexity.rule.ts now
    versionLagCount,
    edgeCrossings: 0,      // owned by complexity.rule.ts now
    disabledNodes,
    orphanNodes,
  };

  return { flags, profile };
}

export function computeHealthScore(flags: AuditFlag[]): number {
  let score = 100;
  for (const f of flags) {
    if (f.category === "HYGIENE" && f.ptsDeducted) score -= f.ptsDeducted;
  }
  return Math.max(0, score);
}

// Kept for import compat in engine
export { CRED_REQUIRED_TYPES };
export const FILTER_NODE_TYPES = new Set([
  "n8n-nodes-base.set", "n8n-nodes-base.editFields",
  "n8n-nodes-base.itemLists", "n8n-nodes-base.filter", "n8n-nodes-base.if",
]);
