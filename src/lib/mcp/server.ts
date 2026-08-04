import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseWorkflow } from "@/lib/parsers";
import { analyzerService } from "@/lib/analyzer/engine";
import { getCertificateById, getAnalysisV2ByVersionId, getWorkflowBySlug } from "@/lib/db/queries/workflows";
import { verifyCertificate } from "@/lib/engine/certification";

export function buildMcpServer(_userId: string): McpServer {
  const server = new McpServer({
    name: "flowintel-mcp",
    version: "2.0.0",
  });

  // ── Tool 1: analyze_workflow ─────────────────────────────────────────────────
  server.tool(
    "analyze_workflow",
    "Run the FlowIntel v2 static analysis engine on a workflow JSON. Returns FQI score, quality gate results, and finding summary.",
    {
      json: z.string().describe("The workflow JSON as a string (n8n, Make, Zapier, or Flowise format)"),
    },
    async ({ json }: { json: string }) => {
      try {
        const parsed = parseWorkflow(JSON.parse(json));
        const result = await analyzerService.analyzeAsync(parsed);
        const { v2Report } = result;
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              fqiScore: v2Report.fqiScore,
              platform: parsed.platform,
              nodeCount: parsed.nodeCount,
              findingsTotal: v2Report.findings.length,
              findingsBySeverity: {
                critical: v2Report.findings.filter((f) => f.severity === "CRITICAL").length,
                high:     v2Report.findings.filter((f) => f.severity === "HIGH").length,
                medium:   v2Report.findings.filter((f) => f.severity === "MEDIUM").length,
                low:      v2Report.findings.filter((f) => f.severity === "LOW").length,
              },
              qualityGates: v2Report.qualityGates.map((g) => ({
                gate: g.gate, passed: g.passed, failReasons: g.failReasons,
              })),
              certified: !!(v2Report.certificate?.valid),
              certificateId: v2Report.certificate?.certificateId ?? null,
              analysedAt: v2Report.analysedAt,
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  // ── Tool 2: get_findings ──────────────────────────────────────────────────────
  server.tool(
    "get_findings",
    "Get the v2 analysis findings for a workflow in the FlowIntel database by slug.",
    {
      slug: z.string().describe("The workflow slug (from the URL, e.g. 'my-workflow-abc123')"),
      severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]).optional().describe("Filter by severity"),
      category: z.string().optional().describe("Filter by category (e.g. SECURITY, RELIABILITY)"),
    },
    async ({ slug, severity, category }: { slug: string; severity?: string; category?: string }) => {
      try {
        const data = await getWorkflowBySlug(slug);
        if (!data?.version) return { content: [{ type: "text" as const, text: "Workflow not found" }], isError: true };

        const analysis = await getAnalysisV2ByVersionId(data.version.id);
        if (!analysis) return { content: [{ type: "text" as const, text: "No v2 analysis found for this workflow" }] };

        type FindingLike = { severity: string; category: string; ruleId: string; ruleName?: string; evidence?: { summary: string }; suggestedFix?: string };
        let findings = (analysis.findings ?? []) as FindingLike[];
        if (severity) findings = findings.filter((f) => f.severity === severity);
        if (category) findings = findings.filter((f) => f.category === category);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              workflowSlug: slug,
              fqiScore: analysis.fqiScore,
              totalFindings: findings.length,
              findings: findings.slice(0, 50).map((f) => ({
                ruleId:   f.ruleId,
                ruleName: f.ruleName,
                severity: f.severity,
                category: f.category,
                summary:  f.evidence?.summary,
                fix:      f.suggestedFix,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  // ── Tool 3: get_quality_gates ─────────────────────────────────────────────────
  server.tool(
    "get_quality_gates",
    "Get the quality gate evaluation results for a workflow in the database.",
    {
      slug: z.string().describe("The workflow slug"),
    },
    async ({ slug }: { slug: string }) => {
      try {
        const data = await getWorkflowBySlug(slug);
        if (!data?.version) return { content: [{ type: "text" as const, text: "Workflow not found" }], isError: true };

        const analysis = await getAnalysisV2ByVersionId(data.version.id);
        if (!analysis) return { content: [{ type: "text" as const, text: "No v2 analysis found" }] };

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              workflowSlug: slug,
              fqiScore: analysis.fqiScore,
              certified: !!(analysis.gateMarketplacePassed && analysis.gateProductionPassed),
              gates: {
                security:    { passed: analysis.gateSecurityPassed },
                reliability: { passed: analysis.gateReliabilityPassed },
                marketplace: { passed: analysis.gateMarketplacePassed },
                production:  { passed: analysis.gateProductionPassed },
                enterprise:  { passed: analysis.gateEnterprisePassed },
              },
              detailedResults: analysis.qualityGates,
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  // ── Tool 4: verify_certificate ────────────────────────────────────────────────
  server.tool(
    "verify_certificate",
    "Verify a FlowIntel Certified™ certificate by ID. Checks hash integrity.",
    {
      certificateId: z.string().describe("The certificate ID (e.g. CERT-20260803120000-A3F9B2C1)"),
    },
    async ({ certificateId }: { certificateId: string }) => {
      try {
        const row = await getCertificateById(certificateId);
        if (!row) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ valid: false, reason: "Certificate not found in database" }) }] };
        }

        // Reconstruct cert shape for verification
        const cert = {
          certificateId: row.certificateId,
          fingerprint: row.fingerprint,
          auditDate: row.auditDate instanceof Date ? row.auditDate.toISOString() : String(row.auditDate),
          verificationHash: row.verificationHash,
          valid: row.valid,
          certificationVersion: row.certificationVersion,
          passedGates: (row.passedGates ?? []) as import("@/lib/engine/types").QualityGateName[],
          gateResults: [],
          categoryScores: {} as Record<import("@/lib/engine/types").RuleCategory, number | null>,
          findingsSummary: row.findingsSummary as import("@/lib/engine/types").Certificate["findingsSummary"],
          platform: "unknown",
          workflowName: "unknown",
        };

        const hashValid = await verifyCertificate(cert);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              certificateId,
              valid: row.valid && hashValid,
              hashIntegrity: hashValid,
              fingerprint: row.fingerprint,
              auditDate: row.auditDate,
              passedGates: row.passedGates,
              certificationVersion: row.certificationVersion,
              reason: hashValid ? "Certificate is authentic and unmodified" : "Certificate hash mismatch — may have been tampered with",
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  return server;
}
