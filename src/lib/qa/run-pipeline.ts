#!/usr/bin/env tsx
/**
 * FlowIntel QA — Pipeline Orchestrator
 * ─────────────────────────────────────────────────────────────────────────────
 * Single entry point that runs all three phases in sequence.
 * Verbose debug logging via DEBUG=1 or --debug flag.
 *
 * Usage:
 *   npx tsx src/lib/qa/run-pipeline.ts [--out <dir>] [--debug] [--dry-run]
 *
 * Phases:
 *   1. generate-fixtures  → writes *-fail.json to <out>/
 *   2. audit-fixtures     → runs real rule engine, flags false negatives
 *   3. remediate-fixtures → mutates fail → pass, re-audits, writes *-pass.json
 *   4. verify-pass-files  → runs engine on *-pass.json, confirms FQI improved
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

// ─── CLI args ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const outIdx    = argv.indexOf("--out");
const OUT_DIR   = outIdx >= 0 ? argv[outIdx + 1] : path.join(process.cwd(), "qa-fixtures");
const DEBUG     = argv.includes("--debug") || process.env.DEBUG === "1";
const DRY_RUN   = argv.includes("--dry-run");

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  red:   "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  cyan:  "\x1b[36m", gray:  "\x1b[90m", blue:   "\x1b[34m",
};

function banner(phase: number, title: string): void {
  console.log("\n" + "─".repeat(62));
  console.log(`${C.bold}${C.blue}  Phase ${phase}: ${title}${C.reset}`);
  console.log("─".repeat(62));
}

function runScript(scriptPath: string, extraArgs: string[]): { exitCode: number; output: string } {
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const allArgs = [scriptPath, ...extraArgs];

  if (DEBUG) {
    console.log(`${C.gray}  $ tsx ${allArgs.join(" ")}${C.reset}`);
  }

  try {
    const output = execFileSync(tsxBin, allArgs, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, DEBUG: DEBUG ? "1" : undefined },
    });
    return { exitCode: 0, output };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    return {
      exitCode: e.status ?? 1,
      output: [e.stdout ?? "", e.stderr ?? "", e.message ?? ""].filter(Boolean).join("\n"),
    };
  }
}

// ─── Phase 4: Verify pass files ──────────────────────────────────────────────
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

interface ManifestEntry {
  file: string;
  platform: string;
  ruleId: string;
  category: string;
  flawLabel: string;
}

function runPhase4Verification(fixturesDir: string): {
  total: number; improved: number; critZero: number; avgFqiPass: number
} {
  registerAllPacks();
  const manifest: ManifestEntry[] = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "_manifest.json"), "utf8")
  );

  const pairs = manifest
    .filter((e) => e.file.endsWith("-fail.json"))
    .map((fail) => {
      const passFile = fail.file.replace("-fail.json", "-pass.json");
      return { fail, passFile };
    })
    .filter(({ passFile }) => fs.existsSync(path.join(fixturesDir, passFile)));

  let improved = 0, critZero = 0;
  const fqiScores: number[] = [];

  for (const { fail, passFile } of pairs) {
    try {
      const failRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, fail.file), "utf8"));
      const passRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, passFile), "utf8"));

      const score = (raw: unknown) => {
        const ast = parseWorkflow(raw);
        const findings = executeRules(ast, registry);
        const ctx = {
          hasHttpNodes: ast.httpNodesCount > 0, hasAiNodes: ast.aiNodesCount > 0,
          hasWebhooks: ast.hasWebhooks, hasLoops: ast.nodes.some((n) => n.isLoop),
          hasCodeNodes: ast.nodes.some((n) => n.isCode), nodeCount: ast.nodes.length,
        };
        const cats = computeCategoryScores(findings, determineApplicableCategories(findings, ctx));
        return { fqi: computeOverallFqi(cats), crits: findings.filter((f: Finding) => f.severity === "CRITICAL").length };
      };

      const failScore = score(failRaw);
      const passScore = score(passRaw);

      if (passScore.fqi > failScore.fqi)  improved++;
      if (passScore.crits === 0)          critZero++;
      fqiScores.push(passScore.fqi);

      if (DEBUG) {
        console.log(
          `   ${C.gray}${fail.file.replace("-fail.json", "")}:${C.reset}` +
          `  FQI ${failScore.fqi}→${passScore.fqi}  ` +
          `CRITS ${failScore.crits}→${passScore.crits}`
        );
      }
    } catch { /* parse error — skip */ }
  }

  const avgFqiPass = fqiScores.length
    ? Math.round(fqiScores.reduce((a, b) => a + b, 0) / fqiScores.length)
    : 0;

  return { total: pairs.length, improved, critZero, avgFqiPass };
}

