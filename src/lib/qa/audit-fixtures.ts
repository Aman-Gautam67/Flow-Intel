#!/usr/bin/env tsx
/**
 * FlowIntel QA — Phase 2: Detection / Audit Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads every *-fail.json in qa-fixtures/, runs the real FlowIntel rule engine,
 * then produces a structured per-file audit report + false-negative analysis.
 *
 * Usage:
 *   npx tsx src/lib/qa/audit-fixtures.ts [--fixtures <dir>] [--json <out.json>]
 *
 * Output:
 *   - Structured console report (colour-coded severity blocks)
 *   - Optional JSON report file (--json flag)
 *   - Exit code 1 if any false negatives detected
 */

import fs from "fs";
import path from "path";

// ── Engine imports ──────────────────────────────────────────────────────────
import { parseWorkflow } from "../parsers/index";
import { registerAllPacks } from "../engine/rule-packs/index";
import { registry } from "../engine/registry";
import { executeRules } from "../engine/rule-engine";
import {
  computeCategoryScores,
  determineApplicableCategories,
  computeOverallFqi,
} from "../engine/category-engine";
import { evaluateAllGates } from "../engine/quality-gates";
import type { Finding, QualityGateResult, CategoryScore } from "../engine/types";

// ── Manifest entry ─────────────────────────────────────────────────────────
interface ManifestEntry {
  file: string;
  platform: string;
  ruleId: string;
  category: string;
  flawLabel: string;
}

// ── Report structures ──────────────────────────────────────────────────────
export interface FixtureAuditResult {
  file: string;
  platform: string;
  expectedRuleId: string;          // canonical rule from manifest, e.g. "sec001"
  flawLabel: string;
  fqiScore: number;
  findings: Finding[];
  categoryScores: CategoryScore[];
  gates: QualityGateResult[];
  /** Rule IDs that fired */
  detectedRuleIds: string[];
  /** Whether the expected flaw family was detected */
  expectedDetected: boolean;
  /** Details if false negative */
  falseNegativeReason?: string;
  durationMs: number;
  error?: string;
}

export interface AuditSummary {
  totalFiles: number;
  passed: number;
  falseNegatives: number;
  errors: number;
  avgFqi: number;
  avgDurationMs: number;
  results: FixtureAuditResult[];
}

// ── Rule ID normalization ───────────────────────────────────────────────────
// Maps fixture manifest IDs (e.g. "sec001") to the real engine rule IDs (SEC-001)
const RULE_ID_MAP: Record<string, string[]> = {
  sec001:  ["SEC-001"],
  sec001b: ["SEC-001"],
  sec002:  ["SEC-002"],
  sec003:  ["SEC-003"],
  sec004:  ["SEC-004"],
  sec008:  ["SEC-008"],
  rel001:  ["REL-001"],
  rel002:  ["REL-002"],
  rel004:  ["REL-004", "REL-005", "REL-001"],
  rel011:  ["REL-011", "PER-001", "REL-001"],
  per001:  ["PER-001", "PER-005", "PER-009", "REL-023", "REL-001"],
  per013:  ["PER-013", "PRV-001", "PRV-006", "PRV-017", "OBS-006", "SEC-009"],
  per026:  ["PER-026"],
  prv001:  ["PRV-001", "PRV-006", "PRV-017", "OBS-006", "OBS-014", "SEC-009"],
  prv003:  ["PRV-001", "SEC-005", "PRV-006", "PER-013", "REL-001"],
  mnt001:  ["MNT-001", "MNT-003", "MNT-006", "MNT-009", "REL-029"],
  cmp001:  ["CMP-001", "CMP-003"],
  cmp003:  ["CMP-003", "CMP-005"],
};

function expectedRulesFired(manifestId: string, detectedIds: Set<string>): boolean {
  const expected = RULE_ID_MAP[manifestId] ?? [];
  return expected.some((r) => detectedIds.has(r));
}

