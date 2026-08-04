import { notFound } from "next/navigation";
import { getWorkflowBySlug } from "@/lib/db/queries/workflows";
import { WorkflowDashboard } from "@/components/workflow/workflow-dashboard";
import type { N8nNode, ScoreBreakdown } from "@/types";
import type { WorkflowAnalysisV2 } from "@/lib/db/schema";

type Props = { params: Promise<{ slug: string }> };

export default async function WorkflowPage({ params }: Props) {
  const { slug } = await params;
  const data = await getWorkflowBySlug(slug);

  if (!data?.workflow) notFound();

  const { workflow, version, scores, analysisV2, deps, versions } = data;
  if (!version || !scores) notFound();

  const rawJson = version.rawJson as Record<string, unknown>;

  // Extract nodes defensively — handles n8n (nodes[] with top-level .type),
  // Flowise/LangFlow (nodes[] with .data.type / .data.name shape), Make (flow[]),
  // and Zapier (steps[] or nodes{}) — all of which store rawNodes:[] in the parser
  // but persist their original JSON in rawJson.
  function extractN8nNodes(json: Record<string, unknown>): N8nNode[] {
    const arr = json.nodes;
    if (!Array.isArray(arr) || arr.length === 0) return [];
    // n8n shape: nodes have a top-level string `.type` field directly
    const first = arr[0] as Record<string, unknown>;
    if (typeof first.type === "string" && typeof first.id === "string") {
      // Genuine n8n nodes — return as-is
      return arr as N8nNode[];
    }
    // Flowise / LangFlow shape: { id, data: { name, type, ... } }
    if (first.data && typeof first.data === "object") {
      return arr.map((n: unknown) => {
        const node = n as Record<string, unknown>;
        const data = (node.data ?? {}) as Record<string, unknown>;
        return {
          id:          String(node.id ?? ""),
          name:        String(data.label ?? data.name ?? node.id ?? ""),
          type:        String(data.name ?? data.type ?? "flowise.unknown"),
          typeVersion: 1,
          position:    (node.position as [number, number]) ?? [0, 0],
          parameters:  (data.inputs ?? {}) as Record<string, unknown>,
          disabled:    false,
        } satisfies N8nNode;
      });
    }
    // Fallback: return empty so drift detection just skips gracefully
    return [];
  }

  const rawNodes = extractN8nNodes(rawJson);
  const rawConnections = (rawJson.connections ?? {}) as Record<string, unknown>;

  return (
    <WorkflowDashboard
      slug={workflow.slug}
      title={workflow.title}
      platform={workflow.platform}
      description={workflow.description}
      nodeCount={version.nodeCount}
      triggerType={version.triggerType}
      scores={scores}
      analysisV2={analysisV2}
      rawNodes={rawNodes}
      rawConnections={rawConnections}
      deps={deps}
      versions={versions.map((v) => ({ id: v.id, versionNum: v.versionNum, createdAt: v.createdAt }))}
      views={workflow.viewCount ?? 0}
      downloads={workflow.downloadCount ?? 0}
      bookmarks={workflow.bookmarkCount ?? 0}
    />
  );
}
