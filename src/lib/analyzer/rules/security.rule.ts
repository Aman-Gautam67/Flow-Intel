import type { AuditFlag, ParsedWorkflow, PrivacyProfile } from "@/types";

// ─── PILLAR 2: SECURITY & PRIVACY ─────────────────────────────────────────────
//
// This pillar now owns ALL security AND privacy flags.
// Privacy flags (PII egress, cred blast radius, raw IP, unknown domain) are merged
// here to eliminate double-jeopardy with the old standalone PRIVACY pillar.
//
// N/A CONDITION:
//   The pillar is marked N/A when the workflow has:
//     • No incoming webhook triggers (no inbound attack surface)
//     • No outbound HTTP nodes (no egress risk)
//   In this case the score is excluded from the overall mean entirely.
//
// CONTEXT-AWARE RULES:
//   1. http:// rule skips localhost, internal hostnames (n8n-*, *.local),
//      and RFC-1918 IP ranges (10.x, 172.16-31.x, 192.168.x).
//   2. Missing-credential rule skips nodes whose URL field contains an
//      expression ({{ ... }}) — the credential may be injected at runtime.

// ─── Secret pattern set ───────────────────────────────────────────────────────
export const SECRET_PATTERN_SET = [
  { re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, label: "JWT token", pts: 35 },
  { re: /\bsk-[A-Za-z0-9]{20,60}\b/, label: "OpenAI API key", pts: 35 },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,80}\b/, label: "Anthropic API key", pts: 35 },
  { re: /AIza[A-Za-z0-9_-]{35}/, label: "Google API key", pts: 35 },
  { re: /xox[baprs]-[0-9A-Za-z-]{10,80}/, label: "Slack token", pts: 35 },
  { re: /\b(ghp_|github_pat_)[A-Za-z0-9_]{30,100}\b/, label: "GitHub token", pts: 35 },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS Access Key", pts: 35 },
  { re: /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/, label: "Stripe secret key", pts: 35 },
  { re: /["']Bearer\s+[A-Za-z0-9\-._~+/]{32,}["']/, label: "Bearer token", pts: 35 },
  { re: /["'](password|passwd|pwd)["']\s*:\s*["'](?!\{\{)[^\s"']{8,}["']/i, label: "Hardcoded password", pts: 35 },
  { re: /["'](secret|apiSecret|clientSecret|app_secret|consumer_secret)["']\s*:\s*["'](?!\{\{)[A-Za-z0-9_\-]{12,}["']/i, label: "Hardcoded secret", pts: 35 },
  { re: /["'](apiKey|api_key|x-api-key|X-Api-Key)["']\s*:\s*["'](?!\{\{)[A-Za-z0-9_\-]{16,}["']/i, label: "Hardcoded API key", pts: 35 },
];

// ─── Context helpers ──────────────────────────────────────────────────────────
function isExpression(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const t = value.trim();
  return t.startsWith("={{") || t.startsWith("{{");
}

function extractLiteralStrings(params: unknown, depth = 0): string[] {
  if (depth > 6 || !params || typeof params !== "object") return [];
  const results: string[] = [];
  if (Array.isArray(params)) {
    for (const item of params) results.push(...extractLiteralStrings(item, depth + 1));
    return results;
  }
  for (const [, val] of Object.entries(params as Record<string, unknown>)) {
    if (typeof val === "string" && !isExpression(val) && val.length >= 8) results.push(val);
    else if (typeof val === "object") results.push(...extractLiteralStrings(val, depth + 1));
  }
  return results;
}

function labelToEnvVarName(label: string): string {
  return label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Extract only URL-typed parameter fields to avoid matching http:// in unrelated text */
function extractUrlFields(params: unknown): string {
  if (!params || typeof params !== "object") return "";
  const p = params as Record<string, unknown>;
  const urlFields = ["url", "webhookUrl", "endpoint", "baseUrl", "apiUrl", "uri", "webhook_url", "targetUrl"];
  return urlFields.map((k) => String(p[k] ?? "")).join(" ");
}

/**
 * Context-aware: returns true if the url points to a local/internal address.
 * Skips: localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, *.local, n8n-* hostnames.
 */
function isInternalUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    if (hostname === "localhost") return true;
    if (/^127\./.test(hostname)) return true;
    if (/^10\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;
    const INTERNAL_TLDS = [".local", ".internal", ".corp", ".intranet", ".legacy", ".home", ".lan", ".office", ".private"];
    if (INTERNAL_TLDS.some((tld) => hostname.endsWith(tld))) return true;
    if (/^n8n[-_]/.test(hostname)) return true; // docker-compose service names
    return false;
  } catch { return false; }
}

function isRawIpUrl(url: string): boolean {
  try { return /^\d+\.\d+\.\d+\.\d+$/.test(new URL(url).hostname); }
  catch { return false; }
}

const KNOWN_SAFE_DOMAINS = new Set([
  "api.slack.com", "api.stripe.com", "api.github.com", "api.openai.com",
  "api.anthropic.com", "api.twilio.com", "api.sendgrid.com", "api.mailchimp.com",
  "hooks.slack.com", "api.telegram.org", "discord.com/api", "api.notion.com",
  "api.airtable.com", "sheets.googleapis.com", "gmail.googleapis.com",
  "oauth2.googleapis.com",
]);
function isDomainSafe(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    for (const s of KNOWN_SAFE_DOMAINS) {
      if (hostname === s || hostname.endsWith("." + s)) return true;
    }
    return false;
  } catch { return false; }
}
function extractUrls(paramStr: string): string[] {
  const urls: string[] = [];
  const re = /["'](https?:\/\/[^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paramStr)) !== null) urls.push(m[1]);
  return urls;
}

const PII_FIELDS = [
  "email", "phone", "phoneNumber", "mobile", "ssn", "socialSecurityNumber",
  "password", "passwd", "pwd", "creditCard", "credit_card", "cardNumber", "cvv", "ccv",
  "token", "authToken", "accessToken", "refreshToken", "dob", "dateOfBirth", "birthday",
  "address", "street", "zipCode", "postalCode", "passport", "driverLicense", "nationalId",
  "firstName", "lastName", "fullName",
];

const OUTBOUND_TYPES = new Set([
  "n8n-nodes-base.httpRequest", "n8n-nodes-base.webhook",
  "n8n-nodes-base.slack", "n8n-nodes-base.gmail",
  "n8n-nodes-base.telegram", "n8n-nodes-base.discord",
]);

// ─── N/A detection ────────────────────────────────────────────────────────────
export function isSecurityApplicable(parsed: ParsedWorkflow): boolean {
  if (parsed.hasWebhooks) return true;
  if (parsed.httpNodesCount > 0) return true;
  if (parsed.nodes.some((n) => OUTBOUND_TYPES.has(n.type))) return true;
  return false;
}

// ─── Main rule runner ─────────────────────────────────────────────────────────
export function runSecurityRules(
  parsed: ParsedWorkflow
): { flags: AuditFlag[]; profile: PrivacyProfile } {
  const flags: AuditFlag[] = [];
  const nodes = parsed.nodes;

  const piiFieldsDetected: string[] = [];
  const credentialBlastRadius: Record<string, number> = {};
  const flaggedEgressUrls: string[] = [];
  const piiInOutboundNodes: string[] = [];

  for (const node of nodes) {
    // ── Hardcoded credentials (skips expression values) ─────────────────────
    const literalValues = extractLiteralStrings(node.parameters);
    const fullParamStr  = JSON.stringify(node.parameters ?? {});
    let credFlagged = false;
    for (const { re, label, pts } of SECRET_PATTERN_SET) {
      if (credFlagged) break;
      const testStr = literalValues.join(" ") + " " + fullParamStr;
      if (re.test(testStr)) {
        const match = testStr.match(re)?.[0] ?? "";
        if (match && !match.includes("={{")) {
          flags.push({
            id: `SEC_HARDCODED_${node.id}`,
            rule: "SEC_HARDCODED_CREDENTIALS",
            severity: "CRITICAL",
            category: "SECURITY",
            title: `Hardcoded credential (${label})`,
            detail: `${label} found in parameters of "${node.name}". Move to credential store immediately.`,
            nodeName: node.name, nodeType: node.type, ptsDeducted: pts,
            envVarExpression: `={{ $env.${labelToEnvVarName(label)} }}`,
            remediation: {
              description: `Remove the hardcoded ${label} and use an n8n credential instead.`,
              n8nUiInstruction: `Open "${node.name}" → Credentials → Create new credential.`,
            },
          });
          credFlagged = true;
        }
      }
    }

    // ── Unauthenticated webhooks ────────────────────────────────────────────
    const isWebhookTrigger =
      node.type === "n8n-nodes-base.webhook" ||
      (node.isTrigger && node.isHttp && node.type.toLowerCase().includes("webhook"));
    if (isWebhookTrigger) {
      const p = node.parameters as Record<string, unknown> | undefined;
      const auth = p?.authentication ?? p?.auth ?? p?.authType ?? p?.authMethod;
      const hasCredentials =
        node.isAuthenticated === true ||
        (node.credentials && Object.keys(node.credentials).length > 0);
      if ((!auth || auth === "none") && !hasCredentials) {
        flags.push({
          id: `SEC_WEBHOOK_UNAUTH_${node.id}`,
          rule: "SEC_UNAUTHENTICATED_WEBHOOK",
          severity: "CRITICAL",
          category: "SECURITY",
          title: "Unauthenticated webhook",
          detail: `Webhook "${node.name}" has no authentication — any actor can trigger this workflow.`,
          nodeName: node.name, nodeType: node.type, ptsDeducted: 25,
          remediation: {
            description: "Enable Header Auth, Basic Auth, or JWT on the webhook.",
            n8nUiInstruction: `Open "${node.name}" → Authentication → Header Auth.`,
            jsonPatch: [{ op: "replace", path: `/parameters/authentication`, value: "headerAuth" }],
          },
        });
      }
    }

    // ── Unsafe code patterns ────────────────────────────────────────────────
    if (node.isCode) {
      const codeStr = node.codeMeta?.codeSnippet ?? JSON.stringify(node.parameters ?? {});
      const unsafePatterns = [
        { re: /\beval\s*\(/, label: "eval()" },
        { re: /require\s*\(\s*['"]child_process['"]/, label: "child_process" },
        { re: /require\s*\(\s*['"]fs['"]/, label: "fs module" },
        { re: /\bexecSync\s*\(|\bspawnSync\s*\(/, label: "shell execution" },
      ];
      for (const { re, label } of unsafePatterns) {
        if (re.test(codeStr)) {
          flags.push({
            id: `SEC_UNSAFE_CODE_${node.id}`,
            rule: "SEC_UNSAFE_CODE_NODE",
            severity: "CRITICAL",
            category: "SECURITY",
            title: `Unsafe code pattern: ${label}`,
            detail: `Node "${node.name}" uses ${label}, posing a sandbox escape risk.`,
            nodeName: node.name, nodeType: node.type, ptsDeducted: 18,
            remediation: { description: `Replace ${label} with a safe built-in node.` },
          });
          break;
        }
      }
    }

    // ── Unencrypted HTTP (context-aware: skip internal/local) ───────────────
    const urlStr = extractUrlFields(node.parameters);
    const httpMatches = urlStr.match(/\bhttp:\/\/[^\s"']+/g) ?? [];
    for (const url of httpMatches) {
      if (!isInternalUrl(url)) {
        flags.push({
          id: `SEC_HTTP_${node.id}`,
          rule: "SEC_UNENCRYPTED_HTTP",
          severity: "WARNING",
          category: "SECURITY",
          title: "Unencrypted HTTP endpoint",
          detail: `Node "${node.name}" uses plain http:// to an external host — use https://.`,
          nodeName: node.name, nodeType: node.type, ptsDeducted: 10,
          remediation: {
            description: "Replace http:// with https:// in the URL field.",
            n8nUiInstruction: `Open "${node.name}" → URL → change http:// to https://.`,
          },
        });
        break; // one per node
      }
    }

    // ── PII in outbound nodes (merged from privacy.rule.ts) ────────────────
    if (OUTBOUND_TYPES.has(node.type) || node.isHttp) {
      const paramStr = JSON.stringify(node.parameters ?? {}).toLowerCase();
      const matchedFields = PII_FIELDS.filter((f) =>
        paramStr.includes(`"${f.toLowerCase()}"`) || paramStr.includes(`'${f.toLowerCase()}'`)
      );
      if (matchedFields.length > 0) {
        piiInOutboundNodes.push(node.name);
        for (const f of matchedFields) {
          if (!piiFieldsDetected.includes(f)) piiFieldsDetected.push(f);
        }
        flags.push({
          id: `SEC_PII_EGRESS_${node.id}`,
          rule: "SEC_PII_IN_OUTBOUND",
          severity: "CRITICAL",
          category: "SECURITY",
          title: "PII in outbound payload",
          detail: `"${node.name}" sends potential PII (${matchedFields.slice(0, 3).join(", ")}) to an external service.`,
          nodeName: node.name, nodeType: node.type, ptsDeducted: 20,
          remediation: {
            description: "Mask or remove PII fields before sending data externally.",
            n8nUiInstruction: `Add an 'Edit Fields' node before "${node.name}" to redact sensitive fields.`,
          },
        });
      }
    }

    // ── Egress domain / raw IP / plain HTTP egress (merged from privacy) ────
    if ((OUTBOUND_TYPES.has(node.type) || node.isHttp)) {
      const paramStr = JSON.stringify(node.parameters ?? {});
      const urls = extractUrls(paramStr);
      for (const url of urls) {
        if (isDomainSafe(url) || isInternalUrl(url)) continue;
        if (flaggedEgressUrls.includes(url)) continue;
        flaggedEgressUrls.push(url);
        const isHttp   = url.startsWith("http://");
        const isRawIp  = isRawIpUrl(url);
        flags.push({
          id: `SEC_EGRESS_${node.id}_${flaggedEgressUrls.length}`,
          rule: isRawIp ? "SEC_RAW_IP_EGRESS" : isHttp ? "SEC_HTTP_EGRESS" : "SEC_UNKNOWN_DOMAIN",
          severity: isHttp || isRawIp ? "WARNING" : "INFO",
          category: "SECURITY",
          title: isRawIp ? "Raw IP in outbound request" : isHttp ? "Unencrypted egress" : "Unknown external domain",
          detail: `"${node.name}" sends data to ${url}.`,
          nodeName: node.name, nodeType: node.type,
          ptsDeducted: isHttp || isRawIp ? 10 : 0,
          remediation: {
            description: isRawIp
              ? "Use the service DNS hostname instead of a raw IP."
              : isHttp ? "Replace http:// with https://."
              : "Verify this is a trusted endpoint.",
          },
        });
        break; // one flag per node
      }
    }
  }

  // ── Credential blast radius (merged from privacy) ───────────────────────
  for (const node of nodes) {
    if (!node.credentials || Object.keys(node.credentials).length === 0) continue;
    for (const [credType, credRef] of Object.entries(node.credentials as Record<string, unknown>)) {
      const ref = credRef as Record<string, unknown>;
      const key = `${credType}:${ref?.id ?? ref?.name ?? "unknown"}`;
      credentialBlastRadius[key] = (credentialBlastRadius[key] ?? 0) + 1;
    }
  }
  for (const [key, count] of Object.entries(credentialBlastRadius)) {
    if (count >= 4) {
      flags.push({
        id: `SEC_CRED_SPOF_${key.replace(/[^a-z0-9]/gi, "_")}`,
        rule: "SEC_CREDENTIAL_SPOF",
        severity: "WARNING",
        category: "SECURITY",
        title: `Credential shared across ${count} nodes`,
        detail: `Credential "${key}" used by ${count} nodes — high blast radius on key compromise.`,
        ptsDeducted: 12,
        remediation: {
          description: "Create scoped credentials with minimal permissions for each workflow section.",
        },
      });
    }
  }

  const profile: PrivacyProfile = {
    piiFieldsDetected, credentialBlastRadius, flaggedEgressUrls, piiInOutboundNodes,
  };

  return { flags, profile };
}

// ─── Score computation ────────────────────────────────────────────────────────
// Returns null when the pillar is not applicable.
export function computeSecurityScore(
  flags: AuditFlag[],
  applicable: boolean
): number | null {
  if (!applicable) return null;
  let score = 100;
  const seen = new Set<string>();
  for (const f of flags) {
    if (f.category !== "SECURITY" || !f.ptsDeducted) continue;
    // Full penalty first occurrence, 50% for subsequent occurrences of same rule class
    const deduction = seen.has(f.rule) ? Math.floor(f.ptsDeducted * 0.5) : f.ptsDeducted;
    seen.add(f.rule);
    score -= deduction;
  }
  return Math.max(0, score);
}
