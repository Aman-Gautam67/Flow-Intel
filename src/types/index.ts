export type Platform =
  | "N8N" | "MAKE" | "ZAPIER" | "FLOWISE" | "LANGFLOW"
  | "AIRFLOW" | "PREFECT" | "DAGSTER" | "GENERIC"
  | "NODE_RED" | "ACTIVEPIECES"
  | "DIFY" | "CREWAI" | "AUTOGEN" | "PIPEDREAM" | "OPENAI_AGENTS";

export type WorkflowPlatform = Platform;

// ─── Severity ────────────────────────────────────────────────────────────────
export type Severity = "CRITICAL" | "WARNING" | "INFO" | "PASS";

// ─── NormalNode ───────────────────────────────────────────────────────────────
export interface NormalNode {
  id: string;
  name: string;
  type: string;
  typeVersion?: number;
  disabled?: boolean;
  position?: [number, number];
  parameters: Record<string, unknown>;
  credentials: Record<string, unknown>;
  isTrigger: boolean;
  isHttp: boolean;
  isCode: boolean;
  isAi: boolean;
  isLoop: boolean;
  isBranch: boolean;
  isDelay: boolean;
  httpMeta?: { url?: string; method?: string; headers?: Record<string, string> };
  codeMeta?: { codeSnippet?: string; language: "javascript" | "python" | "other" };
  aiMeta?: { maxIterations?: number; hasStructuredOutput: boolean; model?: string };
  isAuthenticated?: boolean;
}

// ─── NormalEdge ───────────────────────────────────────────────────────────────
export interface NormalEdge {
  source: string;
  target: string;
  type?: string;
  /** The output handle label, e.g. "main", "error", "0", "1" */
  sourceHandle?: string;
}

// ─── Extracted parameter ──────────────────────────────────────────────────────
export interface ExtractedParam { nodeId: string; key: string; value: string; }

// ─── Parsed Workflow ─────────────────────────────────────────────────────────
export interface ParsedWorkflow {
  name: string;
  description?: string;
  platform: Platform;
  /** Alias for name — used by v2 engine for display */
  rawWorkflowName?: string;
  /** n8n instance version or platform version string */
  platformVersion?: string;
  /** Raw workflow metadata (settings, notes, etc.) */
  metadata?: Record<string, unknown>;
  nodeCount: number;
  connectionCount: number;
  nodes: NormalNode[];
  edges: NormalEdge[];
  extractedParameters: ExtractedParam[];
  triggerNodes: Array<{ id: string; name: string; type: string; isAuthenticated: boolean }>;
  integrations: Array<{ name: string; category: string; isAi: boolean; vendorType: "saas" | "community" | "selfhosted" | "core" }>;
  httpNodesCount: number;
  codeNodesCount: number;
  aiNodesCount: number;
  hasWebhooks: boolean;
  hasSchedules: boolean;
  hasBranches: boolean;
  hasLoops: boolean;
  branchCount: number;
  loopCount: number;
  extractedSecretsCount: number;
  rawNodes: unknown[];   // platform-raw node array; N8nNode[] for N8N, unknown[] for others
  rawConnections: Record<string, unknown>;
  rawJson?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __deepContext?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __graph?: any;
}

export interface IWorkflowParser {
  supports(json: unknown): boolean;
  parse(json: unknown): ParsedWorkflow;
}

