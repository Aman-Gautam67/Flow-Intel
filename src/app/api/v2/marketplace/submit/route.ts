import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import {
  workflows,
  workflowPassports,
  workflowAnalysisV2,
  workflowVersions,
} from "@/lib/db/schema";
import {
  storeCertificate,
  upsertPassport,
  getAnalysisV2ByVersionId,
} from "@/lib/db/queries/workflows";
import { issueCertificate } from "@/lib/engine/certification";
import type { CategoryScore, QualityGateResult } from "@/lib/engine/types";

/**
 * POST /api/v2/marketplace/submit
 * ─────────────────────────────────────────────────────────────────────────────
 * Submit a workflow for marketplace publication.
 *
 * The decision is 100% deterministic — based on MARKETPLACE_GATE result.
 * AI is never involved in certification or publication decisions.
 *
 * Body: { workflowId: string }
 *
 * Response (approved):
 *   { status: "APPROVED", certificateId, passedGates, fqiScore }
 *
 * Response (rejected):
 *   { status: "REJECTED", failReasons: [...], blockingFindings: [...], autoFixes: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    const { workflowId } = await request.json() as { workflowId: string };

    if (!workflowId) {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }

    // Load workflow
    const wf = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
    if (!wf[0]) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // Load latest version
    const versions = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflowId))
      .orderBy((t) => [t.versionNum])
      .limit(1);
    const version = versions[versions.length - 1] ?? versions[0];
    if (!version) {
      return NextResponse.json({ error: "No workflow version found" }, { status: 404 });
    }

    // Load v2 analysis
    const analysis = await getAnalysisV2ByVersionId(version.id);
    if (!analysis) {
      return NextResponse.json({
        error: "No v2 analysis found. Upload the workflow via POST /api/v2/analyze?save=true first.",
        status: "NO_ANALYSIS",
      }, { status: 422 });
    }

    const marketplacePassed = analysis.gateMarketplacePassed === true;
    const productionPassed  = analysis.gateProductionPassed  === true;

    // ── REJECTED ──────────────────────────────────────────────────────────────
    if (!marketplacePassed || !productionPassed) {
      // Update passport marketplace_status
      await upsertPassport(workflowId, { marketplaceStatus: "REJECTED" }).catch(console.error);

      const qualityGates = (analysis.qualityGates ?? []) as QualityGateResult[];
      const failingGates = qualityGates.filter((g) => !g.passed && (
        g.gate === "MARKETPLACE_GATE" || g.gate === "PRODUCTION_GATE" || g.gate === "SECURITY_GATE"
      ));

      const blockingFindings = failingGates.flatMap((g) => g.blockingFindings ?? []);
      const failReasons = failingGates.flatMap((g) => g.failReasons ?? []);

      // Collect auto-fix suggestions
      const autoFixes = blockingFindings
        .filter((f) => f.autoFix)
        .map((f) => ({
          ruleId: f.ruleId,
          finding: f.evidence.summary,
          fix: f.suggestedFix,
          autoInstruction: f.autoFix?.manualInstruction,
        }));

      return NextResponse.json({
        status: "REJECTED",
        workflowId,
        failReasons,
        blockingFindings: blockingFindings.map((f) => ({
          ruleId:   f.ruleId,
          ruleName: f.ruleName,
          severity: f.severity,
          category: f.category,
          finding:  f.evidence.summary,
          fix:      f.suggestedFix,
          marketplaceBlocking: f.marketplaceBlocking,
        })),
        autoFixes,
        fqiScore: analysis.fqiScore,
        message: "This workflow cannot be published. Resolve the blocking findings and re-analyze.",
      }, { status: 422 });
    }

    // ── APPROVED ──────────────────────────────────────────────────────────────
    // Issue certificate
    const qualityGates = (analysis.qualityGates ?? []) as QualityGateResult[];
    const categoryScores = (analysis.categoryScores ?? []) as CategoryScore[];

    const cert = await issueCertificate({
      fingerprint: {
        hash: analysis.fingerprintHash ?? "unknown",
        nodeCount: 0,
        connectionCount: 0,
        nodeTypeSignature: [],
        fingerprintedAt: new Date().toISOString(),
      },
      platform: wf[0].platform,
      workflowName: wf[0].title,
      findings: (analysis.findings ?? []) as import("@/lib/engine/types").Finding[],
      gateResults: qualityGates,
      categoryScores,
    });

    // Persist certificate
    if (cert?.valid) {
      await storeCertificate(workflowId, version.id, cert).catch(console.error);
    }

    // Update passport + workflow marketplace status
    await upsertPassport(workflowId, { marketplaceStatus: "APPROVED" }).catch(console.error);
    await db.update(workflows).set({ isPublic: true }).where(eq(workflows.id, workflowId)).catch(console.error);

    return NextResponse.json({
      status:        "APPROVED",
      workflowId,
      certificateId: cert?.certificateId ?? null,
      passedGates:   cert?.passedGates ?? [],
      fqiScore:      analysis.fqiScore,
      fingerprint:   analysis.fingerprintHash,
      message:       "Workflow approved for marketplace publication. FlowIntel Certified™ certificate issued.",
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Marketplace submission failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
