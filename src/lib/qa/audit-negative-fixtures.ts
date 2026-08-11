#!/usr/bin/env tsx
/**
 * FlowIntel QA — Phase 5: Negative Fixture Audit (False-Positive Guard)
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs each NEGATIVE_FIXTURE through the full rule engine and asserts that
 * ZERO CRITICAL findings and ZERO marketplaceBlocking: true findings are emitted.
 *
 * A failure here means a rule is generating a false positive on a clean workflow.
 *
 * Usage:
 *   npx tsx src/lib/qa/audit-negative-fixtures.ts
 *
 * Exit code 0 = all clean. Exit code 1 = false positive(s) found.
 */

import { parseWorkflow }      from "../parsers/index";
import { registerAllPacks }   from "../engine/rule-packs/index";
import { registry }           from "../engine/registry";
import { executeRules }       from "../engine/rule-engine";
import type { Finding }       from "../engine/types";
import { NEGATIVE_FIXTURES }  from "./fixtures/negative-fixtures";

// ─── Console colours ──────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m", bold: "\x1b[1m",
  red:    "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan:  "\x1b[36m",
  gray:   "\x1b[90m", bgRed: "\x1b[41m",
};

interface NegativeResult {
  id:           string;
  label:        string;
  platform:     string;
  findings:     Finding[];
  falsePositives: Finding[];  // CRITICAL or marketplaceBlocking:true findings on a clean wf
  durationMs:   number;
  error?:       string;
}

function auditOne(fixture: (typeof NEGATIVE_FIXTURES)[number]): NegativeResult {
  const start = Date.now();
  try {
    const ast      = parseWorkflow(fixture.workflow);
    const findings = executeRules(ast, registry);
    // False positives = any CRITICAL or marketplace-blocking finding on a clean workflow
    const fps = findings.filter((f) => f.severity === "CRITICAL" || f.marketplaceBlocking);
    return {
      id: fixture.id, label: fixture.label, platform: fixture.platform,
      findings, falsePositives: fps, durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: fixture.id, label: fixture.label, platform: fixture.platform,
      findings: [], falsePositives: [], durationMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

function printResult(r: NegativeResult): void {
  const ok   = r.falsePositives.length === 0 && !r.error;
  const icon = ok ? `${C.green}✅${C.reset}` : `${C.red}❌${C.reset}`;
  console.log(`\n${icon} ${C.bold}${r.id}${C.reset}  ${C.gray}(${r.platform}, ${r.durationMs}ms)${C.reset}`);
  console.log(`   ${r.label}`);

  if (r.error) {
    console.log(`   ${C.red}PARSE/ENGINE ERROR: ${r.error}${C.reset}`);
    return;
  }
  if (r.falsePositives.length === 0) {
    console.log(`   ${C.green}Clean — ${r.findings.length} finding(s), none CRITICAL or marketplace-blocking${C.reset}`);
    return;
  }
  console.log(`   ${C.red}${C.bold}FALSE POSITIVE(S) — ${r.falsePositives.length} unexpected finding(s):${C.reset}`);
  for (const f of r.falsePositives) {
    const sev = f.severity === "CRITICAL"
      ? `${C.bgRed}${C.bold} CRITICAL ${C.reset}`
      : `${C.red}${C.bold} MARKETPLACE-BLOCKING ${C.reset}`;
    console.log(`     ${sev} ${C.bold}${f.ruleId}${C.reset}  "${f.evidence.summary}"`);
    console.log(`       ${C.gray}${f.evidence.detail}${C.reset}`);
    console.log(`       ${C.yellow}Fix this in the rule: ${f.docReference ?? "no docRef"}${C.reset}`);
  }
}

function main(): void {
  registerAllPacks();

  console.log(`\n${C.bold}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║  FlowIntel QA — Phase 5: False-Positive Guard            ║${C.reset}`);
  console.log(`${C.bold}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`  Auditing ${NEGATIVE_FIXTURES.length} clean workflow(s) for false positives…\n`);

  const results = NEGATIVE_FIXTURES.map(auditOne);
  results.forEach(printResult);

  const fps    = results.filter((r) => r.falsePositives.length > 0).length;
  const errors = results.filter((r) => !!r.error).length;
  const passed = results.length - fps - errors;

  console.log("\n" + "═".repeat(62));
  console.log(`${C.bold}  FALSE-POSITIVE GUARD — SUMMARY${C.reset}`);
  console.log("═".repeat(62));
  console.log(`  Clean workflows audited : ${C.bold}${results.length}${C.reset}`);
  console.log(`  Confirmed clean         : ${C.green}${passed}${C.reset}`);
  console.log(`  FALSE POSITIVES found   : ${fps > 0 ? C.red + C.bold : C.green}${fps}${C.reset}`);
  console.log(`  Parse/engine errors     : ${errors > 0 ? C.red : C.green}${errors}${C.reset}`);

  if (fps > 0) {
    console.log(`\n${C.red}${C.bold}  ❌ FAIL — rules are generating false positives on clean workflows.${C.reset}`);
    console.log(`${C.red}  Fix the rule(s) listed above before merging.${C.reset}`);
  } else if (errors > 0) {
    console.log(`\n${C.yellow}${C.bold}  ⚠️  Parse errors — check fixture definitions.${C.reset}`);
  } else {
    console.log(`\n${C.green}${C.bold}  ✅ All clean workflows remain clean — no false positives.${C.reset}`);
  }
  console.log("═".repeat(62) + "\n");

  process.exit(fps > 0 || errors > 0 ? 1 : 0);
}

main();
