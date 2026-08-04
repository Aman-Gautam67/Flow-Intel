import { NextRequest, NextResponse } from "next/server";
import { parseWorkflow } from "@/lib/parsers";
import { analyzerService } from "@/lib/analyzer/engine";
import { createWorkflowWithAnalysis } from "@/lib/db/queries/workflows";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { json: workflowJson, save = false, isPublic = true } = body as {
      json: unknown;
      save?: boolean;
      isPublic?: boolean;
    };

    if (!workflowJson) {
      return NextResponse.json({ error: "Missing workflow JSON" }, { status: 400 });
    }

    // Optionally extract authenticated user (non-blocking — anonymous uploads allowed)
    const authResult = requireAuth(request);
    const authorId = authResult.ok ? authResult.user.id : undefined;

    // Parse
    const parsed = parseWorkflow(workflowJson);

    // Analyze
    const result = analyzerService.analyze(parsed);

    // Optionally save to DB — isolated so a persistence failure never kills the analysis response
    let savedSlug: string | null = null;
    let dbError: string | null = null;
    if (save) {
      try {
        const triggerType = parsed.triggerNodes[0]?.type ?? "unknown";
        const { slug } = await createWorkflowWithAnalysis({
          title: parsed.name,
          description: parsed.description,
          platform: parsed.platform,
          isPublic,
          authorId,
          rawJson: workflowJson,
          nodeCount: parsed.nodeCount,
          triggerType,
          scores: result.scores,
          deps: parsed.integrations.map((i) => ({
            serviceName: i.name,
            category: i.category,
            isAi: i.isAi,
            vendorType: i.vendorType,
          })),
          categoryNames: buildCategories(parsed),
        });
        savedSlug = slug;
      } catch (dbErr) {
        // Log server-side for ops visibility; return the analysis result regardless
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        console.error("[parse] DB save failed:", msg);
        dbError = `Workflow analysed successfully but could not be saved: ${msg}`;
      }
    }

    return NextResponse.json({
      success: true,
      result,
      slug: savedSlug,
      ...(dbError ? { dbError } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parse failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

function buildCategories(parsed: ReturnType<typeof parseWorkflow>): string[] {
  const cats: string[] = [];
  if (parsed.hasWebhooks) cats.push("Webhooks");
  if (parsed.aiNodesCount > 0) cats.push("AI / LLM");
  if (parsed.hasSchedules) cats.push("Scheduled");
  if (parsed.integrations.some((i) => i.category === "Database")) cats.push("Database");
  if (parsed.integrations.some((i) => i.category === "Communication")) cats.push("Communication");
  if (cats.length === 0) cats.push("General");
  return cats;
}
