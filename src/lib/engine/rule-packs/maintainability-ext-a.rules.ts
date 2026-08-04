/**
 * FlowIntel Maintainability Extension A — MNT-006 to MNT-018
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

export const MAINTAINABILITY_EXT_A: RulePackManifest = {
  id: "flowintel-maintainability-ext-a",
  name: "FlowIntel Maintainability Extension A",
  version: "2.0.0",
  description: "MNT-006 through MNT-018: dead nodes, giant code, naming, coupling, duplication.",
  rules: [
    {
      id: "MNT-006",
      name: "Orphaned Node (No Edges)",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Node has no incoming or outgoing edges — it is unreachable and will never execute.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/MNT-006",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const connected = new Set<string>();
        for (const e of ast.edges) { connected.add(e.source); connected.add(e.target); }
        for (const node of ast.nodes) {
          if (node.isTrigger) continue;
          if (!connected.has(node.name)) {
            findings.push({
              id: fid("MNT-006", node.id), ruleId: "MNT-006",
              ruleName: "Orphaned Node (No Edges)",
              severity: "MEDIUM", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Node has no edges", detail: `"${node.name}" is not connected to any other node — it will never execute.` },
              humanExplanation: "Orphaned nodes waste space, confuse reviewers, and may contain outdated logic that misleads future maintainers.",
              suggestedFix: `Remove "${node.name}" if it is unused, or connect it to the workflow graph.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-006", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-007",
      name: "Code Node Exceeds 100 Lines",
      category: "MAINTAINABILITY",
      severity: "HIGH",
      description: "Code node contains more than 100 lines — should be split into smaller focused nodes.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/MNT-007",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          const lines = code.split("\n").length;
          if (lines > 100) {
            findings.push({
              id: fid("MNT-007", node.id), ruleId: "MNT-007",
              ruleName: "Code Node Exceeds 100 Lines",
              severity: "HIGH", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `${lines} lines in one code node`, detail: `"${node.name}" has ${lines} lines — too large to review, test, or maintain safely.` },
              humanExplanation: "Giant code nodes are impossible to code-review, cannot be unit-tested, and become permanent technical debt.",
              suggestedFix: "Split the logic across multiple focused Code nodes or extract helper functions into separate sub-workflows.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-007", penaltyPoints: 12,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-008",
      name: "Duplicate Node Logic Detected",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Two or more code nodes share near-identical logic — violates DRY principle.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/MNT-008",
      detect(ast: ParsedWorkflow): Finding[] {
        const codeNodes = ast.nodes.filter((n) => n.isCode);
        if (codeNodes.length < 2) return [];
        const findings: Finding[] = [];
        const seen = new Map<string, string>();
        for (const node of codeNodes) {
          const code = (node.codeMeta?.codeSnippet ?? ps(node)).trim().slice(0, 200);
          if (seen.has(code)) {
            findings.push({
              id: fid("MNT-008", node.id), ruleId: "MNT-008",
              ruleName: "Duplicate Node Logic Detected",
              severity: "MEDIUM", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Duplicate of node "${seen.get(code)}"`, detail: `"${node.name}" contains logic nearly identical to "${seen.get(code)}" — duplicated maintenance burden.` },
              humanExplanation: "Duplicate code means bug fixes must be applied twice. One copy inevitably drifts, causing subtle inconsistencies.",
              suggestedFix: "Extract the shared logic into a sub-workflow that both nodes call.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-008", penaltyPoints: 10,
            });
          } else {
            seen.set(code, node.name);
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-009",
      name: "Default Node Name Not Changed",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Node uses the default auto-generated name (e.g. 'HTTP Request', 'Code', 'Set').",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/MNT-009",
      detect(ast: ParsedWorkflow): Finding[] {
        const DEFAULT_NAMES = new Set([
          "HTTP Request","Code","Set","Edit Fields","If","Switch","Merge",
          "Split In Batches","Execute Workflow","Schedule Trigger","Webhook",
          "Manual Trigger","Function","Function Item","Wait","No Op","Start",
        ]);
        return ast.nodes
          .filter((n) => DEFAULT_NAMES.has(n.name))
          .map((node) => ({
            id: fid("MNT-009", node.id), ruleId: "MNT-009",
            ruleName: "Default Node Name Not Changed",
            severity: "LOW" as const, category: "MAINTAINABILITY" as const,
            location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
            evidence: { summary: `Default name "${node.name}" not customised`, detail: `"${node.name}" uses the default node name — provides no context about its purpose.` },
            humanExplanation: "When every node is named 'HTTP Request', reading the workflow requires opening each node to understand its purpose.",
            suggestedFix: `Rename "${node.name}" to something descriptive like "Fetch User from CRM" or "Send Slack Alert".`,
            marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-009", penaltyPoints: 3,
          }));
      },
    },

    {
      id: "MNT-010",
      name: "Excessively Long Expression",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "A node parameter contains an expression longer than 200 characters — unreadable.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/MNT-010",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        function walk(obj: unknown, nodeId: string, nodeName: string, nodeType: string, path = ""): void {
          if (!obj || typeof obj !== "object") return;
          for (const [k, v] of Object.entries(obj as Record<string,unknown>)) {
            if (typeof v === "string" && v.startsWith("={{") && v.length > 200) {
              findings.push({
                id: fid("MNT-010", nodeId) + "-" + k, ruleId: "MNT-010",
                ruleName: "Excessively Long Expression",
                severity: "MEDIUM", category: "MAINTAINABILITY",
                location: { nodeId, nodeName, nodeType, paramPath: path + "/" + k },
                evidence: { summary: `Expression is ${v.length} chars`, value: v.slice(0, 80) + "…", detail: `Parameter "${k}" in "${nodeName}" has a ${v.length}-character expression — too complex to read.` },
                humanExplanation: "Expressions longer than 200 chars are impossible to read, debug, or review. They should be moved to a Code node.",
                suggestedFix: "Move the long expression to a Set/Code node with a descriptive variable name.",
                marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-010", penaltyPoints: 5,
              });
            } else if (v && typeof v === "object") {
              walk(v, nodeId, nodeName, nodeType, path + "/" + k);
            }
          }
        }
        for (const node of ast.nodes) walk(node.parameters, node.id, node.name, node.type);
        return findings;
      },
    },

    {
      id: "MNT-011",
      name: "Workflow Exceeds Recommended Node Count",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Workflow has more than 40 nodes — consider breaking into sub-workflows.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/MNT-011",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.nodes.length <= 40) return [];
        return [{
          id: "MNT-011-workflow", ruleId: "MNT-011",
          ruleName: "Workflow Exceeds Recommended Node Count",
          severity: "MEDIUM", category: "MAINTAINABILITY",
          location: {},
          evidence: { summary: `${ast.nodes.length} nodes in single workflow`, detail: `Workflow has ${ast.nodes.length} nodes — difficult to navigate, understand, or maintain.` },
          humanExplanation: "Monolithic workflows with 40+ nodes are difficult to test, debug, and modify without unintended side effects.",
          suggestedFix: "Split into focused sub-workflows of ≤20 nodes each, connected via Execute Workflow nodes.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-011", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "MNT-012",
      name: "Magic Number in Expression",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Numeric literals appear directly in expressions without named constants.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/MNT-012",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = ps(node);
          // Detect numbers > 10 used directly in comparisons/arithmetic in expressions
          const matches = s.match(/==\s*\d{3,}|>\s*\d{3,}|<\s*\d{3,}|\*\s*\d{2,}|\/\s*\d{2,}/g);
          if (matches && matches.length > 0) {
            findings.push({
              id: fid("MNT-012", node.id), ruleId: "MNT-012",
              ruleName: "Magic Number in Expression",
              severity: "LOW", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Magic numbers: ${matches.slice(0,3).join(", ")}`, detail: `"${node.name}" uses unexplained numeric literals in expressions — their meaning is unclear.` },
              humanExplanation: "Magic numbers make code unreadable. '> 86400000' is less clear than 'ONE_DAY_MS'.",
              suggestedFix: "Define constants in a Set node at the top of the workflow and reference them by name.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-012", penaltyPoints: 3,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-013",
      name: "Commented-Out Code in Code Node",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Code node contains large blocks of commented-out code.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/MNT-013",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          const commentedLines = code.split("\n").filter((l) => /^\s*\/\//.test(l)).length;
          const totalLines = code.split("\n").length;
          if (commentedLines > 5 && commentedLines / totalLines > 0.3) {
            findings.push({
              id: fid("MNT-013", node.id), ruleId: "MNT-013",
              ruleName: "Commented-Out Code in Code Node",
              severity: "LOW", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `${commentedLines}/${totalLines} lines are comments`, detail: `"${node.name}" has ${commentedLines} commented lines (${Math.round(commentedLines/totalLines*100)}% of the file).` },
              humanExplanation: "Commented-out code creates confusion — is it intentional? Outdated? Needed again? Version control makes it unnecessary.",
              suggestedFix: `Remove commented-out code from "${node.name}". Use version control history to recover it if needed.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-013", penaltyPoints: 3,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-014",
      name: "Deeply Nested Conditional Logic",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Workflow has 4+ chained If/Switch nodes creating deeply nested logic.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/MNT-014",
      detect(ast: ParsedWorkflow): Finding[] {
        const COND = new Set(["n8n-nodes-base.if","n8n-nodes-base.switch"]);
        const condCount = ast.nodes.filter((n) => COND.has(n.type)).length;
        if (condCount < 4) return [];
        // Check if they are chained (output of one feeds into next)
        let chainLen = 0;
        let maxChain = 0;
        let currentNode: string | null = null;
        for (const node of ast.nodes) {
          if (!COND.has(node.type)) { chainLen = 0; continue; }
          if (currentNode !== null) {
            const isChained = ast.edges.some((e) => e.source === currentNode && e.target === node.name);
            chainLen = isChained ? chainLen + 1 : 1;
          } else chainLen = 1;
          maxChain = Math.max(maxChain, chainLen);
          currentNode = node.name;
        }
        if (maxChain < 4) return [];
        return [{
          id: "MNT-014-workflow", ruleId: "MNT-014",
          ruleName: "Deeply Nested Conditional Logic",
          severity: "MEDIUM", category: "MAINTAINABILITY",
          location: {},
          evidence: { summary: `${maxChain} chained conditional nodes`, detail: `Workflow chains ${maxChain} If/Switch nodes — logic path complexity is high.` },
          humanExplanation: "Deeply nested conditionals make it nearly impossible to reason about all code paths or write tests for each branch.",
          suggestedFix: "Flatten the logic using a Switch node with multiple outputs, or move complex routing to a Code node with early returns.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-014", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "MNT-015",
      name: "Missing Node Notes on Complex Logic",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Code nodes with complex logic have no explanatory notes.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/MNT-015",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          const lines = code.split("\n").length;
          if (lines < 20) continue;
          const pp = node.parameters as Record<string,unknown> | undefined;
          const hasNotes = pp?.notes || pp?.description || pp?.comment;
          if (!hasNotes) {
            findings.push({
              id: fid("MNT-015", node.id), ruleId: "MNT-015",
              ruleName: "Missing Node Notes on Complex Logic",
              severity: "LOW", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `${lines}-line code node with no notes`, detail: `"${node.name}" has ${lines} lines but no explanatory notes — intent is unclear.` },
              humanExplanation: "Complex code without explanation becomes a maintenance hazard as the original author's intent is forgotten.",
              suggestedFix: `Add a description in the notes field of "${node.name}" explaining what it does and why.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-015", penaltyPoints: 3,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-016",
      name: "Hardcoded Environment-Specific Value",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Workflow contains hardcoded environment-specific values (URLs, IDs) that break across environments.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/MNT-016",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const ENV_PATTERNS = [
          /https?:\/\/(?:staging|dev|prod|uat|localhost)\./i,
          /"(?:baseUrl|apiUrl|endpoint)"\s*:\s*"https?:\/\//,
        ];
        for (const node of ast.nodes) {
          const s = ps(node);
          for (const re of ENV_PATTERNS) {
            if (re.test(s)) {
              findings.push({
                id: fid("MNT-016", node.id), ruleId: "MNT-016",
                ruleName: "Hardcoded Environment-Specific Value",
                severity: "MEDIUM", category: "MAINTAINABILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: { summary: "Environment-specific URL hardcoded", detail: `"${node.name}" contains a hardcoded environment URL — will break when deployed to a different environment.` },
                humanExplanation: "Hardcoded environment URLs make workflows impossible to promote between dev/staging/prod without manual edits.",
                suggestedFix: "Replace hardcoded URLs with environment variables referenced via $env.BASE_URL or n8n credentials.",
                marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-016", penaltyPoints: 10,
              });
              break;
            }
          }
        }
        return findings;
      },
    },

    {
      id: "MNT-017",
      name: "Unused Credential Definition",
      category: "MAINTAINABILITY",
      severity: "LOW",
      description: "Workflow defines a credential that is not referenced by any node.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 3,
      docReference: "https://flowintel.io/rules/MNT-017",
      detect(ast: ParsedWorkflow): Finding[] {
        // Detect nodes that have credentials defined but completely empty
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const creds = node.credentials as Record<string, unknown> | undefined;
          if (!creds || Object.keys(creds).length > 0) continue;
          // Node type normally requires credentials but has none
          const CRED_TYPES = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.slack","n8n-nodes-base.stripe","n8n-nodes-base.github"]);
          if (!CRED_TYPES.has(node.type)) continue;
          findings.push({
            id: fid("MNT-017", node.id), ruleId: "MNT-017",
            ruleName: "Unused Credential Definition",
            severity: "LOW", category: "MAINTAINABILITY",
            location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
            evidence: { summary: "Node has no credentials assigned", detail: `"${node.name}" (${node.type}) has no credentials configured — will fail on execution.` },
            humanExplanation: "Integration nodes without credentials produce authentication errors at runtime.",
            suggestedFix: `Assign the appropriate credentials to "${node.name}" in the Credentials dropdown.`,
            marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-017", penaltyPoints: 3,
          });
        }
        return findings;
      },
    },

    {
      id: "MNT-018",
      name: "Sub-workflow Called With No Input Mapping",
      category: "MAINTAINABILITY",
      severity: "MEDIUM",
      description: "Execute Workflow node passes no explicit input — relies on implicit data passing.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/MNT-018",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.executeWorkflow") continue;
          const pp = node.parameters as Record<string,unknown> | undefined;
          const hasInput = pp?.inputData || pp?.fields || pp?.parameters;
          if (!hasInput) {
            findings.push({
              id: fid("MNT-018", node.id), ruleId: "MNT-018",
              ruleName: "Sub-workflow Called With No Input Mapping",
              severity: "MEDIUM", category: "MAINTAINABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Execute Workflow with no explicit input mapping", detail: `"${node.name}" calls a sub-workflow without explicit input mapping — creates implicit coupling.` },
              humanExplanation: "Implicit data passing makes sub-workflow contracts invisible. Changing the parent workflow silently breaks the sub-workflow.",
              suggestedFix: "Explicitly map input fields in the Execute Workflow node to document the interface contract.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/MNT-018", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },
  ],
};
