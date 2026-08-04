
import { NextRequest, NextResponse } from "next/server";
import { searchWorkflows, getStats } from "@/lib/db/queries/workflows";
import type { AuditFlag, SearchParams } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    const params: SearchParams = {
      q: sp.get("q") ?? undefined,
      platform: (sp.get("platform") as SearchParams["platform"]) ?? undefined,
      category: sp.get("category") ?? undefined,
      healthMin: sp.has("healthMin") ? Number(sp.get("healthMin")) : undefined,
      securityMin: sp.has("securityMin") ? Number(sp.get("securityMin")) : undefined,
      complexityMin: sp.has("complexityMin") ? Number(sp.get("complexityMin")) : undefined,
      complexityMax: sp.has("complexityMax") ? Number(sp.get("complexityMax")) : undefined,
      hasAi: sp.get("hasAi") === "true" ? true : undefined,
      noCritFlags: sp.get("noCritFlags") === "true" ? true : undefined,
      productionReady: sp.get("productionReady") === "true" ? true : undefined,
      certifiedOnly: sp.get("certifiedOnly") === "true" ? true : undefined,
      fqiMin: sp.has("fqiMin") ? Number(sp.get("fqiMin")) : undefined,
      gateFilter: (sp.get("gateFilter") as SearchParams["gateFilter"]) ?? undefined,
      page: sp.has("page") ? Number(sp.get("page")) : 1,
      limit: sp.has("limit") ? Math.min(Number(sp.get("limit")), 50) : 20,
    };

    const rows = await searchWorkflows(params);

    return NextResponse.json({
      workflows: rows.map((r) => {
        const allFlags = (r.scores?.allFlags ?? []) as unknown as AuditFlag[];
        const critFlagCount = allFlags.filter((f) => f.severity === "CRITICAL").length;
        const hasAiNodes = r.deps.some((d) => d.isAi);
        const v2 = r.analysisV2 as Record<string, unknown> | null;

        return {
          id: r.workflow.id,
          slug: r.workflow.slug,
          title: r.workflow.title,
          description: r.workflow.description,
          platform: r.workflow.platform,
          createdAt: r.workflow.createdAt,
          nodeCount: r.version?.nodeCount ?? 0,
          triggerType: r.version?.triggerType ?? null,
          hasAiNodes,
          critFlagCount,
          certified: !!(v2?.["gateMarketplacePassed"] && v2?.["gateProductionPassed"]),
          views:     r.workflow.viewCount     ?? 0,
          downloads: r.workflow.downloadCount ?? 0,
          bookmarks: r.workflow.bookmarkCount ?? 0,
          scores: r.scores
            ? {
                health: r.scores.healthScore,
                security: r.scores.securityScore,
                complexity: r.scores.complexityScore,
                reliability: r.scores.reliabilityScore,
                debt: r.scores.debtScore,
                memory: r.scores.memoryScore,
                resilience: r.scores.resilienceScore,
                privacy: r.scores.privacyScore,
                aiGuardrails: r.scores.aiGuardrailsScore,
                estimatedCostUsd: r.scores.estimatedCostUsd,
                fqi: (v2?.["fqiScore"] as number | null) ?? null,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/workflows] DB error:", message);
    return NextResponse.json(
      { error: "Database unavailable", detail: message, workflows: [] },
      { status: 503 }
    );
  }
}

export async function HEAD() {
  try {
    const stats = await getStats();
    return new Response(null, {
      headers: {
        "X-Workflows-Count": String(stats.workflowsAnalyzed),
        "X-Vulnerabilities-Count": String(stats.vulnerabilitiesDetected),
        "X-Integrations-Count": String(stats.integrationsIndexed),
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
