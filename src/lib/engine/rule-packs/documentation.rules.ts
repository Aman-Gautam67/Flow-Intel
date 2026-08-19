/**
 * FlowIntel Rule Pack — DOCUMENTATION
 * ─────────────────────────────────────────────────────────────────────────────
 * DOC-001  Missing README / setup instructions
 * DOC-002  Missing environment variable documentation
 * DOC-003  Missing changelog / version history
 *
 * Note: Documentation findings reduce quality but NEVER block marketplace publication.
 * This is by design — technical quality should not be gated on documentation completeness.
 */

import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

const ENV_EXPRESSION_RE = /\$env\.[A-Z_][A-Z0-9_]*/gi;
const CREDENTIAL_KEYWORDS = ["apiKey", "token", "secret", "password", "key"];

function countEnvReferences(ast: ParsedWorkflow): string[] {
  const allParams = JSON.stringify(ast.nodes.map((n) => n.parameters));
  const matches = allParams.match(ENV_EXPRESSION_RE) ?? [];
  return [...new Set(matches)];
}

function hasReadme(ast: ParsedWorkflow): boolean {
  const meta = ast.metadata as Record<string, unknown> | undefined;
  const legacyReadme = meta ? String(meta.readme ?? meta.description ?? meta.notes ?? "") : "";
  const deepCtx = (ast as any).__deepContext;
  const rootReadme = deepCtx?.root?.readmeContent || "";
  const combinedReadme = (legacyReadme + "\n" + rootReadme).trim();
  return combinedReadme.length > 50 || legacyReadme.trim().length > 100;
}

function hasChangelog(ast: ParsedWorkflow): boolean {
  const meta = ast.metadata as Record<string, unknown> | undefined;
  if (!meta) return false;
  const content = JSON.stringify(meta).toLowerCase();
  return content.includes("changelog") || content.includes("version history") ||
    content.includes("v1.") || content.includes("v2.");
}

export const DOCUMENTATION_PACK: RulePackManifest = {
  id: "flowintel-core-documentation",
  name: "FlowIntel Documentation Rules",
  version: "2.0.0",
  description: "Detects missing README, environment documentation, and changelog.",
  rules: [
    // ── DOC-001: Missing README ────────────────────────────────────────────────
    {
      id: "DOC-001",
      name: "Missing README / Setup Instructions",
      category: "DOCUMENTATION",
      severity: "MEDIUM",
      description: "Workflow has no substantive README explaining purpose, prerequisites, and setup.",
      enabled: true,
      marketplaceBlocking: false, // NEVER blocks marketplace — intentional design
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/DOC-001",
      detect(ast: ParsedWorkflow): Finding[] {
        if (hasReadme(ast)) return [];
        return [{
          id: "DOC-001-workflow",
          ruleId: "DOC-001",
          ruleName: "Missing README / Setup Instructions",
          severity: "MEDIUM",
          category: "DOCUMENTATION",
          location: {},
          evidence: {
            summary: "No README or setup instructions found",
            detail: "This workflow has no README (or only a short description). Users cannot understand its purpose or configure it without reverse-engineering every node.",
          },
          humanExplanation: "A README is the first thing marketplace users see. Without it, even a technically perfect workflow will be abandoned or misconfigured.",
          suggestedFix: "Add a workflow description of at least 100 characters covering: purpose, trigger conditions, required credentials, and expected outputs.",
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/DOC-001",
          penaltyPoints: 10,
        }];
      },
    },

    // ── DOC-002: Missing Environment Variable Documentation ───────────────────
    {
      id: "DOC-002",
      name: "Missing Environment Variable Documentation",
      category: "DOCUMENTATION",
      severity: "LOW",
      description: "Workflow uses $env.VARIABLE_NAME references without documenting required environment variables.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/DOC-002",
      detect(ast: ParsedWorkflow): Finding[] {
        const envRefs = countEnvReferences(ast);
        if (envRefs.length === 0) return [];
        // Check if README/description mentions these variables
        const meta = ast.metadata as Record<string, unknown> | undefined;
        const readmeContent = String(meta?.readme ?? meta?.description ?? "").toLowerCase();
        const undocumented = envRefs.filter((v) => !readmeContent.includes(v.toLowerCase().replace("$env.", "")));
        if (undocumented.length === 0) return [];
        return [{
          id: "DOC-002-workflow",
          ruleId: "DOC-002",
          ruleName: "Missing Environment Variable Documentation",
          severity: "LOW",
          category: "DOCUMENTATION",
          location: {},
          evidence: {
            summary: `${undocumented.length} undocumented env variable(s): ${undocumented.slice(0, 3).join(", ")}`,
            detail: `This workflow uses environment variables (${undocumented.join(", ")}) but the README does not document what values are required.`,
          },
          humanExplanation: "Users who import this workflow need to know exactly which environment variables to set. Without documentation, they'll encounter cryptic runtime errors.",
          suggestedFix: `Add a 'Required Environment Variables' section to the README listing: ${undocumented.join(", ")} with descriptions and example values.`,
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/DOC-002",
          penaltyPoints: 6,
        }];
      },
    },

    // ── DOC-003: Missing Changelog ────────────────────────────────────────────
    {
      id: "DOC-003",
      name: "Missing Changelog",
      category: "DOCUMENTATION",
      severity: "INFO",
      description: "Workflow has no changelog or version history — marketplace users cannot track changes between versions.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 0,
      docReference: "https://flowintel.io/rules/DOC-003",
      detect(ast: ParsedWorkflow): Finding[] {
        if (hasChangelog(ast)) return [];
        // Only flag if there's a README (no point flagging missing changelog if there's no README)
        if (!hasReadme(ast)) return [];
        return [{
          id: "DOC-003-workflow",
          ruleId: "DOC-003",
          ruleName: "Missing Changelog",
          severity: "INFO",
          category: "DOCUMENTATION",
          location: {},
          evidence: {
            summary: "No changelog or version history found",
            detail: "This workflow has a README but no changelog. Users who have previously downloaded this workflow cannot know what changed in the latest version.",
          },
          humanExplanation: "A changelog builds user trust and helps existing users understand whether to upgrade. It's especially important for workflows with credentials or behavior changes.",
          suggestedFix: "Add a '## Changelog' section to the README with dated version entries.",
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/DOC-003",
          penaltyPoints: 3,
        }];
      },
    },
  ],
};
