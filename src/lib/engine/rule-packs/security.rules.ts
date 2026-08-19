/**
 * FlowIntel Rule Pack — SECURITY
 * ─────────────────────────────────────────────────────────────────────────────
 * SEC-001  Hardcoded credentials
 * SEC-002  Unauthenticated webhook trigger
 * SEC-003  Unencrypted HTTP egress (external host)
 * SEC-004  Dangerous code execution (eval / child_process / fs)
 * SEC-005  PII in outbound payload
 */

import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, label: "JWT token" },
  { re: /\bsk-[A-Za-z0-9]{20,60}\b/, label: "OpenAI API key" },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,80}\b/, label: "Anthropic API key" },
  { re: /AIza[A-Za-z0-9_-]{35}/, label: "Google API key" },
  { re: /xox[baprs]-[0-9A-Za-z-]{10,80}/, label: "Slack token" },
  { re: /\b(ghp_|github_pat_)[A-Za-z0-9_]{30,100}\b/, label: "GitHub token" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS Access Key" },
  { re: /\bsk_(?:live|test)_[A-Za-z0-9]{9,}\b/, label: "Stripe secret key" },
  { re: /["'](password|secret|apiKey|api_key)["']\s*:\s*["'](?!\{\{)[A-Za-z0-9_\-]{12,}["']/i, label: "Hardcoded secret" },
];

const PII_FIELDS = new Set([
  "email", "phone", "phoneNumber", "ssn", "password", "passwd", "creditCard",
  "cardNumber", "cvv", "dob", "dateOfBirth", "address", "passport",
  "firstName", "lastName", "fullName", "nationalId",
]);

const OUTBOUND_NODE_TYPES = new Set([
  "n8n-nodes-base.httpRequest", "n8n-nodes-base.slack", "n8n-nodes-base.gmail",
  "n8n-nodes-base.telegram", "n8n-nodes-base.discord",
]);

function isExpression(v: unknown): boolean {
  if (typeof v !== "string") return false;
  return v.trim().startsWith("={{") || v.trim().startsWith("{{");
}

function isInternalHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    if (hostname === "localhost" || /^127\./.test(hostname)) return true;
    if (/^10\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
    // Internal TLDs: .local, .internal, .corp, .intranet, .legacy, .home, .lan, .office
    const INTERNAL_TLDS = [".local", ".internal", ".corp", ".intranet", ".legacy", ".home", ".lan", ".office", ".private"];
    if (INTERNAL_TLDS.some((tld) => hostname.endsWith(tld))) return true;
    if (/^n8n[-_]/.test(hostname)) return true;
    return false;
  } catch { return false; }
}

function extractLiteralStrings(params: unknown, depth = 0): string[] {
  if (depth > 6 || !params || typeof params !== "object") return [];
  if (Array.isArray(params)) return params.flatMap((i) => extractLiteralStrings(i, depth + 1));
  return Object.values(params as Record<string, unknown>).flatMap((v) =>
    typeof v === "string" && !isExpression(v) && v.length >= 8 ? [v]
    : typeof v === "object" ? extractLiteralStrings(v, depth + 1) : []
  );
}

function makeFindingId(ruleId: string, nodeId: string, suffix?: string): string {
  return [ruleId, nodeId, suffix].filter(Boolean).join("-");
}

export const SECURITY_PACK: RulePackManifest = {
  id: "flowintel-core-security",
  name: "FlowIntel Security Rules",
  version: "2.0.0",
  description: "Detects hardcoded secrets, unauth webhooks, unencrypted egress, dangerous code, and PII leakage.",
  rules: [
    // ── SEC-001: Hardcoded Credentials ────────────────────────────────────────
    {
      id: "SEC-001",
      name: "Hardcoded Credentials",
      category: "SECURITY",
      severity: "CRITICAL",
      description: "Detects API keys, tokens, and passwords hardcoded in workflow parameters.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 35,
      docReference: "https://flowintel.io/rules/SEC-001",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const literals = extractLiteralStrings(node.parameters);
          const testStr  = literals.join(" ") + " " + JSON.stringify(node.parameters ?? {});
          for (const { re, label } of SECRET_PATTERNS) {
            if (re.test(testStr)) {
              findings.push({
                id: makeFindingId("SEC-001", node.id),
                ruleId: "SEC-001",
                ruleName: "Hardcoded Credentials",
                severity: "CRITICAL",
                category: "SECURITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: `${label} found in node parameters`,
                  value: "[REDACTED]",
                  detail: `A literal ${label} is embedded in the parameters of node "${node.name}". This will be visible to anyone who exports the workflow.`,
                },
                humanExplanation: `Hardcoded credentials pose an immediate security risk: anyone who can read the workflow JSON gains full access to the associated account.`,
                suggestedFix: `Remove the hardcoded ${label} and create an n8n credential entry instead. Reference it via the Credentials dropdown.`,
                autoFix: {
                  description: `Move ${label} to an environment variable`,
                  manualInstruction: `Open node "${node.name}" → Credentials → Create new ${label} credential.`,
                },
                marketplaceBlocking: true,
                docReference: "https://flowintel.io/rules/SEC-001",
                penaltyPoints: 35,
              });
              break; // one finding per node
            }
          }
        }
        return findings;
      },
    },

    // ── SEC-002: Unauthenticated Webhook ──────────────────────────────────────
    {
      id: "SEC-002",
      name: "Unauthenticated Webhook Trigger",
      category: "SECURITY",
      severity: "CRITICAL",
      description: "Detects publicly-exposed webhook triggers with no authentication.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 25,
      docReference: "https://flowintel.io/rules/SEC-002",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const deepCtx = ast.__deepContext;
        for (const node of ast.nodes) {
          const isWebhook = node.type === "n8n-nodes-base.webhook" ||
            (node.isTrigger && node.isHttp && node.type.toLowerCase().includes("webhook"));
          if (!isWebhook) continue;
          const p = node.parameters as Record<string, unknown> | undefined;
          const auth = p?.authentication ?? p?.auth ?? p?.authType;
          const nodeCtx = deepCtx?.getNodeContext(node.id) || deepCtx?.getNodeContext(node.name);
          const resolvedAuth = nodeCtx?.resolvedAuth;
          const hasCreds = node.isAuthenticated === true ||
            (node.credentials && Object.keys(node.credentials).length > 0) ||
            (nodeCtx?.hasAuth ?? false);
          const isAuthConfigured = (auth && auth !== "none") || (resolvedAuth && resolvedAuth !== "none" && resolvedAuth !== "undefined") || hasCreds;
          if (!isAuthConfigured) {
            findings.push({
              id: makeFindingId("SEC-002", node.id),
              ruleId: "SEC-002",
              ruleName: "Unauthenticated Webhook Trigger",
              severity: "CRITICAL",
              category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: {
                summary: "Webhook has no authentication configured",
                detail: `Node "${node.name}" is a publicly-accessible webhook with authentication set to "none". Any actor who knows the URL can trigger this workflow.`,
              },
              humanExplanation: "An unauthenticated webhook is a public entry point — anyone can trigger your workflow, cause unwanted actions, or flood your execution quota.",
              suggestedFix: "Enable Header Auth, Basic Auth, or JWT verification on the webhook node.",
              autoFix: {
                description: "Enable Header Auth",
                manualInstruction: `Open "${node.name}" → Authentication → select "Header Auth" → add a secret header value.`,
                patches: [{ op: "replace", path: "/parameters/authentication", value: "headerAuth" }],
              },
              marketplaceBlocking: true,
              docReference: "https://flowintel.io/rules/SEC-002",
              penaltyPoints: 25,
            });
          }
        }
        return findings;
      },
    },

    // ── SEC-003: Unencrypted HTTP Egress ──────────────────────────────────────
    {
      id: "SEC-003",
      name: "Unencrypted HTTP Egress",
      category: "SECURITY",
      severity: "HIGH",
      description: "Detects outbound HTTP (non-HTTPS) requests to external hosts.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/SEC-003",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const p = node.parameters as Record<string, unknown> | undefined;
          if (!p) continue;
          const urlFields = ["url", "webhookUrl", "endpoint", "baseUrl", "apiUrl", "uri"];
          for (const field of urlFields) {
            const urlVal = p[field];
            if (typeof urlVal !== "string") continue;
            if (!urlVal.startsWith("http://")) continue;
            if (isInternalHost(urlVal)) continue;
            findings.push({
              id: makeFindingId("SEC-003", node.id, field),
              ruleId: "SEC-003",
              ruleName: "Unencrypted HTTP Egress",
              severity: "HIGH",
              category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type, paramPath: `/${field}` },
              evidence: {
                summary: "http:// used for external request",
                value: urlVal.slice(0, 100),
                detail: `Node "${node.name}" makes an unencrypted HTTP request. Data in transit is not protected.`,
              },
              humanExplanation: "HTTP transmits data in plaintext. Credentials, tokens, and payload contents are visible to anyone on the network path.",
              suggestedFix: `Replace http:// with https:// in the ${field} parameter of "${node.name}".`,
              autoFix: {
                description: "Upgrade to HTTPS",
                patches: [{ op: "replace", path: `/parameters/${field}`, value: urlVal.replace("http://", "https://") }],
              },
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/SEC-003",
              penaltyPoints: 10,
            });
            break; // one finding per node
          }
        }
        return findings;
      },
    },

    // ── SEC-004: Dangerous Code Execution ────────────────────────────────────
    {
      id: "SEC-004",
      name: "Dangerous Code Execution",
      category: "SECURITY",
      severity: "CRITICAL",
      description: "Detects eval(), child_process, shell execution, and unrestricted fs access in code nodes.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 30,
      docReference: "https://flowintel.io/rules/SEC-004",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const DANGEROUS: Array<{ re: RegExp; label: string }> = [
          { re: /\beval\s*\(/, label: "eval()" },
          { re: /\bnew\s+Function\s*\(/, label: "new Function()" },
          { re: /require\s*\(\s*['"]child_process['"]/, label: "child_process" },
          { re: /\bexecSync\s*\(|\bspawnSync\s*\(|\bexec\s*\(/, label: "shell execution" },
          { re: /require\s*\(\s*['"]fs['"]/, label: "fs module" },
          { re: /process\.env\b/, label: "process.env access" },
        ];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? JSON.stringify(node.parameters ?? {});
          for (const { re, label } of DANGEROUS) {
            if (re.test(code)) {
              findings.push({
                id: makeFindingId("SEC-004", node.id),
                ruleId: "SEC-004",
                ruleName: "Dangerous Code Execution",
                severity: "CRITICAL",
                category: "SECURITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: `${label} detected in code node`,
                  detail: `Node "${node.name}" uses ${label}, which can escape the sandboxed environment and execute arbitrary system commands.`,
                },
                humanExplanation: `${label} in a workflow code node can be exploited to run system commands, read server files, or exfiltrate environment secrets.`,
                suggestedFix: `Replace ${label} with a dedicated built-in n8n node (e.g. Execute Command node) or remove it entirely.`,
                marketplaceBlocking: true,
                docReference: "https://flowintel.io/rules/SEC-004",
                penaltyPoints: 30,
              });
              break;
            }
          }
        }
        return findings;
      },
    },

    // ── SEC-005: PII in Outbound Payload ─────────────────────────────────────
    {
      id: "SEC-005",
      name: "PII in Outbound Payload",
      category: "SECURITY",
      severity: "HIGH",
      description: "Detects known PII field names sent to external services.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/SEC-005",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!OUTBOUND_NODE_TYPES.has(node.type) && !node.isHttp) continue;
          const paramStr = JSON.stringify(node.parameters ?? {}).toLowerCase();
          const matched = [...PII_FIELDS].filter((f) => paramStr.includes(`"${f.toLowerCase()}"`));
          if (matched.length > 0) {
            findings.push({
              id: makeFindingId("SEC-005", node.id),
              ruleId: "SEC-005",
              ruleName: "PII in Outbound Payload",
              severity: "HIGH",
              category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: {
                summary: `PII fields detected: ${matched.slice(0, 3).join(", ")}`,
                detail: `Node "${node.name}" appears to forward potential PII fields (${matched.join(", ")}) to an external service.`,
              },
              humanExplanation: "Sending unmasked PII to third-party services may violate GDPR, CCPA, and internal data governance policies.",
              suggestedFix: `Add an 'Edit Fields' node before "${node.name}" to redact or hash sensitive fields before they leave the workflow.`,
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/SEC-005",
              penaltyPoints: 20,
            });
          }
        }
        return findings;
      },
    },
  ],
};
