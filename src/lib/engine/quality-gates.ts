/**
 * FlowIntel Quality Gates — v2.1.0 (hardened)
 * ─────────────────────────────────────────────────────────────────────────────
 * Quality Gates are BINARY: a workflow either PASSES or FAILS each gate.
 * Gates evaluate specific findings — never raw scores alone.
 *
 * DEPENDENCY CHAIN (invariant must hold after every change):
 *   ENTERPRISE_GATE  ← depends on PRODUCTION_GATE
 *   PRODUCTION_GATE  ← depends on MARKETPLACE_GATE
 *   MARKETPLACE_GATE ← depends on SECURITY_GATE + RELIABILITY_GATE
 *
 * Gate definitions:
 *   SECURITY_GATE    — No CRITICAL security findings; no marketplace-blocking security rules
 *   RELIABILITY_GATE — Proportional error-handling coverage; no infinite loops
 *   MARKETPLACE_GATE — SECURITY + RELIABILITY pass; no any marketplace-blocking finding
 *   PRODUCTION_GATE  — MARKETPLACE pass; no remaining CRITICAL findings; no double-write retries
 *   ENTERPRISE_GATE  — PRODUCTION pass; observability present; documentation present;
 *                      no HIGH/CRITICAL in IDEMPOTENCY, SECURITY, PRIVACY, RELIABILITY
 *
 * Changes from v2.0.0 (audit fixes):
 *   [FIX-1] Reliability Gate: replaced absolute threshold (≥3) with proportional algorithm
 *           FAIL if unhandledNetworkNodes / totalNetworkNodes > RELIABILITY_FAIL_RATIO (0.40)
 *           Minimum: 1-node workflows fail if that node is unhandled
 *   [FIX-2] Reliability Gate: hasHttp logic inverted bug fixed — now derived from AST context
 *   [FIX-3] Reliability Gate: infinite loop (REL-011) now included
 *   [FIX-4] Security Gate: deduplicates failReasons — CRITICAL + blocking counted once
 *   [FIX-5] Security Gate: PRIVACY CRITICAL findings move to Production Gate (separation of concerns)
 *   [FIX-6] Enterprise Gate: OBS check changed from AND → OR (either missing = fail)
 *   [FIX-7] Enterprise Gate: broadened to catch HIGH+ in critical categories
 *   [FIX-8] All gates: blockingFindings deduplicated by finding.id (no reference-equality)
 */

import type { Finding, CategoryScore, QualityGateResult, QualityGateName } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Proportional threshold for the Reliability Gate.
 * FAIL if (unhandled network nodes) / (total network nodes) > this ratio.
 * 0.40 means: if more than 40% of your network nodes lack error handling, the gate fails.
 * Rationale:
 *   - 2/5   = 40% → exactly on threshold → PASS (borderline acceptable)
 *   - 3/5   = 60% → FAIL
 *   - 1/30  = 3%  → PASS (excellent on a large workflow)
 *   - 25/30 = 83% → FAIL (systemic neglect on large workflow)
 *   - 2/2   = 100% → FAIL (100% unhandled was passing before — now fixed)
 *   - 1/1   = 100% → FAIL
 */
const RELIABILITY_FAIL_RATIO = 0.40;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGate(
  name: QualityGateName,
  evaluate: () => { failReasons: string[]; blockingFindings: Finding[] }
): QualityGateResult {
  const { failReasons, blockingFindings } = evaluate();
  // Deduplicate blockingFindings by finding.id (object identity unreliable across rule packs)
  const seen = new Set<string>();
  const deduped = blockingFindings.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
  return {
    gate: name,
    passed: failReasons.length === 0,
    failReasons,
    blockingFindings: deduped,
  };
}

function findingsOfRule(findings: Finding[], ruleId: string): Finding[] {
  return findings.filter((f) => f.ruleId === ruleId);
}

function criticalFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.severity === "CRITICAL");
}

function highOrCriticalFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH");
}

function marketplaceBlockingFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.marketplaceBlocking);
}

/** Deduplicate a merged finding array by finding.id */
function dedupeFindings(existing: Finding[], additions: Finding[]): Finding[] {
  const ids = new Set(existing.map((f) => f.id));
  return additions.filter((f) => !ids.has(f.id));
}

// ─── Gate 1: Security Gate ────────────────────────────────────────────────────
/**
 * Scope: SECURITY category only.
 * Privacy violations are covered by the Production Gate (separation of concerns).
 *
 * FAILS if:
 *   a) Any CRITICAL finding in the SECURITY category
 *   b) Any marketplace-blocking finding in the SECURITY category
 *
 * FIX-4: A CRITICAL marketplace-blocking finding now generates ONE failReason, not two.
 * FIX-5: PRIVACY CRITICAL findings removed from this gate (moved to Production Gate).
 */
export function evaluateSecurityGate(
  findings: Finding[],
  _categoryScores: CategoryScore[]
): QualityGateResult {
  return makeGate("SECURITY_GATE", () => {
    const failReasons: string[] = [];
    const blockingFindings: Finding[] = [];

    const secFindings = findings.filter((f) => f.category === "SECURITY");

    // Collect CRITICAL security findings
    const critSec = secFindings.filter((f) => f.severity === "CRITICAL");
    // Collect marketplace-blocking security findings not already in crit list
    const mbSec = secFindings.filter(
      (f) => f.marketplaceBlocking && f.severity !== "CRITICAL"
    );

    if (critSec.length > 0) {
      failReasons.push(
        `${critSec.length} CRITICAL security finding${critSec.length > 1 ? "s" : ""}: ` +
        critSec.map((f) => f.ruleName).join(", ")
      );
      blockingFindings.push(...critSec);
    }

    if (mbSec.length > 0) {
      for (const f of mbSec) {
        failReasons.push(`Security policy violation: ${f.ruleName} — ${f.evidence.summary}`);
        blockingFindings.push(f);
      }
    }

    return { failReasons, blockingFindings };
  });
}

// ─── Gate 2: Reliability Gate ─────────────────────────────────────────────────
/**
 * PROPORTIONAL algorithm — scales with workflow size. [FIX-1, FIX-2, FIX-3]
 *
 * FAILS if:
 *   a) unhandledNetworkNodes / totalNetworkNodes > RELIABILITY_FAIL_RATIO (0.40)
 *      where:
 *        unhandledNetworkNodes = count of REL-001 findings
 *        totalNetworkNodes     = passed in via workflowContext
 *   b) Any unbounded infinite loop (REL-011) — always blocks regardless of size
 *   c) Any unbounded batch loop (REL-002) — only if HTTP calls exist in the workflow
 *      (totalNetworkNodes > 0 is the correct proxy, not absence of REL-001 findings)
 *
 * The gate now requires workflowContext to carry total network node count.
 */