// ── Core audit function ─────────────────────────────────────────────────────
function auditFile(fixtureDir: string, entry: ManifestEntry): FixtureAuditResult {
  const start = Date.now();
  const filepath = path.join(fixtureDir, entry.file);

  try {
    const raw = JSON.parse(fs.readFileSync(filepath, "utf8"));
    const ast = parseWorkflow(raw);

    const findings = executeRules(ast, registry);
    const ctx = {
      hasHttpNodes:  ast.httpNodesCount > 0,
      hasAiNodes:    ast.aiNodesCount > 0,
      hasWebhooks:   ast.hasWebhooks,
      hasLoops:      ast.nodes.some((n) => n.isLoop),
      hasCodeNodes:  ast.nodes.some((n) => n.isCode),
      nodeCount:     ast.nodes.length,
    };
    const applicable = determineApplicableCategories(findings, ctx);
    const categoryScores = computeCategoryScores(findings, applicable);
    const fqiScore = computeOverallFqi(categoryScores);
    const gates = evaluateAllGates(findings, categoryScores, { totalNetworkNodes: ast.httpNodesCount });

    const detectedRuleIds: string[] = [...new Set<string>(findings.map((f: Finding) => f.ruleId))];
    const detectedSet = new Set<string>(detectedRuleIds);
    const expectedDetected = expectedRulesFired(entry.ruleId, detectedSet);

    return {
      file: entry.file,
      platform: entry.platform,
      expectedRuleId: entry.ruleId,
      flawLabel: entry.flawLabel,
      fqiScore,
      findings,
      categoryScores,
      gates,
      detectedRuleIds,
      expectedDetected,
      falseNegativeReason: expectedDetected
        ? undefined
        : `Expected one of [${(RULE_ID_MAP[entry.ruleId] ?? []).join(", ")}] but got: [${detectedRuleIds.join(", ") || "none"}]`,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      file: entry.file,
      platform: entry.platform,
      expectedRuleId: entry.ruleId,
      flawLabel: entry.flawLabel,
      fqiScore: -1,
      findings: [],
      categoryScores: [],
      gates: [],
      detectedRuleIds: [],
      expectedDetected: false,
      falseNegativeReason: `PARSE/ENGINE ERROR: ${(err as Error).message}`,
      durationMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

// ── Console reporter ────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  gray:   "\x1b[90m",
  bgRed:  "\x1b[41m",
};

function sev(s: string): string {
  if (s === "CRITICAL") return `${C.bgRed}${C.bold} CRITICAL ${C.reset}`;
  if (s === "HIGH")     return `${C.red}${C.bold} HIGH ${C.reset}`;
  if (s === "MEDIUM")   return `${C.yellow} MEDIUM ${C.reset}`;
  if (s === "LOW")      return `${C.cyan} LOW ${C.reset}`;
  return `${C.gray} INFO ${C.reset}`;
}

function printReport(result: FixtureAuditResult): void {
  const icon = result.expectedDetected ? `${C.green}✅${C.reset}` : `${C.red}❌${C.reset}`;
  const fqiColor = result.fqiScore >= 70 ? C.green : result.fqiScore >= 50 ? C.yellow : C.red;

  console.log(`\n${icon} ${C.bold}${result.file}${C.reset}`);
  console.log(
    `   Platform: ${C.cyan}${result.platform}${C.reset}  ` +
    `Expected: ${C.bold}${result.expectedRuleId.toUpperCase()}${C.reset}  ` +
    `FQI: ${fqiColor}${result.fqiScore}${C.reset}  ` +
    `${C.gray}${result.durationMs}ms${C.reset}`
  );
  console.log(`   Flaw: ${result.flawLabel}`);

  if (!result.expectedDetected) {
    console.log(`   ${C.red}${C.bold}⚠  FALSE NEGATIVE: ${result.falseNegativeReason}${C.reset}`);
  }

  if (result.error) {
    console.log(`   ${C.red}ERROR: ${result.error}${C.reset}`);
    return;
  }

  if (result.findings.length === 0) {
    console.log(`   ${C.gray}No findings${C.reset}`);
    return;
  }

  // Group findings by severity
  const bySev: Record<string, Finding[]> = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [], INFO: [] };
  for (const f of result.findings) bySev[f.severity]?.push(f);

  for (const [severity, group] of Object.entries(bySev)) {
    if (!group.length) continue;
    for (const f of group) {
      console.log(
        `   ${sev(severity)} ${C.bold}${f.ruleId}${C.reset}  ` +
        `${C.gray}${f.location.nodeName ?? "workflow"}${C.reset}  ` +
        `${f.evidence.summary}`
      );
    }
  }

  // Gate summary
  const failedGates = result.gates.filter((g) => !g.passed);
  if (failedGates.length) {
    const names = failedGates.map((g) => g.gate.replace("_GATE", "")).join(", ");
    console.log(`   ${C.red}Gates failed: ${names}${C.reset}`);
  }
}

function printSummary(summary: AuditSummary): void {
  console.log("\n" + "═".repeat(62));
  console.log(`${C.bold}  FLOWINTEL QA AUDIT SUMMARY${C.reset}`);
  console.log("═".repeat(62));

  const fnColor = summary.falseNegatives > 0 ? C.red : C.green;
  const errColor = summary.errors > 0 ? C.red : C.green;

  console.log(`  Total fixtures audited : ${C.bold}${summary.totalFiles}${C.reset}`);
  console.log(`  Flaws detected         : ${C.green}${summary.passed}${C.reset} / ${summary.totalFiles}`);
  console.log(`  False negatives        : ${fnColor}${C.bold}${summary.falseNegatives}${C.reset}`);
  console.log(`  Parse/engine errors    : ${errColor}${summary.errors}${C.reset}`);
  console.log(`  Average FQI            : ${C.bold}${summary.avgFqi}${C.reset}`);
  console.log(`  Avg audit time         : ${C.gray}${summary.avgDurationMs}ms${C.reset}`);

  if (summary.falseNegatives > 0) {
    console.log(`\n${C.red}${C.bold}  FALSE NEGATIVES — requires rule engine fixes:${C.reset}`);
    summary.results
      .filter((r) => !r.expectedDetected)
      .forEach((r) => {
        console.log(`  ❌ ${r.file}`);
        console.log(`     ${r.falseNegativeReason}`);
      });
  } else {
    console.log(`\n${C.green}${C.bold}  ✅ All expected flaws detected — no false negatives!${C.reset}`);
  }
  console.log("═".repeat(62) + "\n");
}

// ── Main ────────────────────────────────────────────────────────────────────
function main(): void {
  const args = process.argv.slice(2);
  const fixIdx = args.indexOf("--fixtures");
  const jsonIdx = args.indexOf("--json");

  const FIXTURES_DIR = fixIdx >= 0 ? args[fixIdx + 1] : path.join(process.cwd(), "qa-fixtures");
  const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : null;

  if (!fs.existsSync(FIXTURES_DIR)) {
    console.error(`Fixtures directory not found: ${FIXTURES_DIR}`);
    console.error("Run generate-fixtures.ts first.");
    process.exit(1);
  }

  const manifestPath = path.join(FIXTURES_DIR, "_manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  registerAllPacks();

  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const failFiles = manifest.filter((e) => e.file.endsWith("-fail.json"));

  console.log(`\n${C.bold}FlowIntel QA — Phase 2: Audit Engine${C.reset}`);
  console.log(`Scanning ${failFiles.length} fixture files in: ${FIXTURES_DIR}\n`);

  const results: FixtureAuditResult[] = [];

  for (const entry of failFiles) {
    const result = auditFile(FIXTURES_DIR, entry);
    results.push(result);
    printReport(result);
  }

  const falseNegatives = results.filter((r) => !r.expectedDetected).length;
  const errors = results.filter((r) => !!r.error).length;
  const validFqi = results.filter((r) => r.fqiScore >= 0).map((r) => r.fqiScore);
  const avgFqi = validFqi.length ? Math.round(validFqi.reduce((a, b) => a + b, 0) / validFqi.length) : 0;
  const avgDuration = Math.round(results.reduce((a, r) => a + r.durationMs, 0) / results.length);

  const summary: AuditSummary = {
    totalFiles: results.length,
    passed: results.filter((r) => r.expectedDetected).length,
    falseNegatives,
    errors,
    avgFqi,
    avgDurationMs: avgDuration,
    results,
  };

  printSummary(summary);

  if (JSON_OUT) {
    // Strip Finding arrays for brevity — keep counts only
    const compact = {
      ...summary,
      results: summary.results.map(({ findings, categoryScores, gates, ...r }) => ({
        ...r,
        findingCount: findings.length,
        criticalCount: findings.filter((f) => f.severity === "CRITICAL").length,
        highCount: findings.filter((f) => f.severity === "HIGH").length,
      })),
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(compact, null, 2));
    console.log(`JSON report written: ${JSON_OUT}`);
  }

  process.exit(falseNegatives > 0 || errors > 0 ? 1 : 0);
}

main();
