/**
 * FlowIntel Workflow Passport
 * ─────────────────────────────────────────────────────────────────────────────
 * Every workflow analyzed by FlowIntel receives a permanent Workflow Passport.
 *
 * The Passport is the stable identity record for a workflow across versions.
 * It accumulates certification history, marketplace status, and audit history.
 *
 * Unlike the Certificate (which is point-in-time), the Passport is a living record.
 *
 * In the current architecture, the Passport is created fresh from each analysis.
 * When persisted to the database, it builds a history over time.
 * The database layer (outside this module) handles version accumulation.
 */

import type {
  WorkflowPassport,
  FingerprintResult,
  Certificate,
  QualityGateResult,
} from "./types";

/**
 * Create a new Workflow Passport from an analysis result.
 *
 * @param params - Analysis result components
 * @returns A populated WorkflowPassport
 */
export function createPassport(params: {
  workflowId: string;
  fingerprint: FingerprintResult;
  workflowName: string;
  platform: string;
  creator?: string;
  certificate: Certificate | null;
  gateResults: QualityGateResult[];
  analysisVersion?: number;
  previousPassport?: WorkflowPassport;
}): WorkflowPassport {
  const {
    workflowId,
    fingerprint,
    workflowName,
    platform,
    creator,
    certificate,
    gateResults,
    analysisVersion = 1,
    previousPassport,
  } = params;

  const now = new Date().toISOString();

  // Determine marketplace status from gate results
  const marketplaceGate = gateResults.find((g) => g.gate === "MARKETPLACE_GATE");
  let marketplaceStatus: WorkflowPassport["marketplaceStatus"] = "NOT_SUBMITTED";

  if (previousPassport?.marketplaceStatus === "APPROVED") {
    // Stay approved if it was previously approved and still passes
    marketplaceStatus = marketplaceGate?.passed ? "APPROVED" : "REJECTED";
  } else if (previousPassport?.marketplaceStatus === "PENDING") {
    // Pending → approved or rejected based on current gates
    marketplaceStatus = marketplaceGate?.passed ? "APPROVED" : "REJECTED";
  } else {
    // Fresh workflow — not submitted yet
    marketplaceStatus = "NOT_SUBMITTED";
  }

  const passport: WorkflowPassport = {
    workflowId,
    fingerprint,
    workflowName,
    platform,
    creator,
    firstAnalysedAt: previousPassport?.firstAnalysedAt ?? now,
    lastAnalysedAt: now,
    analysisVersion: previousPassport
      ? (previousPassport.analysisVersion + 1)
      : analysisVersion,
    certificate: certificate ?? undefined,
    marketplaceStatus,
    gateResults,
  };

  return passport;
}

/**
 * Update an existing passport with new analysis results.
 * Preserves historical fields (firstAnalysedAt, creator) while updating current state.
 */
export function updatePassport(
  existing: WorkflowPassport,
  update: {
    fingerprint: FingerprintResult;
    workflowName?: string;
    certificate: Certificate | null;
    gateResults: QualityGateResult[];
  }
): WorkflowPassport {
  const marketplaceGate = update.gateResults.find((g) => g.gate === "MARKETPLACE_GATE");

  // If currently approved and gates still pass, remain approved
  // If currently approved and gates now fail, move to rejected
  let newMarketplaceStatus = existing.marketplaceStatus;
  if (existing.marketplaceStatus === "APPROVED") {
    newMarketplaceStatus = marketplaceGate?.passed ? "APPROVED" : "REJECTED";
  }

  return {
    ...existing,
    fingerprint: update.fingerprint,
    workflowName: update.workflowName ?? existing.workflowName,
    lastAnalysedAt: new Date().toISOString(),
    analysisVersion: existing.analysisVersion + 1,
    certificate: update.certificate ?? undefined,
    marketplaceStatus: newMarketplaceStatus,
    gateResults: update.gateResults,
  };
}

/**
 * Generate a stable workflow ID from a fingerprint hash.
 * This is the canonical workflow ID used across all analysis versions.
 *
 * Format: WF-{first 12 chars of fingerprint hash}
 */
export function generateWorkflowId(fingerprintHash: string): string {
  return `WF-${fingerprintHash.slice(0, 12).toUpperCase()}`;
}

/**
 * Compute a summary string for the passport — suitable for API responses.
 */
export function summarizePassport(passport: WorkflowPassport): string {
  const certified = passport.certificate?.valid ? "Certified" : "Not Certified";
  const marketStatus = passport.marketplaceStatus.replace(/_/g, " ");
  return [
    `Workflow: ${passport.workflowName}`,
    `Platform: ${passport.platform}`,
    `ID: ${passport.workflowId}`,
    `Version: ${passport.analysisVersion}`,
    `Status: ${certified} | ${marketStatus}`,
    `Last Analyzed: ${passport.lastAnalysedAt.split("T")[0]}`,
    `Fingerprint: ${passport.fingerprint.hash.slice(0, 16)}...`,
  ].join(" | ");
}
