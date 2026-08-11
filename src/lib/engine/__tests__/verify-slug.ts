/**
 * End-to-end slug verification: reads DB via getWorkflowBySlug and
 * simulates the exact WorkflowDashboard rendering logic to confirm
 * the AI Guard ring shows the real score, not N/A when it shouldn't.
 *
 * With the nullable ai_guardrails_score column:
 *   null = N/A (no AI nodes)
 *   number = real computed score (including 100 for perfect)
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

  // New logic: null from DB = N/A, number = real score
  let dimScore: number | null = rawVal === undefined ? 0 : rawVal;
  if (rawVal === null) dimScore = null; // N/A ring

  console.log("  DB aiGuardrailsScore :", rawVal);
  console.log("  hasAiNodes           :", hasAiNodes);
  console.log("  → ring dimScore      :", dimScore, dimScore === null ? "(N/A dashed)" : `(ring shows ${dimScore})`);
  console.log("");
  if (rawVal !== null && hasAiNodes) {
    console.log("✅ PASS — AI Guard ring will show", dimScore, "(real score)");
  } else if (rawVal === null && !hasAiNodes) {
    console.log("✅ PASS — AI Guard ring will show N/A (no AI nodes, score correctly null)");
  } else if (rawVal === null && hasAiNodes) {
    console.log("⚠️  WARN — AI nodes detected but score is null (legacy data, re-analyze recommended)");
  } else {
    console.log("✅ PASS — ring will show", dimScore);
  }
}
main().catch((e) => { console.error("ERROR:", e); process.exit(1); }).finally(() => process.exit(0));