export function evaluateReliabilityGate(
  findings: Finding[],
  _categoryScores: CategoryScore[],
  workflowContext: {
    /** Total count of HTTP/network nodes in the workflow (from AST — not from findings) */
    totalNetworkNodes: number;
  } = { totalNetworkNodes: 0 }
): QualityGateResult {
  return makeGate("RELIABILITY_GATE", () => {
    const failReasons: string[] = [];
    const blockingFindings: Finding[] = [];

    const noErrorHandling = findingsOfRule(findings, "REL-001");
    const unboundedBatch   = findingsOfRule(findings, "REL-002");
    const infiniteLoop     = findingsOfRule(findings, "REL-011"); // [FIX-3]

    const totalNetworkNodes = workflowContext.totalNetworkNodes;
    const unhandledCount    = noErrorHandling.length;

    // [FIX-1] Proportional threshold
    if (unhandledCount > 0 && totalNetworkNodes > 0) {
      const ratio = unhandledCount / totalNetworkNodes;
      if (ratio > RELIABILITY_FAIL_RATIO) {
        const pct = Math.round(ratio * 100);
        failReasons.push(
          `${unhandledCount}/${totalNetworkNodes} network nodes (${pct}%) lack error handling` +
          ` — exceeds ${Math.round(RELIABILITY_FAIL_RATIO * 100)}% threshold`
        );
        blockingFindings.push(...noErrorHandling);
      }
    } else if (unhandledCount > 0 && totalNetworkNodes === 0) {
      // Fallback: if we have REL-001 findings but no context, treat any as a signal
      // (guards against misconfigured context)
      if (unhandledCount >= 2) {
        failReasons.push(
          `${unhandledCount} network nodes lack error handling (workflow context unavailable)`
        );
        blockingFindings.push(...noErrorHandling);
      }
    }

    // [FIX-3] Infinite loop always blocks — regardless of HTTP presence
    if (infiniteLoop.length > 0) {
      failReasons.push(
        `${infiniteLoop.length} potential infinite loop${infiniteLoop.length > 1 ? "s" : ""} detected — execution will never terminate`
      );
      blockingFindings.push(...infiniteLoop);
    }

    // [FIX-2] Unbounded batch loop: use totalNetworkNodes > 0 as the HTTP proxy
    // (previously used findings presence — inverted bug)
    const hasHttpContext = totalNetworkNodes > 0;
    if (unboundedBatch.length > 0 && hasHttpContext) {
      failReasons.push(
        `${unboundedBatch.length} unbounded loop${unboundedBatch.length > 1 ? "s" : ""} with HTTP calls — memory exhaustion risk`
      );
      const newFindings = dedupeFindings(blockingFindings, unboundedBatch);
      blockingFindings.push(...newFindings);
    }

    return { failReasons, blockingFindings };
  });
}

// ─── Gate 3: Marketplace Gate ─────────────────────────────────────────────────
/**
 * FAILS if:
 *   - Security Gate failed
 *   - Reliability Gate failed
 *   - Any marketplace-blocking finding from any category (not already captured above)
 *
 * The Marketplace must never publish based on scores alone.
 * Each blocking finding is listed individually so creators know exactly what to fix.
 */
export function evaluateMarketplaceGate(
  findings: Finding[],
  _categoryScores: CategoryScore[],
  secGate: QualityGateResult,
  relGate: QualityGateResult
): QualityGateResult {
  return makeGate("MARKETPLACE_GATE", () => {
    const failReasons: string[] = [];
    const blockingFindings: Finding[] = [];

    if (!secGate.passed) {
      failReasons.push(`Security Gate failed (${secGate.failReasons.length} reason${secGate.failReasons.length > 1 ? "s" : ""})`);
      blockingFindings.push(...secGate.blockingFindings);
    }

    if (!relGate.passed) {
      failReasons.push(`Reliability Gate failed (${relGate.failReasons.length} reason${relGate.failReasons.length > 1 ? "s" : ""})`);
      blockingFindings.push(...dedupeFindings(blockingFindings, relGate.blockingFindings));
    }

    // Any marketplace-blocking finding not already captured
    const allBlocking = marketplaceBlockingFindings(findings);
    const newBlocking = dedupeFindings(blockingFindings, allBlocking);
    if (newBlocking.length > 0) {
      for (const f of newBlocking) {
        failReasons.push(`[${f.category}] ${f.ruleName}: ${f.evidence.summary}`);
        blockingFindings.push(f);
      }
    }

    return { failReasons, blockingFindings };
  });
}

// ─── Gate 4: Production Gate ──────────────────────────────────────────────────
/**
 * FAILS if:
 *   - Marketplace Gate failed
 *   - Any remaining CRITICAL finding in any category (including PRIVACY — [FIX-5])
 *   - Non-idempotent retries on write operations (IDP-002)
 *   - Payment charge without idempotency key (IDP-004) — double-charge risk
 *   - Subscription charge without guard (IDP-015) — double-subscription risk
 */
