/**
 * FlowIntel Documentation Extension — DOC-004 to DOC-015
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }

export const DOCUMENTATION_EXT: RulePackManifest = {
  id: "flowintel-documentation-ext",
  name: "FlowIntel Documentation Extension",
  version: "2.0.0",
  description: "DOC-004 through DOC-015: README, env vars, credentials, setup, troubleshooting.",
  rules: [
    {
      id: "DOC-004",
      name: "Missing Required Credentials List",
      category: "DOCUMENTATION",
      severity: "HIGH",
      description: "Workflow uses credentials but does not document which credentials are required to run it.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/DOC-004",
      detect(ast: ParsedWorkflow): Finding[] {
        const credTypes = new Set<string>();
        for (const node of ast.nodes) {
          const creds = node.credentials as Record<string, { type?: string }> | undefined;
          if (creds) for (const c of Object.values(creds)) if (c.type) credTypes.add(c.type);
        }
        if (credTypes.size === 0) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasCreds = meta?.requiredCredentials || meta?.credentials || (meta?.setup as Record<string,unknown> | undefined)?.credentials;
        if (hasCreds) return [];
        return [{
          id: "DOC-004-workflow", ruleId: "DOC-004",
          ruleName: "Missing Required Credentials List",
          severity: "HIGH", category: "DOCUMENTATION",
          location: {},
          evidence: { summary: `${credTypes.size} credential type(s) undocumented`, detail: `Workflow uses [${[...credTypes].join(", ")}] but does not list required credentials.` },
          humanExplanation: "Without a credentials list, users importing this workflow have no idea what API accounts they need to set up before running it.",
          suggestedFix: `Add a requiredCredentials list to workflow metadata: ${[...credTypes].map(c => `"${c}"`).join(", ")}.`,
          marketplaceBlocking: true, docReference: "https://flowintel.io/rules/DOC-004", penaltyPoints: 15,
        }];
      },
    },

    {
      id: "DOC-005",
      name: "Missing Environment Variable Documentation",
      category: "DOCUMENTATION",
      severity: "HIGH",
      description: "Workflow uses $env variables but does not document what values are required.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/DOC-005",
      detect(ast: ParsedWorkflow): Finding[] {
        const envVars = new Set<string>();
        for (const node of ast.nodes) {
          const s = JSON.stringify(node.parameters ?? {});
          for (const m of s.matchAll(/\$env\.([A-Z_][A-Z0-9_]*)/g)) envVars.add(m[1]!);
        }
        if (envVars.size === 0) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasEnvDoc = meta?.environmentVariables || meta?.envVars || (meta?.setup as Record<string,unknown> | undefined)?.envVars;
        if (hasEnvDoc) return [];
        return [{
          id: "DOC-005-workflow", ruleId: "DOC-005",
          ruleName: "Missing Environment Variable Documentation",
          severity: "HIGH", category: "DOCUMENTATION",
          location: {},
          evidence: { summary: `Undocumented env vars: ${[...envVars].join(", ")}`, detail: `Workflow references $env.[${[...envVars].join(", ")}] with no setup documentation.` },
          humanExplanation: "Users who import this workflow will not know which environment variables to configure, causing immediate execution failures.",
          suggestedFix: `Add environmentVariables to workflow metadata: ${[...envVars].map(v => `${v}: "description"`).join(", ")}.`,
          marketplaceBlocking: true, docReference: "https://flowintel.io/rules/DOC-005", penaltyPoints: 15,
        }];
      },
    },

    {
      id: "DOC-006",
      name: "Missing Trigger Documentation",
      category: "DOCUMENTATION",
      severity: "MEDIUM",
      description: "Workflow trigger is not documented — users don't know how to activate it.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/DOC-006",
      detect(ast: ParsedWorkflow): Finding[] {
        const trigger = ast.nodes.find((n) => n.isTrigger);
        if (!trigger) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasTriggerDoc = meta?.triggerDescription || meta?.howToRun || meta?.activation;
        if (hasTriggerDoc) return [];
        return [{
          id: fid("DOC-006", trigger.id), ruleId: "DOC-006",
          ruleName: "Missing Trigger Documentation",
          severity: "MEDIUM", category: "DOCUMENTATION",
          location: { nodeId: trigger.id, nodeName: trigger.name, nodeType: trigger.type },
          evidence: { summary: "No trigger documentation", detail: `Trigger "${trigger.name}" (${trigger.type}) is not documented — users don't know how to activate the workflow.` },
          humanExplanation: "Without trigger documentation, users importing the workflow cannot determine how to start it.",
          suggestedFix: "Add a triggerDescription field to metadata: 'Triggered by a Stripe webhook when a payment succeeds.'",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/DOC-006", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "DOC-007",
      name: "Missing Test Instructions",
      category: "DOCUMENTATION",
      severity: "MEDIUM",
      description: "Workflow has no test instructions — users cannot verify it works after setup.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/DOC-007",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.nodes.length < 5) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasTest = meta?.testInstructions || meta?.howToTest || meta?.testing || meta?.verification;
        if (hasTest) return [];
        return [{
          id: "DOC-007-workflow", ruleId: "DOC-007",
          ruleName: "Missing Test Instructions",
          severity: "MEDIUM", category: "DOCUMENTATION",
          location: {},
          evidence: { summary: "No test instructions in metadata", detail: "Workflow has no instructions for how to verify it is working correctly after setup." },
          humanExplanation: "Without test instructions, users cannot confirm their setup is correct and may spend hours debugging a misconfigured credential.",
          suggestedFix: "Add testInstructions to metadata: 'Send a POST to /webhook/my-path with payload {\"test\":true} and verify you receive a Slack message.'",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/DOC-007", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "DOC-008",
      name: "Missing Troubleshooting Notes",
      category: "DOCUMENTATION",
      severity: "LOW",
      description: "Complex workflow has no troubleshooting guidance for common failure modes.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/DOC-008",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.nodes.length < 10) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasTroubleshoot = meta?.troubleshooting || meta?.commonIssues || meta?.faq;
        if (hasTroubleshoot) return [];
        return [{
          id: "DOC-008-workflow", ruleId: "DOC-008",
          ruleName: "Missing Troubleshooting Notes",
          severity: "LOW", category: "DOCUMENTATION",
          location: {},
          evidence: { summary: "No troubleshooting section", detail: `Complex workflow (${ast.nodes.length} nodes) has no troubleshooting guidance.` },
          humanExplanation: "Complex workflows have many failure modes. Without troubleshooting notes, users raise support requests for issues that have known solutions.",
          suggestedFix: "Add a troubleshooting section listing the top 3 common errors and their solutions.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/DOC-008", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "DOC-009",
      name: "Missing Workflow Version in Documentation",
      category: "DOCUMENTATION",
      severity: "LOW",
      description: "Workflow documentation does not include a version number for tracking updates.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/DOC-009",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasVersion = meta?.version || meta?.workflowVersion || meta?.semver;
        if (hasVersion) return [];
        return [{
          id: "DOC-009-workflow", ruleId: "DOC-009",
          ruleName: "Missing Workflow Version in Documentation",
          severity: "LOW", category: "DOCUMENTATION",
          location: {},
          evidence: { summary: "No version in metadata", detail: "Workflow has no version number — users cannot tell which version they are running." },
          humanExplanation: "Without a version number, users cannot determine if they have the latest version or communicate which version has a bug.",
          suggestedFix: "Add version: '1.0.0' to workflow metadata and increment it with each meaningful change.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/DOC-009", penaltyPoints: 3,
        }];
      },
    },

    {
      id: "DOC-010",
      name: "Missing Expected Input Schema Documentation",
      category: "DOCUMENTATION",
      severity: "MEDIUM",
      description: "Webhook or trigger workflow has no documentation of the expected input payload schema.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/DOC-010",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasWebhook = ast.nodes.some((n) => n.type === "n8n-nodes-base.webhook");
        if (!hasWebhook) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasSchema = meta?.inputSchema || meta?.payloadSchema || meta?.requestBody || meta?.examplePayload;
        if (hasSchema) return [];
        return [{
          id: "DOC-010-workflow", ruleId: "DOC-010",
          ruleName: "Missing Expected Input Schema Documentation",
          severity: "MEDIUM", category: "DOCUMENTATION",
          location: {},
          evidence: { summary: "Webhook with no input schema doc", detail: "Webhook workflow has no documentation of its expected input payload structure." },
          humanExplanation: "Without an input schema, integrators cannot build correct payloads and will fail on first try.",
          suggestedFix: "Add an inputSchema or examplePayload to workflow metadata showing the required JSON structure.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/DOC-010", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "DOC-011",
      name: "Missing Expected Output Schema Documentation",
      category: "DOCUMENTATION",
      severity: "LOW",
      description: "Webhook workflow does not document what it returns to callers.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/DOC-011",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasWebhookResp = ast.nodes.some((n) => n.type === "n8n-nodes-base.respondToWebhook");
        if (!hasWebhookResp) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasOutputDoc = meta?.outputSchema || meta?.responseSchema || meta?.exampleResponse;
        if (hasOutputDoc) return [];
        return [{
          id: "DOC-011-workflow", ruleId: "DOC-011",
          ruleName: "Missing Expected Output Schema Documentation",
          severity: "LOW", category: "DOCUMENTATION",
          location: {},
          evidence: { summary: "No response schema documented", detail: "Workflow returns a webhook response but does not document its structure." },
          humanExplanation: "Without response documentation, callers cannot know what fields to expect and must reverse-engineer the response.",
          suggestedFix: "Add an exampleResponse or responseSchema to workflow metadata.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/DOC-011", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "DOC-012",
      name: "Missing Support Contact Information",
      category: "DOCUMENTATION",
      severity: "LOW",
      description: "Published workflow has no support contact or issue tracker URL.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/DOC-012",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasSupport = meta?.supportUrl || meta?.issueTracker || meta?.contact || meta?.supportEmail;
        if (hasSupport) return [];
        return [{
          id: "DOC-012-workflow", ruleId: "DOC-012",
          ruleName: "Missing Support Contact Information",
          severity: "LOW", category: "DOCUMENTATION",
          location: {},
          evidence: { summary: "No support contact in metadata", detail: "Workflow has no support URL or contact — users with issues have no escalation path." },
          humanExplanation: "Without a support contact, users who encounter problems have nowhere to turn and may leave negative reviews or abandon the workflow.",
          suggestedFix: "Add supportUrl or contact to workflow metadata pointing to a GitHub Issues page or support email.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/DOC-012", penaltyPoints: 3,
        }];
      },
    },

    {
      id: "DOC-013",
      name: "Missing Dependencies / Community Nodes List",
      category: "DOCUMENTATION",
      severity: "HIGH",
      description: "Workflow uses community nodes but doesn't list them as required dependencies.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/DOC-013",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.platform !== "N8N") return []; // Community nodes logic currently only applies to n8n
        const communityNodes = ast.nodes
          .filter((n) => !n.type.startsWith("n8n-nodes-base.") && !n.type.startsWith("@n8n/"))
          .map((n) => n.type);
        if (communityNodes.length === 0) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasDeps = meta?.dependencies || meta?.requiredNodes || meta?.communityNodes;
        if (hasDeps) return [];
        const unique = [...new Set(communityNodes)];
        return [{
          id: "DOC-013-workflow", ruleId: "DOC-013",
          ruleName: "Missing Dependencies / Community Nodes List",
          severity: "HIGH", category: "DOCUMENTATION",
          location: {},
          evidence: { summary: `${unique.length} undocumented community node(s)`, detail: `Workflow uses community nodes [${unique.join(", ")}] with no installation instructions.` },
          humanExplanation: "Users who import this workflow will see errors for missing node types unless they know which community packages to install first.",
          suggestedFix: `Add dependencies to metadata: ${unique.map(n => `"${n}"`).join(", ")} and include installation instructions.`,
          marketplaceBlocking: true, docReference: "https://flowintel.io/rules/DOC-013", penaltyPoints: 15,
        }];
      },
    },

    {
      id: "DOC-014",
      name: "Missing Use Case / Business Purpose Statement",
      category: "DOCUMENTATION",
      severity: "LOW",
      description: "Workflow has no description of the business problem it solves.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/DOC-014",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasUseCase = meta?.useCase || meta?.businessPurpose || meta?.problemSolved || meta?.description;
        if (hasUseCase) return [];
        if (ast.nodes.length < 4) return [];
        return [{
          id: "DOC-014-workflow", ruleId: "DOC-014",
          ruleName: "Missing Use Case / Business Purpose Statement",
          severity: "LOW", category: "DOCUMENTATION",
          location: {},
          evidence: { summary: "No use case description", detail: "Workflow has no description of what business problem it solves." },
          humanExplanation: "Without a use case statement, potential users cannot determine if the workflow is relevant to their needs.",
          suggestedFix: "Add a description or useCase field to metadata: 'Automatically syncs new Stripe customers to HubSpot CRM.'",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/DOC-014", penaltyPoints: 3,
        }];
      },
    },

    {
      id: "DOC-015",
      name: "Missing License Declaration",
      category: "DOCUMENTATION",
      severity: "LOW",
      description: "Workflow published to marketplace has no license declaration.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/DOC-015",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasLicense = meta?.license || meta?.licenseUrl || meta?.spdx;
        if (hasLicense) return [];
        return [{
          id: "DOC-015-workflow", ruleId: "DOC-015",
          ruleName: "Missing License Declaration",
          severity: "LOW", category: "DOCUMENTATION",
          location: {},
          evidence: { summary: "No license in metadata", detail: "Workflow has no license declaration — users cannot determine if they are allowed to modify or redistribute it." },
          humanExplanation: "Without a license, the default is all-rights-reserved, which restricts how users can legally use the workflow.",
          suggestedFix: "Add license: 'MIT' or license: 'CC-BY-4.0' to workflow metadata.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/DOC-015", penaltyPoints: 3,
        }];
      },
    },
  ],
};
