/**
 * FlowIntel Privacy Extension A — PRV-004 to PRV-013
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

const PII_FIELDS = ["email","phone","ssn","dateOfBirth","address","creditCard",
  "firstName","lastName","fullName","nationalId","passport","ipAddress","userId","deviceId"];
const UNAPPROVED_AI = new Set(["replicate","cohere","ai21","nlpcloud","forefront"]);
const EU_REGIONS = new Set(["eu-west","eu-central","eu-north","europe","frankfurt","ireland","paris","stockholm"]);

export const PRIVACY_EXT_A: RulePackManifest = {
  id: "flowintel-privacy-ext-a",
  name: "FlowIntel Privacy Extension A",
  version: "2.0.0",
  description: "PRV-004 through PRV-013: GDPR, data region, PII masking, retention, consent.",
  rules: [
    {
      id: "PRV-004",
      name: "PII Sent to Non-EU Region Without Consent Indicator",
      category: "PRIVACY",
      severity: "CRITICAL",
      description: "PII data flows to a service endpoint outside the EU without a documented consent/lawful-basis.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 30,
      docReference: "https://flowintel.io/rules/PRV-004",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const pp = node.parameters as Record<string,unknown> | undefined;
          const url = String(pp?.url ?? "").toLowerCase();
          const isEu = [...EU_REGIONS].some((r) => url.includes(r));
          if (isEu) continue;
          const s = ps(node).toLowerCase();
          const hasPii = PII_FIELDS.some((f) => s.includes(`"${f.toLowerCase()}"`));
          if (!hasPii) continue;
          const meta = ast.metadata as Record<string,unknown> | undefined;
          const hasConsent = meta?.gdprLawfulBasis || meta?.dataProcessingAgreement || meta?.consentIndicator;
          if (!hasConsent) {
            findings.push({
              id: fid("PRV-004", node.id), ruleId: "PRV-004",
              ruleName: "PII Sent to Non-EU Region Without Consent Indicator",
              severity: "CRITICAL", category: "PRIVACY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "PII → non-EU endpoint, no lawful basis recorded", detail: `"${node.name}" sends PII to a non-EU endpoint without a documented GDPR lawful basis.` },
              humanExplanation: "GDPR Article 44 prohibits transferring personal data outside the EU without adequate safeguards or documented lawful basis.",
              suggestedFix: "Add a gdprLawfulBasis field to workflow metadata, or restrict the endpoint to EU regions, or pseudonymise PII before transfer.",
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/PRV-004", penaltyPoints: 30,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PRV-005",
      name: "PII Stored Without Retention Policy",
      category: "PRIVACY",
      severity: "HIGH",
      description: "Workflow writes PII to a database with no configured retention or TTL.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/PRV-005",
      detect(ast: ParsedWorkflow): Finding[] {
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb","n8n-nodes-base.airtable","n8n-nodes-base.googleSheets"]);
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!DB.has(node.type)) continue;
          const op = String((node.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          if (!["insert","create","upsert","append","write"].some((v) => op.includes(v))) continue;
          const s = ps(node).toLowerCase();
          if (!PII_FIELDS.some((f) => s.includes(`"${f.toLowerCase()}"`))) continue;
          const meta = ast.metadata as Record<string,unknown> | undefined;
          const hasRetention = meta?.dataRetentionDays || meta?.ttl || meta?.retentionPolicy;
          const hasDelete = ast.nodes.some((n) => {
            const ns = ps(n).toLowerCase();
            return /delete.*where.*date|ttl|expire|cleanup.*older/i.test(ns);
          });
          if (!hasRetention && !hasDelete) {
            findings.push({
              id: fid("PRV-005", node.id), ruleId: "PRV-005",
              ruleName: "PII Stored Without Retention Policy",
              severity: "HIGH", category: "PRIVACY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "PII written to DB with no retention/TTL", detail: `"${node.name}" stores PII fields with no documented retention policy or cleanup logic.` },
              humanExplanation: "GDPR Article 5(1)(e) requires data to be kept no longer than necessary. Storing PII indefinitely violates this principle.",
              suggestedFix: "Add a scheduled cleanup workflow that deletes PII records older than your retention period. Document the retention period in workflow metadata.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-005", penaltyPoints: 20,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PRV-006",
      name: "Sensitive Data in Workflow Execution Logs",
      category: "PRIVACY",
      severity: "HIGH",
      description: "Workflow logs PII or sensitive data that ends up in n8n execution logs.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/PRV-006",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          const logsPii = PII_FIELDS.some((f) => {
            const re = new RegExp(`console\\.(log|info|warn|error).*${f}`, "i");
            return re.test(code);
          });
          if (logsPii) {
            findings.push({
              id: fid("PRV-006", node.id), ruleId: "PRV-006",
              ruleName: "Sensitive Data in Workflow Execution Logs",
              severity: "HIGH", category: "PRIVACY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "PII field name in console.log call", detail: `"${node.name}" logs what appears to be PII data — it will appear in n8n execution history.` },
              humanExplanation: "n8n stores execution data. Logging PII means it is stored in plaintext in the execution database, visible to all workspace admins.",
              suggestedFix: "Remove PII from log statements. Log only record IDs, not personal data fields.",
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/PRV-006", penaltyPoints: 20,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PRV-007",
      name: "Unmasked Credit Card Data in Transit",
      category: "PRIVACY",
      severity: "CRITICAL",
      description: "Workflow passes full credit card numbers through nodes without masking.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 35,
      docReference: "https://flowintel.io/rules/PRV-007",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = ps(node).toLowerCase();
          if (/"(?:cardnumber|creditcard|ccnumber|pan)"\s*:\s*"[0-9]{12,19}"/i.test(s)) {
            findings.push({
              id: fid("PRV-007", node.id), ruleId: "PRV-007",
              ruleName: "Unmasked Credit Card Data in Transit",
              severity: "CRITICAL", category: "PRIVACY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Full card number detected in parameters", detail: `"${node.name}" appears to carry a full PAN (card number) — violates PCI-DSS.` },
              humanExplanation: "Passing full PANs through workflow nodes violates PCI-DSS. Even if encrypted at rest, unmasked PANs in transit are a compliance violation.",
              suggestedFix: "Never handle full PANs. Use a tokenization service (Stripe, Braintree) and pass only the token.",
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/PRV-007", penaltyPoints: 35,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PRV-008",
      name: "AI Prompt Contains PII Without Redaction",
      category: "PRIVACY",
      severity: "HIGH",
      description: "LLM prompt is constructed with PII fields from trigger/user input.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/PRV-008",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const AI = ["langchain","openai","anthropic","llm","chatmodel","agent"];
        for (const node of ast.nodes) {
          const t = node.type.toLowerCase();
          if (!AI.some((a) => t.includes(a))) continue;
          const s = ps(node).toLowerCase();
          const hasPii = PII_FIELDS.some((f) => s.includes(f.toLowerCase()));
          if (!hasPii) continue;
          const hasRedaction = ast.nodes.some((n) => {
            const ns = ps(n);
            return /redact|mask|anonymize|pseudonymize|hash.*pii|pii.*hash/i.test(ns);
          });
          if (!hasRedaction) {
            findings.push({
              id: fid("PRV-008", node.id), ruleId: "PRV-008",
              ruleName: "AI Prompt Contains PII Without Redaction",
              severity: "HIGH", category: "PRIVACY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "PII field names in AI prompt with no redaction", detail: `"${node.name}" injects PII into an AI prompt without prior redaction — PII is sent to the AI provider.` },
              humanExplanation: "AI providers log prompts for safety monitoring. Sending PII in prompts means personal data is processed by the AI provider's infrastructure, requiring a DPA.",
              suggestedFix: "Add a redaction step before the AI node to replace PII with pseudonyms or placeholders.",
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/PRV-008", penaltyPoints: 20,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PRV-009",
      name: "User Data Exported Without Anonymisation",
      category: "PRIVACY",
      severity: "HIGH",
      description: "Workflow exports user data to a file or spreadsheet without anonymising identifiers.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 18,
      docReference: "https://flowintel.io/rules/PRV-009",
      detect(ast: ParsedWorkflow): Finding[] {
        const EXPORT = new Set(["n8n-nodes-base.googleSheets","n8n-nodes-base.airtable","n8n-nodes-base.writeBinaryFile","n8n-nodes-base.awsS3"]);
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!EXPORT.has(node.type)) continue;
          const s = ps(node).toLowerCase();
          if (!PII_FIELDS.some((f) => s.includes(f.toLowerCase()))) continue;
          const hasAnon = ast.nodes.some((n) => {
            const ns = ps(n);
            return /anonymize|pseudonymize|hash|mask|redact/i.test(ns);
          });
          if (!hasAnon) {
            findings.push({
              id: fid("PRV-009", node.id), ruleId: "PRV-009",
              ruleName: "User Data Exported Without Anonymisation",
              severity: "HIGH", category: "PRIVACY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "PII exported to storage with no anonymisation", detail: `"${node.name}" exports data containing PII without anonymisation — raw personal data in export files.` },
              humanExplanation: "Exporting unanonymised user data creates uncontrolled copies of PII that are difficult to delete on right-to-erasure requests.",
              suggestedFix: "Add a data anonymisation step before the export node. Hash or pseudonymise identifiers.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-009", penaltyPoints: 18,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PRV-010",
      name: "Missing Right to Erasure Implementation",
      category: "PRIVACY",
      severity: "MEDIUM",
      description: "Workflow stores PII but has no delete/erasure path for GDPR right-to-erasure requests.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/PRV-010",
      detect(ast: ParsedWorkflow): Finding[] {
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb"]);
        const storesPii = ast.nodes.some((n) => {
          if (!DB.has(n.type)) return false;
          const op = String((n.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          return ["insert","create","upsert"].some((v) => op.includes(v));
        });
        if (!storesPii) return [];
        const hasErasure = ast.nodes.some((n) => {
          const s = ps(n);
          return /delete.*user|erasure|rightToDelete|gdpr.*delete|remove.*account/i.test(s);
        });
        if (hasErasure) return [];
        return [{
          id: "PRV-010-workflow", ruleId: "PRV-010",
          ruleName: "Missing Right to Erasure Implementation",
          severity: "MEDIUM", category: "PRIVACY",
          location: {},
          evidence: { summary: "PII stored with no erasure path", detail: "Workflow stores user PII but has no data erasure workflow linked." },
          humanExplanation: "GDPR Article 17 requires implementing right-to-erasure. Storing PII without a deletion mechanism creates legal liability.",
          suggestedFix: "Create a companion workflow that, given a userId, deletes all associated PII from every table it was stored in.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-010", penaltyPoints: 15,
        }];
      },
    },

    {
      id: "PRV-011",
      name: "Unapproved AI Provider Receives Personal Data",
      category: "PRIVACY",
      severity: "HIGH",
      description: "Personal data is sent to an AI provider not on the approved Data Processing Agreement list.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/PRV-011",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const t = node.type.toLowerCase();
          const isUnapproved = [...UNAPPROVED_AI].some((p) => t.includes(p));
          if (!isUnapproved) continue;
          const s = ps(node).toLowerCase();
          if (!PII_FIELDS.some((f) => s.includes(f.toLowerCase()))) continue;
          findings.push({
            id: fid("PRV-011", node.id), ruleId: "PRV-011",
            ruleName: "Unapproved AI Provider Receives Personal Data",
            severity: "HIGH", category: "PRIVACY",
            location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
            evidence: { summary: `Unapproved AI provider: ${node.type}`, detail: `"${node.name}" sends what appears to be personal data to an unapproved AI provider.` },
            humanExplanation: "Processing personal data with an AI provider requires a Data Processing Agreement. Unapproved providers may not offer DPAs.",
            suggestedFix: "Either remove PII from the prompt or switch to an approved AI provider with a signed DPA.",
            marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-011", penaltyPoints: 20,
          });
        }
        return findings;
      },
    },

    {
      id: "PRV-012",
      name: "Missing Data Minimisation — Unnecessary PII Fields Collected",
      category: "PRIVACY",
      severity: "MEDIUM",
      description: "Workflow collects more PII fields than it uses downstream.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/PRV-012",
      detect(ast: ParsedWorkflow): Finding[] {
        const trigger = ast.nodes.find((n) => n.isTrigger);
        if (!trigger) return [];
        const triggerStr = ps(trigger).toLowerCase();
        const collectedPii = PII_FIELDS.filter((f) => triggerStr.includes(f.toLowerCase()));
        if (collectedPii.length === 0) return [];
        const allOtherNodes = ast.nodes.filter((n) => n.id !== trigger.id);
        const usedPii = PII_FIELDS.filter((f) =>
          allOtherNodes.some((n) => ps(n).toLowerCase().includes(f.toLowerCase()))
        );
        const unused = collectedPii.filter((f) => !usedPii.includes(f));
        if (unused.length === 0) return [];
        return [{
          id: fid("PRV-012", trigger.id), ruleId: "PRV-012",
          ruleName: "Missing Data Minimisation — Unnecessary PII Fields Collected",
          severity: "MEDIUM", category: "PRIVACY",
          location: { nodeId: trigger.id, nodeName: trigger.name, nodeType: trigger.type },
          evidence: { summary: `Unused PII: ${unused.join(", ")}`, detail: `Trigger collects PII fields [${unused.join(", ")}] that are never used in downstream nodes.` },
          humanExplanation: "GDPR data minimisation principle: only collect data you actually need. Collecting unused PII increases liability.",
          suggestedFix: `Remove unused PII fields [${unused.join(", ")}] from the trigger input schema.`,
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-012", penaltyPoints: 12,
        }];
      },
    },

    {
      id: "PRV-013",
      name: "Consent Not Verified Before Processing",
      category: "PRIVACY",
      severity: "HIGH",
      description: "Workflow processes user data without checking consent status first.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 18,
      docReference: "https://flowintel.io/rules/PRV-013",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasTrigger = ast.nodes.some((n) => n.isTrigger);
        if (!hasTrigger) return [];
        const storesPii = ast.nodes.some((n) => {
          const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb"]);
          if (!DB.has(n.type)) return false;
          const s = ps(n).toLowerCase();
          return PII_FIELDS.some((f) => s.includes(f.toLowerCase()));
        });
        if (!storesPii) return [];
        const hasConsentCheck = ast.nodes.some((n) => {
          const s = ps(n);
          return /consent|optIn|hasConsented|gdpr_consent|marketingConsent/i.test(s);
        });
        if (hasConsentCheck) return [];
        return [{
          id: "PRV-013-workflow", ruleId: "PRV-013",
          ruleName: "Consent Not Verified Before Processing",
          severity: "HIGH", category: "PRIVACY",
          location: {},
          evidence: { summary: "PII processing without consent check", detail: "Workflow stores PII without verifying the user has consented to this processing." },
          humanExplanation: "GDPR Article 6 requires a lawful basis for processing. Without a consent check, processing PII may be unlawful.",
          suggestedFix: "Add an If node early in the workflow that checks the user's consent status and exits if consent is not given.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-013", penaltyPoints: 18,
        }];
      },
    },
  ],
};
