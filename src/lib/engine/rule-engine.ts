/**
 * FlowIntel Rule Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Executes all registered, enabled rules against a normalized WorkflowAST
 * and returns a flat list of Findings.
 *
 * Design:
 *  - Pure: no side effects, no I/O, no database
 *  - Deterministic: same AST always produces same findings
 *  - Isolated: each rule runs independently; a rule crash is caught and
 *    recorded as an INFO finding rather than crashing the engine
 *  - Scalable: O(n × r) where n = nodes and r = rules — no shared state
 *
 * Usage:
 *   const findings = ruleEngine.execute(ast);
 */

import type { ParsedWorkflow } from "@/types";
import type { Finding, RuleCategory } from "./types";

/**
 * Skip sets (performance optimisation) — AGENTS.md §19
 */
export const AI_ONLY_RULES = new Set([
  "SEC-010", "SEC-016", "SEC-039", "SEC-040",
  "REL-015", "REL-022", "REL-031",
  "PER-003", "PER-010", "PER-017", "PER-021",
  "CST-001", "CST-004", "CST-005", "CST-006", "CST-008", "CST-009", "CST-013", "CST-015", "CST-019",
  "PRV-001", "PRV-008", "PRV-011",
]);

export const HTTP_ONLY_RULES = new Set([
  "SEC-003", "SEC-007", "SEC-011", "SEC-012", "SEC-013", "SEC-018", "SEC-024", "SEC-025", "SEC-036", "SEC-038",
  "REL-001", "REL-003", "REL-004", "REL-006", "REL-017", "REL-018", "REL-026", "REL-027", "REL-030",
  "PER-001", "PER-004", "PER-005", "PER-006", "PER-009", "PER-013", "PER-019",
  "CST-002", "CST-003", "CST-007", "CST-011",
  "CMP-015", "CMP-019", "CMP-020",
]);

export const CODE_ONLY_RULES = new Set([
  "SEC-004", "SEC-008", "SEC-009", "SEC-022", "SEC-026", "SEC-033", "SEC-037",
  "REL-019",
  "PER-008", "PER-016", "PER-018", "PER-022", "PER-025", "PER-026",
  "MNT-002", "MNT-007", "MNT-013", "MNT-026",
]);

/**
 * Execute all enabled rules against the workflow AST.
 *
 * @param ast - Normalized workflow AST from any supported parser
 * @param registry - The populated rule registry
 * @returns Flat array of all findings from all rules
 */
export function executeRules(
  ast: ParsedWorkflow,
  registry: { getEnabledRules(): Array<{ id: string; name: string; detect(ast: ParsedWorkflow): Finding[] }> }
): Finding[] {
  const allFindings: Finding[] = [];
  const rules = registry.getEnabledRules();
  const hasCodeNodes = (ast.codeNodesCount ?? 0) > 0 || ast.nodes.some((n) => n.isCode);

  for (const rule of rules) {
    if (AI_ONLY_RULES.has(rule.id) && (ast.aiNodesCount ?? 0) === 0) continue;
    if (HTTP_ONLY_RULES.has(rule.id) && (ast.httpNodesCount ?? 0) === 0) continue;
    if (CODE_ONLY_RULES.has(rule.id) && !hasCodeNodes) continue;

    let findings: Finding[] = [];
    try {
      findings = rule.detect(ast);
    } catch (err) {
      // Rule crash → emit an INFO finding so the engine never fails silently
      const errorFinding: Finding = {
        id: `RULE_CRASH-${rule.id}`,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: "INFO",
        category: "MAINTAINABILITY",
        location: {},
        evidence: {
          summary: "Rule execution error (internal)",
          detail: `Rule "${rule.id}" threw an unexpected error: ${err instanceof Error ? err.message : String(err)}. This is a FlowIntel bug — please report it.`,
        },
        humanExplanation: "An internal rule error occurred. This finding is informational and does not reflect a workflow problem.",
        suggestedFix: "No action needed. This indicates a FlowIntel engine issue.",
        marketplaceBlocking: false,
        penaltyPoints: 0,
      };
      allFindings.push(errorFinding);
      continue;
    }

    // Validate finding shape (belt-and-suspenders — rule authors may forget fields)
    for (const finding of findings) {
      if (!finding.id || !finding.ruleId || !finding.severity || !finding.category) {
        continue; // silently skip malformed findings from rule authors
      }
      allFindings.push(finding);
    }
  }

  return allFindings;
}

/**
 * Execute rules for a specific category only.
 * Useful for incremental re-analysis after targeted edits.
 */
export function executeRulesForCategory(
  ast: ParsedWorkflow,
  registry: { getRulesByCategory(category: RuleCategory): Array<{ id: string; name: string; detect(ast: ParsedWorkflow): Finding[] }> },
  category: RuleCategory
): Finding[] {
  const rules = registry.getRulesByCategory(category);
  const findings: Finding[] = [];
  const hasCodeNodes = (ast.codeNodesCount ?? 0) > 0 || ast.nodes.some((n) => n.isCode);

  for (const rule of rules) {
    if (AI_ONLY_RULES.has(rule.id) && (ast.aiNodesCount ?? 0) === 0) continue;
    if (HTTP_ONLY_RULES.has(rule.id) && (ast.httpNodesCount ?? 0) === 0) continue;
    if (CODE_ONLY_RULES.has(rule.id) && !hasCodeNodes) continue;

    try {
      findings.push(...rule.detect(ast));
    } catch { /* skip crashed rules */ }
  }
  return findings;
}

/**
 * Execute a single rule by ID.
 * Used for targeted re-analysis, testing, and the AI fix-suggestion pipeline.
 */
export function executeSingleRule(
  ast: ParsedWorkflow,
  rule: { id: string; name: string; detect(ast: ParsedWorkflow): Finding[] }
): Finding[] {
  try {
    return rule.detect(ast);
  } catch (err) {
    console.warn(`[RuleEngine] Rule "${rule.id}" crashed:`, err);
    return [];
  }
}

/**
 * Summarize findings by severity.
 */
export function summarizeFindings(findings: Finding[]): {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
} {
  return {
    total:    findings.length,
    critical: findings.filter((f) => f.severity === "CRITICAL").length,
    high:     findings.filter((f) => f.severity === "HIGH").length,
    medium:   findings.filter((f) => f.severity === "MEDIUM").length,
    low:      findings.filter((f) => f.severity === "LOW").length,
    info:     findings.filter((f) => f.severity === "INFO").length,
  };
}
