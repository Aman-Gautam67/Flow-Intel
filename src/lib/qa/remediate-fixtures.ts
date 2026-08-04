#!/usr/bin/env tsx
/**
 * FlowIntel QA — Phase 3: Auto-Remediation Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads every *-fail.json, applies all transforms, re-audits the fixed version,
 * and writes [platform]-[ruleId]-[index]-pass.json.
 *
 * Usage:
 *   npx tsx src/lib/qa/remediate-fixtures.ts [--fixtures <dir>] [--dry-run]
 */

import fs from "fs";
import path from "path";

import { parseWorkflow } from "../parsers/index";
import { registerAllPacks } from "../engine/rule-packs/index";
import { registry } from "../engine/registry";
import { executeRules } from "../engine/rule-engine";
import {
  computeCategoryScores,
  determineApplicableCategories,
  computeOverallFqi,
} from "../engine/category-engine";
import type { Finding } from "../engine/types";

import { applyAllTransforms, type WorkflowJson, type AppliedPatch } from "./remediation/transforms";

// ─── Types ───────────────────────────────────────────────────────────────────
interface ManifestEntry {
  file: string;
  platform: string;
  ruleId: string;
  category: string;
  flawLabel: string;
}

interface RemediationResult {
  inputFile: string;
  outputFile: string;
  platform: string;
  ruleId: string;
  flawLabel: string;
  patchesApplied: AppliedPatch[];
  fqiBefore: number;
  fqiAfter: number;
  findingsCountBefore: number;
  findingsCountAfter: number;
  criticalsBefore: number;
  criticalsAfter: number;
  durationMs: number;
  writtenToDisk: boolean;
  error?: string;
}

// ─── Console colours ─────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", gray: "\x1b[90m",
};

// ─── Run engine on a parsed JSON ─────────────────────────────────────────────
function scoreWorkflow(raw: WorkflowJson): { fqi: number; findingCount: number; criticalCount: number } {
  try {
    const ast = parseWorkflow(raw);
    const findings = executeRules(ast, registry);
    const ctx = {
      hasHttpNodes: ast.httpNodesCount > 0,
      hasAiNodes:   ast.aiNodesCount > 0,
      hasWebhooks:  ast.hasWebhooks,
      hasLoops:     ast.nodes.some((n) => n.isLoop),
      hasCodeNodes: ast.nodes.some((n) => n.isCode),
      nodeCount:    ast.nodes.length,
    };
    const applicable = determineApplicableCategories(findings, ctx);
    const catScores = computeCategoryScores(findings, applicable);
    return {
      fqi: computeOverallFqi(catScores),
      findingCount: findings.length,
      criticalCount: findings.filter((f: Finding) => f.severity === "CRITICAL").length,
    };
  } catch {
    return { fqi: -1, findingCount: -1, criticalCount: -1 };
  }
}

