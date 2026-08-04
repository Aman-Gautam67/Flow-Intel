/**
 * FlowIntel Maintainability Extension B — MNT-019 to MNT-030
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

export const MAINTAINABILITY_EXT_B: RulePackManifest = {
  id: "flowintel-maintainability-ext-b",
  name: "FlowIntel Maintainability Extension B",
  version: "2.0.0",
  description: "MNT-019 through MNT-030: coupling, testability, config, versioning, tech debt.",
  rules: [
    {
      id: "MNT-019",
      name: "Mixed Business Logic and Orchestration",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Single code node performs both data transformation and external API calls.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/MNT-019",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          const hasHttp = /fetch\s*\(|axios\.|http\.get|http\.post|require.*http/i.test(code);
          const hasTransform = /\.map\s*\(|\.filter\s*\(|\.reduce\s*\(|Object\.assign|JSON\.parse/i.test(code);
          if (hasHttp && hasTransform) {
            findings.push({
              id: fid("MNT-019", node.id), ruleId: "MNT-019",
              ruleName: "Mixed Business Logic and Orchestration",
              severity: "MEDIUM", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Code node does HTTP + data transformation", detail: `"${node.name}" mixes HTTP calls with data transformation — violates single-responsibility principle.` },
              humanExplanation: "Mixing I/O and transformation makes nodes impossible to unit-test and difficult to reason about.",
              suggestedFix: "Split into two nodes: one HTTP Request node for the API call, one Code node for the transformation.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-019", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-020",
      name: "No Sticky Notes in Complex Workflow",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Complex workflow (15+ nodes) has no sticky notes explaining sections.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/MNT-020",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.nodes.length < 15) return [];
        const hasStickyNotes = ast.nodes.some((n) =>
          n.type === "n8n-nodes-base.stickyNote" || n.type === "n8n-nodes-base.note"
        );
        if (hasStickyNotes) return [];
        return [{
          id: "MNT-020-workflow", ruleId: "MNT-020",
          ruleName: "No Sticky Notes in Complex Workflow",
          severity: "LOW", category: "MAINTAINABILITY",
          location: {},
          evidence: { summary: `${ast.nodes.length} nodes with no sticky notes`, detail: `Workflow has ${ast.nodes.length} nodes but no sticky notes to explain sections or non-obvious logic.` },
          humanExplanation: "Complex workflows without annotations require new maintainers to reverse-engineer intent from node names alone.",
          suggestedFix: "Add sticky notes to explain the purpose of each major section and any non-obvious design decisions.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-020", penaltyPoints: 3,
        }];
      },
    },

    {
      id: "MNT-021",
      name: "Workflow ID Not Pinned in Execute Workflow",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Execute Workflow node references sub-workflow by name instead of stable ID.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/MNT-021",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.executeWorkflow") continue;
          const pp = node.parameters as Record<string,unknown> | undefined;
          const hasId = pp?.workflowId || (pp?.calledWorkflowId);
          const hasName = pp?.workflowName && !hasId;
          if (hasName) {
            findings.push({
              id: fid("MNT-021", node.id), ruleId: "MNT-021",
              ruleName: "Workflow ID Not Pinned in Execute Workflow",
              severity: "MEDIUM", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Sub-workflow referenced by name not ID", detail: `"${node.name}" references a sub-workflow by name — renaming the sub-workflow will break this call.` },
              humanExplanation: "Name-based references break silently when the sub-workflow is renamed. ID-based references are stable.",
              suggestedFix: "Use the workflow ID (not name) in the Execute Workflow node.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-021", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-022",
      name: "Global Variable Used Without Documentation",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Workflow accesses $vars (n8n global variables) without documenting what they contain.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/MNT-022",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = ps(node);
          if (/\$vars\./i.test(s)) {
            const meta = ast.metadata as Record<string,unknown> | undefined;
            const hasVarDoc = meta?.variables || meta?.globalVars || meta?.varDocumentation;
            if (!hasVarDoc) {
              findings.push({
                id: fid("MNT-022", node.id), ruleId: "MNT-022",
                ruleName: "Global Variable Used Without Documentation",
                severity: "LOW", category: "MAINTAINABILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: { summary: "$vars referenced without documentation", detail: `"${node.name}" uses $vars but the workflow has no documentation of what global variables are required.` },
                humanExplanation: "Undocumented global variable dependencies make deployment to new environments impossible without reverse-engineering.",
                suggestedFix: "Add a sticky note or README section listing all required $vars with their expected values.",
                marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-022", penaltyPoints: 3,
              });
              break;
            }
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-023",
      name: "Inconsistent Naming Convention",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Node names mix camelCase, snake_case, and Title Case — inconsistent conventions.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/MNT-023",
      detect(ast: ParsedWorkflow): Finding[] {
        const names = ast.nodes.map((n) => n.name).filter((n) => n && n.length > 3);
        if (names.length < 5) return [];
        const camel = names.filter((n) => /^[a-z][A-Za-z0-9]+$/.test(n)).length;
        const snake = names.filter((n) => /^[a-z][a-z0-9_]+$/.test(n)).length;
        const title = names.filter((n) => /^[A-Z][A-Za-z0-9 ]+$/.test(n)).length;
        const styles = [camel, snake, title].filter((c) => c > 0).length;
        if (styles < 2) return [];
        return [{
          id: "MNT-023-workflow", ruleId: "MNT-023",
          ruleName: "Inconsistent Naming Convention",
          severity: "LOW", category: "MAINTAINABILITY",
          location: {},
          evidence: { summary: "Mixed naming styles detected", detail: `Node names use ${styles} different naming styles (camelCase: ${camel}, snake_case: ${snake}, Title Case: ${title}).` },
          humanExplanation: "Inconsistent naming conventions make workflows harder to scan and search. A consistent style aids readability.",
          suggestedFix: "Choose one naming convention (recommended: Title Case for n8n) and apply it to all node names.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-023", penaltyPoints: 3,
        }];
      },
    },

    {
      id: "MNT-024",
      name: "Missing Changelog Entry",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Workflow has no changelog or modification history.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/MNT-024",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasChangelog = meta?.changelog || meta?.history || meta?.changes || meta?.lastModified;
        if (hasChangelog) return [];
        if (ast.nodes.length < 5) return [];
        return [{
          id: "MNT-024-workflow", ruleId: "MNT-024",
          ruleName: "Missing Changelog Entry",
          severity: "LOW", category: "MAINTAINABILITY",
          location: {},
          evidence: { summary: "No changelog in workflow metadata", detail: "Workflow has no modification history — impossible to know what changed and when." },
          humanExplanation: "Without a changelog, debugging regressions requires reconstructing history from version snapshots.",
          suggestedFix: "Add a 'changelog' field to the workflow metadata or a sticky note with a brief modification log.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-024", penaltyPoints: 3,
        }];
      },
    },

    {
      id: "MNT-025",
      name: "Credential Type Mismatch Warning",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Node type suggests a specific credential type but the assigned credential uses a generic type.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/MNT-025",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const EXPECTED: Record<string, string> = {
          "n8n-nodes-base.slack": "slackApi",
          "n8n-nodes-base.github": "githubApi",
          "n8n-nodes-base.gmail": "googleApi",
          "n8n-nodes-base.stripe": "stripeApi",
          "n8n-nodes-base.postgres": "postgres",
          "n8n-nodes-base.mysql": "mySql",
        };
        for (const node of ast.nodes) {
          const expected = EXPECTED[node.type];
          if (!expected) continue;
          const creds = node.credentials as Record<string, {type?: string}> | undefined;
          if (!creds) continue;
          const usedType = Object.values(creds)[0]?.type ?? "";
          if (usedType && !usedType.toLowerCase().includes(expected.toLowerCase())) {
            findings.push({
              id: fid("MNT-025", node.id), ruleId: "MNT-025",
              ruleName: "Credential Type Mismatch Warning",
              severity: "MEDIUM", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Expected "${expected}", found "${usedType}"`, detail: `"${node.name}" uses credential type "${usedType}" but expected "${expected}" for ${node.type}.` },
              humanExplanation: "Wrong credential types may silently authenticate with insufficient scopes or fail on first execution.",
              suggestedFix: `Verify "${node.name}" uses the correct credential type: ${expected}.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-025", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-026",
      name: "Todo/Fixme Comment in Code Node",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Code node contains TODO or FIXME comments — unresolved work.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/MNT-026",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          if (/\/\/\s*(TODO|FIXME|HACK|XXX|BUG)\b/i.test(code)) {
            const matches = code.match(/\/\/\s*(TODO|FIXME|HACK|XXX|BUG).*/gi) ?? [];
            findings.push({
              id: fid("MNT-026", node.id), ruleId: "MNT-026",
              ruleName: "Todo/Fixme Comment in Code Node",
              severity: "LOW", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `${matches.length} TODO/FIXME comment(s)`, value: matches[0]?.slice(0, 80), detail: `"${node.name}" has ${matches.length} unresolved TODO/FIXME comment(s).` },
              humanExplanation: "TODOs in production code signal incomplete work. They accumulate silently and are rarely addressed.",
              suggestedFix: "Resolve the TODO/FIXME or track it in an issue tracker. Remove the comment from production code.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-026", penaltyPoints: 3,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-027",
      name: "Same External Service Called Via Multiple Node Types",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Same external service is accessed via both HTTP Request and native integration node.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/MNT-027",
      detect(ast: ParsedWorkflow): Finding[] {
        const SERVICE_DOMAINS: Record<string, string> = {
          "api.slack.com": "slack", "api.stripe.com": "stripe",
          "api.github.com": "github", "api.notion.com": "notion",
          "api.airtable.com": "airtable",
        };
        const usedNative = new Set<string>();
        const NATIVE: Record<string, string> = {
          "n8n-nodes-base.slack": "slack", "n8n-nodes-base.stripe": "stripe",
          "n8n-nodes-base.github": "github", "n8n-nodes-base.notion": "notion",
          "n8n-nodes-base.airtable": "airtable",
        };
        for (const node of ast.nodes) {
          const service = NATIVE[node.type];
          if (service) usedNative.add(service);
        }
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const url = String((node.parameters as Record<string,unknown>)?.url ?? "");
          for (const [domain, service] of Object.entries(SERVICE_DOMAINS)) {
            if (url.includes(domain) && usedNative.has(service)) {
              findings.push({
                id: fid("MNT-027", node.id), ruleId: "MNT-027",
                ruleName: "Same External Service Called Via Multiple Node Types",
                severity: "MEDIUM", category: "MAINTAINABILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: { summary: `${service} accessed via both HTTP Request and native node`, detail: `"${node.name}" calls ${service} via HTTP Request while the workflow also uses a native ${service} node.` },
                humanExplanation: "Using both raw HTTP and native nodes for the same service doubles credential management and creates inconsistent error handling.",
                suggestedFix: `Consolidate all ${service} calls through the native ${service} node instead of HTTP Request.`,
                marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-027", penaltyPoints: 8,
              });
              break;
            }
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-028",
      name: "Test Data Left in Production Workflow",
      category: "MAINTAINABILITY",
      severity: "HIGH",
      description: "Workflow parameters contain test/demo data not intended for production.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/MNT-028",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const TEST_PATTERNS = /test@example\.com|user@test\.com|foo@bar\.com|dummy|placeholder|fake|lorem ipsum|test123|hello world/i;
        for (const node of ast.nodes) {
          const s = ps(node);
          if (TEST_PATTERNS.test(s)) {
            findings.push({
              id: fid("MNT-028", node.id), ruleId: "MNT-028",
              ruleName: "Test Data Left in Production Workflow",
              severity: "HIGH", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Test/placeholder data in parameters", detail: `"${node.name}" contains test email addresses or placeholder values not suitable for production.` },
              humanExplanation: "Test data in production workflows sends emails to test addresses, writes dummy records to real databases, or processes fake transactions.",
              suggestedFix: "Replace all test values in parameters with real production values or environment variable references.",
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/MNT-028", penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-029",
      name: "Excessive Use of NoOp / Passthrough Nodes",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Workflow contains multiple No Operation nodes that serve no functional purpose.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/MNT-029",
      detect(ast: ParsedWorkflow): Finding[] {
        const noops = ast.nodes.filter((n) =>
          n.type === "n8n-nodes-base.noOp" || n.type === "n8n-nodes-base.noop"
        );
        if (noops.length < 2) return [];
        return noops.map((node) => ({
          id: fid("MNT-029", node.id), ruleId: "MNT-029",
          ruleName: "Excessive Use of NoOp / Passthrough Nodes",
          severity: "LOW" as const, category: "MAINTAINABILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: `${noops.length} NoOp nodes found`, detail: `"${node.name}" is one of ${noops.length} NoOp nodes — each adds visual noise without functional value.` },
          humanExplanation: "NoOp nodes are often placeholders left from development. They add clutter without providing any value.",
          suggestedFix: `Remove "${node.name}" and connect its upstream node directly to its downstream node.`,
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-029", penaltyPoints: 3,
        }));
      },
    },

    {
      id: "MNT-030",
      name: "Hardcoded User ID or Account ID",
      category: "MAINTAINABILITY",
      severity: "HIGH",
      description: "Workflow contains hardcoded user IDs or account IDs that break when accounts change.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/MNT-030",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        // Match patterns like userId: "12345" or accountId: "acc_xyz123"
        const ID_PATTERN = /"(?:userId|accountId|tenantId|orgId|customerId)"\s*:\s*"[A-Za-z0-9_\-]{4,50}"/;
        for (const node of ast.nodes) {
          const s = ps(node);
          if (ID_PATTERN.test(s)) {
            findings.push({
              id: fid("MNT-030", node.id), ruleId: "MNT-030",
              ruleName: "Hardcoded User ID or Account ID",
              severity: "HIGH", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Hardcoded entity ID in parameters", detail: `"${node.name}" has a hardcoded user/account/tenant ID — will fail when deployed for a different account.` },
              humanExplanation: "Hardcoded IDs make workflows impossible to reuse across accounts, tenants, or environments without manual edits.",
              suggestedFix: "Replace hardcoded IDs with expressions referencing trigger payload data or environment variables.",
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/MNT-030", penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },
  ],
};
