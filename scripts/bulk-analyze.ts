#!/usr/bin/env tsx
/**
 * FlowIntel — Bulk Workflow Analyzer
 * ─────────────────────────────────────────────────────────────────────────────
 * Batch-analyses a directory of workflow JSON files (any supported platform)
 * and outputs per-file findings + aggregate statistics.
 *
 * Usage:
 *   npx tsx scripts/bulk-analyze.ts --dir ./workflows/ [--out ./report.json] [--csv ./report.csv] [--verbose]
 *
 * The report contains:
 *   • Per-file: platform, nodeCount, fqiScore, finding counts, FP candidates
 *   • Aggregate: rule hit rates, top-10 most-fired rules, avg FQI by platform
 *
 * FP candidates — findings flagged as potential false positives:
 *   • PRV-017 fired but no parameter KEY matches the age/child pattern
 *     (only a substring in a value like "imageUrl" tripped it)
 *   • CRITICAL finding on a workflow with ≤ 2 nodes (usually overly broad rule)
 *   • Any rule firing 0 field-key matches but positive full-text match
 */

import fs   from "fs";
import path from "path";

import { parseWorkflow }    from "../src/lib/parsers/index";
import { registerAllPacks } from "../src/lib/engine/rule-packs/index";
import { registry }         from "../src/lib/engine/registry";
import { executeRules }     from "../src/lib/engine/rule-engine";
import {
  computeCategoryScores,
  determineApplicableCategories,
  computeOverallFqi,
} from "../src/lib/engine/category-engine";
import { evaluateAllGates } from "../src/lib/engine/quality-gates";
import type { Finding }     from "../src/lib/engine/types";

// ─── CLI args ─────────────────────────────────────────────────────────────────
const argv  = process.argv.slice(2);
const idx   = (k: string) => argv.indexOf(k);

