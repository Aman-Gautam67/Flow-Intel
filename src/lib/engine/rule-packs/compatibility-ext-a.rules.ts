/**
 * FlowIntel Compatibility Extension A — CMP-004 to CMP-016
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

// Node version matrix: type → { currentVersion, minSupported, breaking }
const NODE_VERSION_MATRIX: Record<string, { current: number; minSupported: number; breakingAt?: number }> = {
  "n8n-nodes-base.httpRequest":    { current: 4, minSupported: 3, breakingAt: 2 },
  "n8n-nodes-base.code":           { current: 2, minSupported: 1 },
  "n8n-nodes-base.if":             { current: 2, minSupported: 1 },
  "n8n-nodes-base.merge":          { current: 3, minSupported: 2, breakingAt: 1 },
  "n8n-nodes-base.googleSheets":   { current: 4, minSupported: 3, breakingAt: 2 },
  "n8n-nodes-base.slack":          { current: 2, minSupported: 2 },
  "n8n-nodes-base.dateTime":       { current: 2, minSupported: 2, breakingAt: 1 },
  "n8n-nodes-base.airtable":       { current: 2, minSupported: 2, breakingAt: 1 },
  "n8n-nodes-base.notion":         { current: 2, minSupported: 2 },
  "n8n-nodes-base.postgres":       { current: 2, minSupported: 1 },
};

const DEPRECATED_PARAMETERS: Record<string, Array<{ param: string; since: string; replacement: string }>> = {
  "n8n-nodes-base.httpRequest": [
    { param: "sendBinaryData", since: "1.0", replacement: "binaryData.mode" },
    { param: "fullResponse",   since: "1.5", replacement: "options.response.response.fullResponse" },
    { param: "ignoreHttpStatusErrors", since: "1.2", replacement: "options.response.response.neverError" },
  ],
  "n8n-nodes-base.code": [
    { param: "jsCode",   since: "0.198", replacement: "code (JavaScript mode)" },
  ],
};

export const COMPATIBILITY_EXT_A: RulePackManifest = {
  id: "flowintel-compatibility-ext-a",
  name: "FlowIntel Compatibility Extension A",
  version: "2.0.0",
  description: "CMP-004 through CMP-016: node version drift, deprecated params, API changes.",
  rules: [
    {
      id: "CMP-004",
      name: "Node Version Below Current — Drift Detected",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "Node uses a typeVersion older than the current version, missing improvements and fixes.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/CMP-004",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const matrix = NODE_VERSION_MATRIX[node.type];
          if (!matrix) continue;
          const used = Number(node.typeVersion ?? 1);
          if (used < matrix.current && used >= matrix.minSupported) {
            findings.push({
              id: fid("CMP-004", node.id), ruleId: "CMP-004",
              ruleName: "Node Version Below Current — Drift Detected",
              severity: "MEDIUM", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `v${used} used, v${matrix.current} available`, detail: `"${node.name}" uses typeVersion ${used} but v${matrix.current} is available with bug fixes and new features.` },
              humanExplanation: "Running an older node version misses security patches, bug fixes, and performance improvements added in newer versions.",
              suggestedFix: `Upgrade "${node.name}" to typeVersion ${matrix.current}. Review the migration notes for breaking changes.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-004", penaltyPoints: 12,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-005",
      name: "Breaking Node Version In Use",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Node uses a typeVersion that is known to have breaking behaviour differences.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/CMP-005",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const matrix = NODE_VERSION_MATRIX[node.type];
          if (!matrix?.breakingAt) continue;
          const used = Number(node.typeVersion ?? 1);
          if (used <= matrix.breakingAt) {
            findings.push({
              id: fid("CMP-005", node.id), ruleId: "CMP-005",
              ruleName: "Breaking Node Version In Use",
              severity: "HIGH", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `v${used} has known breaking differences vs v${matrix.current}`, detail: `"${node.name}" runs typeVersion ${used} which has known breaking behaviour vs current v${matrix.current}.` },
              humanExplanation: "This node version has documented breaking changes — it may behave differently from documented examples and produce unexpected output.",
              suggestedFix: `Upgrade "${node.name}" to typeVersion ${matrix.current} and re-test all downstream mappings.`,
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/CMP-005", penaltyPoints: 20,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-006",
      name: "Deprecated Node Parameter Used",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Node uses a parameter that was deprecated in a past release.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-006",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const deprecated = DEPRECATED_PARAMETERS[node.type];
          if (!deprecated) continue;
          for (const dep of deprecated) {
            const pp = node.parameters as Record<string, unknown> | undefined;
            if (pp && dep.param in pp) {
              findings.push({
                id: fid("CMP-006", node.id) + "-" + dep.param,
                ruleId: "CMP-006", ruleName: "Deprecated Node Parameter Used",
                severity: "HIGH", category: "COMPATIBILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type, paramPath: "/" + dep.param },
                evidence: { summary: `"${dep.param}" deprecated since v${dep.since}`, detail: `"${node.name}" uses "${dep.param}" which was deprecated in n8n v${dep.since}. Replacement: "${dep.replacement}".` },
                humanExplanation: `Deprecated parameters may be ignored or removed in future n8n versions, silently changing workflow behaviour.`,
                suggestedFix: `Replace "${dep.param}" with "${dep.replacement}" in "${node.name}".`,
                marketplaceBlocking: true, docReference: "https://flowintel.io/rules/CMP-006", penaltyPoints: 15,
              });
            }
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-007",
      name: "LangChain Node Version Mismatch",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Workflow mixes old @n8n/n8n-nodes-langchain node versions with new ones.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-007",
      detect(ast: ParsedWorkflow): Finding[] {
        const lcNodes = ast.nodes.filter((n) => n.type.startsWith("@n8n/n8n-nodes-langchain"));
        if (lcNodes.length < 2) return [];
        const versions = new Set(lcNodes.map((n) => Number(n.typeVersion ?? 1)));
        if (versions.size < 2) return [];
        const minV = Math.min(...versions), maxV = Math.max(...versions);
        return lcNodes.filter((n) => Number(n.typeVersion ?? 1) === minV).map((node) => ({
          id: fid("CMP-007", node.id), ruleId: "CMP-007",
          ruleName: "LangChain Node Version Mismatch",
          severity: "HIGH" as const, category: "COMPATIBILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: `v${minV} mixed with v${maxV} LangChain nodes`, detail: `"${node.name}" uses LangChain typeVersion ${minV} while other nodes use v${maxV} — interface contracts may be incompatible.` },
          humanExplanation: "LangChain node versions have different input/output schemas. Mixing versions causes type mismatches in AI chains.",
          suggestedFix: `Upgrade "${node.name}" to LangChain typeVersion ${maxV} to match other nodes in the chain.`,
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-007", penaltyPoints: 15,
        }));
      },
    },

    {
      id: "CMP-008",
      name: "n8n Version Too Old for Required Node",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Workflow uses a node that requires a newer n8n version than what is recorded in metadata.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 18,
      docReference: "https://flowintel.io/rules/CMP-008",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string, unknown> | undefined;
        const versionStr = String(meta?.n8nVersion ?? meta?.version ?? "0.0.0");
        const parts = versionStr.split(".").map(Number);
        const major = parts[0] ?? 0, minor = parts[1] ?? 0;
        if (major === 0 && minor === 0) return [];
        const findings: Finding[] = [];
        const REQUIRES_NEW: Array<{ type: string; minMajor: number; minMinor: number }> = [
          { type: "@n8n/n8n-nodes-langchain.agent", minMajor: 1, minMinor: 0 },
          { type: "n8n-nodes-base.executeWorkflowTrigger", minMajor: 1, minMinor: 0 },
          { type: "n8n-nodes-base.splitOut", minMajor: 1, minMinor: 0 },
        ];
        for (const node of ast.nodes) {
          const req = REQUIRES_NEW.find((r) => r.type === node.type);
          if (!req) continue;
          if (major < req.minMajor || (major === req.minMajor && minor < req.minMinor)) {
            findings.push({
              id: fid("CMP-008", node.id), ruleId: "CMP-008",
              ruleName: "n8n Version Too Old for Required Node",
              severity: "HIGH", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Requires n8n v${req.minMajor}.${req.minMinor}+, found v${versionStr}`, detail: `"${node.name}" (${node.type}) requires n8n v${req.minMajor}.${req.minMinor} but workflow metadata records v${versionStr}.` },
              humanExplanation: "Deploying this workflow to an older n8n instance will fail because the required node type does not exist.",
              suggestedFix: `Upgrade the target n8n instance to v${req.minMajor}.${req.minMinor}+ before deploying this workflow.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-008", penaltyPoints: 18,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-009",
      name: "Google Sheets v2 Node — Deprecated Operation",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Google Sheets node uses an operation removed in v4.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/CMP-009",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const REMOVED_OPS = new Set(["readSheet","clearSheet","writeSheet"]);
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.googleSheets") continue;
          const op = String((node.parameters as Record<string, unknown>)?.operation ?? "");
          if (REMOVED_OPS.has(op)) {
            findings.push({
              id: fid("CMP-009", node.id), ruleId: "CMP-009",
              ruleName: "Google Sheets v2 Node — Deprecated Operation",
              severity: "HIGH", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Operation "${op}" removed in Google Sheets v4`, detail: `"${node.name}" uses "${op}" which was removed in Google Sheets node v4.` },
              humanExplanation: "Deprecated operations fail silently or throw errors after node upgrades, breaking the workflow.",
              suggestedFix: `Replace "${op}" with the current equivalent: "read" → "getValues", "write" → "appendOrUpdate".`,
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/CMP-009", penaltyPoints: 20,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-010",
      name: "HTTP Request Auth Method Deprecated",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "HTTP Request node uses a legacy authentication method.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CMP-010",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const pp = node.parameters as Record<string, unknown> | undefined;
          const auth = String(pp?.authentication ?? "");
          if (["basicAuth","digestAuth"].includes(auth)) {
            findings.push({
              id: fid("CMP-010", node.id), ruleId: "CMP-010",
              ruleName: "HTTP Request Auth Method Deprecated",
              severity: "MEDIUM", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Legacy auth method: "${auth}"`, detail: `"${node.name}" uses "${auth}" which is superseded by the Credential-based auth system in HTTP Request v4.` },
              humanExplanation: "Legacy auth methods may not be available in newer n8n HTTP Request node versions.",
              suggestedFix: "Switch to credential-based authentication using the Generic Credential Type in the Credentials dropdown.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-010", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-011",
      name: "Make/Integromat Module Version Outdated",
      category: "COMPATIBILITY",
      severity: "HIGH",
      description: "Make.com (Integromat) workflow uses a module version that has been superseded.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CMP-011",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.platform !== "MAKE") return [];
        const findings: Finding[] = [];
        const OUTDATED_MODULES = new Set(["slack:1","gmail:1","http:1","webhook:1"]);
        for (const node of ast.nodes) {
          const moduleKey = node.type.toLowerCase() + ":" + (node.typeVersion ?? "1");
          if (OUTDATED_MODULES.has(moduleKey)) {
            findings.push({
              id: fid("CMP-011", node.id), ruleId: "CMP-011",
              ruleName: "Make/Integromat Module Version Outdated",
              severity: "HIGH", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Outdated module: ${moduleKey}`, detail: `"${node.name}" uses an older module version that may lack current API support.` },
              humanExplanation: "Make.com periodically retires old module versions. Using outdated versions risks breakage when the old version is sunset.",
              suggestedFix: "Upgrade to the current module version in your Make.com scenario editor.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-011", penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-012",
      name: "Flowise Node Without Version Lock",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "Flowise workflow does not pin node versions — updates may change behaviour.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CMP-012",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.platform !== "FLOWISE") return [];
        const unpinned = ast.nodes.filter((n) => !n.typeVersion || n.typeVersion === 0);
        if (unpinned.length === 0) return [];
        return unpinned.map((node) => ({
          id: fid("CMP-012", node.id), ruleId: "CMP-012",
          ruleName: "Flowise Node Without Version Lock",
          severity: "MEDIUM" as const, category: "COMPATIBILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Node has no version pinned", detail: `"${node.name}" has no version pin — Flowise updates may silently change its behaviour.` },
          humanExplanation: "Unpinned Flowise nodes float to the latest version on every deploy, making behaviour non-reproducible.",
          suggestedFix: "Pin the version of each Flowise node in the flow configuration.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-012", penaltyPoints: 10,
        }));
      },
    },

    {
      id: "CMP-013",
      name: "OpenAI Model No Longer Available",
      category: "COMPATIBILITY",
      severity: "CRITICAL",
      description: "Workflow references an OpenAI model that has been deprecated or retired.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 25,
      docReference: "https://flowintel.io/rules/CMP-013",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const RETIRED = new Set([
          "text-davinci-003","text-davinci-002","text-curie-001","text-babbage-001",
          "text-ada-001","code-davinci-002","gpt-3.5-turbo-0301","gpt-4-0314",
          "davinci","curie","babbage","ada",
        ]);
        for (const node of ast.nodes) {
          const pp = node.parameters as Record<string, unknown> | undefined;
          const model = String(pp?.model ?? pp?.modelId ?? ps(node).match(/"model"\s*:\s*"([^"]+)"/)?.[1] ?? "");
          if (model && RETIRED.has(model)) {
            findings.push({
              id: fid("CMP-013", node.id), ruleId: "CMP-013",
              ruleName: "OpenAI Model No Longer Available",
              severity: "CRITICAL", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Retired model: "${model}"`, detail: `"${node.name}" uses "${model}" which has been retired by OpenAI and will return API errors.` },
              humanExplanation: "Retired OpenAI models return 404 errors. The workflow will fail immediately at this node.",
              suggestedFix: `Replace "${model}" with a current model: gpt-4o-mini (fast/cheap) or gpt-4o (capable).`,
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/CMP-013", penaltyPoints: 25,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-014",
      name: "Zapier Action Version Outdated",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "Zapier workflow uses a legacy action version for an integration.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CMP-014",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.platform !== "ZAPIER") return [];
        const outdated = ast.nodes.filter((n) => {
          const v = Number(n.typeVersion ?? 1);
          return v === 1 && n.type.includes("@");
        });
        if (outdated.length === 0) return [];
        return outdated.map((node) => ({
          id: fid("CMP-014", node.id), ruleId: "CMP-014",
          ruleName: "Zapier Action Version Outdated",
          severity: "MEDIUM" as const, category: "COMPATIBILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: `Version 1 action: ${node.type}`, detail: `"${node.name}" uses version 1 of ${node.type}. Newer versions likely have improved API support.` },
          humanExplanation: "Older Zapier action versions may use deprecated API calls that get sunset without warning.",
          suggestedFix: "Update this Zap step to the latest available action version.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-014", penaltyPoints: 10,
        }));
      },
    },

    {
      id: "CMP-015",
      name: "Hardcoded API Version in URL",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "HTTP Request URL contains a hardcoded API version that may be retired.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CMP-015",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const pp = node.parameters as Record<string, unknown> | undefined;
          const url = String(pp?.url ?? "");
          if (/\/v[1-2]\/|\/api\/v[1-2]\//.test(url)) {
            findings.push({
              id: fid("CMP-015", node.id), ruleId: "CMP-015",
              ruleName: "Hardcoded API Version in URL",
              severity: "MEDIUM", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type, paramPath: "/parameters/url" },
              evidence: { summary: "Old API version in URL", value: url.slice(0, 80), detail: `"${node.name}" uses a hardcoded API version path that may be retired by the upstream service.` },
              humanExplanation: "API providers retire old versions. A hardcoded /v1/ URL will break when the provider sunsets v1.",
              suggestedFix: "Use the latest stable API version and parameterise the version via an environment variable.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-015", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CMP-016",
      name: "Expression Engine Version Mismatch",
      category: "COMPATIBILITY",
      severity: "MEDIUM",
      description: "Workflow uses $node[] syntax from the legacy expression engine incompatible with new versions.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/CMP-016",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = ps(node);
          if (/\$node\s*\[/.test(s)) {
            findings.push({
              id: fid("CMP-016", node.id), ruleId: "CMP-016",
              ruleName: "Expression Engine Version Mismatch",
              severity: "MEDIUM", category: "COMPATIBILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "$node[] legacy expression syntax", detail: `"${node.name}" uses $node['Name'] legacy syntax — replaced by $('Name') in n8n v1.0+.` },
              humanExplanation: "The $node[] expression syntax was replaced in n8n v1.0. Workflows using it will error on modern instances.",
              suggestedFix: `Replace $node['NodeName'].json with $('NodeName').item.json throughout "${node.name}".`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CMP-016", penaltyPoints: 12,
            });
          }
        }
        return findings;
      },
    },
  ],
};
