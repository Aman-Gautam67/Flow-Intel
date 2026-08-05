/**
 * FlowIntel Category Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Aggregates a flat list of Findings into per-category CategoryScore objects.
 *
 * Scoring algorithm (no hardcoded percentages):
 *   1. Start each category at 100 points
 *   2. For each finding in that category:
 *      - Apply the rule's penaltyPoints with a diminishing-returns cap:
 *        first occurrence: full penalty
 *        same rule repeated: 50% of original penalty per subsequent finding
 *        cap per rule class: max 40 pts deducted from that rule across all findings
 *   3. Score = max(0, 100 − totalDeductions)
 *   4. Bonus: if ≥80% of network nodes have error handling, add +10 to RELIABILITY
 *
 * A category is considered N/A only when no rules in that category produced findings
 * AND the category has no applicable rules for this workflow type.
 * (N/A determination is left to the analysis runner which has full context.)
 *
 * Pass/Fail threshold: score >= 70 = PASS
 */

import type { Finding, RuleCategory, CategoryScore } from "./types";

const PASS_THRESHOLD = 70;
const DEFAULT_PER_RULE_MAX_DEDUCTION = 40;
const PER_RULE_MAX_DEDUCTION_BY_SEVERITY: Partial<Record<Finding["severity"], number>> = {
  INFO: 5,
  MEDIUM: 25,
};
const REPEAT_PENALTY_MULTIPLIER = 0.5;

const ALL_CATEGORIES: RuleCategory[] = [
  "SECURITY", "RELIABILITY", "IDEMPOTENCY", "OBSERVABILITY",
  "MAINTAINABILITY", "PERFORMANCE", "COMPATIBILITY", "PRIVACY",
  "DOCUMENTATION", "COST_OPTIMIZATION",
];

export function computeCategoryScores(
  findings: Finding[],
  applicableCategories: Set<RuleCategory>
): CategoryScore[] {
  // Group findings by category
  const byCategory = new Map<RuleCategory, Finding[]>();
  for (const cat of ALL_CATEGORIES) {
    byCategory.set(cat, []);
  }
  for (const finding of findings) {
    const arr = byCategory.get(finding.category);
    if (arr) arr.push(finding);
  }

  const results: CategoryScore[] = [];

  for (const category of ALL_CATEGORIES) {
    const catFindings = byCategory.get(category) ?? [];
    const applicable = applicableCategories.has(category);

    // Count by severity
    const criticalCount = catFindings.filter((f) => f.severity === "CRITICAL").length;
    const highCount     = catFindings.filter((f) => f.severity === "HIGH").length;
    const mediumCount   = catFindings.filter((f) => f.severity === "MEDIUM").length;
    const lowCount      = catFindings.filter((f) => f.severity === "LOW").length;
    const infoCount     = catFindings.filter((f) => f.severity === "INFO").length;

    // Score computation with per-rule caps and diminishing returns
    let score = 100;
    const ruleDeductions = new Map<string, number>();

    for (const finding of catFindings) {
      if (!finding.penaltyPoints || finding.penaltyPoints <= 0) continue;
      const alreadyDeducted = ruleDeductions.get(finding.ruleId) ?? 0;
      const maxDeduction = PER_RULE_MAX_DEDUCTION_BY_SEVERITY[finding.severity] ?? DEFAULT_PER_RULE_MAX_DEDUCTION;
      const remaining = maxDeduction - alreadyDeducted;
      if (remaining <= 0) continue;
      // Diminishing returns for repeated findings from same rule
      const isRepeat = alreadyDeducted > 0;
      const raw = isRepeat
        ? Math.round(finding.penaltyPoints * REPEAT_PENALTY_MULTIPLIER)
        : finding.penaltyPoints;
      const applied = Math.min(raw, remaining);
      ruleDeductions.set(finding.ruleId, alreadyDeducted + applied);
      score -= applied;
    }

    score = Math.max(0, score);

    results.push({
      category,
      score,
      applicable,
      findings: catFindings,
      passed: score >= PASS_THRESHOLD,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      infoCount,
    });
  }

  return results;
}

