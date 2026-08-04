import type { AuditFlag, NormalNode, ParsedWorkflow } from "@/types";

// ─── PILLAR 3: RELIABILITY & RESILIENCE ──────────────────────────────────────
//
// Owns:
//   • RELIABILITY_NO_ERROR_HANDLING  — network nodes with no error branch / continueOnFail
//   • RELIABILITY_UNBOUNDED_LOOP     — loop nodes without a batchSize limit
//   • RESILIENCE_UNTHROTTLED_LOOP    — HTTP inside loop with no delay (rate-limit risk)
//   • RESILIENCE_BLAST_RADIUS        — majority of state-changing nodes unprotected
//
// REMOVED (no longer here):
//   • RESILIENCE_NON_IDEMPOTENT_RETRY → moved to ARCHITECTURE pillar (complexity.rule.ts)
//     Rationale: retrying non-idempotent calls is a design/architecture decision, not
//     a resilience failure. It doesn't affect how the workflow survives external outages.
//
// DEDUCTION CAP:
//   No single rule class can deduct more than 50 pts to preserve gradation on
//   workflows with many unhandled nodes.

const HTTP_TYPES = new Set([
  "n8n-nodes-base.httpRequest", "n8n-nodes-base.webhook",
  "n8n-nodes-base.slack", "n8n-nodes-base.gmail",
  "n8n-nodes-base.github", "n8n-nodes-base.stripe",
  "@n8n/n8n-nodes-langchain.openAi", "n8n-nodes-base.openAi",
]);

const LOOP_TYPES = new Set([
  "n8n-nodes-base.splitInBatches",
  "n8n-nodes-base.loopNode",
]);

const STATE_CHANGING_TYPES = new Set([
  "n8n-nodes-base.postgres", "n8n-nodes-base.mysql",
  "n8n-nodes-base.mongodb", "n8n-nodes-base.redis",
  "n8n-nodes-base.httpRequest", "n8n-nodes-base.slack",
  "n8n-nodes-base.gmail", "n8n-nodes-base.stripe",
  "@n8n/n8n-nodes-langchain.openAi",
]);

const DELAY_NODE_TYPES = new Set([
  "n8n-nodes-base.wait", "n8n-nodes-base.delay", "n8n-nodes-base.dateTime",
]);

const PER_CLASS_MAX_DEDUCTION = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nodeHasContinueOnFail(node: NormalNode): boolean {
  const p = node.parameters as Record<string, unknown> | undefined;
  if (!p) return false;
  if (p.continueOnFail === true) return true;
  if (p.onError === "continueRegularOutput" || p.onError === "continueErrorOutput") return true;
  const opts = p.options as Record<string, unknown> | undefined;
  if (opts?.continueOnFail === true) return true;
  if (opts?.onError === "continueRegularOutput" || opts?.onError === "continueErrorOutput") return true;
  return false;
}

function nodeHasErrorBranch(nodeName: string, connections: Record<string, unknown>): boolean {
  const nodeConns = connections[nodeName];
  if (!nodeConns || typeof nodeConns !== "object") return false;
  const mainOutputs = (nodeConns as Record<string, unknown>).main;
  if (!Array.isArray(mainOutputs)) return false;
  if (mainOutputs.length >= 2) {
    const errorTargets = mainOutputs[1];
    if (Array.isArray(errorTargets) && errorTargets.length > 0) return true;
  }
  return false;
}

function nodeHasRetry(node: NormalNode): boolean {
  const p = node.parameters as Record<string, unknown> | undefined;
  if (!p) return false;
  if (p.retryOnFail === true) return true;
  if (typeof p.maxTries === "number" && p.maxTries > 1) return true;
  const opts = p.options as Record<string, unknown> | undefined;
  if (opts?.retryOnFail === true) return true;
  return false;
}

function loopHasBreak(node: NormalNode): boolean {
  const p = node.parameters as Record<string, unknown> | undefined;
  if (!p) return false;
  return (
    (typeof p.batchSize === "number" && p.batchSize > 0) ||
    (typeof p.batchSize === "string" && parseInt(p.batchSize, 10) > 0) ||
    (typeof p.maxItems === "number" && p.maxItems > 0)
  );
}