export function evaluateProductionGate(
  findings: Finding[],
  _categoryScores: CategoryScore[],
  marketplaceGate: QualityGateResult
): QualityGateResult {
  return makeGate("PRODUCTION_GATE", () => {
    const failReasons: string[] = [];
    const blockingFindings: Finding[] = [];

    if (!marketplaceGate.passed) {
      failReasons.push(`Marketplace Gate failed (${marketplaceGate.blockingFindings.length} blocking finding${marketplaceGate.blockingFindings.length !== 1 ? "s" : ""})`);
      blockingFindings.push(...marketplaceGate.blockingFindings);
    }

    // Any CRITICAL finding not already captured (includes PRIVACY CRITICAL — [FIX-5])
    const remainingCritical = dedupeFindings(blockingFindings, criticalFindings(findings));
    if (remainingCritical.length > 0) {
      const byCat: Record<string, number> = {};
      for (const f of remainingCritical) byCat[f.category] = (byCat[f.category] ?? 0) + 1;
      const summary = Object.entries(byCat).map(([c, n]) => `${n} in ${c}`).join(", ");
      failReasons.push(`${remainingCritical.length} CRITICAL finding${remainingCritical.length > 1 ? "s" : ""} must be resolved before production: ${summary}`);
      blockingFindings.push(...remainingCritical);
    }

    // Non-idempotent retries — data integrity risk
    const nonIdempotentRetries = dedupeFindings(blockingFindings, findingsOfRule(findings, "IDP-002"));
    if (nonIdempotentRetries.length > 0) {
      failReasons.push(`${nonIdempotentRetries.length} non-idempotent write retry${nonIdempotentRetries.length > 1 ? "s" : ""} — data duplication risk in production`);
      blockingFindings.push(...nonIdempotentRetries);
    }

    // Payment safety rules (always block production)
    const paymentRisks = dedupeFindings(
      blockingFindings,
      findings.filter((f) => f.ruleId === "IDP-004" || f.ruleId === "IDP-015")
    );
    if (paymentRisks.length > 0) {
      failReasons.push(`${paymentRisks.length} payment operation${paymentRisks.length > 1 ? "s" : ""} without idempotency protection — double-charge risk`);
      blockingFindings.push(...paymentRisks);
    }

    return { failReasons, blockingFindings };
  });
}

// ─── Gate 5: Enterprise Gate ──────────────────────────────────────────────────
/**
 * FAILS if:
 *   - Production Gate failed
 *   - Any HIGH or CRITICAL finding in SECURITY, PRIVACY, RELIABILITY, or IDEMPOTENCY  [FIX-7]
 *   - Missing execution tracking OR monitoring (OR logic) [FIX-6]
 *   - Missing README documentation (DOC-001)
 *   - Credential blast radius (PRV-003)
 *   - Missing audit log on destructive operations (SEC-035)
 *   - Missing rollback on multi-step writes (REL-028)
 *   - PII stored without retention policy (PRV-005)
 */
