import { NextRequest, NextResponse } from "next/server";
import { parseWorkflow } from "@/lib/parsers";
import { analyzerService } from "@/lib/analyzer/engine";
import { verifyCertificate } from "@/lib/engine/certification";
import { verifyFingerprint } from "@/lib/engine/fingerprint";
import { getCertificateById } from "@/lib/db/queries/workflows";

/**
 * POST /api/v2/certificate/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * Certificate verification endpoint.
 *
 * Two modes:
 *   1. Verify hash only: pass certificateId + verificationHash in body
 *      Returns: { valid: boolean, reason: string }
 *
 *   2. Full re-analysis: pass the original workflow JSON to re-analyze and
 *      compare fingerprints
 *      Returns: { valid: boolean, fingerprintMatch: boolean, newReport: ... }
 *
 * Body: {
 *   certificate: Certificate,  // the certificate to verify
 *   workflow?: <workflow JSON>  // optional: re-analyze to verify fingerprint
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json() as {
      certificate: import("@/lib/engine/types").Certificate;
      workflow?: unknown;
    };

    const { certificate, workflow } = body;

    if (!certificate) {
      return NextResponse.json({ error: "Certificate required in body" }, { status: 400 });
    }

    if (certificate.certificateId !== id) {
      return NextResponse.json({
        valid: false,
        reason: "Certificate ID in URL does not match certificate body",
      });
    }

    // ── Mode 1: Hash integrity check ─────────────────────────────────────────
    const hashValid = await verifyCertificate(certificate);
    if (!hashValid) {
      return NextResponse.json({
        valid: false,
        reason: "Certificate verification hash does not match — certificate may have been tampered with",
        certificateId: id,
      });
    }

    // ── Mode 2: Re-analyze + fingerprint comparison ──────────────────────────
    if (workflow) {
      const parsed = parseWorkflow(workflow);
      const fingerprintMatch = await verifyFingerprint(parsed, certificate.fingerprint);
      const result = await analyzerService.analyzeAsync(parsed);

      return NextResponse.json({
        valid: hashValid && fingerprintMatch,
        hashIntegrity: hashValid,
        fingerprintMatch,
        reason: fingerprintMatch
          ? "Certificate hash valid and workflow fingerprint matches"
          : "Certificate hash is valid but workflow has been modified since certification",
        certificateId: id,
        originalCertificate: certificate,
        currentAnalysis: {
          fqiScore: result.v2Report.fqiScore,
          findings: result.v2Report.findings.length,
          qualityGates: result.v2Report.qualityGates.map((g) => ({
            gate: g.gate,
            passed: g.passed,
            failReasons: g.failReasons,
          })),
          newCertificate: result.v2Report.certificate,
        },
      });
    }

    // ── Hash-only verification ────────────────────────────────────────────────
    return NextResponse.json({
      valid: hashValid,
      hashIntegrity: hashValid,
      reason: hashValid
        ? "Certificate verification hash is valid"
        : "Certificate verification hash does not match",
      certificateId: id,
      auditDate: certificate.auditDate,
      platform: certificate.platform,
      workflowName: certificate.workflowName,
      passedGates: certificate.passedGates,
      findingsSummary: certificate.findingsSummary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

/**
 * GET /api/v2/certificate/[id]
 * Looks up a certificate by ID from the database.
 * Returns the certificate record if found, or 404.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const row = await getCertificateById(id);
    if (!row) {
      return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    }
    return NextResponse.json({
      certificateId: row.certificateId,
      valid: row.valid,
      fingerprint: row.fingerprint,
      verificationHash: row.verificationHash,
      passedGates: row.passedGates,
      findingsSummary: row.findingsSummary,
      categoryScores: row.categoryScores,
      auditDate: row.auditDate,
      certificationVersion: row.certificationVersion,
    });
  } catch {
    return NextResponse.json({ error: "Certificate lookup failed" }, { status: 500 });
  }
}