// ─── Main rule runner ─────────────────────────────────────────────────────────
export function runReliabilityRules(
  parsed: ParsedWorkflow,
  connections: Record<string, unknown>
): { flags: AuditFlag[]; retryBonus: number; noErrorHandlingCount: number } {
  const flags: AuditFlag[] = [];
  const nodes = parsed.nodes;
  const nodeByName = new Map<string, NormalNode>(nodes.map((n) => [n.name, n]));

  let networkNodesWithRetryOrCOF = 0;
  let networkNodesTotal = 0;
  let noErrorHandlingCount = 0;

  // ── Error handling on network nodes ────────────────────────────────────────
  for (const node of nodes) {
    if (!HTTP_TYPES.has(node.type)) continue;
    networkNodesTotal++;
    const hasErrBranch = nodeHasErrorBranch(node.name, connections);
    const hasCof = nodeHasContinueOnFail(node);
    const hasRetry = nodeHasRetry(node);
    if (hasRetry || hasCof) networkNodesWithRetryOrCOF++;
    if (!hasErrBranch && !hasCof) {
      noErrorHandlingCount++;
      flags.push({
        id: `REL_NO_ERR_${node.id}`,
        rule: "RELIABILITY_NO_ERROR_HANDLING",
        severity: "WARNING",
        category: "RELIABILITY",
        title: "No error handling on network node",
        detail: `"${node.name}" makes external calls with no error branch or continueOnFail — a single failure halts the workflow.`,
        nodeName: node.name, nodeType: node.type, ptsDeducted: 15,
        remediation: {
          description: "Enable 'Continue on Fail' or add an error output branch.",
          n8nUiInstruction: `Open "${node.name}" → Settings → toggle "Continue On Fail".`,
          jsonPatch: [{ op: "replace", path: `/parameters/continueOnFail`, value: true }],
        },
      });
    }
  }

  // ── Loop without batchSize ─────────────────────────────────────────────────
  for (const node of nodes) {
    if (!LOOP_TYPES.has(node.type)) continue;
    if (!loopHasBreak(node)) {
      flags.push({
        id: `REL_LOOP_${node.id}`,
        rule: "RELIABILITY_UNBOUNDED_LOOP",
        severity: "WARNING",
        category: "RELIABILITY",
        title: "Loop without explicit batch limit",
        detail: `"${node.name}" has no batchSize or item limit — may exhaust memory on large inputs.`,
        nodeName: node.name, nodeType: node.type, ptsDeducted: 12,
        remediation: {
          description: "Set a batchSize to limit processing scope.",
          n8nUiInstruction: `Open "${node.name}" → Batch Size → set e.g. 100.`,
          jsonPatch: [{ op: "replace", path: `/parameters/batchSize`, value: 100 }],
        },
      });
    }
  }

  // ── Unthrottled API calls inside loops (rate-limit risk) ───────────────────
  const loopNodes = nodes.filter((n) => LOOP_TYPES.has(n.type));
  for (const loopNode of loopNodes) {
    const loopConns = (connections as Record<string, Record<string, Array<Array<{ node: string }>>>>)[loopNode.name];
    const bodySteps = loopConns?.main?.[0] ?? [];
    for (const { node: nextName } of bodySteps) {
      const next = nodeByName.get(nextName);
      if (!next || !HTTP_TYPES.has(next.type)) continue;
      const hasDelay = bodySteps.some(({ node: n }) => {
        const nd = nodeByName.get(n);
        return nd && DELAY_NODE_TYPES.has(nd.type);
      });
      if (!hasDelay) {
        flags.push({
          id: `REL_THROTTLE_${loopNode.id}`,
          rule: "RELIABILITY_UNTHROTTLED_LOOP",
          severity: "WARNING",
          category: "RELIABILITY",
          title: "Unthrottled API calls inside loop",
          detail: `"${next.name}" calls an API inside loop "${loopNode.name}" without a delay — risks rate-limit errors.`,
          nodeName: next.name, nodeType: next.type, ptsDeducted: 15,
          remediation: {
            description: "Add a Wait node between the loop and the API call.",
            n8nUiInstruction: `Insert a "Wait" node between "${loopNode.name}" and "${next.name}" (1-second delay).`,
          },
        });
      }
    }
  }

  // ── Blast radius: majority of state-changing nodes unprotected ─────────────
  const stateNodes = nodes.filter((n) => STATE_CHANGING_TYPES.has(n.type));
  const unprotected = stateNodes.filter((n) => {
    if ((n.parameters as Record<string, unknown>)?.continueOnFail === true) return false;
    const nodeConns = (connections as Record<string, Record<string, unknown>>)[n.name];
    if (!nodeConns) return false;
    const outputs = Object.keys(nodeConns);
    if (outputs.every((k) => k === "main")) {
      const mainArr = (nodeConns as Record<string, unknown[]>).main;
      if (Array.isArray(mainArr) && mainArr.length >= 2) {
        const errBranch = mainArr[1];
        if (Array.isArray(errBranch) && errBranch.length > 0) return false;
      }
      return true;
    }
    return false;
  });

  if (stateNodes.length > 0 && unprotected.length / stateNodes.length > 0.6) {
    flags.push({
      id: "REL_BLAST_RADIUS",
      rule: "RELIABILITY_BLAST_RADIUS",
      severity: "WARNING",
      category: "RELIABILITY",
      title: `High failure blast radius (${Math.round(unprotected.length / stateNodes.length * 100)}% unprotected)`,
      detail: `${unprotected.length}/${stateNodes.length} state-changing nodes have no error handling — a single failure could corrupt state across all.`,
      ptsDeducted: 15,
      remediation: {
        description: "Add error branches or continueOnFail to all state-changing nodes.",
      },
    });
  }

  // Retry bonus: ≥50% of network nodes have retry or continueOnFail
  const retryBonus =
    networkNodesTotal > 0 && networkNodesWithRetryOrCOF / networkNodesTotal >= 0.5 ? 15 : 0;

  return { flags, retryBonus, noErrorHandlingCount };
}

export function computeReliabilityScore(flags: AuditFlag[], retryBonus: number): number {
  let score = 100;
  const classDeductions: Record<string, number> = {};
  for (const f of flags) {
    if (f.category !== "RELIABILITY" || !f.ptsDeducted) continue;
    const current = classDeductions[f.rule] ?? 0;
    const allowable = Math.max(0, PER_CLASS_MAX_DEDUCTION - current);
    const applied = Math.min(f.ptsDeducted, allowable);
    classDeductions[f.rule] = current + applied;
    score -= applied;
  }
  return Math.min(100, Math.max(0, score + retryBonus));
}

export function computeRetryBonus(parsed: ParsedWorkflow): number {
  const nodes = parsed.nodes;
  let total = 0, withCov = 0;
  for (const node of nodes) {
    if (!HTTP_TYPES.has(node.type)) continue;
    total++;
    const p = node.parameters as Record<string, unknown> | undefined;
    const opts = p?.options as Record<string, unknown> | undefined;
    if (p?.continueOnFail === true || p?.retryOnFail === true ||
        opts?.continueOnFail === true || opts?.retryOnFail === true) withCov++;
  }
  if (total > 0 && withCov / total >= 0.5) return 15;
  return 0;
}