export function evaluateEnterpriseGate(
  findings: Finding[],
  _categoryScores: CategoryScore[],
  productionGate: QualityGateResult
): QualityGateResult {
  return makeGate("ENTERPRISE_GATE", () => {
    const failReasons: string[] = [];
    const blockingFindings: Finding[] = [];

    if (!productionGate.passed) {
      failReasons.push(`Production Gate failed (${productionGate.blockingFindings.length} blocking finding${productionGate.blockingFindings.length !== 1 ? "s" : ""})`);
      blockingFindings.push(...productionGate.blockingFindings);
    }

    // [FIX-7] Any HIGH/CRITICAL in enterprise-sensitive categories
    const ENTERPRISE_CRITICAL_CATS = new Set(["SECURITY", "PRIVACY", "RELIABILITY", "IDEMPOTENCY"]);
    const highCritEnterprise = dedupeFindings(
      blockingFindings,
      highOrCriticalFindings(findings).filter((f) => ENTERPRISE_CRITICAL_CATS.has(f.category))
    );
    if (highCritEnterprise.length > 0) {
      const byCat: Record<string, number> = {};
      for (const f of highCritEnterprise) byCat[f.category] = (byCat[f.category] ?? 0) + 1;
      const summary = Object.entries(byCat).map(([c, n]) => `${n} ${c}`).join(", ");
      failReasons.push(`HIGH/CRITICAL findings in enterprise-sensitive categories: ${summary}`);
      blockingFindings.push(...highCritEnterprise);
    }

    // [FIX-6] Observability: OR logic — either missing tracking OR missing monitoring fails
    const noTracking = findingsOfRule(findings, "OBS-001");
    const noMonitor  = findingsOfRule(findings, "OBS-002");
    if (noTracking.length > 0) {
      failReasons.push("No execution tracking — enterprise SLAs require full execution visibility");
      blockingFindings.push(...dedupeFindings(blockingFindings, noTracking));
    }
    if (noMonitor.length > 0) {
      failReasons.push("No monitoring integration — enterprise requires alerting on failures");
      blockingFindings.push(...dedupeFindings(blockingFindings, noMonitor));
    }

    // Documentation requirement
    const noReadme = dedupeFindings(blockingFindings, findingsOfRule(findings, "DOC-001"));
    if (noReadme.length > 0) {
      failReasons.push("Missing README — enterprise workflows must be fully documented");
      blockingFindings.push(...noReadme);
    }

    // Credential blast radius
    const credBlast = dedupeFindings(blockingFindings, findingsOfRule(findings, "PRV-003"));
    if (credBlast.length > 0) {
      failReasons.push("Credential blast radius exceeds enterprise security policy");
      blockingFindings.push(...credBlast);
    }

    // Audit log requirement for destructive operations
    const noAuditLog = dedupeFindings(blockingFindings, findingsOfRule(findings, "SEC-035"));
    if (noAuditLog.length > 0) {
      failReasons.push("Destructive operations lack audit logs — required for enterprise compliance");
      blockingFindings.push(...noAuditLog);
    }

    // Multi-step write without rollback
    const noRollback = dedupeFindings(blockingFindings, findingsOfRule(findings, "REL-028"));
    if (noRollback.length > 0) {
      failReasons.push("Multi-step write operations lack rollback logic — data consistency risk");
      blockingFindings.push(...noRollback);
    }

    // PII retention policy
    const noRetention = dedupeFindings(blockingFindings, findingsOfRule(findings, "PRV-005"));
    if (noRetention.length > 0) {
      failReasons.push("PII stored without retention policy — GDPR Article 5(1)(e) violation");
      blockingFindings.push(...noRetention);
    }

    return { failReasons, blockingFindings };
  });
}

// ─── Evaluate All Gates ───────────────────────────────────────────────────────
/**
 * Evaluate the full gate chain in dependency order.
 * workflowContext is required for the proportional Reliability Gate.
 */
export function evaluateAllGates(
  findings: Finding[],
  categoryScores: CategoryScore[],
  workflowContext: { totalNetworkNodes: number } = { totalNetworkNodes: 0 }
): QualityGateResult[] {
  const secGate = evaluateSecurityGate(findings, categoryScores);
  const relGate = evaluateReliabilityGate(findings, categoryScores, workflowContext);
  const mktGate = evaluateMarketplaceGate(findings, categoryScores, secGate, relGate);
  const prdGate = evaluateProductionGate(findings, categoryScores, mktGate);
  const entGate = evaluateEnterpriseGate(findings, categoryScores, prdGate);

  return [secGate, relGate, mktGate, prdGate, entGate];
}
