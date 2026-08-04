/**
 * FlowIntel Security Extension B — SEC-021 to SEC-035
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(rule: string, node: string, sfx?: string) {
  return [rule, node, sfx].filter(Boolean).join("-");
}
function paramStr(node: { parameters?: unknown }): string {
  return JSON.stringify(node.parameters ?? {});
}

export const SECURITY_EXT_B: RulePackManifest = {
  id: "flowintel-security-ext-b",
  name: "FlowIntel Security Extension B",
  version: "2.0.0",
  description: "SEC-021 through SEC-035: CORS, path traversal, debug flags, data exfil, and more.",
  rules: [
    {
      id: "SEC-021",
      name: "Overly Permissive CORS Configuration",
      category: "SECURITY",
      severity: "HIGH",
      description: "Workflow or response node sets Access-Control-Allow-Origin: * unnecessarily.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/SEC-021",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = paramStr(node);
          if (/access-control-allow-origin['":\s]*\*/i.test(s)) {
            findings.push({
              id: fid("SEC-021", node.id),
              ruleId: "SEC-021", ruleName: "Overly Permissive CORS Configuration",
              severity: "HIGH", category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "CORS wildcard (*) set", detail: `"${node.name}" sets Access-Control-Allow-Origin: * which allows any website to read the response.` },
              humanExplanation: "Wildcard CORS allows malicious websites to call your workflow endpoint and read responses from authenticated users.",
              suggestedFix: "Replace * with the specific allowed origins (e.g. https://yourapp.com).",
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/SEC-021",
              penaltyPoints: 12,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "SEC-022",
      name: "Path Traversal Risk",
      category: "SECURITY",
      severity: "CRITICAL",
      description: "File operation uses a path derived from user input without sanitisation.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 30,
      docReference: "https://flowintel.io/rules/SEC-022",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? paramStr(node);
          if (/readFile|writeFile|readdir|unlink|rename/.test(code) &&
              /\$json\.(body|query|params|input)/.test(code)) {
            findings.push({
              id: fid("SEC-022", node.id),
              ruleId: "SEC-022", ruleName: "Path Traversal Risk",
              severity: "CRITICAL", category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "File op with user-supplied path", detail: `"${node.name}" performs a file operation using a user-controlled path value — vulnerable to ../../ traversal.` },
              humanExplanation: "Path traversal lets attackers read or overwrite arbitrary files on the server filesystem.",
              suggestedFix: "Sanitise the path with path.basename() and restrict to an allowed directory before any file operation.",
              marketplaceBlocking: true,
              docReference: "https://flowintel.io/rules/SEC-022",
              penaltyPoints: 30,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "SEC-023",
      name: "Debug Mode Enabled in Production Node",
      category: "SECURITY",
      severity: "MEDIUM",
      description: "Node has a debug or verbose flag enabled — may leak internal data in responses.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/SEC-023",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = paramStr(node);
          if (/"(?:debug|verbose|trace)"\s*:\s*true/i.test(s)) {
            findings.push({
              id: fid("SEC-023", node.id),
              ruleId: "SEC-023", ruleName: "Debug Mode Enabled in Production Node",
              severity: "MEDIUM", category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "debug/verbose flag is true", detail: `"${node.name}" has debug mode enabled, which may include stack traces or internal data in outputs.` },
              humanExplanation: "Debug output in production can leak internal paths, SQL queries, stack traces, and configuration values.",
              suggestedFix: `Disable debug/verbose mode in "${node.name}" before deploying to production.`,
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/SEC-023",
              penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "SEC-024",
      name: "Data Exfiltration to Unknown Endpoint",
      category: "SECURITY",
      severity: "HIGH",
      description: "HTTP Request sends data to an IP address rather than a named hostname.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/SEC-024",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const p = node.parameters as Record<string, unknown> | undefined;
          const url = String(p?.url ?? "");
          if (/https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)) {
            findings.push({
              id: fid("SEC-024", node.id),
              ruleId: "SEC-024", ruleName: "Data Exfiltration to Unknown Endpoint",
              severity: "HIGH", category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type, paramPath: "/parameters/url" },
              evidence: { summary: "HTTP request to raw IP address", value: url.slice(0, 80), detail: `"${node.name}" sends data to an IP address instead of a named host — harder to audit and may bypass firewall rules.` },
              humanExplanation: "Raw IP destinations are difficult to whitelist, audit, or monitor and are a common indicator of data exfiltration.",
              suggestedFix: "Replace the IP address with a proper hostname, or verify this IP is an approved destination and document it.",
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/SEC-024",
              penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "SEC-025",
      name: "Missing Content Security Policy Header",
      category: "SECURITY",
      severity: "LOW",
      description: "Webhook response does not include a Content-Security-Policy header.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/SEC-025",
      detect(ast: ParsedWorkflow): Finding[] {
        const respNodes = ast.nodes.filter((n) => n.type === "n8n-nodes-base.respondToWebhook");
        if (respNodes.length === 0) return [];
        return respNodes.filter((node) => {
          const s = paramStr(node);
          return !/content-security-policy/i.test(s);
        }).map((node) => ({
          id: fid("SEC-025", node.id),
          ruleId: "SEC-025", ruleName: "Missing Content Security Policy Header",
          severity: "LOW" as const, category: "SECURITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "No CSP header in webhook response", detail: `"${node.name}" returns a response without a Content-Security-Policy header.` },
          humanExplanation: "Without CSP, browsers allow inline scripts and arbitrary resource loads — increasing XSS risk.",
          suggestedFix: "Add a Content-Security-Policy response header with an appropriate policy.",
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/SEC-025",
          penaltyPoints: 5,
        }));
      },
    },

    {
      id: "SEC-026",
      name: "Insecure Deserialization",
      category: "SECURITY",
      severity: "CRITICAL",
      description: "Code node deserializes untrusted data using eval, JSON.parse on raw input, or similar.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 25,
      docReference: "https://flowintel.io/rules/SEC-026",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? paramStr(node);
          if (/JSON\.parse\s*\(\s*\$json\.(body|query|input)/i.test(code) ||
              /deserialize|unserialize|fromJSON.*\$json/i.test(code)) {
            findings.push({
              id: fid("SEC-026", node.id),
              ruleId: "SEC-026", ruleName: "Insecure Deserialization",
              severity: "CRITICAL", category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Untrusted data deserialized directly", detail: `"${node.name}" deserializes user-supplied input without validation.` },
              humanExplanation: "Deserializing untrusted data can lead to remote code execution if prototype pollution or gadget chains exist.",
              suggestedFix: "Validate and sanitise the input before deserialization. Use JSON.parse inside a try-catch and validate the resulting shape.",
              marketplaceBlocking: true,
              docReference: "https://flowintel.io/rules/SEC-026",
              penaltyPoints: 25,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "SEC-027",
      name: "Broken Access Control — Missing Auth Check",
      category: "SECURITY",
      severity: "CRITICAL",
      description: "Workflow performs privileged operations without verifying caller identity.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 30,
      docReference: "https://flowintel.io/rules/SEC-027",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasWebhook = ast.nodes.some((n) => n.type === "n8n-nodes-base.webhook");
        if (!hasWebhook) return [];
        const PRIV_TYPES = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb","n8n-nodes-base.executeCommand","n8n-nodes-base.ftp","n8n-nodes-base.ssh"]);
        const hasPrivNode = ast.nodes.some((n) => PRIV_TYPES.has(n.type));
        if (!hasPrivNode) return [];
        const hasAuthCheck = ast.nodes.some((n) => {
          const s = paramStr(n);
          return /authorization|bearer|apikey|auth.*header|verify.*token|checkAuth/i.test(s);
        });
        if (hasAuthCheck) return [];
        const webhook = ast.nodes.find((n) => n.type === "n8n-nodes-base.webhook")!;
        return [{
          id: fid("SEC-027", webhook.id),
          ruleId: "SEC-027", ruleName: "Broken Access Control — Missing Auth Check",
          severity: "CRITICAL", category: "SECURITY",
          location: { nodeId: webhook.id, nodeName: webhook.name, nodeType: webhook.type },
          evidence: { summary: "Privileged operation reachable via unauthenticated webhook", detail: "A privileged node (DB/SSH/Command) is reachable from an unauthenticated webhook without any auth check." },
          humanExplanation: "Anyone who can reach the webhook URL can trigger privileged operations — read/write databases, run commands, or access file systems.",
          suggestedFix: "Add authentication to the webhook node or add a Code node immediately after to verify an Authorization header.",
          marketplaceBlocking: true,
          docReference: "https://flowintel.io/rules/SEC-027",
          penaltyPoints: 30,
        }];
      },
    },

    {
      id: "SEC-028",
      name: "Cleartext Password in Workflow Variables",
      category: "SECURITY",
      severity: "CRITICAL",
      description: "Workflow uses a variable or expression containing a literal password value.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 35,
      docReference: "https://flowintel.io/rules/SEC-028",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = paramStr(node);
          if (/["'](?:password|passwd|pwd)["']\s*:\s*["'][^{][A-Za-z0-9!@#$%^&*]{8,}["']/i.test(s)) {
            findings.push({
              id: fid("SEC-028", node.id),
              ruleId: "SEC-028", ruleName: "Cleartext Password in Workflow Variables",
              severity: "CRITICAL", category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Literal password string in parameters", detail: `"${node.name}" contains what appears to be a cleartext password literal.` },
              humanExplanation: "Cleartext passwords in workflow JSON are visible to any user who can export or view the workflow.",
              suggestedFix: "Store the password as an n8n credential and reference it via the Credentials dropdown instead.",
              marketplaceBlocking: true,
              docReference: "https://flowintel.io/rules/SEC-028",
              penaltyPoints: 35,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "SEC-029",
      name: "Dependency Confusion Risk (Community Package Name)",
      category: "SECURITY",
      severity: "MEDIUM",
      description: "Community node package name matches a common internal naming pattern vulnerable to dependency confusion.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/SEC-029",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type.startsWith("n8n-nodes-base.") || node.type.startsWith("@n8n/")) continue;
          // Suspicious patterns: internal-sounding names, @company/ scopes, version 0.0.x
          if (/^n8n-nodes-(?!base\b)[\w-]+-internal/.test(node.type) ||
              /^@[\w-]+\/n8n-nodes-(?!base\b)/.test(node.type)) {
            findings.push({
              id: fid("SEC-029", node.id),
              ruleId: "SEC-029", ruleName: "Dependency Confusion Risk",
              severity: "MEDIUM", category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Suspicious community package: ${node.type}`, detail: `"${node.name}" uses a package name pattern associated with dependency confusion attacks.` },
              humanExplanation: "Dependency confusion attacks substitute malicious public packages for internal package names during install.",
              suggestedFix: "Verify this community node is from a trusted source. Pin the exact version and checksum in your n8n deployment.",
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/SEC-029",
              penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "SEC-030",
      name: "Webhook Responds with Stack Trace",
      category: "SECURITY",
      severity: "HIGH",
      description: "Workflow response includes error.stack or stack trace in the response body.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/SEC-030",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = paramStr(node);
          if (/error\.stack|\$\.stack|stackTrace/i.test(s)) {
            findings.push({
              id: fid("SEC-030", node.id),
              ruleId: "SEC-030", ruleName: "Webhook Responds with Stack Trace",
              severity: "HIGH", category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "error.stack in response", detail: `"${node.name}" includes error.stack in its output — leaking internal file paths and code structure.` },
              humanExplanation: "Stack traces expose internal file paths, library names, and code structure that attackers use for targeted exploits.",
              suggestedFix: "Remove error.stack from responses. Log it internally instead and return a generic error message to callers.",
              marketplaceBlocking: true,
              docReference: "https://flowintel.io/rules/SEC-030",
              penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "SEC-031",
      name: "Unrestricted File Upload",
      category: "SECURITY",
      severity: "CRITICAL",
      description: "Workflow accepts file uploads without validating MIME type or file extension.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 25,
      docReference: "https://flowintel.io/rules/SEC-031",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const hasFileInput = ast.nodes.some((n) =>
          n.type.includes("binary") || paramStr(n).includes("binaryData") || paramStr(n).includes("multipart")
        );
        if (!hasFileInput) return [];
        const hasValidation = ast.nodes.some((n) => {
          const s = paramStr(n);
          return /mimeType|contentType|\.ext|allowedTypes|fileExtension/i.test(s);
        });
        if (hasValidation) return [];
        const fileNode = ast.nodes.find((n) => n.type.includes("binary") || paramStr(n).includes("binaryData"))!;
        if (!fileNode) return [];
        findings.push({
          id: fid("SEC-031", fileNode.id),
          ruleId: "SEC-031", ruleName: "Unrestricted File Upload",
          severity: "CRITICAL", category: "SECURITY",
          location: { nodeId: fileNode.id, nodeName: fileNode.name, nodeType: fileNode.type },
          evidence: { summary: "File upload without MIME/extension validation", detail: `"${fileNode.name}" handles file uploads without validating the file type.` },
          humanExplanation: "Accepting arbitrary file types allows uploading malicious executables, web shells, or scripts that can be executed server-side.",
          suggestedFix: "Add a Code node after the upload to validate MIME type and extension against an allowlist before processing.",
          marketplaceBlocking: true,
          docReference: "https://flowintel.io/rules/SEC-031",
          penaltyPoints: 25,
        });
        return findings;
      },
    },

    {
      id: "SEC-032",
      name: "Insecure Redirect",
      category: "SECURITY",
      severity: "HIGH",
      description: "Workflow issues a redirect to a URL derived from user input.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/SEC-032",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.respondToWebhook") continue;
          const s = paramStr(node);
          if (/redirect|location.*header/i.test(s) && /\$json\.(body|query|params)/i.test(s)) {
            findings.push({
              id: fid("SEC-032", node.id),
              ruleId: "SEC-032", ruleName: "Insecure Redirect",
              severity: "HIGH", category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Redirect URL from user input", detail: `"${node.name}" issues a redirect using a user-supplied URL — open redirect vulnerability.` },
              humanExplanation: "Open redirects allow phishing attacks where attackers craft links that appear legitimate but redirect users to malicious sites.",
              suggestedFix: "Allowlist valid redirect destinations or use relative paths only.",
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/SEC-032",
              penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "SEC-033",
      name: "Hardcoded Encryption Key",
      category: "SECURITY",
      severity: "CRITICAL",
      description: "Code node contains a hardcoded encryption key or IV.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 30,
      docReference: "https://flowintel.io/rules/SEC-033",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? paramStr(node);
          if (/createCipher|createDecipher|AES|encrypt|decrypt/i.test(code) &&
              /(?:key|secret|iv)\s*=\s*['"][A-Za-z0-9+/=]{16,}['"]/i.test(code)) {
            findings.push({
              id: fid("SEC-033", node.id),
              ruleId: "SEC-033", ruleName: "Hardcoded Encryption Key",
              severity: "CRITICAL", category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Encryption key hardcoded in code node", detail: `"${node.name}" contains a hardcoded encryption key/IV which compromises all data encrypted with it.` },
              humanExplanation: "A hardcoded key means every encrypted value can be decrypted by anyone who reads the workflow source.",
              suggestedFix: "Store encryption keys in n8n Credentials or environment variables — never in workflow code.",
              marketplaceBlocking: true,
              docReference: "https://flowintel.io/rules/SEC-033",
              penaltyPoints: 30,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "SEC-034",
      name: "Excessive Data Returned to Caller",
      category: "SECURITY",
      severity: "MEDIUM",
      description: "Workflow response returns entire database record objects including sensitive system fields.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/SEC-034",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.respondToWebhook") continue;
          const p = node.parameters as Record<string, unknown> | undefined;
          const body = String(p?.body ?? p?.responseBody ?? "");
          // Entire $json passed without field selection
          if (/^\s*=\s*\{\{?\s*\$json\s*\}?\}?\s*$/.test(body) || body.trim() === "{{$json}}") {
            findings.push({
              id: fid("SEC-034", node.id),
              ruleId: "SEC-034", ruleName: "Excessive Data Returned to Caller",
              severity: "MEDIUM", category: "SECURITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Entire $json returned in response", detail: `"${node.name}" returns the entire data object — including internal fields — to the caller.` },
              humanExplanation: "Returning entire database records exposes internal IDs, timestamps, and sensitive fields that callers don't need.",
              suggestedFix: "Add a Set Fields node before the response to select only the fields the caller needs.",
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/SEC-034",
              penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "SEC-035",
      name: "Missing Audit Log for Destructive Operation",
      category: "SECURITY",
      severity: "HIGH",
      description: "Workflow performs a delete or destructive operation without writing an audit log entry.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/SEC-035",
      detect(ast: ParsedWorkflow): Finding[] {
        const DB_TYPES = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb","n8n-nodes-base.airtable","n8n-nodes-base.supabase"]);
        const hasDelete = ast.nodes.some((n) => {
          if (!DB_TYPES.has(n.type)) return false;
          const op = String((n.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          return ["delete","remove","drop","truncate","destroy"].some((v) => op.includes(v));
        });
        if (!hasDelete) return [];
        const hasAuditLog = ast.nodes.some((n) => {
          const s = JSON.stringify(n.parameters ?? {});
          return /audit|auditLog|audit_log|activityLog/i.test(s);
        });
        if (hasAuditLog) return [];
        const delNode = ast.nodes.find((n) => {
          if (!DB_TYPES.has(n.type)) return false;
          const op = String((n.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          return ["delete","remove","drop","truncate","destroy"].some((v) => op.includes(v));
        })!;
        return [{
          id: fid("SEC-035", delNode.id),
          ruleId: "SEC-035", ruleName: "Missing Audit Log for Destructive Operation",
          severity: "HIGH", category: "SECURITY",
          location: { nodeId: delNode.id, nodeName: delNode.name, nodeType: delNode.type },
          evidence: { summary: "Delete operation without audit trail", detail: `"${delNode.name}" performs a destructive operation with no audit logging.` },
          humanExplanation: "Destructive operations without audit trails make it impossible to investigate incidents or meet compliance requirements.",
          suggestedFix: "Add a node before the delete to write an audit log entry (who, what, when) to a separate audit table or log service.",
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/SEC-035",
          penaltyPoints: 15,
        }];
      },
    },
  ],
};
