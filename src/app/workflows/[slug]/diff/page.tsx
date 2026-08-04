import { notFound } from "next/navigation";
import { getWorkflowBySlug, getVersionWithScores } from "@/lib/db/queries/workflows";
import { DiffPage } from "@/components/workflow/diff-page";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ v1?: string; v2?: string }> };

export default async function DiffRoute({ params, searchParams }: Props) {
  const { slug } = await params;
  const { v1: v1Id, v2: v2Id } = await searchParams;

  const data = await getWorkflowBySlug(slug);
  if (!data?.workflow || data.versions.length < 1) notFound();

  // Default: compare last two versions
  const versions = data.versions;
  const targetV1 = v1Id ? versions.find((v) => v.id === v1Id) : versions[versions.length > 1 ? versions.length - 2 : 0];
  const targetV2 = v2Id ? versions.find((v) => v.id === v2Id) : versions[versions.length - 1];

  if (!targetV1 || !targetV2) notFound();

  const [vs1, vs2] = await Promise.all([
    getVersionWithScores(targetV1.id),
    getVersionWithScores(targetV2.id),
  ]);

  if (!vs1?.scores || !vs2?.scores) notFound();

  return (
    <DiffPage
      slug={slug}
      title={data.workflow.title}
      v1={vs1 as Parameters<typeof DiffPage>[0]["v1"]}
      v2={vs2 as Parameters<typeof DiffPage>[0]["v2"]}
    />
  );
}
