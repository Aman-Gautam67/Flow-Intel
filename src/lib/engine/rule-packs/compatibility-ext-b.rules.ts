/**
 * FlowIntel Compatibility Extension B — CMP-017 to CMP-030
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

export const COMPATIBILITY_EXT_B: RulePackManifest = {
  id: "flowintel-compatibility-ext-b",
  name: "FlowIntel Compatibility Extension B",
  version: "2.0.0",
  description: "CMP-017 through CMP-030: webhook URL changes, credential schema drift, platform migration.",
  rules: [
    {
      id: "CMP-017",
      name: "Webhook URL Format Changed",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Webhook node path uses the legacy /webhook/ prefix instead of /webhook-test/ or new format.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-017",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.webhook") continue;
          const pp = node.parameters as Record<string, unknown> | undefined;
          const path = String(pp?.path ?? "");
          if (path.startsWith("webhook/") || path.includes("/webhook/webhook/")) {
            findings.push({
              id: fid("CMP-017", node.id), ruleId: "CMP-017",
              ruleName: "Webhook URL Format Changed",
              severity: "HIGH", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Legacy webhook path format", value: path, detail: `"${node.name}" uses path "${path}" — may conflict with n8n's URL routing changes.` },
              humanExplanation: "n8n changed webhook URL routing in v1.x. Legacy path formats may not resolve correctly.",
              suggestedFix: "Use a clean path like /my-workflow without the webhook/ prefix.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-017", penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-018",
      name: "Credential Schema Changed — Missing Required Field",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Credential type used by a node has added required fields in newer versions.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-018",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const REQUIRES_FIELDS: Record<string, string[]> = {
          "googleApi": ["accessType"],
          "slackApi": ["accessToken"],
          "stripeApi": ["secretKey"],
        };
        for (const node of ast.nodes) {
          const creds = node.credentials as Record<string, { type?: string; [k: string]: unknown }> | undefined;
          if (!creds) continue;
          for (const cred of Object.values(creds)) {
            const type = cred.type ?? "";
            const required = REQUIRES_FIELDS[type];
            if (!required) continue;
            for (const field of required) {
              if (!(field in cred)) {
                findings.push({
                  id: fid("CMP-018", node.id) + "-" + field,
                  ruleId: "CMP-018", ruleName: "Credential Schema Changed — Missing Required Field",
                  severity: "HIGH", category: "COMPATIBILITY",
                  location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                  evidence: { summary: `"${field}" required but missing in ${type}`, detail: `"${node.name}" uses ${type} credential that now requires "${field}" field.` },
                  humanExplanation: "Newer credential schemas require additional fields. Missing them causes auth failures.",
                  suggestedFix: `Edit the ${type} credential for "${node.name}" and add the required "${field}" field.`,
                  marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-018", penaltyPoints: 15,
                });
              }
            }
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-019",
      name: "Airtable v1 API Usage",
      category: "COMPATIBILITY",
      severity: "CRITICAL",
      description: "Workflow targets Airtable API v0 which was shut down in 2024.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 25,
      docReference: "https://flowintel.io/rules/CMP-019",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = ps(node);
          if (/api\.airtable\.com\/v0\b/.test(s)) {
            findings.push({
              id: fid("CMP-019", node.id), ruleId: "CMP-019",
              ruleName: "Airtable v1 API Usage",
              severity: "CRITICAL", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Airtable API v0 endpoint", detail: `"${node.name}" calls api.airtable.com/v0 which was discontinued.` },
              humanExplanation: "Airtable API v0 was shut down. All requests return 404. Must migrate to v1.",
              suggestedFix: "Use the built-in Airtable node (v2+) or update the URL to api.airtable.com/v1.",
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/CMP-019", penaltyPoints: 25,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-020",
      name: "Twitter/X API v1 Usage",
      category: "COMPATIBILITY",
      severity: "CRITICAL",
      description: "Workflow uses Twitter API v1.1 which has been deprecated and rate-limited to unusability.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 25,
      docReference: "https://flowintel.io/rules/CMP-020",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = ps(node);
          if (/api\.twitter\.com\/1\.1|api\.twitter\.com\/oauth\//.test(s)) {
            findings.push({
              id: fid("CMP-020", node.id), ruleId: "CMP-020",
              ruleName: "Twitter/X API v1 Usage",
              severity: "CRITICAL", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Twitter API v1.1 endpoint", detail: `"${node.name}" uses Twitter API v1.1 which has severe free-tier rate limits and is largely non-functional.` },
              humanExplanation: "Twitter/X API v1.1 free tier allows only ~1 read per month. The workflow will hit rate limits immediately.",
              suggestedFix: "Migrate to Twitter/X API v2 endpoints (api.twitter.com/2/) or use the official X node.",
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/CMP-020", penaltyPoints: 25,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-021",
      name: "Slack Legacy Token Authentication",
      category: "COMPATIBILITY",
      severity: "CRITICAL",
      description: "Workflow uses a legacy Slack Bot token format (xoxb-) with deprecated RTM API.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/CMP-021",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = ps(node);
          if (/rtm\.connect|rtm\.start|slackbot\.com/.test(s)) {
            findings.push({
              id: fid("CMP-021", node.id), ruleId: "CMP-021",
              ruleName: "Slack Legacy Token Authentication",
              severity: "CRITICAL", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Slack RTM API usage detected", detail: `"${node.name}" uses Slack's deprecated RTM API which was disabled in 2024.` },
              humanExplanation: "Slack RTM API was deprecated and disabled. Workflows using it receive connection refused errors.",
              suggestedFix: "Migrate to Slack Socket Mode or use the Web API with event subscriptions.",
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/CMP-021", penaltyPoints: 20,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-022",
      name: "Google OAuth2 Scope Deprecated",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Workflow requests a Google OAuth2 scope that has been deprecated or split.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-022",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const DEPRECATED_SCOPES: Record<string, string> = {
          "https://www.googleapis.com/auth/plus.login": "openid profile email",
          "https://www.googleapis.com/auth/plus.me": "openid profile",
          "https://mail.google.com/": "https://www.googleapis.com/auth/gmail.modify",
        };
        for (const node of ast.nodes) {
          const s = ps(node);
          for (const [scope, replacement] of Object.entries(DEPRECATED_SCOPES)) {
            if (s.includes(scope)) {
              findings.push({
                id: fid("CMP-022", node.id) + "-scope",
                ruleId: "CMP-022", ruleName: "Google OAuth2 Scope Deprecated",
                severity: "HIGH", category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: { summary: `Deprecated scope: ${scope.split("/").pop()}`, detail: `"${node.name}" requests deprecated Google scope "${scope}". Use "${replacement}" instead.` },
                humanExplanation: "Requesting deprecated Google scopes causes OAuth consent screen errors or token rejection.",
                suggestedFix: `Replace scope "${scope}" with "${replacement}".`,
                marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-022", penaltyPoints: 15,
              });
              break;
            }
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-023",
      name: "Stripe API Version Pinned to Old Version",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "Stripe API calls use a pinned API version older than 2 years.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/CMP-023",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = ps(node);
          const match = s.match(/Stripe-Version['":\s]+(20[12]\d-\d{2}-\d{2})/);
          if (match) {
            const year = parseInt(match[1]!.slice(0, 4));
            if (year < 2022) {
              findings.push({
                id: fid("CMP-023", node.id), ruleId: "CMP-023",
                ruleName: "Stripe API Version Pinned to Old Version",
                severity: "MEDIUM", category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: { summary: `Stripe-Version: ${match[1]}`, detail: `"${node.name}" pins Stripe API to ${match[1]} — old versions lose support after 2 years.` },
                humanExplanation: "Stripe retires API versions after 2 years. Old versions stop receiving security patches and may return deprecated response shapes.",
                suggestedFix: "Update the Stripe-Version header to the current stable version and review the migration guide for breaking changes.",
                marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-023", penaltyPoints: 12,
              });
            }
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-024",
      name: "Missing Platform Version Declaration",
      category: "COMPATIBILITY",
      severity: "LOW",
      description: "Workflow exported from Make, Zapier, or Flowise has no platform version recorded.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/CMP-024",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.platform === "N8N") return [];
        if (ast.platformVersion) return [];
        return [{
          id: "CMP-024-workflow", ruleId: "CMP-024",
          ruleName: "Missing Platform Version Declaration",
          severity: "LOW", category: "COMPATIBILITY",
          location: {},
          evidence: { summary: `${ast.platform} workflow with no version`, detail: `${ast.platform} workflow has no platform version recorded — compatibility cannot be verified.` },
          humanExplanation: "Without a platform version, FlowIntel cannot warn about deprecated modules or breaking changes in the export format.",
          suggestedFix: "Re-export the workflow from the latest version of the platform to include version metadata.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-024", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "CMP-025",
      name: "Anthropic Claude Model Deprecated",
      category: "COMPATIBILITY",
      severity: "CRITICAL",
      description: "Workflow uses a Claude model version that has been retired by Anthropic.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 25,
      docReference: "https://flowintel.io/rules/CMP-025",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const RETIRED = new Set(["claude-instant-1","claude-instant-1.1","claude-1","claude-1.3","claude-2.0"]);
        for (const node of ast.nodes) {
          const model = String((node.parameters as Record<string, unknown>)?.model ?? "");
          if (model && RETIRED.has(model)) {
            findings.push({
              id: fid("CMP-025", node.id), ruleId: "CMP-025",
              ruleName: "Anthropic Claude Model Deprecated",
              severity: "CRITICAL", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Retired model: "${model}"`, detail: `"${node.name}" uses Anthropic model "${model}" which has been retired.` },
              humanExplanation: "Retired Anthropic models return API errors. The workflow will fail at this node.",
              suggestedFix: `Replace "${model}" with claude-3-5-sonnet-20241022 or claude-3-haiku-20240307.`,
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/CMP-025", penaltyPoints: 25,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-026",
      name: "Facebook Graph API Version Outdated",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Workflow targets an old Facebook Graph API version that will be deprecated.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-026",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = ps(node);
          const m = s.match(/graph\.facebook\.com\/v(\d+)\./);
          if (m && parseInt(m[1]!) < 18) {
            findings.push({
              id: fid("CMP-026", node.id), ruleId: "CMP-026",
              ruleName: "Facebook Graph API Version Outdated",
              severity: "HIGH", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Graph API v${m[1]}`, detail: `"${node.name}" calls Facebook Graph API v${m[1]} — Meta retires versions every 2 years.` },
              humanExplanation: "Meta regularly retires Graph API versions. Using an old version breaks when it is sunset.",
              suggestedFix: "Upgrade to the current Graph API version (v19.0+) and review the migration changelog.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-026", penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-027",
      name: "Workflow Uses Removed n8n Built-in Variable",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Expression references a built-in n8n variable removed in v1.x ($execution.data).",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 18,
      docReference: "https://flowintel.io/rules/CMP-027",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const REMOVED = [
          { pattern: /\$execution\.data\b/, name: "$execution.data", replacement: "$input.all()" },
          { pattern: /\$binary\b/, name: "$binary", replacement: "$input.item.binary" },
          { pattern: /\$position\b/, name: "$position", replacement: "$itemIndex" },
        ];
        for (const node of ast.nodes) {
          const s = ps(node);
          for (const { pattern, name, replacement } of REMOVED) {
            if (pattern.test(s)) {
              findings.push({
                id: fid("CMP-027", node.id) + "-" + name,
                ruleId: "CMP-027", ruleName: "Workflow Uses Removed n8n Built-in Variable",
                severity: "HIGH", category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: { summary: `Removed variable: ${name}`, detail: `"${node.name}" uses ${name} which was removed. Use ${replacement} instead.` },
                humanExplanation: `${name} was removed in n8n v1.x. Expressions using it will throw errors on modern instances.`,
                suggestedFix: `Replace ${name} with ${replacement} in "${node.name}".`,
                marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-027", penaltyPoints: 18,
              });
              break;
            }
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-028",
      name: "Credential Type Not Available in Cloud",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "Workflow uses a credential type only available in self-hosted n8n, not n8n Cloud.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CMP-028",
      detect(ast: ParsedWorkflow): Finding[] {
        const SELF_HOSTED_ONLY = new Set(["sshPrivateKey","ftpCredentials","sftpCredentials","awsCredentials"]);
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const creds = node.credentials as Record<string, { type?: string }> | undefined;
          if (!creds) continue;
          for (const cred of Object.values(creds)) {
            if (cred.type && SELF_HOSTED_ONLY.has(cred.type)) {
              findings.push({
                id: fid("CMP-028", node.id), ruleId: "CMP-028",
                ruleName: "Credential Type Not Available in Cloud",
                severity: "MEDIUM", category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: { summary: `Self-hosted-only credential: ${cred.type}`, detail: `"${node.name}" uses ${cred.type} which may not be available on n8n Cloud instances.` },
                humanExplanation: "Some credential types are restricted to self-hosted n8n. Publishing to the marketplace may confuse Cloud users.",
                suggestedFix: "Document that this workflow requires a self-hosted n8n instance, or provide an alternative Cloud-compatible approach.",
                marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-028", penaltyPoints: 10,
              });
            }
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-029",
      name: "Execute Command Node Disabled in Cloud",
      category: "COMPATIBILITY",
      severity: "CRITICAL",
      description: "Execute Command node is blocked on n8n Cloud — workflow will not run there.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 25,
      docReference: "https://flowintel.io/rules/CMP-029",
      detect(ast: ParsedWorkflow): Finding[] {
        return ast.nodes
          .filter((n) => n.type === "n8n-nodes-base.executeCommand")
          .map((node) => ({
            id: fid("CMP-029", node.id), ruleId: "CMP-029",
            ruleName: "Execute Command Node Disabled in Cloud",
            severity: "CRITICAL" as const, category: "COMPATIBILITY" as const,
            location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
            evidence: { summary: "Execute Command node present", detail: `"${node.name}" uses Execute Command which is blocked on n8n Cloud for security reasons.` },
            humanExplanation: "n8n Cloud blocks the Execute Command node. Workflows using it will fail for all Cloud users.",
            suggestedFix: "Replace Execute Command with a dedicated node (HTTP Request, Code, or a native service node) or document that self-hosted n8n is required.",
            marketplaceBlocking: true, docReference: "https://flowintel.io/rules/CMP-029", penaltyPoints: 25,
          }));
      },
    },

    {
      id: "CMP-030",
      name: "Workflow Schema Version Mismatch",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "Workflow JSON uses an older schema version that may not import cleanly into current n8n.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CMP-030",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string, unknown> | undefined;
        const schemaVersion = Number(meta?.schemaVersion ?? 0);
        if (schemaVersion === 0 || schemaVersion >= 2) return [];
        return [{
          id: "CMP-030-workflow", ruleId: "CMP-030",
          ruleName: "Workflow Schema Version Mismatch",
          severity: "MEDIUM", category: "COMPATIBILITY",
          location: {},
          evidence: { summary: `Schema version ${schemaVersion}`, detail: `Workflow uses schema version ${schemaVersion}. Current n8n expects schema version 2.` },
          humanExplanation: "Importing an old schema version into a new n8n instance may fail validation or silently lose fields.",
          suggestedFix: "Re-export the workflow from a current n8n instance to update the schema version.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-030", penaltyPoints: 10,
        }];
      },
    },
  ],
};
