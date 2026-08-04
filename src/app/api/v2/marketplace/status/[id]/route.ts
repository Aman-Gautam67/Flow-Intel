import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { workflows, workflowPassports } from "@/lib/db/schema";
import { getPassportByWorkflowId } from "@/lib/db/queries/workflows";

/**
 * GET /api/v2/marketplace/status/[id]
 * Returns the marketplace publication status for a workflow.
 *
 * Response:
 *   { workflowId, status, certified, fqiScore, lastAnalysedAt }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const wf = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
    if (!wf[0]) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const passport = await getPassportByWorkflowId(id);

    return NextResponse.json({
      workflowId:        id,
      title:             wf[0].title,
      platform:          wf[0].platform,
      status:            passport?.marketplaceStatus ?? "NOT_SUBMITTED",
      certified:         passport?.marketplaceStatus === "APPROVED",
      analysisVersion:   passport?.analysisVersion ?? 0,
      fingerprintHash:   passport?.fingerprintHash ?? null,
      lastAnalysedAt:    passport?.lastAnalysedAt ?? null,
      firstAnalysedAt:   passport?.firstAnalysedAt ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
