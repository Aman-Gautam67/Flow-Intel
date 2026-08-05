/**
 * FlowIntel Certification Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Issues deterministic, immutable FlowIntel Certified™ certificates.
 *
 * Certification requirements (all must pass):
 *   - MARKETPLACE_GATE passed
 *   - PRODUCTION_GATE passed
 *
 * Note: ENTERPRISE_GATE failure does not block certification — it only means
 * the workflow is not enterprise-ready. Certification is Marketplace-level.
 *
 * Certificate properties:
 *   - certificateId: CERT-{timestamp}-{fingerprint prefix}
 *   - verificationHash: SHA-256(certificateId + fingerprint + auditDate)
 *   - Immutable: once issued, certificates are never modified
 *   - Shareable: the certificate ID + verificationHash uniquely identify it
 *
 * AI is NEVER part of certification. All certification is deterministic.
 */

import type {
  Certificate,
  QualityGateResult,
  CategoryScore,
  FingerprintResult,
  RuleCategory,
  Finding,
} from "./types";
import { sha256 } from "./fingerprint";
import { summarizeFindings } from "./rule-engine";

const CERTIFICATION_VERSION = "2.0.0";

// Gates required to issue a certificate
const REQUIRED_PASSING_GATES = new Set(["MARKETPLACE_GATE", "PRODUCTION_GATE"]);

export type CertificationLevel =
  | "ENTERPRISE_READY"
  | "CERTIFIED"
  | "MARKETPLACE_READY"
  | "NOT_CERTIFIED";

/**
 * Derive the public certification level from evaluated quality gates.
 * Enterprise readiness requires every gate, certification requires marketplace
 * and production gates, and marketplace readiness requires only marketplace.
 */
export function deriveCertificationLevel(gateResults: QualityGateResult[]): CertificationLevel {
  const passed = (gateName: QualityGateResult["gate"]) =>
    gateResults.find((gate) => gate.gate === gateName)?.passed === true;

  if (gateResults.length > 0 && gateResults.every((gate) => gate.passed)) {
    return "ENTERPRISE_READY";
  }
  if (passed("MARKETPLACE_GATE") && passed("PRODUCTION_GATE")) {
    return "CERTIFIED";
  }
  if (passed("MARKETPLACE_GATE")) {
    return "MARKETPLACE_READY";
  }
  return "NOT_CERTIFIED";
}

/**
 * Attempt to issue a FlowIntel Certified™ certificate.
 *
 * @returns Certificate if all required gates pass, null otherwise
 */
export async function issueCertificate(params: {
  fingerprint: FingerprintResult;
  platform: string;
  workflowName: string;
  findings: Finding[];
  gateResults: QualityGateResult[];
  categoryScores: CategoryScore[];
}): Promise<Certificate | null> {
  const { fingerprint, platform, workflowName, findings, gateResults, categoryScores } = params;

  // Check required gates
  const allRequiredPass = Array.from(REQUIRED_PASSING_GATES).every((gateName) => {
    const result = gateResults.find((g) => g.gate === gateName);
    return result?.passed === true;
  });

  const auditDate = new Date().toISOString();

  // Build category score summary (null for N/A categories)
  const categoryScoreMap: Record<RuleCategory, number | null> = {
    SECURITY:          null,
    RELIABILITY:       null,
    IDEMPOTENCY:       null,
    OBSERVABILITY:     null,
    MAINTAINABILITY:   null,
    PERFORMANCE:       null,
    COMPATIBILITY:     null,
    PRIVACY:           null,
    DOCUMENTATION:     null,
    COST_OPTIMIZATION: null,
  };
  for (const cat of categoryScores) {
    if (cat.applicable) {
      categoryScoreMap[cat.category] = cat.score;
    }
  }

  const passedGates = gateResults
    .filter((g) => g.passed)
    .map((g) => g.gate);

  const findingsSummary = summarizeFindings(findings);

  // Build certificate ID: deterministic from fingerprint + timestamp (ms truncated to minute for stability)
  const minuteTimestamp = new Date(auditDate).toISOString().slice(0, 16).replace(/[^0-9]/g, "");
  const certIdBase = `CERT-${minuteTimestamp}-${fingerprint.hash.slice(0, 8).toUpperCase()}`;

  // Verification hash: SHA-256(certId + fingerprint + auditDate + valid flag)
  const verificationInput = `${certIdBase}:${fingerprint.hash}:${auditDate}:${allRequiredPass}`;
  const verificationHash = await sha256(verificationInput);

  const certificate: Certificate = {
    certificateId: certIdBase,
    fingerprint: fingerprint.hash,
    auditDate,
    certificationVersion: CERTIFICATION_VERSION,
    platform,
    workflowName,
    passedGates,
    gateResults,
    categoryScores: categoryScoreMap,
    findingsSummary,
    verificationHash,
    valid: allRequiredPass,
  };

  // Return certificate regardless of validity — callers can check .valid
  // The runner decides whether to surface it based on context
  return certificate;
}

/**
 * Verify a certificate's integrity.
 *
 * Recomputes the verification hash and compares it to the stored one.
 * Returns true if the certificate has not been tampered with.
 *
 * Note: This only verifies hash integrity, not that the underlying
 * workflow still produces the same findings (use fingerprintWorkflow for that).
 */
export async function verifyCertificate(cert: Certificate): Promise<boolean> {
  const verificationInput = `${cert.certificateId}:${cert.fingerprint}:${cert.auditDate}:${cert.valid}`;
  const expectedHash = await sha256(verificationInput);
  return expectedHash === cert.verificationHash;
}

/**
 * Generate a human-readable certificate summary string.
 * Suitable for README embedding or API responses.
 */
export function formatCertificateSummary(cert: Certificate): string {
  const status = cert.valid ? "✅ FlowIntel Certified™" : "❌ Not Certified";
  const passedCount = cert.passedGates.length;
  const totalGates = cert.gateResults.length;
  return [
    `${status}`,
    `Certificate ID: ${cert.certificateId}`,
    `Platform: ${cert.platform}`,
    `Workflow: ${cert.workflowName}`,
    `Audit Date: ${cert.auditDate.split("T")[0]}`,
    `Gates Passed: ${passedCount}/${totalGates}`,
    `Findings: ${cert.findingsSummary.critical} CRITICAL, ${cert.findingsSummary.high} HIGH`,
    `Verification Hash: ${cert.verificationHash.slice(0, 16)}...`,
  ].join("\n");
}
