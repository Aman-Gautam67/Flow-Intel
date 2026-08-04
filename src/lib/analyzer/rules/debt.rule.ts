import type { AuditFlag, DebtProfile, ParsedWorkflow } from "@/types";

// ─── debt.rule.ts — DEPRECATED SHELL ─────────────────────────────────────────
//
// All rules that were in this file have been migrated to eliminate double-jeopardy:
//
//   DEBT_DISABLED_NODE     → health.rule.ts   (HYGIENE pillar)
//   DEBT_ORPHAN_NODE       → health.rule.ts   (HYGIENE pillar)
//   DEBT_VERSION_LAG       → health.rule.ts   (HYGIENE pillar)
//   DEBT_DEAD_VARIABLES    → complexity.rule.ts (ARCHITECTURE pillar)
//   DEBT_SPAGHETTI_FACTOR  → complexity.rule.ts (ARCHITECTURE pillar)
//
// This file is kept as a re-export shim so any code that still imports
// { runDebtRules, computeDebtScore } from this module continues to compile.
// The functions return empty results — debt is fully rolled into the
// HYGIENE and ARCHITECTURE pillars.

export function runDebtRules(
  _parsed: ParsedWorkflow,
  _connections: Record<string, unknown>
): { flags: AuditFlag[]; profile: DebtProfile } {
  return {
    flags: [],
    profile: {
      disabledNodeCount: 0,
      orphanNodeCount: 0,
      deadVariableCount: 0,
      versionLagCount: 0,
      edgeCrossings: 0,
      disabledNodes: [],
      orphanNodes: [],
    },
  };
}

export function computeDebtScore(_flags: AuditFlag[]): number {
  // Debt score is now an alias for hygieneScore — computed in engine.ts.
  // Returning 100 here is safe; the engine overrides this value.
  return 100;
}
