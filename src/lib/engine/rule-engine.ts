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

  for (const rule of rules) {
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
  for (const rule of rules) {
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
