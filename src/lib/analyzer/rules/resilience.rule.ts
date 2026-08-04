import type { AuditFlag, ParsedWorkflow } from "@/types";

// ─── resilience.rule.ts — DEPRECATED SHELL ───────────────────────────────────
//
// All rules from this file have been merged into reliability.rule.ts to eliminate
// the double-jeopardy between RELIABILITY and RESILIENCE:
//
//   RESILIENCE_UNTHROTTLED_LOOP       → reliability.rule.ts (RELIABILITY category)
//   RESILIENCE_BLAST_RADIUS           → reliability.rule.ts (RELIABILITY category)
//   RESILIENCE_NON_IDEMPOTENT_RETRY   → complexity.rule.ts  (ARCHITECTURE category)
//
// This file is kept as a re-export shim so imports from resilience.rule.ts
// still compile without changes to other modules.

export function runResilienceRules(
  _parsed: ParsedWorkflow,
  _connections: Record<string, unknown>
): AuditFlag[] {
  return [];
}

export function computeResilienceScore(_flags: AuditFlag[]): number {
  // Resilience score is now an alias for reliabilityScore — computed in engine.ts.
  return 100;
}
