/**
 * FlowIntel Adapter Bridge
 * ─────────────────────────────────────────────────────────────────────────────
 * Maps the v2 AnalysisReport back to the legacy ScoreBreakdown shape.
 *
 * This adapter exists so the existing engine.ts, UI components, database
 * routes, and API routes need ZERO changes. The v2 engine is the source of
 * truth; the legacy shape is purely a backward-compatibility output.
 *
 * Mapping rules:
 *   architectureScore  ← MAINTAINABILITY score (v2 replaces architecture)
 *   securityScore      ← SECURITY score (null = N/A)
 *   reliabilityScore   ← RELIABILITY score
 *   memoryScore        ← PERFORMANCE score (closest equivalent)
 *   aiGuardrailsScore  ← derived from AI findings severity (null if N/A)
 *   hygieneScore       ← MAINTAINABILITY score
 *   overallScore       ← v2 fqiScore
 *
 * Legacy flags are synthesized from v2 Findings to satisfy the UI components
 * that render the existing flag-tooltip and dimension-popover components.
 */

import type { AnalysisReport, Finding, CategoryScore } from "./types";
import type {
  ScoreBreakdown,
  AuditFlag,
  MemoryProfile,
  DebtProfile,
  PrivacyProfile,
} from "@/types";

// ─── Finding → AuditFlag conversion ──────────────────────────────────────────

function findingToFlag(finding: Finding): AuditFlag {
  // Map v2 severity to legacy severity
  const severityMap: Record<string, AuditFlag["severity"]> = {
    CRITICAL: "CRITICAL",
    HIGH:     "CRITICAL",   // legacy has no HIGH — map to CRITICAL
    MEDIUM:   "WARNING",
    LOW:      "WARNING",
    INFO:     "INFO",
  };

  // Map v2 category to legacy 6-bucket category.
  // NOTE: OBSERVABILITY, MAINTAINABILITY, COMPATIBILITY, and DOCUMENTATION are all
  // folded into "HYGIENE" here for backward compatibility with DB columns and score rings.
  // The real v2 category is preserved in the `v2Category` field so the UI can show
  // "Compatibility" or "Observability" instead of the collapsed "Hygiene" label.
  const categoryMap: Record<string, AuditFlag["category"]> = {
    SECURITY:          "SECURITY",
    RELIABILITY:       "RELIABILITY",
    IDEMPOTENCY:       "RELIABILITY",     // closest legacy equivalent
    OBSERVABILITY:     "HYGIENE",
    MAINTAINABILITY:   "HYGIENE",
    PERFORMANCE:       "ARCHITECTURE",
    COMPATIBILITY:     "HYGIENE",
    PRIVACY:           "SECURITY",
    DOCUMENTATION:     "HYGIENE",
    COST_OPTIMIZATION: "ARCHITECTURE",
  };

  return {
    id: finding.id,
    rule: finding.ruleId,
    severity: severityMap[finding.severity] ?? "WARNING",
    category: categoryMap[finding.category] ?? "HYGIENE",
    // Preserve the real v2 category so UI components can display it without
    // showing the misleading "Hygiene" label for Compatibility/Observability flags
    v2Category: finding.category,
    title: finding.ruleName,
    detail: finding.evidence.summary + " — " + finding.humanExplanation.slice(0, 120),
    nodeName: finding.location.nodeName,
    nodeType: finding.location.nodeType,
    ptsDeducted: finding.penaltyPoints,
    remediation: finding.suggestedFix
      ? {
          description: finding.suggestedFix,
          n8nUiInstruction: finding.autoFix?.manualInstruction,
          jsonPatch: finding.autoFix?.patches?.map((p) => ({
            op: p.op,
            path: p.path,
            value: p.value,
          })),
        }
      : undefined,
  };
}

// ─── Category score lookup helper ─────────────────────────────────────────────
function getCatScore(scores: CategoryScore[], category: string): number | null {
  const cat = scores.find((s) => s.category === category);
  if (!cat || !cat.applicable) return null;
  return cat.score;
}