// ─── n8n internal types ───────────────────────────────────────────────────────
export interface N8nNode {
  id: string; name: string; type: string; typeVersion?: number;
  disabled?: boolean; position?: [number, number];
  parameters?: Record<string, unknown>; credentials?: Record<string, unknown>;
}
export interface N8nWorkflowJson {
  name?: string; description?: string;
  nodes?: N8nNode[]; connections?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

// ─── Audit Flag ──────────────────────────────────────────────────────────────
// Category is now aligned to 6 pillars. Legacy 9-dimension categories map as follows:
//   ARCHITECTURE  ← COMPLEXITY + DEBT (structure/spaghetti)
//   SECURITY      ← SECURITY + PRIVACY
//   RELIABILITY   ← RELIABILITY + RESILIENCE
//   MEMORY        ← MEMORY (unchanged)
//   AI_GUARDRAILS ← AI_GUARDRAILS (unchanged)
//   HYGIENE       ← HEALTH + DEBT (node-level: orphan, disabled, deprecated, version-lag)
export interface AuditFlag {
  id: string;
  rule: string;
  severity: Severity;
  /** Legacy 6-bucket category — used for score ring grouping and DB column compat */
  category:
    | "ARCHITECTURE"
    | "SECURITY"
    | "RELIABILITY"
    | "MEMORY"
    | "AI_GUARDRAILS"
    | "HYGIENE";
  /**
   * Real v2 category name — more specific than the legacy 6-bucket `category`.
   * Populated by adapter-bridge.ts so the UI can show the precise dimension
   * (e.g. "COMPATIBILITY" or "OBSERVABILITY") instead of the collapsed "HYGIENE" label.
   */
  v2Category?: string;
  title: string;
  detail: string;
  nodeName?: string;
  nodeType?: string;
  remediation?: RemediationStep;
  ptsDeducted?: number;
  envVarExpression?: string;
}

// ─── Remediation Step ────────────────────────────────────────────────────────
export interface RemediationStep {
  description: string;
  jsonPatch?: JsonPatch[];
  n8nUiInstruction?: string;
}
export interface JsonPatch {
  op: "replace" | "add" | "remove";
  path: string;
  value?: unknown;
}

// ─── Pillar Score entry ──────────────────────────────────────────────────────
// score: 0-100 | null = N/A (pillar not applicable to this workflow)
export interface PillarScore {
  pillar: "ARCHITECTURE" | "SECURITY" | "RELIABILITY" | "MEMORY" | "AI_GUARDRAILS" | "HYGIENE";
  label: string;
  score: number | null;   // null = N/A
  applicable: boolean;
  flags: AuditFlag[];
}

// ─── Score breakdown ─────────────────────────────────────────────────────────
export interface ScoreBreakdown {
  // 6 pillar scores (null = N/A)
  architectureScore:   number | null;
  securityScore:       number | null;
  reliabilityScore:    number;
  memoryScore:         number;
  aiGuardrailsScore:   number | null;
  hygieneScore:        number;

  // Derived overall (weighted mean of applicable pillars only)
  overallScore: number;

  // Legacy scalar aliases kept for DB column compat — equal to pillar values above
  // complexityScore = architectureScore ?? 100
  // privacyScore    = securityScore     ?? 100
  // debtScore       = hygieneScore
  // resilienceScore = reliabilityScore
  complexityScore:   number;
  privacyScore:      number;
  debtScore:         number;
  resilienceScore:   number;
  healthScore:       number;  // = hygieneScore (alias)

  estimatedCostUsd: number;
  noErrorHandlingCount: number;
  flags: AuditFlag[];
  securityFlags: AuditFlag[];
  resilienceFlags: AuditFlag[];
  memoryProfile: MemoryProfile;
  debtProfile: DebtProfile;
  privacyProfile: PrivacyProfile;
  remediationSteps: RemediationStep[];

  // N/A applicability flags
  aiApplicable:       boolean;
  securityApplicable: boolean;
}

export interface MemoryProfile {
  payloadAccumulationRisk: boolean;
  subprocessRisk: boolean;
  estimatedBytesPerRun: number;
  accumulationChains: string[];
}
export interface DebtProfile {
  disabledNodeCount: number;
  orphanNodeCount: number;
  deadVariableCount: number;
  versionLagCount: number;
  edgeCrossings: number;
  disabledNodes: string[];
  orphanNodes: string[];
}
export interface PrivacyProfile {
  piiFieldsDetected: string[];
  credentialBlastRadius: Record<string, number>;
  flaggedEgressUrls: string[];
  piiInOutboundNodes: string[];
}

// ─── Full Analysis Result ────────────────────────────────────────────────────
export interface AnalysisResult {
  parsed: ParsedWorkflow;
  scores: ScoreBreakdown;
  analysedAt: string;
}

// ─── Workflow record ─────────────────────────────────────────────────────────
export interface WorkflowRecord {
  id: string; slug: string; title: string; description: string | null;
  platform: Platform; isPublic: boolean; authorId: string | null;
  createdAt: string; updatedAt: string;
  scores?: ScoreBreakdown | null;
  nodeCount?: number; triggerType?: string;
  tags?: string[]; categories?: string[];
  dependencies?: Array<{ serviceName: string; category: string; isAi: boolean; vendorType?: string }>;
}

// ─── Search / filter params ──────────────────────────────────────────────────
export interface SearchParams {
  q?: string; platform?: Platform; category?: string;
  complexityMin?: number; complexityMax?: number;
  healthMin?: number; securityMin?: number;
  triggerType?: string; hasAi?: boolean;
  noCritFlags?: boolean; productionReady?: boolean;
  /** v2 engine filters */
  certifiedOnly?: boolean;    // only workflows with valid certificate (mkt + prod gates passed)
  fqiMin?: number;            // minimum FQI score (0-100)
  gateFilter?: "marketplace" | "production" | "enterprise";  // specific gate must pass
  page?: number; limit?: number;
}
