// CF Workers: use Node.js runtime for DB access and Node built-ins
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workflows } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

type Props = { params: Promise<{ slug: string }> };

/**
 * GET /api/workflows/[slug]/engage
 * Returns view, download, and bookmark counts for a single workflow.
 *
 * POST /api/workflows/[slug]/engage
 * Body: { action: "view" | "download" | "bookmark" }
 * Increments the matching counter. Returns updated counts.
 */

async function getWorkflowBySlug(slug: string) {
  const rows = await db
    .select({
      id:            workflows.id,
      viewCount:     workflows.viewCount,
      downloadCount: workflows.downloadCount,
      bookmarkCount: workflows.bookmarkCount,
    })
    .from(workflows)
    .where(eq(workflows.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const { slug } = await params;
  const wf = await getWorkflowBySlug(slug);
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    views:     wf.viewCount,
    downloads: wf.downloadCount,
    bookmarks: wf.bookmarkCount,
  });
}

export async function POST(req: NextRequest, { params }: Props) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({})) as { action?: string };
  const action = body.action;

  if (action !== "view" && action !== "download" && action !== "bookmark") {
    return NextResponse.json(
      { error: 'action must be "view", "download", or "bookmark"' },
      { status: 400 }
    );
  }

  const wf = await getWorkflowBySlug(slug);
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const colMap = {
    view:     workflows.viewCount,
    download: workflows.downloadCount,
    bookmark: workflows.bookmarkCount,
  } as const;

  await db
    .update(workflows)
    .set({ [action === "view" ? "viewCount" : action === "download" ? "downloadCount" : "bookmarkCount"]:
      sql`${colMap[action]} + 1` })
    .where(eq(workflows.id, wf.id));

  const updated = await getWorkflowBySlug(slug);
  return NextResponse.json({
    views:     updated?.viewCount     ?? 0,
    downloads: updated?.downloadCount ?? 0,
    bookmarks: updated?.bookmarkCount ?? 0,
  });
}
