/**
 * FlowIntel Analysis Engine v2 — Canonical Type Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * All new types live here. Legacy types in src/types/index.ts are unchanged.
 * The engine is intentionally decoupled from the database schema and UI layer.
 */

import type { ParsedWorkflow } from "@/types";
import type { DriftResult } from "./drift-database";

// ─── Re-export the universal AST so rule packs may import from either source ───
// The canonical type name is ParsedWorkflow everywhere.
export type { ParsedWorkflow };

// ─── Rule Categories ──────────────────────────────────────────────────────────
export type RuleCategory =
  | "SECURITY"
  | "RELIABILITY"
  | "IDEMPOTENCY"
  | "OBSERVABILITY"
  | "MAINTAINABILITY"
  | "PERFORMANCE"
  | "COMPATIBILITY"
  | "PRIVACY"
  | "DOCUMENTATION"
  | "COST_OPTIMIZATION";

// ─── Finding Severity ─────────────────────────────────────────────────────────
export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

// ─── Finding Location ─────────────────────────────────────────────────────────
export interface FindingLocation {
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  paramPath?: string;   // JSON path within parameters, e.g. "/parameters/url"
  line?: number;        // for code nodes
}

// ─── Finding Evidence ─────────────────────────────────────────────────────────
export interface FindingEvidence {
  /** Short description of what was found */
  summary: string;
  /** The actual value that triggered the finding (redacted if sensitive) */
  value?: string;
  /** Full technical detail */
  detail: string;
}

// ─── Auto Fix ─────────────────────────────────────────────────────────────────
export interface AutoFix {
  description: string;
  /** JSON Patch operations (RFC 6902) to apply. User confirms before applying. */
  patches?: Array<{ op: "replace" | "add" | "remove"; path: string; value?: unknown }>;
  /** UI instruction for manual fix */
  manualInstruction?: string;
}

// ─── Finding (the output of one rule execution) ───────────────────────────────
export interface Finding {
  /** Globally unique per-finding ID (ruleId + nodeId) */
  id: string;
  /** The rule that generated this finding */
  ruleId: string;
  /** Human-readable rule name */
  ruleName: string;
  severity: FindingSeverity;
  category: RuleCategory;
  location: FindingLocation;
  evidence: FindingEvidence;
  /** Human-readable explanation of why this matters */
  humanExplanation: string;
  /** Concrete steps to fix */
  suggestedFix: string;
  autoFix?: AutoFix;
  /** Whether this finding blocks marketplace publication */
  marketplaceBlocking: boolean;
  /** Permanent documentation URL or anchor */
  docReference?: string;
  /** Points deducted from category score (0 = informational) */
  penaltyPoints: number;
}

// ─── Rule Definition ──────────────────────────────────────────────────────────
export interface RuleDefinition {
  /** Permanent, stable rule ID. Never change after publication. */
  id: string;
  /** Short human-readable name */
  name: string;
  category: RuleCategory;
  severity: FindingSeverity;
  /** What this rule detects */
  description: string;
  /** Whether this rule is enabled by default */
  enabled: boolean;
  /** Whether a failing finding blocks marketplace publication */
  marketplaceBlocking: boolean;
  /** Points deducted per finding from the category score (0 = INFO) */
  penaltyPoints: number;
  /** Permanent documentation reference */
  docReference?: string;
  /**
   * Detection logic: receives the normalized AST, returns 0..N Findings.
   * Rules MUST only analyze the AST — never parse raw workflow JSON.
   * Rules MUST be pure functions (no side effects, no I/O).
   */
  detect(ast: ParsedWorkflow): Finding[];
}

// ─── Rule Pack Manifest ───────────────────────────────────────────────────────
export interface RulePackManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  rules: RuleDefinition[];
}

