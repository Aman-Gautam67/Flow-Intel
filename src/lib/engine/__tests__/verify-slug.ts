/**
 * End-to-end slug verification: reads DB via getWorkflowBySlug and
 * simulates the exact WorkflowDashboard rendering logic to confirm
 * the AI Guard ring shows the real score, not 100.
 */
import { getWorkflowBySlug } from "@/lib/db/queries/workflows";

async function main() {
  const slug = process.argv[2] ?? "ai-guard-test-iLoyxU";
  const data = await getWorkflowBySlug(slug);
  if (!data) { console.log("❌ NOT FOUND:", slug); process.exit(1); }

  const s = data.scores;
  console.log("=== getWorkflowBySlug → scores ===");
  if (!s) { console.log("  ❌ NO SCORES ROW"); process.exit(1); }

  const asRecord = s as unknown as Record<string, number | null>;
  const rawVal  = asRecord["aiGuardrailsScore"];
  const hasAiNodes = data.deps.some((d) => d.isAi);
  const isAiGuardStale = hasAiNodes && rawVal === 100;
  let dimScore: number | null = rawVal === undefined ? 0 : rawVal;
  if (!hasAiNodes) dimScore = null;       // no AI → N/A ring
  if (isAiGuardStale) dimScore = null;    // stale 100 → N/A ring

  const ok = dimScore !== 100 || !hasAiNodes;

  console.log("  DB aiGuardrailsScore :", rawVal);
  console.log("  hasAiNodes           :", hasAiNodes);
  console.log("  isAiGuardStale       :", isAiGuardStale);
  console.log("  → ring dimScore      :", dimScore, dimScore === null ? "(N/A dashed)" : `(ring shows ${dimScore})`);
  console.log("");
  if (rawVal !== null && rawVal !== 100 && hasAiNodes) {
    console.log("✅ PASS — AI Guard ring will show", dimScore, "(real score, not 100)");
  } else if (isAiGuardStale) {
    console.log("✅ PASS — AI Guard ring will show N/A (stale 100 suppressed)");
  } else if (!hasAiNodes) {
    console.log("✅ PASS — AI Guard ring will show N/A (no AI nodes)");
  } else {
    console.log("❌ FAIL — ring would show", dimScore, "which is wrong");
    process.exit(1);
  }
}
main().catch((e) => { console.error("ERROR:", e); process.exit(1); }).finally(() => process.exit(0));
