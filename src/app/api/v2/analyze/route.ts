import { NextRequest, NextResponse } from "next/server";
import { parseWorkflow } from "@/lib/parsers";
import { analyzerService } from "@/lib/analyzer/engine";
import {
  storeAnalysisReport,
  storeCertificate,
  upsertPassport,
  createWorkflowWithAnalysis,
  getAnalysisV2ByFingerprint,
} from "@/lib/db/queries/workflows";
import { fingerprintWorkflow } from "@/lib/engine/fingerprint";

/**
 * POST /api/v2/analyze
 * ─────────────────────────────────────────────────────────────────────────────
 * Full FlowIntel v2 analysis pipeline.
 *
 * Modes:
 *   A. Stateless (no workflowId in body): run analysis, return AnalysisReport.
 *      Results are NOT persisted. Use for CI/CD, previews, quick checks.
 *
 *   B. Persistent (workflowId in body, or save: true): run analysis AND
 *      persist the AnalysisReport, certificate (if valid), and passport to DB.
 *      Returns the same AnalysisReport + the new/existing workflowId and slug.
 *
 * Body:
 *   { json, creator?, thresholds?, save?: boolean, title?, description? }
 *
 * Returns:
 *   { report, v1, gates, certification, analysedAt, workflowId?, slug? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      json: unknown;
      creator?: string;
      thresholds?: { health?: number; security?: number; reliability?: number };
      save?: boolean;
      title?: string;
      description?: string;
    };

    const { json: workflowJson, creator, thresholds = {}, save = false } = body;

    if (!workflowJson) {
      return NextResponse.json({ error: "Missing workflow JSON" }, { status: 400 });
    }

    const parsed = parseWorkflow(workflowJson);

    // ── Fingerprint cache check (stateless mode only) ────────────────────────
    // If the workflow was already analyzed (same fingerprint), return cached result.
    // Skip cache when `save: true` (caller wants a fresh analysis + persistence).
    if (!save) {
      try {
        const fp = await fingerprintWorkflow(parsed);
        const cached = await getAnalysisV2ByFingerprint(fp.hash);
        if (cached && cached.analysedAt) {
          const ageHours = (Date.now() - new Date(cached.analysedAt).getTime()) / 3_600_000;
          if (ageHours < 24) {
            // Cache hit — return a lightweight summary from DB columns
            return NextResponse.json({
              cached: true,
              fingerprint: fp.hash,
              fqiScore: cached.fqiScore,
              gates: {
                security:    { passed: cached.gateSecurityPassed },
                reliability: { passed: cached.gateReliabilityPassed },
                marketplace: { passed: cached.gateMarketplacePassed },
                production:  { passed: cached.gateProductionPassed },
                enterprise:  { passed: cached.gateEnterprisePassed },
              },
              categoryScores: cached.categoryScores,
              findings: cached.findings,
              analysedAt: cached.analysedAt,
            });
          }
        }
      } catch { /* cache miss or DB error — continue with full analysis */ }
    }

    const result = await analyzerService.analyzeAsync(parsed, { creator });
    const { v2Report, scores } = result;

    // ── Persistence (mode B) ─────────────────────────────────────────────────
    let persistedWorkflowId: string | null = null;
    let persistedSlug: string | null = null;

    if (save) {
      try {
        // Derive title from workflow name
        const title = body.title ?? parsed.rawWorkflowName ?? parsed.name ?? "Untitled Workflow";
        const description = body.description ?? parsed.description ?? null;
        const platform = parsed.platform;
        const deps = parsed.integrations.map((i) => ({
          serviceName: i.name,
          category: i.category,
          isAi: i.isAi,
          vendorType: i.vendorType,
        }));

        // Create workflow + legacy scores in DB
        const { id: workflowId, slug, versionId } = await createWorkflowWithAnalysis({
          title,
          description: description ?? undefined,
          platform,
          isPublic: true,
          authorId: creator ?? undefined,
          rawJson: workflowJson,
          nodeCount: parsed.nodeCount,
          triggerType: parsed.triggerNodes[0]?.type ?? undefined,
          scores,
          deps,
        });

        persistedWorkflowId = workflowId;
        persistedSlug = slug;

        // Persist v2 analysis report (fire-and-forget with error catch)
        storeAnalysisReport(versionId, v2Report).catch(console.error);

        // Persist certificate if valid
        if (v2Report.certificate?.valid) {
          storeCertificate(workflowId, versionId, v2Report.certificate).catch(console.error);
        }

        // Upsert passport
        upsertPassport(workflowId, {
          fingerprintHash: v2Report.fingerprint?.hash,
          workflowName: title,
          platform,
        }).catch(console.error);

      } catch (dbErr) {
        // DB persistence failure should NOT fail the analysis response
        console.error("[v2/analyze] DB persistence failed:", dbErr);
      }
    }

    // ── v1 backward-compat block ──────────────────────────────────────────────
    const minHealth       = thresholds.health ?? 70;
    const minSecurity     = thresholds.security ?? 70;
    const minReliability  = thresholds.reliability ?? 60;
    const criticalFindings = v2Report.findings.filter((f) => f.severity === "CRITICAL");
    const marketplaceGate  = v2Report.qualityGates.find((g) => g.gate === "MARKETPLACE_GATE");
    const productionGate   = v2Report.qualityGates.find((g) => g.gate === "PRODUCTION_GATE");

    const pass =
      scores.healthScore >= minHealth &&
      (scores.securityScore ?? 100) >= minSecurity &&
      scores.reliabilityScore >= minReliability &&
      criticalFindings.length === 0;

    return NextResponse.json({
      report: v2Report,
      v1: {
        pass,
        scores: {
          health:      scores.healthScore,
          security:    scores.securityScore ?? 100,
          reliability: scores.reliabilityScore,
          overall:     scores.overallScore,
        },
        violations: criticalFindings.map((f) => ({
          ruleId:   f.ruleId,
          rule:     f.ruleName,
          severity: f.severity,
          category: f.category,
          title:    f.evidence.summary,
          detail:   f.humanExplanation,
          node:     f.location.nodeName,
          fix:      f.suggestedFix,
          marketplaceBlocking: f.marketplaceBlocking,
        })),
      },
      gates: {
        marketplace: { passed: marketplaceGate?.passed, reasons: marketplaceGate?.failReasons },
        production:  { passed: productionGate?.passed,  reasons: productionGate?.failReasons },
      },
      certification: v2Report.certificate ? {
        certificateId:    v2Report.certificate.certificateId,
        valid:            v2Report.certificate.valid,
        fingerprint:      v2Report.certificate.fingerprint,
        auditDate:        v2Report.certificate.auditDate,
        passedGates:      v2Report.certificate.passedGates,
        verificationHash: v2Report.certificate.verificationHash,
      } : null,
      ...(persistedWorkflowId ? { workflowId: persistedWorkflowId, slug: persistedSlug } : {}),
      analysedAt: result.analysedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}