const DIR_ARG     = idx("--dir")     >= 0 ? argv[idx("--dir")     + 1] : null;
const OUT_ARG     = idx("--out")     >= 0 ? argv[idx("--out")     + 1] : null;
const CSV_ARG     = idx("--csv")     >= 0 ? argv[idx("--csv")     + 1] : null;
const VERBOSE     = argv.includes("--verbose");
const MAX_FILES   = idx("--max")     >= 0 ? parseInt(argv[idx("--max") + 1] ?? "9999") : 9999;

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", gray: "\x1b[90m", blue: "\x1b[34m",
};

if (!DIR_ARG) {
  console.error(`Usage: npx tsx scripts/bulk-analyze.ts --dir <path> [--out report.json] [--csv report.csv] [--verbose] [--max N]`);
  process.exit(1);
}

// ─── False-positive detection heuristics ─────────────────────────────────────
const AGE_KEY_PATTERN = /\b(age|dob|dateofbirth|date_of_birth|minor|child(?:ren)?)\b/i;

function detectFalsePositiveCandidates(
  findings: Finding[],
  ast: ReturnType<typeof parseWorkflow>
): Array<{ findingId: string; ruleId: string; reason: string }> {
  const fps: Array<{ findingId: string; ruleId: string; reason: string }> = [];

  for (const f of findings) {
    // Heuristic 1: PRV-017 fired but no parameter KEY actually matches age/child terms
    if (f.ruleId === "PRV-017") {
      const keyHit = ast.extractedParameters.some((p) => AGE_KEY_PATTERN.test(p.key));
      if (!keyHit) {
        fps.push({
          findingId: f.id,
          ruleId:    f.ruleId,
          reason:    "PRV-017 fired but no parameter KEY contains age/child/dob — " +
                     "likely substring match in a value (e.g. 'imageUrl', 'storageCapacity').",
        });
      }
    }
    // Heuristic 2: CRITICAL on a tiny workflow (≤ 2 nodes)
    if (f.severity === "CRITICAL" && ast.nodeCount <= 2) {
      fps.push({
        findingId: f.id, ruleId: f.ruleId,
        reason: `CRITICAL finding on a ${ast.nodeCount}-node workflow — verify rule isn't over-broad.`,
      });
    }
    // Heuristic 3: marketplace-blocking on non-n8n platform (n8n Cloud constraint)
    if (f.marketplaceBlocking && ["AIRFLOW","PREFECT","DAGSTER","GENERIC"].includes(ast.platform)) {
      fps.push({
        findingId: f.id, ruleId: f.ruleId,
        reason: `Marketplace-blocking finding on ${ast.platform} — marketplace gate is n8n-specific.`,
      });
    }
  }
  return fps;
}

// ─── Per-file result ──────────────────────────────────────────────────────────
interface FileResult {
  file:              string;
  platform:          string;
  nodeCount:         number;
  fqiScore:          number;
  criticalCount:     number;
  highCount:         number;
  mediumCount:       number;
  lowCount:          number;
  infoCount:         number;
  marketplaceBlocking: number;
  fpCandidateCount:  number;
  fpCandidates:      Array<{ findingId: string; ruleId: string; reason: string }>;
  firedRuleIds:      string[];
  gatesPassed:       string[];
  gatesFailed:       string[];
  durationMs:        number;
  error?:            string;
}

function analyseFile(filePath: string): FileResult {
  const start = Date.now();
  const file  = path.basename(filePath);
  try {
    const raw      = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    const ast      = parseWorkflow(raw);
    const findings = executeRules(ast, registry);

    const ctx = {
      hasHttpNodes: ast.httpNodesCount > 0, hasAiNodes:  ast.aiNodesCount > 0,
      hasWebhooks:  ast.hasWebhooks,        hasLoops:    ast.nodes.some((n) => n.isLoop),
      hasCodeNodes: ast.nodes.some((n) => n.isCode), nodeCount: ast.nodes.length,
    };
    const cats  = computeCategoryScores(findings, determineApplicableCategories(findings, ctx));
    const fqi   = computeOverallFqi(cats);
    const gates = evaluateAllGates(findings, cats, { totalNetworkNodes: ast.httpNodesCount });
    const fps   = detectFalsePositiveCandidates(findings, ast);

    return {
      file, platform: ast.platform, nodeCount: ast.nodeCount, fqiScore: fqi,
      criticalCount:     findings.filter((f) => f.severity === "CRITICAL").length,
      highCount:         findings.filter((f) => f.severity === "HIGH").length,
      mediumCount:       findings.filter((f) => f.severity === "MEDIUM").length,
      lowCount:          findings.filter((f) => f.severity === "LOW").length,
      infoCount:         findings.filter((f) => f.severity === "INFO").length,
      marketplaceBlocking: findings.filter((f) => f.marketplaceBlocking).length,
      fpCandidateCount:  fps.length,
      fpCandidates:      fps,
      firedRuleIds:      [...new Set(findings.map((f) => f.ruleId))],
      gatesPassed:       gates.filter((g) =>  g.passed).map((g) => g.gate),
      gatesFailed:       gates.filter((g) => !g.passed).map((g) => g.gate),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      file, platform: "UNKNOWN", nodeCount: 0, fqiScore: -1,
      criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, infoCount: 0,
      marketplaceBlocking: 0, fpCandidateCount: 0, fpCandidates: [], firedRuleIds: [],
      gatesPassed: [], gatesFailed: [],
      durationMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

// ─── Aggregate stats ──────────────────────────────────────────────────────────
function computeAggregates(results: FileResult[]) {
  const ok = results.filter((r) => !r.error);

  // Rule hit rates
  const ruleHits = new Map<string, number>();
  for (const r of ok) for (const id of r.firedRuleIds) ruleHits.set(id, (ruleHits.get(id) ?? 0) + 1);
  const topRules = [...ruleHits.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([ruleId, count]) => ({ ruleId, count, pct: Math.round(count / ok.length * 100) }));

  // FP candidate rule frequency
  const fpHits = new Map<string, number>();
  for (const r of ok) for (const fp of r.fpCandidates) fpHits.set(fp.ruleId, (fpHits.get(fp.ruleId) ?? 0) + 1);
  const topFpRules = [...fpHits.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([ruleId, count]) => ({ ruleId, count }));

  // Platform distribution
  const byPlatform = new Map<string, number>();
  for (const r of ok) byPlatform.set(r.platform, (byPlatform.get(r.platform) ?? 0) + 1);

  // Avg FQI by platform
  const fqiByPlatform = new Map<string, number[]>();
  for (const r of ok) {
    const arr = fqiByPlatform.get(r.platform) ?? [];
    arr.push(r.fqiScore);
    fqiByPlatform.set(r.platform, arr);
  }
  const avgFqiByPlatform = Object.fromEntries(
    [...fqiByPlatform.entries()].map(([p, arr]) => [p, Math.round(arr.reduce((a, b) => a + b) / arr.length)])
  );

  const validFqi = ok.map((r) => r.fqiScore).filter((v) => v >= 0);
  return {
    totalFiles: results.length,
    parsed:     ok.length,
    errors:     results.length - ok.length,
    avgFqi:     validFqi.length ? Math.round(validFqi.reduce((a, b) => a + b) / validFqi.length) : 0,
    totalCriticals: ok.reduce((s, r) => s + r.criticalCount, 0),
    totalFpCandidates: ok.reduce((s, r) => s + r.fpCandidateCount, 0),
    topRules, topFpRules,
    platformDistribution: Object.fromEntries(byPlatform),
    avgFqiByPlatform,
  };
}

// ─── CSV writer ───────────────────────────────────────────────────────────────
function toCsv(results: FileResult[]): string {
  const hdr = "file,platform,nodeCount,fqiScore,critical,high,medium,low,info,mktBlocking,fpCandidates,gatesPassed,gatesFailed,error";
  const rows = results.map((r) => [
    JSON.stringify(r.file), r.platform, r.nodeCount, r.fqiScore,
    r.criticalCount, r.highCount, r.mediumCount, r.lowCount, r.infoCount,
    r.marketplaceBlocking, r.fpCandidateCount,
    JSON.stringify(r.gatesPassed.join("|")), JSON.stringify(r.gatesFailed.join("|")),
    JSON.stringify(r.error ?? ""),
  ].join(","));
  return [hdr, ...rows].join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main(): void {
  registerAllPacks();

  const dir = path.resolve(DIR_ARG!);
  if (!fs.existsSync(dir)) { console.error(`Directory not found: ${dir}`); process.exit(1); }

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .slice(0, MAX_FILES)
    .map((f) => path.join(dir, f));

  console.log(`\n${C.bold}FlowIntel Bulk Analyzer${C.reset}  ${C.gray}${files.length} files in ${dir}${C.reset}`);
  console.log("─".repeat(60));

  const results: FileResult[] = [];
  let done = 0;
  for (const file of files) {
    const r = analyseFile(file);
    results.push(r);
    done++;
    if (VERBOSE || r.error || r.fpCandidateCount > 0) {
      const icon = r.error ? `${C.red}✗${C.reset}` : r.fpCandidateCount > 0 ? `${C.yellow}⚠${C.reset}` : `${C.green}✓${C.reset}`;
      const fp   = r.fpCandidateCount > 0 ? `  ${C.yellow}${r.fpCandidateCount} FP candidate(s)${C.reset}` : "";
      console.log(`  ${icon} ${C.gray}[${done}/${files.length}]${C.reset} ${path.basename(file)}  FQI:${r.fqiScore}  CRIT:${r.criticalCount}${fp}`);
      if (r.error) console.log(`    ${C.red}${r.error}${C.reset}`);
      if (VERBOSE && r.fpCandidates.length) {
        for (const fp2 of r.fpCandidates) console.log(`      ↳ ${fp2.ruleId}: ${fp2.reason}`);
      }
    } else if (done % 50 === 0) {
      process.stdout.write(`  ${C.gray}[${done}/${files.length}]…${C.reset}\n`);
    }
  }

  const agg = computeAggregates(results);
  console.log("\n" + "═".repeat(60));
  console.log(`${C.bold}  AGGREGATE STATISTICS${C.reset}`);
  console.log("═".repeat(60));
  console.log(`  Files analysed   : ${C.bold}${agg.totalFiles}${C.reset}  (${agg.errors} errors)`);
  console.log(`  Average FQI      : ${C.bold}${agg.avgFqi}${C.reset}`);
  console.log(`  Total CRITICAL   : ${agg.totalCriticals > 0 ? C.red : C.green}${agg.totalCriticals}${C.reset}`);
  console.log(`  FP candidates    : ${agg.totalFpCandidates > 0 ? C.yellow : C.green}${agg.totalFpCandidates}${C.reset}`);
  console.log(`\n  ${C.bold}Platform distribution:${C.reset}`);
  for (const [p, cnt] of Object.entries(agg.platformDistribution))
    console.log(`    ${p.padEnd(12)} ${cnt}  (avg FQI: ${agg.avgFqiByPlatform[p] ?? "—"})`);
  console.log(`\n  ${C.bold}Top 10 most-fired rules:${C.reset}`);
  for (const r of agg.topRules)
    console.log(`    ${r.ruleId.padEnd(12)} ${r.count} workflows  (${r.pct}%)`);
  if (agg.topFpRules.length) {
    console.log(`\n  ${C.yellow}${C.bold}Top FP-candidate rules:${C.reset}`);
    for (const r of agg.topFpRules)
      console.log(`    ${C.yellow}${r.ruleId.padEnd(12)} ${r.count} candidate(s)${C.reset}`);
  }
  console.log("═".repeat(60));

  if (OUT_ARG) {
    const report = { generatedAt: new Date().toISOString(), aggregates: agg, results };
    fs.writeFileSync(path.resolve(OUT_ARG), JSON.stringify(report, null, 2));
    console.log(`\nJSON report → ${OUT_ARG}`);
  }
  if (CSV_ARG) {
    fs.writeFileSync(path.resolve(CSV_ARG), toCsv(results));
    console.log(`CSV report  → ${CSV_ARG}`);
  }
  console.log();
}

main();
