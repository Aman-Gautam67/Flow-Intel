/**
 * POST /api/admin/reanalyze
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-runs the full analyzer engine against every stored workflow version and
 * writes the fresh scores back to the DB.
 *
 * Use this whenever the scoring formula changes (e.g. Complexity → Simplicity)
 * so existing rows are back-filled without requiring re-uploads.
 *
 * Security: protected by a server-side ADMIN_SECRET env var check.
 * Call with:  Authorization: Bearer <ADMIN_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workflowScores, workflowVersions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseWorkflow } from "@/lib/parsers";
import { analyzerService } from "@/lib/analyzer/engine";

export async function POST(req: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const secret = process.env.ADMIN_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const started = Date.now();
  const results: Array<{ scoreId: string; old: number; new: number; title?: string }> = [];
  let errors = 0;

  try {
    // Load all score rows joined with their raw JSON
    const rows = await db
      .select({
        scoreId:         workflowScores.id,
        versionId:       workflowScores.versionId,
        oldComplexity:   workflowScores.complexityScore,
        rawJson:         workflowVersions.rawJson,
        nodeCount:       workflowVersions.nodeCount,
      })
      .from(workflowScores)
      .innerJoin(workflowVersions, eq(workflowScores.versionId, workflowVersions.id));

    for (const row of rows) {
      try {
        const parsed  = parseWorkflow(row.rawJson as Record<string, unknown>);
        const result  = analyzerService.analyze(parsed);
        const s       = result.scores;

        await db
          .update(workflowScores)
          .set({
            healthScore:       s.healthScore,
            securityScore:     s.securityScore     ?? 100,
            complexityScore:   s.complexityScore,
            reliabilityScore:  s.reliabilityScore,
            debtScore:         s.debtScore,
            memoryScore:       s.memoryScore,
            resilienceScore:   s.resilienceScore,
            privacyScore:      s.privacyScore,
            aiGuardrailsScore: s.aiGuardrailsScore,
            estimatedCostUsd:  s.estimatedCostUsd,
            allFlags:          s.flags as unknown as Record<string, unknown>[],
            securityFlags:     s.securityFlags as unknown as Record<string, unknown>[],
            resilienceFlags:   s.resilienceFlags as unknown as Record<string, unknown>[],
            memoryProfile:     s.memoryProfile as unknown as Record<string, unknown>,
            debtProfile:       s.debtProfile as unknown as Record<string, unknown>,
            privacyProfile:    s.privacyProfile as unknown as Record<string, unknown>,
            remediationSteps:  s.remediationSteps as unknown as Record<string, unknown>[],
          })
          .where(eq(workflowScores.id, row.scoreId));

        results.push({
          scoreId: row.scoreId,
          old:     row.oldComplexity,
          new:     s.complexityScore ?? 0,
          title:   parsed.name,
        });
      } catch (rowErr) {
        errors++;
        console.error(`[reanalyze] row ${row.scoreId} failed:`, rowErr);
      }
    }

    return NextResponse.json({
      ok:      true,
      updated: results.length,
      errors,
      elapsedMs: Date.now() - started,
      rows: results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reanalyze] fatal:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
