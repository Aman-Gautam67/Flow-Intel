import type { AuditFlag, ParsedWorkflow } from "@/types";

// ─── PILLAR 1: ARCHITECTURE (Simplicity) ─────────────────────────────────────
//
// Owns: structural complexity, spaghetti edges, dead variables.
// Does NOT own: orphan/disabled/deprecated/version-lag nodes (→ HYGIENE pillar).
//
// FORMULA (v2 — improved from v1 logarithmic cap):
//
//   Step 1 — Raw complexity (unbounded):
//     raw = nodeCount×2 + branchCount×5 + codeNodesCount×10
//           + httpNodesCount×6 + loopCount×8
//
//   Step 2 — Simplicity mapping:
//     if raw ≤ 65:  simplicity = 100 − raw            (linear)
//     if raw > 65:  simplicity = 35 × e^(−k × (raw − 65))   (exponential decay from 35)
//                   where k = 0.012
//                   → raw=65  → 35 (smooth boundary)
//                   → raw=120 → ~18
//                   → raw=240 → ~4
//                   → raw=500 → ~0.2
//
//   Step 3 — Structure bonus (prevents fully penalising large-but-well-structured workflows):
//     A workflow with no bad structure flags (no spaghetti, no dead vars) and
//     raw > 65 gets a floor of max(score, STRUCTURE_FLOOR) = 15.
//     This ensures "large but clean" (Test B) != "large and messy".
//
//   Step 4 — Penalty deductions for structure flags (spaghetti, dead vars)
//             applied AFTER the decay and floor.
//
//   Final: clamp to [0, 100], round to integer.
//
// DOUBLE-JEOPARDY FIX:
//   - Spaghetti (DEBT_SPAGHETTI_FACTOR) moves HERE from debt.rule.ts
//   - Dead variables (DEBT_DEAD_VARIABLES) moves HERE from debt.rule.ts
//   - Non-idempotent retry (RESILIENCE_NON_IDEMPOTENT_RETRY) moves HERE from resilience.rule.ts
//     (it is an architectural decision to retry non-idempotent ops, not a resilience failure)

const DECAY_K      = 0.012;   // exponential decay constant
const LINEAR_MAX   = 65;      // raw ≤ 65 → linear simplicity
const STRUCT_FLOOR = 15;      // clean large workflows never score below this

// ─── Expression variable extractor ───────────────────────────────────────────
const EXPR_PATTERN = /\{\{\s*(?:\$json|\$vars|\$node\s*\[.+?\]\s*\.json)\s*\.?\s*\[?"?(\w+)"?\]?\s*\}\}/g;
function extractExpressionVars(paramStr: string): Set<string> {
  const used = new Set<string>();
  let m: RegExpExecArray | null;
  EXPR_PATTERN.lastIndex = 0;
  while ((m = EXPR_PATTERN.exec(paramStr)) !== null) used.add(m[1]);
  return used;
}

// ─── Raw complexity score (unbounded) ────────────────────────────────────────
function computeRawComplexity(parsed: ParsedWorkflow): number {
  const { nodeCount, branchCount, codeNodesCount, httpNodesCount, loopCount } = parsed;
  return (
    nodeCount      * 2 +
    branchCount    * 5 +
    codeNodesCount * 10 +
    httpNodesCount * 6 +
    loopCount      * 8
  );
}

// ─── Simplicity score (before structure flag deductions) ─────────────────────
function rawToSimplicity(raw: number): number {
  if (raw <= LINEAR_MAX) return 100 - raw;
  // Exponential decay: 35 × e^(-k × (raw - 65))
  return 35 * Math.exp(-DECAY_K * (raw - LINEAR_MAX));
}

