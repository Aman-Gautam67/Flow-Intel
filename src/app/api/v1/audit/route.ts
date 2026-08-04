import { NextRequest, NextResponse } from "next/server";
import { parseWorkflow } from "@/lib/parsers";
import { analyzerService } from "@/lib/analyzer/engine";

/**
 * POST /api/v1/audit
 * ─────────────────────────────────────────────────────────────────────────────
 * CI/CD headless audit endpoint. Backward-compatible forever.
 *
 * v2 upgrade: pass determination now uses Quality Gate results (deterministic)
 * in addition to score thresholds. A workflow with a CRITICAL security finding
 * always fails — regardless of its numeric security score.
 *
 * Non-breaking additions: `fqiScore`, `gateResults`
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      json: workflowJson,
      thresholds = {},
    } = body as {
      json: unknown;
      thresholds?: { health?: number; security?: number; reliability?: number; privacy?: number };
    };

    if (!workflowJson) {
      return NextResponse.json({ error: "Missing workflow JSON" }, { status: 400 });
    }

    const parsed = parseWorkflow(workflowJson);
    const result = await analyzerService.analyzeAsync(parsed);
    const { scores, v2Report } = result;

    const minHealth      = thresholds.health ?? 70;
    const minSecurity    = thresholds.security ?? 70;
    const minReliability = thresholds.reliability ?? 60;
    const minPrivacy     = thresholds.privacy ?? 60;

    const secGate = v2Report.qualityGates.find((g) => g.gate === "SECURITY_GATE");
    const relGate = v2Report.qualityGates.find((g) => g.gate === "RELIABILITY_GATE");
    const violations = v2Report.findings.filter((f) => f.severity === "CRITICAL");

    const pass =
      (secGate?.passed ?? true) &&
      (relGate?.passed ?? true) &&
      scores.healthScore >= minHealth &&
      (scores.securityScore ?? 100) >= minSecurity &&
      scores.reliabilityScore >= minReliability &&
      scores.privacyScore >= minPrivacy &&
      violations.length === 0;

    return NextResponse.json(
      {
        pass,
        scores: {
          health:           scores.healthScore,
          security:         scores.securityScore     ?? 100,
          complexity:       scores.complexityScore,
          reliability:      scores.reliabilityScore,
          debt:             scores.debtScore,
          memory:           scores.memoryScore,
          resilience:       scores.resilienceScore,
          privacy:          scores.privacyScore,
          aiGuardrails:     scores.aiGuardrailsScore ?? 100,
          estimatedCostUsd: scores.estimatedCostUsd,
        },
        violations: violations.map((v) => ({
          ruleId:   v.ruleId,
          rule:     v.ruleName,
          severity: v.severity,
          title:    v.evidence.summary,
          detail:   v.humanExplanation,
          node:     v.location.nodeName,
          fix:      v.suggestedFix,
          marketplaceBlocking: v.marketplaceBlocking,
        })),
        thresholds: { health: minHealth, security: minSecurity, reliability: minReliability, privacy: minPrivacy },
        analysedAt: result.analysedAt,
        fqiScore: v2Report.fqiScore,
        gateResults: v2Report.qualityGates.map((g) => ({
          gate: g.gate, passed: g.passed, failReasons: g.failReasons,
        })),
      },
      { status: pass ? 200 : 422 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Audit failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