// ─── Main orchestrator ────────────────────────────────────────────────────────
function main(): void {
  const start = Date.now();
  const dir = path.resolve(OUT_DIR);
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);

  console.log(`\n${C.bold}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║     FlowIntel QA Pipeline — Full End-to-End Run          ║${C.reset}`);
  console.log(`${C.bold}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`  Output directory: ${C.cyan}${dir}${C.reset}`);
  if (DEBUG)   console.log(`  ${C.yellow}Debug mode ON${C.reset}`);
  if (DRY_RUN) console.log(`  ${C.yellow}Dry-run mode — no pass.json files written${C.reset}`);

  const results: Array<{ phase: number; ok: boolean; notes: string }> = [];

  // ── Phase 1: Generate ──────────────────────────────────────────────────
  banner(1, "Fixture Generator (Red Team)");
  const gen = runScript(path.join(scriptDir, "generate-fixtures.ts"), ["--out", dir]);
  process.stdout.write(gen.output);
  const genOk = gen.exitCode === 0;
  results.push({ phase: 1, ok: genOk, notes: genOk ? "fixtures written" : "GENERATOR FAILED" });

  if (!genOk) {
    console.error(`${C.red}Phase 1 failed — aborting pipeline.${C.reset}`);
    process.exit(1);
  }

  // Count generated files
  const fixtureCount = fs.readdirSync(dir).filter((f) => f.endsWith("-fail.json")).length;
  console.log(`${C.green}  Generated ${fixtureCount} fixture files.${C.reset}`);

  // ── Phase 2: Audit ─────────────────────────────────────────────────────
  banner(2, "Detection / Audit Engine");
  const auditArgs = ["--fixtures", dir, "--json", path.join(dir, "_audit-report.json")];
  const audit = runScript(path.join(scriptDir, "audit-fixtures.ts"), auditArgs);
  process.stdout.write(audit.output);
  const auditOk = audit.exitCode === 0;
  // Phase 2 exit code 1 means false negatives — not a hard abort
  results.push({ phase: 2, ok: auditOk, notes: auditOk ? "no false negatives" : "false negatives detected — see report" });

  // ── Phase 3: Remediate ─────────────────────────────────────────────────
  banner(3, "Auto-Remediation Engine (Blue Team)");
  const fixArgs = ["--fixtures", dir, ...(DRY_RUN ? ["--dry-run"] : [])];
  const fix = runScript(path.join(scriptDir, "remediate-fixtures.ts"), fixArgs);
  process.stdout.write(fix.output);
  const fixOk = fix.exitCode === 0;
  results.push({ phase: 3, ok: fixOk, notes: fixOk ? "pass files written" : "remediation errors" });

  // ── Phase 4: Verify ────────────────────────────────────────────────────
  if (!DRY_RUN) {
    banner(4, "Pass-File Verification");
    const v = runPhase4Verification(dir);
    const allImproved = v.improved === v.total;
    console.log(`  Pairs verified     : ${C.bold}${v.total}${C.reset}`);
    console.log(`  FQI improved       : ${allImproved ? C.green : C.yellow}${v.improved}${C.reset} / ${v.total}`);
    console.log(`  Zero criticals     : ${v.critZero} / ${v.total}`);
    console.log(`  Avg pass FQI       : ${C.bold}${v.avgFqiPass}${C.reset}`);
    results.push({ phase: 4, ok: allImproved, notes: `${v.improved}/${v.total} FQI improved` });
  }

  // ── Final summary ──────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const allPassed = results.every((r) => r.ok);

  console.log("\n" + "═".repeat(62));
  console.log(`${C.bold}  PIPELINE COMPLETE — ${elapsed}s${C.reset}`);
  console.log("═".repeat(62));
  for (const r of results) {
    const icon = r.ok ? `${C.green}✅${C.reset}` : `${C.yellow}⚠️ ${C.reset}`;
    console.log(`  ${icon} Phase ${r.phase}: ${r.notes}`);
  }

  console.log();
  if (allPassed) {
    console.log(`${C.green}${C.bold}  ✅ All phases passed. FlowIntel QA pipeline is GREEN.${C.reset}`);
  } else {
    const issues = results.filter((r) => !r.ok).map((r) => `Phase ${r.phase}`).join(", ");
    console.log(`${C.yellow}${C.bold}  ⚠️  Issues in: ${issues}. Review logs above.${C.reset}`);
  }
  console.log("═".repeat(62) + "\n");
  process.exit(allPassed ? 0 : 1);
}

main();