// ─── Print per-file result ────────────────────────────────────────────────────
function printResult(r: RemediationResult): void {
  const improved = r.fqiAfter > r.fqiBefore;
  const icon = r.error ? `${C.red}💥${C.reset}` : improved ? `${C.green}✅${C.reset}` : `${C.yellow}⚠️${C.reset}`;
  const fqiDelta = r.fqiAfter - r.fqiBefore;
  const deltaStr = fqiDelta >= 0 ? `${C.green}+${fqiDelta}${C.reset}` : `${C.red}${fqiDelta}${C.reset}`;

  console.log(`\n${icon} ${C.bold}${r.inputFile}${C.reset}`);

  if (r.error) {
    console.log(`   ${C.red}ERROR: ${r.error}${C.reset}`);
    return;
  }

  console.log(
    `   FQI: ${C.bold}${r.fqiBefore}${C.reset} → ${C.bold}${r.fqiAfter}${C.reset} (${deltaStr})  ` +
    `Findings: ${r.findingsCountBefore}→${r.findingsCountAfter}  ` +
    `Criticals: ${C.red}${r.criticalsBefore}${C.reset}→${C.green}${r.criticalsAfter}${C.reset}`
  );

  if (r.patchesApplied.length === 0) {
    console.log(`   ${C.gray}No transforms applied${C.reset}`);
  } else {
    console.log(`   Patches applied (${r.patchesApplied.length}):`);
    for (const p of r.patchesApplied) {
      const node = p.nodeName ? ` [${p.nodeName}]` : "";
      console.log(`   ${C.cyan}  ✦${C.reset} ${p.transform}${node}: ${p.description}`);
    }
  }

  if (r.writtenToDisk) {
    console.log(`   ${C.gray}→ ${r.outputFile}${C.reset}`);
  } else {
    console.log(`   ${C.yellow}(dry-run — not written)${C.reset}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
function main(): void {
  const args = process.argv.slice(2);
  const fixIdx = args.indexOf("--fixtures");
  const dryRun = args.includes("--dry-run");

  const FIXTURES_DIR = fixIdx >= 0 ? args[fixIdx + 1] : path.join(process.cwd(), "qa-fixtures");

  if (!fs.existsSync(FIXTURES_DIR)) {
    console.error(`Fixtures directory not found: ${FIXTURES_DIR}`);
    process.exit(1);
  }

  const manifestPath = path.join(FIXTURES_DIR, "_manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found — run generate-fixtures.ts first`);
    process.exit(1);
  }

  registerAllPacks();

  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const failEntries = manifest.filter((e) => e.file.endsWith("-fail.json"));

  console.log(`\n${C.bold}FlowIntel QA — Phase 3: Auto-Remediation${C.reset}`);
  console.log(`Processing ${failEntries.length} fixtures${dryRun ? " [DRY RUN]" : ""}...\n`);

  const results: RemediationResult[] = [];
  const passManifestEntries: ManifestEntry[] = [];

  for (const entry of failEntries) {
    const start = Date.now();
    const inputPath = path.join(FIXTURES_DIR, entry.file);
    const outputFile = entry.file.replace("-fail.json", "-pass.json");
    const outputPath = path.join(FIXTURES_DIR, outputFile);

    try {
      const rawFail = JSON.parse(fs.readFileSync(inputPath, "utf8")) as WorkflowJson;

      // Score before
      const before = scoreWorkflow(rawFail);

      // Apply all transforms
      const { wf: fixed, allPatches } = applyAllTransforms(rawFail);

      // Score after
      const after = scoreWorkflow(fixed);

      // Write pass file
      if (!dryRun) {
        fs.writeFileSync(outputPath, JSON.stringify(fixed, null, 2));
        passManifestEntries.push({
          ...entry,
          file: outputFile,
        });
      }

      const result: RemediationResult = {
        inputFile: entry.file,
        outputFile,
        platform: entry.platform,
        ruleId: entry.ruleId,
        flawLabel: entry.flawLabel,
        patchesApplied: allPatches,
        fqiBefore: before.fqi,
        fqiAfter: after.fqi,
        findingsCountBefore: before.findingCount,
        findingsCountAfter: after.findingCount,
        criticalsBefore: before.criticalCount,
        criticalsAfter: after.criticalCount,
        durationMs: Date.now() - start,
        writtenToDisk: !dryRun,
      };

      results.push(result);
      printResult(result);
    } catch (err: unknown) {
      const result: RemediationResult = {
        inputFile: entry.file,
        outputFile,
        platform: entry.platform,
        ruleId: entry.ruleId,
        flawLabel: entry.flawLabel,
        patchesApplied: [],
        fqiBefore: -1,
        fqiAfter: -1,
        findingsCountBefore: -1,
        findingsCountAfter: -1,
        criticalsBefore: -1,
        criticalsAfter: -1,
        durationMs: Date.now() - start,
        writtenToDisk: false,
        error: (err as Error).message,
      };
      results.push(result);
      printResult(result);
    }
  }

  // Append pass entries to manifest
  if (!dryRun && passManifestEntries.length > 0) {
    const existingManifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const merged = [...existingManifest, ...passManifestEntries.filter(
      (p) => !existingManifest.some((e) => e.file === p.file)
    )];
    fs.writeFileSync(manifestPath, JSON.stringify(merged, null, 2));
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const improved = results.filter((r) => r.fqiAfter > r.fqiBefore).length;
  const patchTotal = results.reduce((a, r) => a + r.patchesApplied.length, 0);
  const critBefore = results.filter((r) => r.criticalsBefore >= 0).reduce((a, r) => a + r.criticalsBefore, 0);
  const critAfter  = results.filter((r) => r.criticalsAfter >= 0).reduce((a, r) => a + r.criticalsAfter, 0);
  const validFqi = results.filter((r) => r.fqiAfter >= 0);
  const avgFqiAfter = validFqi.length
    ? Math.round(validFqi.reduce((a, r) => a + r.fqiAfter, 0) / validFqi.length)
    : 0;
  const errors = results.filter((r) => !!r.error).length;

  console.log("\n" + "═".repeat(62));
  console.log(`${C.bold}  REMEDIATION SUMMARY${C.reset}`);
  console.log("═".repeat(62));
  console.log(`  Fixtures processed   : ${C.bold}${results.length}${C.reset}`);
  console.log(`  FQI improved         : ${C.green}${improved}${C.reset} / ${results.length}`);
  console.log(`  Total patches        : ${C.cyan}${patchTotal}${C.reset}`);
  console.log(`  CRITICAL findings    : ${C.red}${critBefore}${C.reset} → ${C.green}${critAfter}${C.reset}`);
  console.log(`  Avg FQI after fix    : ${C.bold}${avgFqiAfter}${C.reset}`);
  console.log(`  Errors               : ${errors > 0 ? C.red : C.green}${errors}${C.reset}`);
  if (dryRun) console.log(`  ${C.yellow}DRY RUN — no files written${C.reset}`);
  else console.log(`  Pass files written   : ${C.green}${results.filter((r) => r.writtenToDisk).length}${C.reset}`);
  console.log("═".repeat(62) + "\n");
}

main();
