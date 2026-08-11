/**
 * FlowIntel Rule Pack — PRIVACY
 * ─────────────────────────────────────────────────────────────────────────────
 * PRV-001  Sensitive data sent to external AI provider
 * PRV-002  Missing data masking before external transmission
 * PRV-003  Credential shared across 4+ nodes (blast radius)
 */

import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

const EXTERNAL_AI_TYPES = new Set([
  "@n8n/n8n-nodes-langchain.lmOpenAi",
  "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  "@n8n/n8n-nodes-langchain.openAiAssistant",
  "@n8n/n8n-nodes-langchain.lmAnthropic",
  "@n8n/n8n-nodes-langchain.lmChatAnthropic",
  "@n8n/n8n-nodes-langchain.lmCohere",
  "@n8n/n8n-nodes-langchain.lmMistral",
  "n8n-nodes-base.openAi",
]);

const PII_FIELD_NAMES = new Set([
  "email", "phone", "phoneNumber", "ssn", "socialSecurityNumber",
  "password", "passwd", "creditCard", "cardNumber", "cvv",
  "dob", "dateOfBirth", "address", "passport", "nationalId",
  "firstName", "lastName", "fullName",
]);

const MASKING_NODE_TYPES = new Set([
  "n8n-nodes-base.set", "n8n-nodes-base.code",
]);

const MASKING_KEYWORDS = ["mask", "redact", "anonymize", "anonymise", "hash", "encrypt", "obfuscat"];

function hasMaskingBeforeAi(ast: ParsedWorkflow): boolean {
  // Check if there's a Set or Code node upstream of any AI node with masking keywords
  for (const node of ast.nodes) {
    if (!MASKING_NODE_TYPES.has(node.type)) continue;
    const paramStr = JSON.stringify(node.parameters ?? {}).toLowerCase();
    const code = node.codeMeta?.codeSnippet?.toLowerCase() ?? "";
    if (MASKING_KEYWORDS.some((kw) => paramStr.includes(kw) || code.includes(kw))) return true;
  }
  return false;
}

function makeFindingId(ruleId: string, key: string): string {
  return `${ruleId}-${key}`;
}

export const PRIVACY_PACK: RulePackManifest = {
  id: "flowintel-core-privacy",
  name: "FlowIntel Privacy Rules",
  version: "2.0.0",
  description: "Detects PII sent to external AI, missing masking, and credential blast-radius issues.",
  rules: [
    // ── PRV-001: PII Sent to External AI Provider ──────────────────────────────
    {
      id: "PRV-001",
      name: "PII Sent to External AI Provider",
      category: "PRIVACY",
      severity: "HIGH",
      description: "Workflow sends data to an external AI API without evidence of PII masking upstream.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/PRV-001",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasAiNode = ast.nodes.some((n) => EXTERNAL_AI_TYPES.has(n.type));
        if (!hasAiNode) return [];
        // Check if any PII-looking fields exist in the workflow
        const allParams = JSON.stringify(ast.nodes.map((n) => n.parameters)).toLowerCase();
        const hasPiiFields = [...PII_FIELD_NAMES].some((f) => allParams.includes(`"${f}"`));
        if (!hasPiiFields) return [];
        if (hasMaskingBeforeAi(ast)) return [];
        const aiNodes = ast.nodes.filter((n) => EXTERNAL_AI_TYPES.has(n.type));
        return aiNodes.map((node) => ({
          id: makeFindingId("PRV-001", node.id),
          ruleId: "PRV-001",
          ruleName: "PII Sent to External AI Provider",
          severity: "HIGH" as const,
          category: "PRIVACY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: {
            summary: "PII fields in workflow combined with external AI node",
            detail: `Workflow contains PII field names and sends data to "${node.name}" (${node.type}) without detected masking upstream.`,
          },
          humanExplanation: "Sending personally identifiable information to external AI APIs may violate GDPR, CCPA, and enterprise data governance policies. The AI provider becomes a data processor.",
          suggestedFix: `Add a Set/Code node before "${node.name}" to redact or pseudonymize all PII fields before they reach the AI provider.`,
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/PRV-001",
          penaltyPoints: 20,
        }));
      },
    },

    // ── PRV-002: Missing Data Masking Before External Transmission ────────────
    {
      id: "PRV-002",
      name: "Missing Data Masking Before External Transmission",
      category: "PRIVACY",
      severity: "MEDIUM",
      description: "PII field names are referenced before an outbound HTTP node with no masking step.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PRV-002",
      detect(ast: ParsedWorkflow): Finding[] {
        const httpNodes = ast.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest" && n.isHttp);
        if (httpNodes.length === 0) return [];
        const allParams = JSON.stringify(ast.nodes.map((n) => n.parameters)).toLowerCase();
        const hasPiiFields = [...PII_FIELD_NAMES].some((f) => allParams.includes(f));
        if (!hasPiiFields) return [];
        if (hasMaskingBeforeAi(ast)) return [];
        return httpNodes.slice(0, 1).map((node) => ({
          id: makeFindingId("PRV-002", node.id),
          ruleId: "PRV-002",
          ruleName: "Missing Data Masking Before External Transmission",
          severity: "MEDIUM" as const,
          category: "PRIVACY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: {
            summary: "PII field names present + outbound HTTP with no masking node",
            detail: `This workflow references PII field names and makes external HTTP requests, but no masking/redaction node was detected upstream.`,
          },
          humanExplanation: "Without masking, PII fields flow unredacted to external endpoints where you may lose control over retention and processing.",
          suggestedFix: "Insert a Set node before each outbound HTTP node to explicitly whitelist the fields you want to send, dropping any PII fields you don't need.",
          marketplaceBlocking: false,
          docReference: "https://flowintel.io/rules/PRV-002",
          penaltyPoints: 15,
        }));
      },
    },

    // ── PRV-003: High Credential Blast Radius ─────────────────────────────────
    {
      id: "PRV-003",
      name: "High Credential Blast Radius",
      category: "PRIVACY",
      severity: "MEDIUM",
      description: "A single credential is reused across 4+ nodes — compromise of that credential affects all.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PRV-003",
      detect(ast: ParsedWorkflow): Finding[] {
        const credUsage = new Map<string, number>();
        for (const node of ast.nodes) {
          if (!node.credentials) continue;
          for (const [credType, credRef] of Object.entries(node.credentials as Record<string, unknown>)) {
            const ref = credRef as Record<string, unknown>;
            const key = `${credType}:${ref?.id ?? ref?.name ?? "unknown"}`;
            credUsage.set(key, (credUsage.get(key) ?? 0) + 1);
          }
        }
        const findings: Finding[] = [];
        for (const [key, count] of credUsage.entries()) {
          if (count < 4) continue;
          findings.push({
            id: makeFindingId("PRV-003", key.replace(/[^a-z0-9]/gi, "_")),
            ruleId: "PRV-003",
            ruleName: "High Credential Blast Radius",
            severity: "MEDIUM",
            category: "PRIVACY",
            location: {},
            evidence: {
              summary: `Credential "${key}" used by ${count} nodes`,
              detail: `A single credential is shared across ${count} nodes. Rotating or revoking this credential affects all nodes simultaneously.`,
            },
            humanExplanation: "Using the same credential for many operations is a security anti-pattern. A leaked key gives attackers access to all nodes using it, and rotation requires updating all nodes simultaneously.",
            suggestedFix: "Create separate scoped credentials for different workflow sections. Apply the principle of least privilege.",
            marketplaceBlocking: false,
            docReference: "https://flowintel.io/rules/PRV-003",
            penaltyPoints: 12,
          });
        }
        return findings;
      },
    },
  ],
};