// ─── Main adapter function ────────────────────────────────────────────────────
export function adaptToLegacyScoreBreakdown(report: AnalysisReport): ScoreBreakdown {
  const { categoryScores, findings, fqiScore, estimatedMonthlyCostUsd } = report;

  // ── Pillar score mapping ────────────────────────────────────────────────────
  const securityScore    = getCatScore(categoryScores, "SECURITY");
  const reliabilityScore = getCatScore(categoryScores, "RELIABILITY") ?? 100;
  const maintainability  = getCatScore(categoryScores, "MAINTAINABILITY") ?? 100;
  const performance      = getCatScore(categoryScores, "PERFORMANCE");
  const privacy          = getCatScore(categoryScores, "PRIVACY");
  const compatibility    = getCatScore(categoryScores, "COMPATIBILITY");

  // Architecture = weighted avg of maintainability + performance + compatibility
  // Falls back to maintainability alone if others are N/A
  const archComponents = [maintainability, performance, compatibility].filter((v) => v !== null) as number[];
  const architectureScore = archComponents.length > 0
    ? Math.round(archComponents.reduce((a, b) => a + b, 0) / archComponents.length)
    : null;

  // Memory score = PERFORMANCE (closest proxy for resource efficiency)
  const memoryScore = performance ?? 100;

  // AI Guardrails = derived from AI-specific findings across safety, reliability,
  // performance, privacy, and cost categories. Restrict generic SEC/REL/PER rules
  // to findings located on AI node types to avoid penalizing non-AI workflow issues.
  const aiFindings = findings.filter((f) => {
    const nodeType = f.location.nodeType?.toLowerCase() ?? "";
    const isAiNodeFinding = /langchain|openai|anthropic|llm|chatmodel|agent/.test(nodeType);
    return isAiNodeFinding && (
      f.ruleId.startsWith("SEC-") ||
      f.ruleId.startsWith("REL-") ||
      f.ruleId.startsWith("PER-") ||
      f.ruleId.startsWith("PRV-") ||
      f.ruleId.startsWith("COST-")
    );
  });
  const hasAiNodes = report.ast.aiNodesCount > 0;
  const aiGuardrailsScore = hasAiNodes
    ? Math.max(0, 100 - aiFindings.reduce((s, f) => s + f.penaltyPoints, 0))
    : null;

  // Hygiene = MAINTAINABILITY
  const hygieneScore = maintainability;

  const overallScore = fqiScore;

  // ── All flags ───────────────────────────────────────────────────────────────
  const allFlags: AuditFlag[] = findings.map(findingToFlag);
  const securityFlags = allFlags.filter((f) => f.category === "SECURITY");

  // ── Profiles ────────────────────────────────────────────────────────────────
  const memoryProfile: MemoryProfile = {
    payloadAccumulationRisk: findings.some((f) => f.ruleId === "REL-002"),
    subprocessRisk: findings.some((f) => f.ruleId === "SEC-004"),
    estimatedBytesPerRun: 0,
    accumulationChains: [],
  };

  const disabledNodes = report.ast.nodes.filter((n) => n.disabled).map((n) => n.name);
  const orphanNodes = report.ast.nodes
    .filter((n) => !n.isTrigger && !report.ast.edges.some((e) => e.source === n.name || e.target === n.name))
    .map((n) => n.name);

  const debtProfile: DebtProfile = {
    disabledNodeCount: disabledNodes.length,
    orphanNodeCount: orphanNodes.length,
    deadVariableCount: 0,
    versionLagCount: findings.filter((f) => f.ruleId === "CMP-001").length,
    edgeCrossings: 0,
    disabledNodes,
    orphanNodes,
  };

  const privacyFindings = findings.filter((f) => f.category === "PRIVACY" || f.ruleId === "SEC-005");
  const privacyProfile: PrivacyProfile = {
    piiFieldsDetected: privacyFindings
      .map((f) => f.evidence.summary)
      .filter(Boolean),
    credentialBlastRadius: {},
    flaggedEgressUrls: [],
    piiInOutboundNodes: privacyFindings
      .map((f) => f.location.nodeName ?? "")
      .filter(Boolean),
  };

  // Count network nodes without error handling for UI display
  const noErrorHandlingCount = findings.filter((f) => f.ruleId === "REL-001").length;

  // Security/AI applicability
  const secCat = categoryScores.find((s) => s.category === "SECURITY");
  const securityApplicable = secCat?.applicable ?? (report.ast.httpNodesCount > 0 || report.ast.hasWebhooks);
  const aiApplicable = report.ast.aiNodesCount > 0;

  const scores: ScoreBreakdown = {
    architectureScore,
    securityScore,
    reliabilityScore,
    memoryScore,
    aiGuardrailsScore,
    hygieneScore,
    overallScore,

    // Legacy scalar aliases
    complexityScore: architectureScore ?? 100,
    privacyScore:    securityScore ?? 100,
    debtScore:       hygieneScore,
    resilienceScore: reliabilityScore,
    healthScore:     hygieneScore,

    estimatedCostUsd: estimatedMonthlyCostUsd,
    noErrorHandlingCount,
    flags:           allFlags,
    securityFlags,
    resilienceFlags: [],
    memoryProfile,
    debtProfile,
    privacyProfile,
    aiApplicable,
    securityApplicable,
    remediationSteps: allFlags
      .filter((f) => f.remediation)
      .map((f) => ({ ...f.remediation!, nodeId: f.id })) as ScoreBreakdown["remediationSteps"],
  };

  return scores;
}
