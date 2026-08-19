/**
 * FlowIntel Compatibility Extension B — CMP-017 to CMP-041
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string, sfx?: string) { return [r, n, sfx].filter(Boolean).join("-"); }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

export const COMPATIBILITY_EXT_B: RulePackManifest = {
  id: "flowintel-compatibility-ext-b",
  name: "FlowIntel Compatibility Extension B",
  version: "2.0.0",
  description: "CMP-017 through CMP-041: webhook URL changes, credential schema drift, platform migration, and multi-platform compatibility.",
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
            suggestedFix: "For Cloud compatibility: replace Execute Command with HTTP Request, Code node, or a native service integration. " +
              "If this workflow is intentionally self-hosted-only, add `selfHostedOnly: true` to workflow metadata and document Cloud incompatibility clearly for marketplace users.",
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

    {
      id: "CMP-031",
      name: "Power Automate — Office 365 Outlook REST v2 Deprecated Connector",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Power Automate workflow uses deprecated Office 365 Outlook REST API v2 endpoints (outlook.office.com/api/v2.0), which have been decommissioned.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-031",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          for (const node of ast.nodes) {
            const s = ps(node);
            const url = String(node.httpMeta?.url ?? "");
            if (!s.includes("outlook.") && !url.includes("outlook.")) continue;

            if (s.includes("outlook.office.com/api/v2.0") || s.includes("outlook.office365.com/api/v2.0") || url.includes("outlook.office.com/api/v2.0")) {
              findings.push({
                id: fid("CMP-031", node.id),
                ruleId: "CMP-031",
                ruleName: "Power Automate — Office 365 Outlook REST v2 Deprecated Connector",
                severity: "HIGH",
                category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: "Deprecated Outlook REST API v2 endpoint used",
                  detail: `"${node.name}" calls decommissioned Outlook REST v2 API (outlook.office.com/api/v2.0).`,
                },
                humanExplanation: "Microsoft decommissioned the Outlook REST API v2. Workflows calling this endpoint receive HTTP 410 Gone or authentication errors.",
                suggestedFix: "Migrate to Microsoft Graph API (graph.microsoft.com/v1.0/me/messages) or use the modern Office 365 Outlook connector.",
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/CMP-031",
                penaltyPoints: 15,
              });
            }
          }
        } catch {
          // Safe guard against malformed AST
        }
        return findings;
      },
    },

    {
      id: "CMP-032",
      name: "Power Automate — Hardcoded Connection Instead of Connection Reference",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "Power Automate action references a hardcoded environment connection (/subscriptions/.../connections/) instead of a solution Connection Reference, breaking ALM.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CMP-032",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          for (const node of ast.nodes) {
            const s = ps(node);
            if (!s.includes("/subscriptions/") && !s.includes("/providers/Microsoft.")) continue;

            if (/\/subscriptions\/[a-f0-9-]+\/.*\/connections\//i.test(s) ||
                /\/providers\/Microsoft\.PowerApps\/apis\/.*\/connections\//i.test(s) ||
                /\/subscriptions\/[^\/]+\/resourceGroups\/[^\/]+\/providers\/Microsoft\.Web\/connections\//i.test(s)) {
              findings.push({
                id: fid("CMP-032", node.id),
                ruleId: "CMP-032",
                ruleName: "Power Automate — Hardcoded Connection Instead of Connection Reference",
                severity: "MEDIUM",
                category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: "Hardcoded connection ID detected in Power Automate action",
                  detail: `"${node.name}" binds directly to a subscription-specific connection ID instead of using a Connection Reference parameter.`,
                },
                humanExplanation: "Hardcoded connection IDs bind workflows to a specific Power Automate environment. Exporting and deploying across dev/test/prod environments will fail.",
                suggestedFix: "Convert the connection to a solution Connection Reference in Power Automate before exporting the flow.",
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/CMP-032",
                penaltyPoints: 10,
              });
            }
          }
        } catch {
          // Safe guard against malformed AST
        }
        return findings;
      },
    },

    {
      id: "CMP-033",
      name: "LangFlow — Deprecated LangChain Component",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "LangFlow workflow uses deprecated legacy LangChain chain components (RetrievalQAChain, LLMChain, ConversationChain) removed in modern LangChain versions.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-033",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          const DEPRECATED_CHAINS = ["RetrievalQAChain", "LLMChain", "ConversationChain", "StuffDocumentsChain", "MapReduceDocumentsChain"];
          for (const node of ast.nodes) {
            const s = ps(node);
            const t = node.type;
            const matched = DEPRECATED_CHAINS.find((chain) =>
              t.toLowerCase().includes(chain.toLowerCase()) ||
              node.name.toLowerCase().includes(chain.toLowerCase()) ||
              s.includes(chain)
            );

            if (matched) {
              findings.push({
                id: fid("CMP-033", node.id),
                ruleId: "CMP-033",
                ruleName: "LangFlow — Deprecated LangChain Component",
                severity: "HIGH",
                category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: `Deprecated LangChain component used: ${matched}`,
                  detail: `"${node.name}" uses deprecated component "${matched}". Modern LangChain and LangFlow 1.0+ replace legacy chains with LCEL / Agent components.`,
                },
                humanExplanation: "Legacy LangChain Chains (RetrievalQAChain, LLMChain, ConversationChain) are deprecated in LangChain 0.2+ and removed in LangChain 0.3+ / modern LangFlow.",
                suggestedFix: "Migrate from legacy Chains to LangChain Expression Language (LCEL) or modern LangFlow 1.0 Agent/Tool components.",
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/CMP-033",
                penaltyPoints: 15,
              });
            }
          }
        } catch {
          // Safe guard against malformed AST
        }
        return findings;
      },
    },

    {
      id: "CMP-034",
      name: "Dify — Dangling Context Variable Reference",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Dify workflow references a context variable ({{#node_id.var#}}) pointing to a node ID that does not exist in the workflow graph.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 18,
      docReference: "https://flowintel.io/rules/CMP-034",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          const validNodeIds = new Set(ast.nodes.map((n) => n.id));
          const BUILTIN_NAMESPACES = new Set(["sys", "env", "conversation", "input", "context", "start", "workflow"]);

          for (const node of ast.nodes) {
            const s = ps(node);
            if (!s.includes("{{#")) continue;

            const varRegex = /\{\{#([a-zA-Z0-9_\-]+)(?:\.([a-zA-Z0-9_\-]+))?#\}\}/g;
            let match: RegExpExecArray | null;
            while ((match = varRegex.exec(s)) !== null) {
              const targetNodeId = match[1]!;
              if (!BUILTIN_NAMESPACES.has(targetNodeId.toLowerCase()) && !validNodeIds.has(targetNodeId)) {
                findings.push({
                  id: fid("CMP-034", node.id, targetNodeId),
                  ruleId: "CMP-034",
                  ruleName: "Dify — Dangling Context Variable Reference",
                  severity: "HIGH",
                  category: "COMPATIBILITY",
                  location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                  evidence: {
                    summary: `Dangling variable reference to nonexistent node ID: {{#${targetNodeId}#}}`,
                    detail: `"${node.name}" references output variable "{{#${targetNodeId}.${match[2] ?? ""}#}}" from node ID "${targetNodeId}", which does not exist in the workflow graph.`,
                  },
                  humanExplanation: "Referencing deleted or nonexistent node IDs in Dify context variables causes runtime execution failures and undefined variable exceptions.",
                  suggestedFix: `Update variable selector in "${node.name}" to reference a valid upstream node ID in the graph.`,
                  marketplaceBlocking: false,
                  docReference: "https://flowintel.io/rules/CMP-034",
                  penaltyPoints: 18,
                });
              }
            }
          }
        } catch {
          // Safe guard against malformed AST
        }
        return findings;
      },
    },

    {
      id: "CMP-035",
      name: "CrewAI — Missing expected_output in Task",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "CrewAI task definition lacks an expected_output specification, leading to unpredictable agent termination and hallucinated outputs.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-035",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          for (const node of ast.nodes) {
            const isCrewTask =
              node.type.startsWith("crewai.task") ||
              node.type === "crewai.task" ||
              (ast.platform === "CREWAI" && node.id.startsWith("task_"));

            if (!isCrewTask) continue;

            const p = (node.parameters ?? {}) as Record<string, unknown>;
            const expOut = p.expected_output;
            const hasExpectedOutput = typeof expOut === "string" && expOut.trim().length > 0;

            if (!hasExpectedOutput) {
              findings.push({
                id: fid("CMP-035", node.id),
                ruleId: "CMP-035",
                ruleName: "CrewAI — Missing expected_output in Task",
                severity: "HIGH",
                category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: "CrewAI task lacks expected_output parameter",
                  detail: `Task "${node.name}" is defined without an expected_output field. In CrewAI v0.28+, expected_output is mandatory for reliable task completion.`,
                },
                humanExplanation: "CrewAI tasks without expected_output cannot accurately evaluate completion criteria, leading to infinite agent loops or incomplete responses.",
                suggestedFix: `Add a clear 'expected_output' string describing the required deliverable format to task "${node.name}".`,
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/CMP-035",
                penaltyPoints: 15,
              });
            }
          }
        } catch {
          // Safe guard against malformed AST
        }
        return findings;
      },
    },

    {
      id: "CMP-036",
      name: "CrewAI — Hierarchical Process Missing Manager LLM or Agent",
      category: "COMPATIBILITY",
      severity: "CRITICAL",
      description: "CrewAI crew configured with process: 'hierarchical' does not specify a manager_llm or manager_agent, causing execution to crash at runtime.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/CMP-036",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          const meta = (ast.metadata ?? {}) as Record<string, unknown>;
          const rawJson = (ast.rawJson ?? {}) as Record<string, unknown>;
          const crewObj = (rawJson.crew ?? rawJson) as Record<string, unknown>;

          const isHierarchical =
            meta.process === "hierarchical" ||
            crewObj.process === "hierarchical" ||
            ast.nodes.some((n) => ps(n).includes('"process":"hierarchical"'));

          if (!isHierarchical) return [];

          const hasManager =
            meta.manager_llm ||
            meta.manager_agent ||
            crewObj.manager_llm ||
            crewObj.manager_agent ||
            ast.nodes.some((n) => n.id.includes("manager") || n.type.includes("manager") || ps(n).includes("manager_llm") || ps(n).includes("manager_agent"));

          if (!hasManager) {
            findings.push({
              id: fid("CMP-036", "crew-process"),
              ruleId: "CMP-036",
              ruleName: "CrewAI — Hierarchical Process Missing Manager LLM or Agent",
              severity: "CRITICAL",
              category: "COMPATIBILITY",
              location: {},
              evidence: {
                summary: "Hierarchical process without manager_llm or manager_agent",
                detail: "Crew is configured with process='hierarchical' but neither manager_llm nor manager_agent is defined.",
              },
              humanExplanation: "In CrewAI, hierarchical process requires a manager LLM or custom manager agent to orchestrate task delegation. Without one, execution fails immediately.",
              suggestedFix: "Set `manager_llm: 'gpt-4o'` or specify a `manager_agent` in your Crew definition.",
              marketplaceBlocking: true,
              docReference: "https://flowintel.io/rules/CMP-036",
              penaltyPoints: 20,
            });
          }
        } catch {
          // Safe guard against malformed AST
        }
        return findings;
      },
    },

    {
      id: "CMP-037",
      name: "AutoGen — Legacy 0.2 Config Incompatible with 0.4+",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "AutoGen configuration uses legacy 0.2 syntax (UserProxyAgent/AssistantAgent with use_docker, llm_config.config_list) incompatible with AutoGen 0.4+ architecture.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-037",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          const isAutoGen = ast.platform === "AUTOGEN" || ast.nodes.some((n) => n.type.startsWith("autogen."));
          if (!isAutoGen) return [];

          for (const node of ast.nodes) {
            const s = ps(node);
            const hasLegacyConfig =
              /use_docker|config_list|human_input_mode|max_consecutive_auto_reply/i.test(s);

            if (hasLegacyConfig) {
              findings.push({
                id: fid("CMP-037", node.id),
                ruleId: "CMP-037",
                ruleName: "AutoGen — Legacy 0.2 Config Incompatible with 0.4+",
                severity: "HIGH",
                category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: "Legacy AutoGen 0.2 configuration pattern detected",
                  detail: `"${node.name}" uses AutoGen 0.2 syntax (use_docker, config_list, or human_input_mode) which is incompatible with the rebuilt AutoGen 0.4+ asynchronous architecture.`,
                },
                humanExplanation: "AutoGen 0.4 completely redesigned the framework around asynchronous message agents and event-driven architecture, deprecating 0.2 config_list structures.",
                suggestedFix: "Migrate AutoGen configuration to 0.4+ syntax using autogen_agentchat and modern ModelClient definitions.",
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/CMP-037",
                penaltyPoints: 15,
              });
            }
          }
        } catch {
          // Safe guard against malformed AST
        }
        return findings;
      },
    },

    {
      id: "CMP-038",
      name: "Pipedream — Legacy Step Missing defineComponent",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "Pipedream custom code step does not use the modern defineComponent() wrapper, causing deprecation warnings and missing state features.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CMP-038",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          for (const node of ast.nodes) {
            const isPipedreamCode =
              (ast.platform === "PIPEDREAM" || node.type.startsWith("pipedream.step")) &&
              node.isCode;

            if (!isPipedreamCode) continue;

            const codeSnippet = node.codeMeta?.codeSnippet ?? ps(node);
            const language = node.codeMeta?.language ?? "javascript";

            if (language === "python") continue;

            if (!codeSnippet.includes("defineComponent")) {
              findings.push({
                id: fid("CMP-038", node.id),
                ruleId: "CMP-038",
                ruleName: "Pipedream — Legacy Step Missing defineComponent",
                severity: "MEDIUM",
                category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: "Pipedream Node.js code step does not use defineComponent()",
                  detail: `"${node.name}" uses legacy script syntax instead of export default defineComponent({ async run({ steps, $ }) { ... } }).`,
                },
                humanExplanation: "Pipedream components require defineComponent() to support props, $.service.db state persistence, and modern lifecycle management.",
                suggestedFix: "Wrap your code step in export default defineComponent({ async run({ steps, $ }) { ... } }).",
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/CMP-038",
                penaltyPoints: 10,
              });
            }
          }
        } catch {
          // Safe guard against malformed AST
        }
        return findings;
      },
    },

    {
      id: "CMP-039",
      name: "Make — Legacy Integromat Domain Reference",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Make workflow contains references to legacy integromat.com webhook or API URLs, which will be decommissioned.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-039",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          for (const node of ast.nodes) {
            const s = ps(node);
            const url = String(node.httpMeta?.url ?? "");
            if (!s.includes("integromat.com") && !url.includes("integromat.com")) continue;

            if (s.includes("integromat.com") || url.includes("integromat.com")) {
              findings.push({
                id: fid("CMP-039", node.id),
                ruleId: "CMP-039",
                ruleName: "Make — Legacy Integromat Domain Reference",
                severity: "HIGH",
                category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: "Legacy integromat.com domain URL reference detected",
                  detail: `"${node.name}" references legacy domain integromat.com instead of make.com.`,
                },
                humanExplanation: "Celonis/Make is sunsetting legacy integromat.com domains and webhook endpoints. Requests to these domains will fail.",
                suggestedFix: "Update URLs and webhook endpoints from *.integromat.com to *.make.com.",
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/CMP-039",
                penaltyPoints: 15,
              });
            }
          }
        } catch {
          // Safe guard against malformed AST
        }
        return findings;
      },
    },

    {
      id: "CMP-040",
      name: "Cross-Platform — Deprecated AI Embedding Model",
      category: "COMPATIBILITY",
      severity: "CRITICAL",
      description: "Workflow uses a deprecated or shutdown AI model or embedding model (text-embedding-ada-002, gemini-1.0-pro, mistral-medium), causing execution errors.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 25,
      docReference: "https://flowintel.io/rules/CMP-040",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          const DEPRECATED_MODELS = [
            "text-embedding-ada-002",
            "gemini-1.0-pro",
            "gemini-1.0",
            "gemini-pro-vision",
            "mistral-medium",
          ];
          for (const node of ast.nodes) {
            const s = ps(node);
            const modelMeta = String(node.aiMeta?.model ?? "");
            if (!s.includes("text-embedding-ada-002") && !s.includes("gemini-1.0") && !s.includes("gemini-pro-vision") && !s.includes("mistral-medium") && !modelMeta.includes("text-embedding-ada-002") && !modelMeta.includes("gemini-1.0") && !modelMeta.includes("gemini-pro-vision") && !modelMeta.includes("mistral-medium")) continue;

            const matched = DEPRECATED_MODELS.find((m) =>
              modelMeta.toLowerCase() === m.toLowerCase() ||
              s.toLowerCase().includes(`"${m.toLowerCase()}"`) ||
              s.toLowerCase().includes(`'${m.toLowerCase()}'`) ||
              s.toLowerCase().includes(`:${m.toLowerCase()}`) ||
              s.toLowerCase().includes(`/${m.toLowerCase()}`)
            );

            if (matched) {
              findings.push({
                id: fid("CMP-040", node.id),
                ruleId: "CMP-040",
                ruleName: "Cross-Platform — Deprecated AI Embedding Model",
                severity: "CRITICAL",
                category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: `Deprecated AI model configured: ${matched}`,
                  detail: `"${node.name}" uses deprecated model "${matched}" which has been superseded or retired by the provider.`,
                },
                humanExplanation: "AI providers deprecate and shut down older models on announced timelines. Workflows using retired models will fail with API 404/400 errors.",
                suggestedFix: `Upgrade model "${matched}" to modern alternatives: text-embedding-3-small/large (for OpenAI embeddings), gemini-1.5-pro/flash (for Google), or mistral-large (for Mistral).`,
                marketplaceBlocking: true,
                docReference: "https://flowintel.io/rules/CMP-040",
                penaltyPoints: 25,
              });
            }
          }
        } catch {
          // Safe guard against malformed AST
        }
        return findings;
      },
    },

    {
      id: "CMP-041",
      name: "n8n — Deprecated $items() Expression",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "n8n workflow uses deprecated $items() expression syntax instead of modern $('NodeName').all() or $input.all().",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CMP-041",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          for (const node of ast.nodes) {
            const s = ps(node);
            const code = String(node.codeMeta?.codeSnippet ?? "");
            if (!s.includes("$items(") && !code.includes("$items(")) continue;

            if (/\$items\s*\(/i.test(s) || /\$items\s*\(/i.test(code)) {
              findings.push({
                id: fid("CMP-041", node.id),
                ruleId: "CMP-041",
                ruleName: "n8n — Deprecated $items() Expression",
                severity: "MEDIUM",
                category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: "Deprecated $items() expression syntax used",
                  detail: `"${node.name}" uses deprecated $items() syntax to access node execution items.`,
                },
                humanExplanation: "$items() was deprecated in n8n v0.198+ in favor of $('NodeName').all() or $input.all(), and is removed in newer n8n runtime environments.",
                suggestedFix: "Replace $items('NodeName') with $('NodeName').all() or $input.all().",
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/CMP-041",
                penaltyPoints: 10,
              });
            }
          }
        } catch {
          // Safe guard against malformed AST
        }
        return findings;
      },
    },
  ],
};
