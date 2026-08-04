/**
 * DIMENSION_METADATA
 * ──────────────────────────────────────────────────────────────────────────────
 * Source-of-truth copy for all 9 FlowIntel scoring dimensions.
 * Used by DimensionPopover and (optionally) the PDF export report.
 *
 * Keys must match the `dimKey` identifiers used in SCORE_DIMS inside
 * workflow-dashboard.tsx (health / security / simplicity / reliability /
 * debt / memory / resilience / privacy / ai_guard).
 */

export interface DimensionMeta {
  id: string;
  /** Display label — matches the label shown in the score ring grid */
  label: string;
  /** One-sentence definition of what the dimension measures */
  description: string;
  /** Exact AST properties, rule checks, and scoring parameters used by the engine */
  gradingParameters: string[];
}

export const DIMENSION_METADATA: Record<string, DimensionMeta> = {
  health: {
    id: "health",
    label: "Health",
    description:
      "Evaluates overall structural hygiene, node version freshness, and workflow graph integrity.",
    gradingParameters: [
      "Outdated node versions (e.g. typeVersion v1 vs. current baseline)",
      "Deprecated node types — n8n-nodes-base.function / functionItem",
      "Orphaned / disconnected nodes with no incoming or outgoing graph edges",
      "Nodes that require credentials but have none configured",
      "Disabled nodes left permanently in the graph (dead weight)",
    ],
  },

  security: {
    id: "security",
    label: "Security",
    description:
      "Detects authorisation flaws, exposed secrets, and insecure network configurations.",
    gradingParameters: [
      "Unauthenticated Webhook trigger nodes (authentication === 'none')",
      "Hardcoded API keys, JWT tokens, Stripe secrets, and passwords in node parameters",
      "Plain http:// URLs in URL / endpoint fields (should be https://)",
      "Unsafe code patterns inside Code nodes — eval(), child_process, execSync, shell calls",
      "Bearer tokens or API keys embedded in header values rather than credential store",
    ],
  },

  simplicity: {
    id: "simplicity",
    label: "Simplicity",
    description:
      "Measures how lean, readable, and maintainable the workflow is. 100 = perfectly concise; 0 = maximally dense and hard to follow.",
    gradingParameters: [
      "Total node count — every node above baseline reduces the score",
      "Number of distinct conditional branches (If / Switch nodes)",
      "Loop nesting level — splitInBatches inside another loop",
      "Code nodes (inline JavaScript / Python) add hidden complexity debt",
      "HTTP request node count — high fan-out implies implicit orchestration complexity",
    ],
  },

  reliability: {
    id: "reliability",
    label: "Reliability",
    description:
      "Assesses fault tolerance, error recovery paths, and execution stability under failure conditions.",
    gradingParameters: [
      "HTTP / API nodes with no error branch (main[1]) and no continueOnFail",
      "Loop nodes without a batchSize or maxItems limit (unbounded execution)",
      "Non-idempotent auto-retry on POST/PATCH requests without an idempotency key",
      "Absence of global Error Trigger node for unhandled workflow failures",
      "Bonus applied when ≥50% of network nodes have retry or continueOnFail coverage",
    ],
  },

  debt: {
    id: "debt",
    label: "Technical Debt",
    description:
      "Quantifies future maintenance risk stemming from outdated specifications, dead code, and structural disorder.",
    gradingParameters: [
      "Nodes operating below current version baseline (e.g. httpRequest v1 < v3)",
      "Disabled nodes not removed from the graph",
      "Orphaned nodes not connected to the execution path",
      "Set / Edit Fields values never referenced by any downstream expression ($json / $vars)",
      "Backward-flowing edges creating spaghetti execution paths (>2 backward connections)",
    ],
  },

  memory: {
    id: "memory",
    label: "Memory",
    description:
      "Evaluates runtime memory efficiency, payload accumulation risk, and state footprint per execution.",
    gradingParameters: [
      "Unbounded data chains — >5 non-filter nodes in sequence without a trim/reduce step",
      "Absence of Edit Fields or Item Lists nodes before downstream payload mappings",
      "Code nodes containing ≥2 array iteration patterns (.map, .reduce, .forEach, for-of) on unbounded inputs",
      "Loop ancestor multiplier: AI/HTTP nodes inside splitInBatches without pagination guards",
      "Estimated bytes-per-run footprint (outputKeys × batchSize × 128 bytes)",
    ],
  },

  resilience: {
    id: "resilience",
    label: "Resilience",
    description:
      "Measures workflow survivability during third-party API outages, rate limits, and partial failures.",
    gradingParameters: [
      "HTTP / API calls inside a loop (splitInBatches) without a Wait / delay node between iterations",
      "State-changing nodes (DB writes, Stripe charges, Slack sends) with no error branch or continueOnFail",
      "High failure blast radius — >60% of state-changing nodes are unprotected simultaneously",
      "Auto-retry enabled on POST or PATCH requests that are not idempotent (risk of duplicate records)",
    ],
  },

  privacy: {
    id: "privacy",
    label: "Privacy",
    description:
      "Tracks handling, tracing, and potential egress of sensitive PII data to external services.",
    gradingParameters: [
      "PII field names detected in outbound node payloads (email, phone, SSN, creditCard, passport…)",
      "Single credential shared across ≥4 nodes (blast-radius SPOF on key compromise)",
      "Plain http:// egress endpoints transmitting data in unencrypted transit",
      "Raw IP address targets in outbound requests (bypass DNS-based controls)",
      "Unknown / unverified external domains receiving workflow data (INFO flag)",
    ],
  },

  ai_guard: {
    id: "ai_guard",
    label: "AI Guardrails",
    description:
      "Audits execution boundaries, loop controls, and safety limits on autonomous AI agent nodes.",
    gradingParameters: [
      "AI Agent nodes with no maxIterations limit — can loop and spend tokens indefinitely",
      "Destructive tools attached to an agent without a human-approval gate (SQL, SSH, file system, DB write)",
      "LLM chain / retrieval QA output not validated by a Structured Output Parser",
      "No fallback handler for LLM rate-limit or context-length errors",
      "Agent tool connections inspected via incoming ai_tool edges, not outgoing main edges",
    ],
  },
};

/** Canonical lookup from a dashboard `label` string (case-insensitive) → DimensionMeta */
export function getDimensionMeta(label: string): DimensionMeta | undefined {
  const key = label.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  const aliasMap: Record<string, string> = {
    ai_guard:        "ai_guard",
    "ai guard":      "ai_guard",
    aiguard:         "ai_guard",
    aiGuardrails:    "ai_guard",
    debt:            "debt",
    "technical debt":"debt",
    // Simplicity aliases — "complexity" is the legacy label before v2
    simplicity:      "simplicity",
    complexity:      "simplicity",
  };
  const resolved = aliasMap[key] ?? aliasMap[label.toLowerCase()] ?? key;
  return DIMENSION_METADATA[resolved];
}
