/**
 * FlowIntel Analyzer Service — v2 (Presentation Layer)
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is the ONLY entry point the rest of the codebase uses.
 * It maintains the exact same public interface as the original engine.ts:
 *
 *   analyzerService.analyze(parsed) → AnalysisResult
 *
 * Internally it now delegates to the v2 analysis pipeline:
 *   ParsedWorkflow → analysis-runner → AnalysisReport → adapter-bridge → ScoreBreakdown
 *
 * The v2 AnalysisReport is also attached to the result for routes/components
 * that want to consume the richer v2 data without breaking existing consumers.
 *
 * NOTHING in the existing UI, database routes, or API routes needs to change.
 */

import type { AnalysisResult, ParsedWorkflow } from "@/types";
import type { AnalysisReport } from "@/lib/engine/types";
import { runAnalysis, runAnalysisSync } from "@/lib/engine/analysis-runner";
import { adaptToLegacyScoreBreakdown } from "@/lib/engine/adapter-bridge";

export class WorkflowAnalyzerService {
  /**
   * Analyze a parsed workflow and return a full AnalysisResult.
   *
   * Legacy output shape (scores: ScoreBreakdown) is preserved for all existing
   * consumers. The v2 AnalysisReport is attached as `scores._v2Report` for
   * consumers that want the richer data.
   *
   * This method is async because the v2 pipeline uses async SHA-256 fingerprinting.
   * To maintain backward compatibility with callers that don't await:
   *   - In server-side API routes: await analyzerService.analyzeAsync(parsed)
   *   - In legacy sync callers:    analyzerService.analyze(parsed)  [uses sync fallback]
   */
  /**
   * Synchronous analysis — returns legacy AnalysisResult immediately.
   * Uses the sync fingerprint fallback (no SHA-256, no DB writes).
   * Kept for backward-compatibility with upload previews that run client-side.
   */
  analyze(parsed: ParsedWorkflow): AnalysisResult {
    const syncReport = runAnalysisSync(parsed);

    const scores = adaptToLegacyScoreBreakdown({
      ...syncReport,
      fingerprint: {
        hash: "sync-fallback",
        nodeCount: parsed.nodes.length,
        connectionCount: parsed.edges.length,
        nodeTypeSignature: [],
        fingerprintedAt: new Date().toISOString(),
      },
      certificate: null,
      passport: null,
    });

    return {
      parsed,
      scores,
      analysedAt: syncReport.analysedAt,
    };
  }

  /**
   * Full async analysis with SHA-256 fingerprinting and certification.
   * Use this in all server-side API routes.
   */
  async analyzeAsync(
    parsed: ParsedWorkflow,
    options?: { creator?: string }
  ): Promise<AnalysisResult & { v2Report: AnalysisReport }> {
    const report = await runAnalysis(parsed, options);
    const scores = adaptToLegacyScoreBreakdown(report);

    return {
      parsed,
      scores,
      analysedAt: report.analysedAt,
      v2Report: report,
    };
  }
}

export const analyzerService = new WorkflowAnalyzerService();