// ─── Structure flag analysis ─────────────────────────────────────────────────
function analyseStructure(
  parsed: ParsedWorkflow,
  connections: Record<string, unknown>
): { flags: AuditFlag[]; deduction: number; isStructuredClean: boolean } {
  const flags: AuditFlag[] = [];
  let deduction = 0;
  const nodes = parsed.nodes;

  // ── Dead variables (formerly DEBT) ───────────────────────────────────────
  const allUsedVars = new Set<string>();
  for (const node of nodes) {
    for (const v of extractExpressionVars(JSON.stringify(node.parameters ?? {}))) {
      allUsedVars.add(v);
    }
  }
  let deadVariableCount = 0;
  for (const node of nodes) {
    if (node.type !== "n8n-nodes-base.set" && node.type !== "n8n-nodes-base.editFields") continue;
    const assigns = node.parameters as Record<string, unknown> | undefined;
    const values = assigns?.values as Array<{ name?: string }> | undefined;
    if (Array.isArray(values)) {
      for (const v of values) {
        if (v.name && !allUsedVars.has(v.name)) deadVariableCount++;
      }
    }
  }
  if (deadVariableCount > 0) {
    deduction += 8;
    flags.push({
      id: "ARCH_DEAD_VARS",
      rule: "ARCH_DEAD_VARIABLES",
      severity: "INFO",
      category: "ARCHITECTURE",
      title: `${deadVariableCount} unused variable${deadVariableCount > 1 ? "s" : ""}`,
      detail: `${deadVariableCount} variable(s) set in Edit Fields nodes but never referenced downstream — dead weight increasing cognitive load.`,
      ptsDeducted: 8,
      remediation: {
        description: "Remove unused variable assignments from Set / Edit Fields nodes.",
        n8nUiInstruction: "Review Set / Edit Fields nodes and remove any values not referenced downstream.",
      },
    });
  }

  // ── Spaghetti: backward-flowing edges (formerly DEBT) ────────────────────
  const positionMap = new Map<string, number>();
  nodes.forEach((n, i) => { positionMap.set(n.name, i); positionMap.set(n.id, i); });
  let edgeCrossings = 0;
  for (const [src, outputs] of Object.entries(connections)) {
    const srcIdx = positionMap.get(src) ?? 0;
    if (!outputs || typeof outputs !== "object") continue;
    for (const outputArr of Object.values(outputs as Record<string, unknown>)) {
      if (!Array.isArray(outputArr)) continue;
      for (const targets of outputArr) {
        if (!Array.isArray(targets)) continue;
        for (const t of targets) {
          if (t && typeof t === "object" && "node" in t) {
            const tIdx = positionMap.get((t as { node: string }).node) ?? 0;
            if (tIdx < srcIdx) edgeCrossings++;
          }
        }
      }
    }
  }
  if (edgeCrossings > 2) {
    deduction += 10;
    flags.push({
      id: "ARCH_SPAGHETTI",
      rule: "ARCH_SPAGHETTI_FACTOR",
      severity: "INFO",
      category: "ARCHITECTURE",
      title: `Spaghetti structure (${edgeCrossings} backward edges)`,
      detail: `${edgeCrossings} backward-flowing connections detected — tangled execution paths that increase cognitive load.`,
      ptsDeducted: 10,
      remediation: {
        description: "Reorganise the workflow layout to flow top-to-bottom without backward edges.",
        n8nUiInstruction: "Rearrange nodes so execution order matches visual flow direction.",
      },
    });
  }

  // ── Non-idempotent retry (formerly RESILIENCE) ────────────────────────────
  // This is an ARCHITECTURAL decision, not a resilience failure.
  for (const node of nodes) {
    const p = node.parameters as Record<string, unknown> | undefined;
    const opts = p?.options as Record<string, unknown> | undefined;
    const method = ((p?.method ?? opts?.method ?? "") as string).toUpperCase();
    const hasRetry = p?.retryOnFail === true || opts?.retryOnFail === true;
    if (hasRetry && (method === "POST" || method === "PATCH")) {
      deduction += 8;
      flags.push({
        id: `ARCH_NONIDEMP_${node.id}`,
        rule: "ARCH_NON_IDEMPOTENT_RETRY",
        severity: "WARNING",
        category: "ARCHITECTURE",
        title: `Non-idempotent retry on ${method} request`,
        detail: `Node "${node.name}" retries a ${method} request automatically. This risks duplicate records or side-effects on transient timeout.`,
        nodeName: node.name,
        nodeType: node.type,
        ptsDeducted: 8,
        remediation: {
          description: "Add an idempotency key header or disable auto-retry on mutating requests.",
          n8nUiInstruction: `In "${node.name}" → Options → add an Idempotency-Key header, or remove the retryOnFail toggle.`,
        },
      });
    }
  }

  const isStructuredClean = deduction === 0;
  return { flags, deduction, isStructuredClean };
}

// ─── Main exported score function ────────────────────────────────────────────
export function computeComplexityScore(
  parsed: ParsedWorkflow,
  connections: Record<string, unknown> = {}
): number {
  const raw = computeRawComplexity(parsed);
  const baseSimplicity = rawToSimplicity(raw);

  // Apply structure floor BEFORE deductions: large-but-clean workflows never collapse to 0
  const { isStructuredClean, deduction } = analyseStructure(parsed, connections);
  const withFloor =
    raw > LINEAR_MAX && isStructuredClean
      ? Math.max(baseSimplicity, STRUCT_FLOOR)
      : baseSimplicity;

  return Math.max(0, Math.min(100, Math.round(withFloor - deduction)));
}

export function runComplexityRules(
  parsed: ParsedWorkflow,
  connections: Record<string, unknown> = {}
): AuditFlag[] {
  const raw = computeRawComplexity(parsed);
  const simplicity = computeComplexityScore(parsed, connections);
  const { flags: structFlags } = analyseStructure(parsed, connections);

  const flags: AuditFlag[] = [...structFlags];

  if (simplicity < 35) {
    flags.push({
      id: "ARCH_COMPLEXITY_HIGH",
      rule: "ARCH_COMPLEXITY_HIGH",
      severity: "WARNING",
      category: "ARCHITECTURE",
      title: `Low simplicity — complex workflow (${simplicity}/100)`,
      detail: `Raw complexity score ${raw} maps to simplicity ${simplicity}/100. Workflows at this level are harder to debug and maintain. Consider splitting into sub-workflows.`,
      ptsDeducted: 0,
      remediation: {
        description: "Split this workflow into sub-workflows using the Execute Workflow node.",
        n8nUiInstruction: "Identify logical sub-flows and refactor them into separate focused workflows.",
      },
    });
  }

  if (parsed.nodeCount > 40) {
    flags.push({
      id: "ARCH_LARGE_WORKFLOW",
      rule: "ARCH_LARGE_WORKFLOW",
      severity: "INFO",
      category: "ARCHITECTURE",
      title: `Large workflow (${parsed.nodeCount} nodes)`,
      detail: `${parsed.nodeCount} nodes detected. Workflows over 40 nodes are significantly harder to reason about.`,
      ptsDeducted: 0,
    });
  }

  return flags;
}

export type SimplicityTier = "Lean" | "Moderate" | "Complex";
export function getComplexityTier(score: number): SimplicityTier {
  if (score >= 70) return "Lean";
  if (score >= 35) return "Moderate";
  return "Complex";
}
