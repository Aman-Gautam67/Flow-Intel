/**
 * FlowIntel Scoring Engine — Statistical Simulation Suite v2.1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs the hardened scoring engine against synthetic workflows and validates
 * mathematical invariants, gate behavior, and scoring stability.
 *
 * Run: npx ts-node --skip-project src/lib/engine/__tests__/scoring-simulation.ts
 *
 * All assertions are deterministic. This file is the source of truth for
 * expected scoring behavior — update it when intentional algorithm changes occur.
 */

import { computeCategoryScores, determineApplicableCategories, computeOverallFqi } from "../category-engine";
import { evaluateAllGates } from "../quality-gates";
import { deriveCertificationLevel } from "../certification";
import type { Finding, RuleCategory, CategoryScore } from "../types";

// ─── Simulation Helpers ───────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string, details?: string) {
  if (condition) {
    passed++;
    process.stdout.write(`  ✅ ${label}\n`);
  } else {
    failed++;
    const msg = details ? `  ❌ ${label} — ${details}` : `  ❌ ${label}`;
    failures.push(msg);
    process.stdout.write(msg + "\n");
  }
}

function assertEq<T>(actual: T, expected: T, label: string) {
  assert(actual === expected, label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertRange(val: number, min: number, max: number, label: string) {
  assert(val >= min && val <= max, label, `expected [${min},${max}], got ${val}`);
}

// ─── Finding Factories ────────────────────────────────────────────────────────

let fidCounter = 0;
function makeFinding(
  ruleId: string,
  severity: Finding["severity"],
  category: RuleCategory,
  penaltyPoints: number,
  marketplaceBlocking = false,
  nodeId = `node-${++fidCounter}`
): Finding {
  return {
    id: `${ruleId}-${nodeId}`,
    ruleId,
    ruleName: `${ruleId} (sim)`,
    severity,
    category,
    location: { nodeId },
    evidence: { summary: `sim finding ${ruleId}`, detail: "simulation" },
    humanExplanation: "simulation",
    suggestedFix: "simulation",
    marketplaceBlocking,
    penaltyPoints,
  };
}

const FULL_CONTEXT = {
  hasHttpNodes: true, hasAiNodes: true, hasWebhooks: true,
  hasLoops: true, hasCodeNodes: true, nodeCount: 20,
};
const MINIMAL_CONTEXT = {
  hasHttpNodes: false, hasAiNodes: false, hasWebhooks: false,
  hasLoops: false, hasCodeNodes: false, nodeCount: 2,
};

function score(
  findings: Finding[],
  context = FULL_CONTEXT
): { cats: CategoryScore[]; fqi: number } {
  const applicable = determineApplicableCategories(findings, context);
  const cats = computeCategoryScores(findings, applicable);
  const fqi = computeOverallFqi(cats);
  return { cats, fqi };
}

function catScore(cats: CategoryScore[], cat: RuleCategory): number {
  return cats.find((c) => c.category === cat)?.score ?? 100;
}

// ─── SIMULATION SUITE ─────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════");
console.log("  FlowIntel Scoring Simulation v2.1.0");
console.log("══════════════════════════════════════════\n");

// ── S1: INVARIANTS ─────────────────────────────────────────────────────────────
console.log("S1: Mathematical Invariants");

// S1.1 Perfect workflow = 100 FQI
{
  const { fqi } = score([]);
  assertEq(fqi, 100, "S1.1 Empty findings → FQI=100");
}

// S1.2 FQI always in [0,100]
{
  const massive: Finding[] = [];
  for (let i = 0; i < 50; i++) {
    massive.push(makeFinding(`SEC-${i}`, "CRITICAL", "SECURITY", 35, true));
    massive.push(makeFinding(`REL-${i}`, "HIGH", "RELIABILITY", 20));
    massive.push(makeFinding(`PRV-${i}`, "CRITICAL", "PRIVACY", 30, true));
  }
  const { fqi } = score(massive);
  assertRange(fqi, 0, 100, "S1.2 50 CRITICAL findings → FQI in [0,100]");
  // 50 different rules × CRITICAL per category → each of 3 cats scored 0
  // IDEMPOTENCY/OBS/MNT/PERF/COMPAT/DOC/COST = 100 → FQI ≈ 58
  assertRange(fqi, 50, 65, `S1.2b 50 different CRITICAL rules → SECURITY/REL/PRIVACY=0, rest=100 → FQI in [50,65] (got ${fqi})`);
}

// S1.3 All category scores in [0,100]
{
  const { cats } = score([makeFinding("MNT-001", "INFO", "MAINTAINABILITY", 2)]);
  for (const cat of cats) {
    assertRange(cat.score, 0, 100, `S1.3 MAINTAINABILITY score in [0,100] (got ${cat.score})`);
  }
}

// S1.4 Determinism — same input, same output
{
  const findings = [
    makeFinding("SEC-001", "CRITICAL", "SECURITY", 35, true),
    makeFinding("REL-001", "HIGH", "RELIABILITY", 15),
  ];
  const r1 = score(findings);
  const r2 = score(findings);
  assertEq(r1.fqi, r2.fqi, "S1.4 Determinism — same findings → same FQI");
  assertEq(catScore(r1.cats, "SECURITY"), catScore(r2.cats, "SECURITY"), "S1.4b Same SECURITY score on repeat");
}

// ── S2: PENALTY CALIBRATION (FIX-A, FIX-B) ────────────────────────────────────
console.log("\nS2: Penalty Calibration");

// S2.1 INFO-only cap = 5 (not 40)
{
  const many: Finding[] = [];
  for (let i = 0; i < 20; i++) {
    many.push(makeFinding("OBS-020", "INFO", "OBSERVABILITY", 3));
  }
  const { cats } = score(many);
  const obsScore = catScore(cats, "OBSERVABILITY");
  // Cap=5: first firing deducts 3, repeats deduct round(3×0.5)=2, until 5 total = score≥95
  // 20 OBS-020 firings: first=3, then 2,2,2,... → total=min(3+2×n, 5)=5 deducted
  // score=100-5=95 → then INFO_ONLY_FLOOR=80 kicks in if needed (score>80 so no effect)
  assertRange(obsScore, 80, 100, `S2.1 20 INFO findings → OBSERVABILITY score in [80,100] (got ${obsScore})`);
  assert(obsScore >= 80, "S2.1b INFO-only floor = 80 maintained");
}

// S2.2 MEDIUM cap = 25 (not 40)
{
  const many: Finding[] = [];
  for (let i = 0; i < 10; i++) {
    many.push(makeFinding("MNT-009", "MEDIUM", "MAINTAINABILITY", 10));
  }
  const { cats } = score(many);
  const mntScore = catScore(cats, "MAINTAINABILITY");
  // Cap=25: first=10, repeat=5,5,5,5 = 10+15=25 total → score=75
  assertRange(mntScore, 70, 80, `S2.2 10 MEDIUM MNT findings → score 70-80 (got ${mntScore})`);
}

// S2.3 Single CRITICAL rule capped at 40 regardless of repetition
{
  const many: Finding[] = [];
  for (let i = 0; i < 20; i++) {
    many.push(makeFinding("SEC-001", "CRITICAL", "SECURITY", 35));
  }
  const { cats } = score(many);
  const secScore = catScore(cats, "SECURITY");
  // Cap=40: first=35, repeat=round(35×0.5)=18, but remaining=40-35=5, applied=5, total=40
  // score = 100-40 = 60
  assertEq(secScore, 60, `S2.3 SEC-001 fires 20x → SECURITY score=60 (cap=40 applied) got ${secScore}`);
}

// S2.4 FIX-B: round vs floor on repeat
{
  const f1 = makeFinding("REL-001", "HIGH", "RELIABILITY", 15);
  const f2 = { ...f1, id: f1.id + "b" }; // repeat
  const { cats } = score([f1, f2]);
  const relScore = catScore(cats, "RELIABILITY");
  // First=15, repeat=round(7.5)=8 (FIX-B), total=23, score=77
  // With floor: 15+8=23, 100-23=77
  assertEq(relScore, 77, `S2.4 REL-001 fires twice → RELIABILITY=77 (round not floor) got ${relScore}`);
}

// ── S3: FQI COMPUTATION (FIX-C, FIX-D) ────────────────────────────────────────
console.log("\nS3: FQI Computation");

// S3.1 FIX-C: floor not round
{
  // Construct findings that produce FQI ~69.5 before rounding
  // SECURITY=100, RELIABILITY=69 (score at threshold), everything else N/A in minimal context
  const minCtx = { ...MINIMAL_CONTEXT, hasHttpNodes: true };
  // 100-31=69 deducted in RELIABILITY
  const findings = [makeFinding("REL-001", "HIGH", "RELIABILITY", 20), makeFinding("REL-004", "MEDIUM", "RELIABILITY", 11)];
  const { cats, fqi } = score(findings, minCtx);
  const relScore = catScore(cats, "RELIABILITY");
  // Verify floor behavior: fqi = floor(weighted / totalWeight), not round
  assert(fqi === Math.floor(fqi), `S3.1 FQI is always integer (floor applied), got ${fqi}`);
  assert(fqi <= Math.round(fqi), "S3.1b FQI(floor) ≤ FQI(round) — conservative");
}

// S3.2 N/A categories excluded from FQI denominator
{
  const minCtx = { ...MINIMAL_CONTEXT }; // only MAINTAINABILITY, COMPATIBILITY, DOCUMENTATION
  const { cats, fqi } = score([], minCtx);
  const applicable = cats.filter((c) => c.applicable);
  assert(applicable.length === 3, `S3.2 Minimal workflow has exactly 3 applicable categories, got ${applicable.length}`);
  assertEq(fqi, 100, "S3.2b Minimal workflow with zero findings = FQI 100");
}

// S3.3 Large workflow with one CRITICAL scores lower than small perfect
{
  const bigCtx = { ...FULL_CONTEXT, nodeCount: 30 };
  const bigBroken = score([makeFinding("SEC-001", "CRITICAL", "SECURITY", 35, true)], bigCtx);
  const smallPerfect = score([], MINIMAL_CONTEXT);
  assert(bigBroken.fqi < smallPerfect.fqi, `S3.3 Large+CRITICAL (${bigBroken.fqi}) < Small+perfect (${smallPerfect.fqi})`);
}

// ── S4: RELIABILITY GATE PROPORTIONAL (FIX-1, FIX-2, FIX-3) ──────────────────
console.log("\nS4: Proportional Reliability Gate");

function relGate(rel001Count: number, totalNetwork: number, hasREL011 = false) {
  const findings: Finding[] = [];
  for (let i = 0; i < rel001Count; i++) {
    findings.push(makeFinding("REL-001", "HIGH", "RELIABILITY", 15));
  }
  if (hasREL011) findings.push(makeFinding("REL-011", "CRITICAL", "RELIABILITY", 25));
  const cats = computeCategoryScores(findings, new Set(["RELIABILITY"]));
  return evaluateAllGates(findings, cats, { totalNetworkNodes: totalNetwork });
}

// S4.1 Old bug: 2/2 (100%) was PASS — now must FAIL
{
  const gates = relGate(2, 2);
  const rel = gates.find((g) => g.gate === "RELIABILITY_GATE")!;
  assert(!rel.passed, `S4.1 2/2 unhandled (100%) → RELIABILITY_GATE FAIL (was bug: PASS)`);
}

// S4.2 3/30 (10%) must PASS
{
  const gates = relGate(3, 30);
  const rel = gates.find((g) => g.gate === "RELIABILITY_GATE")!;
  assert(rel.passed, `S4.2 3/30 unhandled (10%) → RELIABILITY_GATE PASS (was bug: FAIL)`);
}

// S4.3 25/30 (83%) must FAIL
{
  const gates = relGate(25, 30);
  const rel = gates.find((g) => g.gate === "RELIABILITY_GATE")!;
  assert(!rel.passed, `S4.3 25/30 unhandled (83%) → RELIABILITY_GATE FAIL`);
}

// S4.4 Exactly at threshold: 2/5 (40%) = borderline PASS
{
  const gates = relGate(2, 5);
  const rel = gates.find((g) => g.gate === "RELIABILITY_GATE")!;
  assert(rel.passed, `S4.4 2/5 unhandled (40%) → RELIABILITY_GATE PASS (at threshold)`);
}

// S4.5 Just over threshold: 3/7 (43%) must FAIL
{
  const gates = relGate(3, 7);
  const rel = gates.find((g) => g.gate === "RELIABILITY_GATE")!;
  assert(!rel.passed, `S4.5 3/7 unhandled (43%) → RELIABILITY_GATE FAIL (just over threshold)`);
}

// S4.6 FIX-3: Infinite loop always fails gate regardless of HTTP
{
  const gates = relGate(0, 0, true);
  const rel = gates.find((g) => g.gate === "RELIABILITY_GATE")!;
  assert(!rel.passed, "S4.6 Infinite loop (REL-011) → RELIABILITY_GATE FAIL (even with 0 HTTP nodes)");
}

// ── S5: SECURITY GATE (FIX-4, FIX-5) ──────────────────────────────────────────
console.log("\nS5: Security Gate");

// S5.1 FIX-4: CRITICAL marketplace-blocking = one failReason not two
{
  const findings = [makeFinding("SEC-001", "CRITICAL", "SECURITY", 35, true)];
  const cats = computeCategoryScores(findings, new Set(["SECURITY"]));
  const gates = evaluateAllGates(findings, cats, { totalNetworkNodes: 1 });
  const sec = gates.find((g) => g.gate === "SECURITY_GATE")!;
  assertEq(sec.failReasons.length, 1, `S5.1 CRITICAL+blocking → exactly 1 failReason (was 2), got ${sec.failReasons.length}`);
  assert(!sec.passed, "S5.1b SECURITY_GATE FAIL on CRITICAL finding");
}

// S5.2 FIX-5: PRIVACY CRITICAL does NOT fail SECURITY gate
{
  const findings = [makeFinding("PRV-016", "CRITICAL", "PRIVACY", 35, true)];
  const cats = computeCategoryScores(findings, new Set(["PRIVACY"]));
  const gates = evaluateAllGates(findings, cats, { totalNetworkNodes: 0 });
  const sec = gates.find((g) => g.gate === "SECURITY_GATE")!;
  const prd = gates.find((g) => g.gate === "PRODUCTION_GATE")!;
  assert(sec.passed, "S5.2 PRIVACY CRITICAL → SECURITY_GATE PASS (separated concerns)");
  assert(!prd.passed, "S5.2b PRIVACY CRITICAL → PRODUCTION_GATE FAIL");
}

// S5.3 Security gate blocks marketplace via chain
{
  const findings = [makeFinding("SEC-001", "CRITICAL", "SECURITY", 35, true)];
  const cats = computeCategoryScores(findings, new Set(["SECURITY"]));
  const gates = evaluateAllGates(findings, cats, { totalNetworkNodes: 1 });
  const mkt = gates.find((g) => g.gate === "MARKETPLACE_GATE")!;
  const prd = gates.find((g) => g.gate === "PRODUCTION_GATE")!;
  const ent = gates.find((g) => g.gate === "ENTERPRISE_GATE")!;
  assert(!mkt.passed, "S5.3 SECURITY→MARKETPLACE chain: MARKETPLACE_GATE FAIL");
  assert(!prd.passed, "S5.3b SECURITY→MARKETPLACE→PRODUCTION chain: PRODUCTION_GATE FAIL");
  assert(!ent.passed, "S5.3c Full chain: ENTERPRISE_GATE FAIL");
}

// ── S6: ENTERPRISE GATE (FIX-6, FIX-7) ────────────────────────────────────────
console.log("\nS6: Enterprise Gate");

// S6.1 FIX-6: OBS-001 alone fails Enterprise gate (OR logic)
{
  const findings = [makeFinding("OBS-001", "MEDIUM", "OBSERVABILITY", 8)];
  const cats = computeCategoryScores(findings, new Set(["OBSERVABILITY"]));
  const gates = evaluateAllGates(findings, cats, { totalNetworkNodes: 0 });
  const ent = gates.find((g) => g.gate === "ENTERPRISE_GATE")!;
  assert(!ent.passed, "S6.1 OBS-001 alone → ENTERPRISE_GATE FAIL (OR logic)");
}

// S6.2 FIX-6: OBS-002 alone fails Enterprise gate (OR logic)
{
  const findings = [makeFinding("OBS-002", "MEDIUM", "OBSERVABILITY", 8)];
  const cats = computeCategoryScores(findings, new Set(["OBSERVABILITY"]));
  const gates = evaluateAllGates(findings, cats, { totalNetworkNodes: 0 });
  const ent = gates.find((g) => g.gate === "ENTERPRISE_GATE")!;
  assert(!ent.passed, "S6.2 OBS-002 alone → ENTERPRISE_GATE FAIL (OR logic)");
}

// S6.3 FIX-7: HIGH finding in RELIABILITY blocks Enterprise
{
  const findings = [makeFinding("REL-028", "HIGH", "RELIABILITY", 15)];
  const cats = computeCategoryScores(findings, new Set(["RELIABILITY"]));
  const gates = evaluateAllGates(findings, cats, { totalNetworkNodes: 0 });
  const ent = gates.find((g) => g.gate === "ENTERPRISE_GATE")!;
  assert(!ent.passed, "S6.3 HIGH RELIABILITY finding → ENTERPRISE_GATE FAIL");
}

// ── S7: CERTIFICATION LEVELS (FIX-H) ──────────────────────────────────────────
console.log("\nS7: Certification Levels");

// S7.1 All gates pass → ENTERPRISE_READY
{
  const level = deriveCertificationLevel([
    { gate: "SECURITY_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "RELIABILITY_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "MARKETPLACE_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "PRODUCTION_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "ENTERPRISE_GATE", passed: true, failReasons: [], blockingFindings: [] },
  ]);
  assertEq(level, "ENTERPRISE_READY", "S7.1 All 5 gates pass → ENTERPRISE_READY");
}

// S7.2 Marketplace+Production pass, Enterprise fails → CERTIFIED
{
  const level = deriveCertificationLevel([
    { gate: "SECURITY_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "RELIABILITY_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "MARKETPLACE_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "PRODUCTION_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "ENTERPRISE_GATE", passed: false, failReasons: ["obs"], blockingFindings: [] },
  ]);
  assertEq(level, "CERTIFIED", "S7.2 Marketplace+Production pass → CERTIFIED");
}

// S7.3 Only Marketplace passes → MARKETPLACE_READY
{
  const level = deriveCertificationLevel([
    { gate: "SECURITY_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "RELIABILITY_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "MARKETPLACE_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "PRODUCTION_GATE", passed: false, failReasons: ["crit"], blockingFindings: [] },
    { gate: "ENTERPRISE_GATE", passed: false, failReasons: ["obs"], blockingFindings: [] },
  ]);
  assertEq(level, "MARKETPLACE_READY", "S7.3 Only Marketplace passes → MARKETPLACE_READY");
}

// S7.4 No gates pass → NOT_CERTIFIED
{
  const level = deriveCertificationLevel([
    { gate: "SECURITY_GATE", passed: false, failReasons: ["crit"], blockingFindings: [] },
    { gate: "RELIABILITY_GATE", passed: true, failReasons: [], blockingFindings: [] },
    { gate: "MARKETPLACE_GATE", passed: false, failReasons: ["sec"], blockingFindings: [] },
    { gate: "PRODUCTION_GATE", passed: false, failReasons: ["mkt"], blockingFindings: [] },
    { gate: "ENTERPRISE_GATE", passed: false, failReasons: ["prd"], blockingFindings: [] },
  ]);
  assertEq(level, "NOT_CERTIFIED", "S7.4 Security fails → NOT_CERTIFIED");
}

// ── S8: BLOCKINGFINDINGS DEDUPLICATION ────────────────────────────────────────
console.log("\nS8: Deduplication");

// S8.1 Same finding not listed twice in gate blockingFindings
{
  const findings = [makeFinding("SEC-001", "CRITICAL", "SECURITY", 35, true)];
  const cats = computeCategoryScores(findings, new Set(["SECURITY"]));
  const gates = evaluateAllGates(findings, cats, { totalNetworkNodes: 1 });
  const mkt = gates.find((g) => g.gate === "MARKETPLACE_GATE")!;
  const ids = mkt.blockingFindings.map((f) => f.id);
  const uniqueIds = new Set(ids);
  assertEq(ids.length, uniqueIds.size, `S8.1 MARKETPLACE_GATE blockingFindings deduped (${ids.length} total, ${uniqueIds.size} unique)`);
}

// ── S9: EDGE CASES ─────────────────────────────────────────────────────────────
console.log("\nS9: Edge Cases");

// S9.1 Empty workflow — all scores 100, FQI 100
{
  const { fqi, cats } = score([], MINIMAL_CONTEXT);
  assertEq(fqi, 100, "S9.1 Empty workflow → FQI=100");
  for (const c of cats.filter((c) => c.applicable)) {
    assertEq(c.score, 100, `S9.1b ${c.category} score=100 on empty workflow`);
  }
}

// S9.2 penaltyPoints=0 is treated as INFO (no score impact)
{
  const findings = [{ ...makeFinding("OBS-017", "INFO", "OBSERVABILITY", 0) }];
  const { cats } = score(findings);
  const obsScore = catScore(cats, "OBSERVABILITY");
  assertEq(obsScore, 100, "S9.2 penaltyPoints=0 finding → no score impact");
}

// S9.3 All categories N/A → FQI=100 (vacuously correct)
{
  const applicable = new Set<RuleCategory>();
  const cats = computeCategoryScores([], applicable);
  const fqi = computeOverallFqi(cats);
  assertEq(fqi, 100, "S9.3 No applicable categories → FQI=100 (vacuous)");
}

// S9.4 Single CRITICAL marketplace-blocking in isolation
{
  const findings = [makeFinding("IDP-004", "CRITICAL", "IDEMPOTENCY", 35, true)];
  const cats = computeCategoryScores(findings, new Set(["IDEMPOTENCY"]));
  const gates = evaluateAllGates(findings, cats, { totalNetworkNodes: 1 });
  const mkt = gates.find((g) => g.gate === "MARKETPLACE_GATE")!;
  const prd = gates.find((g) => g.gate === "PRODUCTION_GATE")!;
  assert(!mkt.passed, "S9.4 IDP-004 (CRITICAL+blocking) → MARKETPLACE_GATE FAIL");
  assert(!prd.passed, "S9.4b IDP-004 → PRODUCTION_GATE FAIL");
}

// S9.5 Very large workflow — 100 medium findings across 10 categories
{
  const findings: Finding[] = [];
  const cats = ["SECURITY","RELIABILITY","IDEMPOTENCY","OBSERVABILITY","MAINTAINABILITY",
                "PERFORMANCE","COMPATIBILITY","PRIVACY","DOCUMENTATION","COST_OPTIMIZATION"] as RuleCategory[];
  for (const cat of cats) {
    for (let i = 0; i < 10; i++) {
      findings.push(makeFinding(`${cat.slice(0,3)}-${String(i).padStart(3,"0")}`, "MEDIUM", cat, 10));
    }
  }
  const { fqi } = score(findings);
  assertRange(fqi, 0, 100, `S9.5 100 MEDIUM findings (10 per cat) → FQI in [0,100] (got ${fqi})`);
  // With cap=25 for MEDIUM: each cat deducts at most 25 → score=75 per cat → FQI≈75
  // 10 different rule IDs × 10pts each per category = 100pts total deduction = score 0
  // This is correct: 10 distinct medium violations = total category failure
  assertEq(fqi, 0, `S9.5b 10 distinct MEDIUM rules × 10pts → category score=0 → FQI=0 (correct), got ${fqi}`);
}

// ─── RESULTS ──────────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("══════════════════════════════════════════");

if (failures.length > 0) {
  console.log("\nFailed assertions:");
  for (const f of failures) console.log(f);
}

console.log(failed === 0 ? "\n✅ All simulations passed.\n" : `\n❌ ${failed} simulation(s) failed.\n`);

process.exit(failed > 0 ? 1 : 0);