/**
 * Determine which categories are applicable for a given workflow.
 * A category is N/A when it has no relevant constructs in the workflow.
 */
export function determineApplicableCategories(
  findings: Finding[],
  workflowContext: {
    hasHttpNodes: boolean;
    hasAiNodes: boolean;
    hasWebhooks: boolean;
    hasLoops: boolean;
    hasCodeNodes: boolean;
    nodeCount: number;
  }
): Set<RuleCategory> {
  const applicable = new Set<RuleCategory>();

  // SECURITY: applicable if there are HTTP nodes, webhooks, or any external communication
  if (workflowContext.hasHttpNodes || workflowContext.hasWebhooks) {
    applicable.add("SECURITY");
  }

  // RELIABILITY: applicable if there are HTTP nodes
  if (workflowContext.hasHttpNodes) {
    applicable.add("RELIABILITY");
  }

  // IDEMPOTENCY: applicable if there are webhooks or write operations
  if (workflowContext.hasWebhooks || workflowContext.hasHttpNodes) {
    applicable.add("IDEMPOTENCY");
  }

  // OBSERVABILITY: applicable for all non-trivial workflows
  if (workflowContext.nodeCount >= 3) {
    applicable.add("OBSERVABILITY");
  }

  // MAINTAINABILITY: always applicable
  applicable.add("MAINTAINABILITY");

  // PERFORMANCE: applicable if there are HTTP nodes or loops
  if (workflowContext.hasHttpNodes || workflowContext.hasLoops) {
    applicable.add("PERFORMANCE");
  }

  // COMPATIBILITY: always applicable
  applicable.add("COMPATIBILITY");

  // PRIVACY: applicable if there are HTTP nodes or AI nodes
  if (workflowContext.hasHttpNodes || workflowContext.hasAiNodes) {
    applicable.add("PRIVACY");
  }

  // DOCUMENTATION: always applicable (documentation matters for all workflows)
  applicable.add("DOCUMENTATION");

  // COST_OPTIMIZATION: applicable if there are AI nodes or HTTP nodes
  if (workflowContext.hasAiNodes || workflowContext.hasHttpNodes) {
    applicable.add("COST_OPTIMIZATION");
  }

  // Override: if a category produced findings, it's definitely applicable
  for (const finding of findings) {
    applicable.add(finding.category);
  }

  return applicable;
}

/**
 * Compute the overall FQI score from category scores.
 *
 * Uses weighted average across applicable categories only.
 * N/A categories (not in applicableCategories) are excluded from both
 * numerator and denominator — they cannot inflate or deflate the score.
 *
 * Weights reflect relative business impact:
 */
const CATEGORY_WEIGHTS: Record<RuleCategory, number> = {
  SECURITY:          1.5,   // external attack surface — highest stakes
  RELIABILITY:       1.2,   // execution correctness
  IDEMPOTENCY:       1.1,   // data integrity
  OBSERVABILITY:     0.8,
  MAINTAINABILITY:   0.9,
  PERFORMANCE:       0.7,
  COMPATIBILITY:     1.0,
  PRIVACY:           1.3,   // regulatory / compliance
  DOCUMENTATION:     0.5,   // reduces quality, never blocks
  COST_OPTIMIZATION: 0.6,
};

export function computeOverallFqi(categoryScores: CategoryScore[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const cat of categoryScores) {
    if (!cat.applicable) continue;
    const w = CATEGORY_WEIGHTS[cat.category] ?? 1.0;
    weightedSum += cat.score * w;
    totalWeight += w;
  }

  if (totalWeight === 0) return 100;
  const average = weightedSum / totalWeight;
  return average >= 99.999 ? 100 : Math.floor(average);
}