// ─── Category Score ───────────────────────────────────────────────────────────
export interface CategoryScore {
  category: RuleCategory;
  /** Computed score 0-100 */
  score: number;
  /** Whether this category is applicable to this workflow (null = N/A) */
  applicable: boolean;
  /** All findings in this category */
  findings: Finding[];
  /** Binary pass/fail for this category */
  passed: boolean;
  /** Counts by severity */
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
}

// ─── Quality Gate Result ──────────────────────────────────────────────────────
export type QualityGateName =
  | "SECURITY_GATE"
  | "RELIABILITY_GATE"
  | "MARKETPLACE_GATE"
  | "PRODUCTION_GATE"
  | "ENTERPRISE_GATE";

export interface QualityGateResult {
  gate: QualityGateName;
  passed: boolean;
  /** Why the gate failed (empty if passed) */
  failReasons: string[];
  /** Which findings triggered this gate failure */
  blockingFindings: Finding[];
}

// ─── Certificate ──────────────────────────────────────────────────────────────
export interface Certificate {
  /** Globally unique certificate ID */
  certificateId: string;
  /** SHA-256 fingerprint of the canonical workflow representation */
  fingerprint: string;
  /** ISO timestamp of audit */
  auditDate: string;
  /** Certification engine version */
  certificationVersion: string;
  platform: string;
  workflowName: string;
  /** Which quality gates were evaluated and passed */
  passedGates: QualityGateName[];
  /** All gate results */
  gateResults: QualityGateResult[];
  /** Category scores at time of certification */
  categoryScores: Record<RuleCategory, number | null>;
  /** Findings present at time of certification */
  findingsSummary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  /** Deterministic verification hash (SHA-256 of certificateId + fingerprint + auditDate) */
  verificationHash: string;
  /** Whether this certificate is valid (gates passed) */
  valid: boolean;
}

// ─── Workflow Fingerprint ─────────────────────────────────────────────────────
export interface FingerprintResult {
  /** SHA-256 hex digest of the canonical workflow */
  hash: string;
  /** Node count in canonical form */
  nodeCount: number;
  /** Connection count in canonical form */
  connectionCount: number;
  /** Sorted list of unique node types */
  nodeTypeSignature: string[];
  /** ISO timestamp of fingerprinting */
  fingerprintedAt: string;
}

// ─── Workflow Passport ────────────────────────────────────────────────────────
export interface WorkflowPassport {
  /** Stable workflow identity (persists across versions) */
  workflowId: string;
  fingerprint: FingerprintResult;
  workflowName: string;
  platform: string;
  /** Creator identifier if available */
  creator?: string;
  /** ISO timestamp of first analysis */
  firstAnalysedAt: string;
  /** ISO timestamp of most recent analysis */
  lastAnalysedAt: string;
  /** Version number of this analysis */
  analysisVersion: number;
  /** Current certification if gates passed */
  certificate?: Certificate;
  /** Current marketplace publication status */
  marketplaceStatus: "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";
  /** Summary of current quality gate results */
  gateResults: QualityGateResult[];
}

// ─── Full Analysis Report (v2 output) ────────────────────────────────────────
export interface AnalysisReport {
  /** Report version for future compatibility */
  reportVersion: "2.0";
  /** ISO timestamp */
  analysedAt: string;
  /** AST used as input */
  ast: ParsedWorkflow;
  /** Workflow fingerprint */
  fingerprint: FingerprintResult;
  /** All findings from all rules */
  findings: Finding[];
  /** Per-category aggregated scores */
  categoryScores: CategoryScore[];
  /** Quality gate evaluations */
  qualityGates: QualityGateResult[];
  /** Certificate (present only if MARKETPLACE_GATE and PRODUCTION_GATE passed) */
  certificate: Certificate | null;
  /** Workflow passport */
  passport: WorkflowPassport | null;
  /** Overall FQI score (0-100, weighted, N/A-aware — presentation layer) */
  fqiScore: number;
  /** Cost estimate */
  estimatedMonthlyCostUsd: number;
  /** Documented compatibility drift results */
  driftResults?: DriftResult[];
}
