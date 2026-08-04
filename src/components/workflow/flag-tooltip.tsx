"use client";

import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";

/**
 * Plain-English "Why This Matters" explanations indexed by rule name.
 * Covers every rule that can fire CRITICAL or WARNING severity.
 */
const RULE_EXPLANATIONS: Record<string, { headline: string; body: string; impact: string }> = {
  SEC_HARDCODED_CREDENTIALS: {
    headline: "Live secret exposed in workflow JSON",
    body: "A real API key or password is stored directly inside the workflow file. Anyone who can export or read this workflow can steal it and impersonate you with that service.",
    impact: "Account takeover · Data exfiltration · Unauthorised billing charges",
  },
  SEC_UNAUTHENTICATED_WEBHOOK: {
    headline: "Anyone on the internet can trigger this workflow",
    body: "The webhook has no authentication check. A malicious actor just needs to discover the URL to run arbitrary executions — potentially sending emails, mutating databases, or incurring API costs.",
    impact: "Workflow abuse · Spam · Data corruption · Cost amplification",
  },
  SEC_UNSAFE_CODE_NODE: {
    headline: "Code node can escape the execution sandbox",
    body: "Patterns like eval(), child_process, or execSync let code reach outside n8n's sandbox to the host OS. This is a remote code execution (RCE) vector if user-controlled data can reach this node.",
    impact: "Full server compromise · Data theft · Lateral movement",
  },
  SEC_UNENCRYPTED_HTTP: {
    headline: "Credentials and data transmitted in plaintext",
    body: "Plain http:// URLs are unencrypted. Any network observer (ISP, proxy, compromised router) can read the request body, headers, and any secrets or PII inside them.",
    impact: "Credential interception · Data leak in transit",
  },
  HEALTH_ORPHAN_NODE: {
    headline: "Dead code — this node will never execute",
    body: "The node has no incoming or outgoing connections. It sits in the workflow taking up visual space and can mislead engineers into thinking work is being done that isn't.",
    impact: "Silent logic gaps · Misleading workflow diagrams",
  },
  HEALTH_MISSING_CREDENTIAL: {
    headline: "Workflow will crash at runtime — no credentials configured",
    body: "This node requires an API credential (e.g. Slack token, DB password) but none is set. The workflow will throw an immediate error the first time it runs in production.",
    impact: "Runtime failure · Data pipeline breakage",
  },
  HEALTH_DEPRECATED_NODE: {
    headline: "Outdated node version with known issues",
    body: "This node type has a newer version available. Older versions may have bugs, security issues, or missing features that the update resolves.",
    impact: "Unexpected behaviour · Missing security patches",
  },
  RELIABILITY_NO_ERROR_HANDLING: {
    headline: "Single point of failure — one error stops everything",
    body: "This network node makes external API calls with no fallback. If the API is unavailable or returns an error, the entire workflow halts immediately, silently dropping data.",
    impact: "Silent data loss · Cascading workflow failures",
  },
  RELIABILITY_UNBOUNDED_LOOP: {
    headline: "Loop can run forever and exhaust memory",
    body: "No batch size or item limit is set. If the input dataset grows unexpectedly, this loop will keep running until n8n's memory limit is hit, potentially crashing the instance.",
    impact: "Memory exhaustion · Instance crash · Runaway execution costs",
  },
  RESILIENCE_UNTHROTTLED_LOOP: {
    headline: "Rate-limit bomb — hammering an API at full speed",
    body: "HTTP calls inside a loop without a delay node will fire as fast as the workflow runs — often hundreds per second. Most APIs will ban or throttle the key, breaking downstream steps.",
    impact: "API key suspension · 429 rate-limit errors · Cascading failures",
  },
  RESILIENCE_BLAST_RADIUS: {
    headline: "Many state-changing nodes have no error protection",
    body: "Database writes, Stripe charges, email sends, and similar irreversible operations are unprotected. A failure midway can leave data in a partially-updated, inconsistent state.",
    impact: "Partial data corruption · Duplicate records · Financial inconsistency",
  },
  RESILIENCE_NON_IDEMPOTENT_RETRY: {
    headline: "Auto-retry on a non-safe operation can duplicate records",
    body: "POST and PATCH requests are not safe to retry without an idempotency key. If the first request times out but succeeds server-side, the retry creates a duplicate transaction or record.",
    impact: "Duplicate charges · Duplicate database rows · Inconsistent state",
  },
  AI_UNBOUNDED_AGENT_LOOP: {
    headline: "AI agent can loop indefinitely — unbounded token spend",
    body: "Without a maxIterations cap, the agent can cycle through tool calls forever. This wastes compute, incurs large API bills, and may never return a result to the caller.",
    impact: "Runaway API costs · Workflow timeout · Denial-of-service",
  },
  AI_DANGEROUS_TOOL_PERMISSIVENESS: {
    headline: "Autonomous agent has access to destructive tools",
    body: "The agent can call database mutators, shell commands, or payment APIs autonomously. A single misunderstood instruction or prompt injection could cause irreversible damage.",
    impact: "Data deletion · Unauthorised transactions · Prompt injection attacks",
  },
  AI_UNVALIDATED_LLM_OUTPUT: {
    headline: "Raw LLM text piped directly into downstream nodes",
    body: "Without a structured output parser, the model's response is treated as a raw string. If the model hallucinates a different format, all downstream JSON parsing and field mappings will break silently.",
    impact: "Silent data corruption · Downstream crashes · Unpredictable behaviour",
  },
  PRIVACY_PII_IN_OUTBOUND: {
    headline: "Personal data being sent to an external service",
    body: "The payload of this outbound node contains fields like email, phone, or SSN. Sending this to a third party may violate GDPR, CCPA, or your data processing agreements.",
    impact: "Regulatory fines · Data breach liability · User trust violation",
  },
  PRIVACY_CREDENTIAL_SPOF: {
    headline: "One compromised credential breaks many operations",
    body: "The same API credential is reused across 4+ nodes. If that key is rotated, revoked, or leaked, all operations using it fail simultaneously — a single point of failure.",
    impact: "Mass operational failure · Difficult incident response",
  },
  MEMORY_PAYLOAD_ACCUMULATION: {
    headline: "Large dataset flows through without being trimmed",
    body: "Data passes through many nodes without a filter or field-trim step. With large inputs (thousands of records), the full dataset is copied at each node, multiplying memory use.",
    impact: "Memory exhaustion · Execution timeout · Instance instability",
  },
  MEMORY_SUBPROCESS_RISK: {
    headline: "Code node performs heavy array iteration on potentially unbounded input",
    body: "Multiple .map(), .forEach(), or loop constructs run on the full input without size guards. A large or unbounded dataset will cause quadratic memory growth.",
    impact: "Execution timeout · High memory usage · Node process crash",
  },
  DEBT_DEAD_VARIABLES: {
    headline: "Variables set but never used downstream",
    body: "Values are written into Set or Edit Fields nodes but never referenced in any expression. This adds noise to the workflow and may indicate copy-paste errors where intended logic is missing.",
    impact: "Misleading diagrams · Potential missing business logic",
  },
};

