/**
 * FlowIntel Analysis Runner — Full Pipeline Orchestrator
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the single entry point for the v2 analysis pipeline.
 *
 * Pipeline:
 *   ParsedWorkflow (AST)
 *   ↓
 *   Fingerprint
 *   ↓
 *   Rule Registry (registerAllPacks)
 *   ↓
 *   Rule Engine (executeRules)
 *   ↓
 *   Category Engine (computeCategoryScores)
 *   ↓
 *   Quality Gates (evaluateAllGates)
 *   ↓
 *   Certification Engine (issueCertificate)
 *   ↓
 *   Workflow Passport (createPassport)
 *   ↓
 *   AnalysisReport (v2 output)
 *
 * The existing engine.ts consumes the AnalysisReport via adapter-bridge.ts
 * and continues to return the legacy ScoreBreakdown shape unchanged.
 */

import type { ParsedWorkflow } from "@/types";
import type { AnalysisReport, Finding, FindingSeverity } from "./types";
import { registerAllPacks } from "./rule-packs/index";
import { registry }          from "./registry";
import { fingerprintWorkflow } from "./fingerprint";
import { executeRules, summarizeFindings } from "./rule-engine";
import {
  computeCategoryScores,
  determineApplicableCategories,
  computeOverallFqi,
} from "./category-engine";
import { evaluateAllGates } from "./quality-gates";
import { issueCertificate } from "./certification";
import { createPassport, generateWorkflowId } from "./passport";
import { estimateCost } from "@/lib/analyzer/cost-estimator";
import { edgesToConnectionMap } from "@/lib/parsers/normalise";
import { detectDrift, type DriftResult } from "./drift-database";

import { DeepContextResolver } from "./deep-context";
import { buildConnectionGraph } from "./graph";

// Bootstrap: register all built-in rule packs once at module load
registerAllPacks();

function convertDriftToFindings(driftResults: DriftResult[], ast: ParsedWorkflow): Finding[] {
  const findings: Finding[] = [];
  for (const drift of driftResults) {
    const { record, affectedNodes } = drift;
    const severity: FindingSeverity =
      record.severity === "BREAKING"
        ? "CRITICAL"
        : record.severity === "DEPRECATED"
        ? "HIGH"
        : record.severity === "WARNING"
        ? "MEDIUM"
        : "INFO";
    const penaltyPoints =
      severity === "CRITICAL"
        ? 20
        : severity === "HIGH"
        ? 15
        : severity === "MEDIUM"
        ? 10
        : 0;
    const marketplaceBlocking = severity === "CRITICAL";

    if (affectedNodes && affectedNodes.length > 0) {
      for (const nodeName of affectedNodes) {
        const matchedNode = ast.nodes.find((n) => n.name === nodeName);
        const nodeId = matchedNode?.id ?? nodeName;
        findings.push({
          id: `DRIFT-${record.id}-${nodeId}`,
          ruleId: record.id,
          ruleName: record.summary,
          severity,
          category: "COMPATIBILITY",
          location: {
            nodeId,
            nodeName,
            nodeType: matchedNode?.type ?? record.component,
          },
          evidence: {
            summary: record.summary,
            detail: record.detail,
            value: record.old,
          },
          humanExplanation: record.detail,
          suggestedFix: record.suggested
            ? `Upgrade / replace with: ${record.suggested}`
            : "Refer to official documentation for migration steps.",
          marketplaceBlocking,
          docReference: record.docUrl,
          penaltyPoints,
        });
      }
    } else {
      findings.push({
        id: `DRIFT-${record.id}-root`,
        ruleId: record.id,
        ruleName: record.summary,
        severity,
        category: "COMPATIBILITY",
        location: {},
        evidence: {
          summary: record.summary,
          detail: record.detail,
          value: record.old,
        },
        humanExplanation: record.detail,
        suggestedFix: record.suggested
          ? `Upgrade / replace with: ${record.suggested}`
          : "Refer to official documentation for migration steps.",
        marketplaceBlocking,
        docReference: record.docUrl,
        penaltyPoints,
      });
    }
  }
  return findings;
}

function ensureContext(ast: ParsedWorkflow) {
  if (process.env.DISABLE_DEEP_CONTEXT === "true") return;
  try {
    if (!ast.__deepContext) {
      ast.__deepContext = DeepContextResolver.resolve(ast.rawJson ?? ast, ast);
    }
    if (!ast.__graph) {
      ast.__graph = buildConnectionGraph(ast.rawConnections, ast.nodes, ast.edges);
    }
  } catch (err) {
    console.warn("[AnalysisRunner] Pre-processing context resolution error:", err);
  }
}

/**
 * Run the complete FlowIntel v2 analysis pipeline.
 *
 * @param ast - Normalized ParsedWorkflow from any supported parser
 * @param options - Optional overrides
 * @returns Full AnalysisReport (v2 output)
 */
export async function runAnalysis(
  ast: ParsedWorkflow,
  options?: {
    /** Creator identifier for the passport */
    creator?: string;
    /** Existing passport (for version accumulation) */
    previousPassport?: import("./types").WorkflowPassport;
  }
): Promise<AnalysisReport> {
  // ── 0. Pre-processing Context Layer ──────────────────────────────────────
  ensureContext(ast);

  // ── 1. Fingerprint ─────────────────────────────────────────────────────────
  const fingerprint = await fingerprintWorkflow(ast);

  // ── 2. Execute all rules & drift detection ──────────────────────────────────
  const findings = executeRules(ast, registry);
  const driftResults = detectDrift(ast, ast.platform ?? "n8n");
  const driftFindings = convertDriftToFindings(driftResults, ast);
  findings.push(...driftFindings);

  // ── 3. Determine applicable categories ────────────────────────────────────
  const workflowContext = {
    hasHttpNodes:  ast.httpNodesCount > 0,
    hasAiNodes:    ast.aiNodesCount > 0,
    hasWebhooks:   ast.hasWebhooks,
    hasLoops:      ast.nodes.some((n) => n.isLoop),
    hasCodeNodes:  ast.nodes.some((n) => n.isCode),
    nodeCount:     ast.nodes.length,
  };
  const applicableCategories = determineApplicableCategories(findings, workflowContext);

  // ── 4. Compute category scores ─────────────────────────────────────────────
  const categoryScores = computeCategoryScores(findings, applicableCategories);

  // ── 5. Evaluate quality gates ──────────────────────────────────────────────
  // Pass total network node count for proportional Reliability Gate
  const totalNetworkNodes = ast.httpNodesCount;
  const qualityGates = evaluateAllGates(findings, categoryScores, { totalNetworkNodes });

  // ── 6. Issue certificate ───────────────────────────────────────────────────
  const platform = ast.platform ?? "n8n";
  const workflowName = ast.rawWorkflowName ?? "Unnamed Workflow";
  const certificate = await issueCertificate({
    fingerprint,
    platform,
    workflowName,
    findings,
    gateResults: qualityGates,
    categoryScores,
  });

  // ── 7. Create workflow passport ────────────────────────────────────
  const workflowId = generateWorkflowId(fingerprint.hash);
  const passport = createPassport({
    workflowId,
    fingerprint,
    workflowName,
    platform,
    creator: options?.creator,
    certificate,
    gateResults: qualityGates,
    previousPassport: options?.previousPassport,
  });

  // ── 8. Compute FQI (presentation layer) ───────────────────────────────────
  const fqiScore = computeOverallFqi(categoryScores);

  // ── 9. Cost estimate ───────────────────────────────────────────────────────
  const connections =
    Object.keys(ast.rawConnections).length > 0
      ? ast.rawConnections
      : edgesToConnectionMap(ast.edges);
  const { totalUsd: estimatedMonthlyCostUsd } = estimateCost(ast, connections);

  return {
    reportVersion: "2.0",
    analysedAt: new Date().toISOString(),
    ast,
    fingerprint,
    findings,
    categoryScores,
    qualityGates,
    certificate: certificate?.valid ? certificate : null,
    passport,
    fqiScore,
    estimatedMonthlyCostUsd,
    driftResults,
  };
}

/**
 * Synchronous-style wrapper for environments that cannot use async.
 * Uses fallback (non-crypto) fingerprint. Prefer runAnalysis in production.
 */
export function runAnalysisSync(ast: ParsedWorkflow): Omit<AnalysisReport, "fingerprint" | "certificate" | "passport"> & {
  fingerprint: null;
  certificate: null;
  passport: null;
} {
  ensureContext(ast);
  const findings = executeRules(ast, registry);
  const driftResults = detectDrift(ast, ast.platform ?? "n8n");
  const driftFindings = convertDriftToFindings(driftResults, ast);
  findings.push(...driftFindings);

  const workflowContext = {
    hasHttpNodes:  ast.httpNodesCount > 0,
    hasAiNodes:    ast.aiNodesCount > 0,
    hasWebhooks:   ast.hasWebhooks,
    hasLoops:      ast.nodes.some((n) => n.isLoop),
    hasCodeNodes:  ast.nodes.some((n) => n.isCode),
    nodeCount:     ast.nodes.length,
  };
  const applicableCategories = determineApplicableCategories(findings, workflowContext);
  const categoryScores = computeCategoryScores(findings, applicableCategories);
  const qualityGates = evaluateAllGates(findings, categoryScores, { totalNetworkNodes: ast.httpNodesCount });
  const fqiScore = computeOverallFqi(categoryScores);

  const connections =
    Object.keys(ast.rawConnections).length > 0
      ? ast.rawConnections
      : edgesToConnectionMap(ast.edges);
  const { totalUsd: estimatedMonthlyCostUsd } = estimateCost(ast, connections);

  return {
    reportVersion: "2.0",
    analysedAt: new Date().toISOString(),
    ast,
    fingerprint: null,
    findings,
    categoryScores,
    qualityGates,
    certificate: null,
    passport: null,
    fqiScore,
    estimatedMonthlyCostUsd,
    driftResults,
  };
}