const DEFAULT_EXPLANATION = {
  headline: "Potential issue detected",
  body: "This flag was raised because a pattern in your workflow matches a known risk category. Review the remediation steps for details.",
  impact: "Review required",
};

interface FlagTooltipProps {
  ruleName: string;
  severity: "CRITICAL" | "WARNING" | "INFO" | string;
}

export function FlagTooltip({ ruleName, severity }: FlagTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos]         = useState<"above" | "below">("below");
  const btnRef = useRef<HTMLButtonElement>(null);

  // Only show for CRIT and WARN
  if (severity !== "CRITICAL" && severity !== "WARNING") return null;

  const info = RULE_EXPLANATIONS[ruleName] ?? DEFAULT_EXPLANATION;
  const accentColor = severity === "CRITICAL" ? "var(--color-fi-crit)" : "var(--color-fi-warn)";

  const handleMouseEnter = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos(rect.top > 240 ? "above" : "below");
    }
    setVisible(true);
  };

  return (
    <div className="relative inline-flex items-center" onMouseLeave={() => setVisible(false)}>
      <button
        ref={btnRef}
        onMouseEnter={handleMouseEnter}
        onFocus={handleMouseEnter}
        onBlur={() => setVisible(false)}
        className="shrink-0 transition-colors"
        style={{ color: visible ? accentColor : "rgba(255,255,255,0.28)" }}
        aria-label="Why this matters"
      >
        <Info size={12} />
      </button>

      {visible && (
        <div
          className="tooltip-in absolute z-50 w-72 border"
          style={{
            [pos === "above" ? "bottom" : "top"]: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(8,8,8,0.97)",
            borderColor: accentColor + "55",
            boxShadow: `0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px ${accentColor}22`,
            padding: "14px 16px",
            pointerEvents: "none",
          }}
        >
          {/* Triangle pointer */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              [pos === "above" ? "bottom" : "top"]: "-5px",
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              [pos === "above" ? "borderTop" : "borderBottom"]: `5px solid ${accentColor}55`,
            }}
          />

          {/* Content */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 shrink-0"
                style={{ color: accentColor, background: accentColor + "18", border: `1px solid ${accentColor}44` }}
              >
                {severity === "CRITICAL" ? "CRIT" : "WARN"}
              </span>
              <span className="font-sans text-[11px] font-semibold leading-snug" style={{ color: "var(--color-fi-text)" }}>
                {info.headline}
              </span>
            </div>
            <p className="font-sans text-[11px] leading-relaxed" style={{ color: "rgba(240,240,240,0.68)" }}>
              {info.body}
            </p>
            <div className="pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.36)" }}>
                Real-world impact:{" "}
              </span>
              <span className="font-mono text-[9px]" style={{ color: accentColor }}>
                {info.impact}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
