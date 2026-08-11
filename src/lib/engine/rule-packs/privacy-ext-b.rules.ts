/**
 * FlowIntel Privacy Extension B — PRV-014 to PRV-025
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

export const PRIVACY_EXT_B: RulePackManifest = {
  id: "flowintel-privacy-ext-b",
  name: "FlowIntel Privacy Extension B",
  version: "2.0.0",
  description: "PRV-014 through PRV-025: access control, profiling, cross-border, children's data.",
  rules: [
    {
      id: "PRV-014",
      name: "User Profile Built Without Purpose Limitation",
      category: "PRIVACY",
      severity: "HIGH",
      description: "Workflow aggregates multiple PII fields into a user profile without a documented purpose.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 18,
      docReference: "https://flowintel.io/rules/PRV-014",
      detect(ast: ParsedWorkflow): Finding[] {
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb","n8n-nodes-base.airtable"]);
        const piiFields = ["email","phone","address","dateOfBirth","firstName","lastName","ipAddress","deviceId","location"];
        let piiCount = 0;
        const writesNode = ast.nodes.find((n) => {
          if (!DB.has(n.type)) return false;
          const op = String((n.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          if (!["insert","upsert","create","update"].some((v) => op.includes(v))) return false;
          const s = ps(n).toLowerCase();
          const fields = piiFields.filter((f) => s.includes(`"${f}"`));
          piiCount = fields.length;
          return fields.length >= 4;
        });
        if (!writesNode) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasPurpose = meta?.processingPurpose || meta?.dataUsage || meta?.purposeStatement;
        if (hasPurpose) return [];
        return [{
          id: fid("PRV-014", writesNode.id), ruleId: "PRV-014",
          ruleName: "User Profile Built Without Purpose Limitation",
          severity: "HIGH", category: "PRIVACY",
          location: { nodeId: writesNode.id, nodeName: writesNode.name, nodeType: writesNode.type },
          evidence: { summary: `${piiCount} PII fields aggregated without purpose statement`, detail: `"${writesNode.name}" combines ${piiCount} PII fields into a record with no documented processing purpose.` },
          humanExplanation: "GDPR purpose limitation (Article 5): data collected for one purpose cannot be reused for another without new consent. Aggregating profiles without a stated purpose violates this.",
          suggestedFix: "Add a 'processingPurpose' field to workflow metadata describing why this data is collected and how it will be used.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-014", penaltyPoints: 18,
        }];
      },
    },

    {
      id: "PRV-015",
      name: "Missing Access Control on PII-Handling Webhook",
      category: "PRIVACY",
      severity: "CRITICAL",
      description: "Webhook that processes PII has no authentication — anyone can submit/access personal data.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 30,
      docReference: "https://flowintel.io/rules/PRV-015",
      detect(ast: ParsedWorkflow): Finding[] {
        const webhooks = ast.nodes.filter((n) => n.type === "n8n-nodes-base.webhook");
        if (webhooks.length === 0) return [];
        const piiFields = ["email","phone","ssn","creditCard","dateOfBirth"];
        const handlesPii = ast.nodes.some((n) => {
          const s = ps(n).toLowerCase();
          return piiFields.some((f) => s.includes(`"${f}"`));
        });
        if (!handlesPii) return [];
        return webhooks.filter((node) => {
          const pp = node.parameters as Record<string,unknown> | undefined;
          const auth = pp?.authentication ?? pp?.auth;
          return !auth || auth === "none";
        }).map((node) => ({
          id: fid("PRV-015", node.id), ruleId: "PRV-015",
          ruleName: "Missing Access Control on PII-Handling Webhook",
          severity: "CRITICAL" as const, category: "PRIVACY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Unauthenticated webhook processes PII", detail: `"${node.name}" is an unauthenticated webhook that handles personal data — anyone can submit or trigger PII processing.` },
          humanExplanation: "An unauthenticated endpoint accepting PII allows anyone to submit personal data into your systems, creating GDPR liability.",
          suggestedFix: "Enable authentication on the webhook node and validate the caller's identity before processing any personal data.",
          marketplaceBlocking: true, docReference: "https://flowintel.io/rules/PRV-015", penaltyPoints: 30,
        }));
      },
    },

    {
      id: "PRV-016",
      name: "Biometric Data Processing Without Explicit Consent",
      category: "PRIVACY",
      severity: "CRITICAL",
      description: "Workflow processes biometric data (face, fingerprint, voice) — requires explicit consent under GDPR Article 9.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 35,
      docReference: "https://flowintel.io/rules/PRV-016",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = ps(node).toLowerCase();
          if (/biometric|faceId|fingerprint|voiceprint|retina|iris.*scan/i.test(s)) {
            const meta = ast.metadata as Record<string,unknown> | undefined;
            const hasConsent = meta?.explicitConsent || meta?.article9Basis || meta?.biometricConsent;
            if (!hasConsent) {
              findings.push({
                id: fid("PRV-016", node.id), ruleId: "PRV-016",
                ruleName: "Biometric Data Processing Without Explicit Consent",
                severity: "CRITICAL", category: "PRIVACY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: { summary: "Biometric data processing detected", detail: `"${node.name}" processes biometric data without documented explicit consent (GDPR Article 9 special category).` },
                humanExplanation: "Biometric data is a GDPR special category. Processing it requires explicit consent or another Article 9 exception, with documentation.",
                suggestedFix: "Add Article 9 lawful basis documentation to workflow metadata and implement explicit consent collection before processing.",
                marketplaceBlocking: true, docReference: "https://flowintel.io/rules/PRV-016", penaltyPoints: 35,
              });
            }
          }
        }
        return findings;
      },
    },

    {
      id: "PRV-017",
      name: "Children's Data Processing Without Age Verification",
      category: "PRIVACY",
      severity: "CRITICAL",
      description: "Workflow may process data from minors without age verification (COPPA/GDPR Article 8).",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 35,
      docReference: "https://flowintel.io/rules/PRV-017",
      detect(ast: ParsedWorkflow): Finding[] {
        const FIELD_NAMES = [
          "age", "dob", "dateOfBirth", "date_of_birth", "minor", "children",
          "childAge", "child_age", "userAge", "user_age", "patientAge", "patient_age",
          "isMinor", "is_minor", "parentalConsent", "parental_consent", "under13", "under16"
        ];

        let keyHit = false;
        for (const param of ast.extractedParameters) {
          const segments = param.key.split('.');
          const lastSegment = segments[segments.length - 1];
          if (FIELD_NAMES.some((f) => f.toLowerCase() === lastSegment.toLowerCase())) {
            keyHit = true;
            break;
          }
        }

        const allParams = JSON.stringify(ast.nodes.map((n) => n.parameters)).toLowerCase();
        const blobHit = FIELD_NAMES.some((f) => allParams.includes(`"${f.toLowerCase()}"`));

        if (!keyHit && !blobHit) return [];

        const hasAgeVerification = ast.nodes.some((n) => {
          const ns = ps(n);
          return /ageVerification|verifyAge|isAdult|age.*>=.*18|age.*>=.*13/i.test(ns);
        });
        if (hasAgeVerification) return [];
        return [{
          id: "PRV-017-workflow", ruleId: "PRV-017",
          ruleName: "Children's Data Processing Without Age Verification",
          severity: "CRITICAL", category: "PRIVACY",
          location: {},
          evidence: { summary: "Age-related data with no age gate", detail: "Workflow handles age or date-of-birth data but has no age verification to prevent processing children's data." },
          humanExplanation: "COPPA (US) and GDPR Article 8 (EU) impose strict rules on processing data from children. Without age verification you cannot distinguish adult from child data.",
          suggestedFix: "Add an age verification step that rejects processing for users under 13 (COPPA) or under 16 (GDPR).",
          marketplaceBlocking: true, docReference: "https://flowintel.io/rules/PRV-017", penaltyPoints: 35,
        }];
      },
    },

    {
      id: "PRV-018",
      name: "Health Data Sent to Third Party Without DPA",
      category: "PRIVACY",
      severity: "CRITICAL",
      description: "Health or medical data flows to a third-party service without documented DPA.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 35,
      docReference: "https://flowintel.io/rules/PRV-018",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const HEALTH_FIELDS = /health|medical|diagnosis|medication|patient|symptom|allergy|prescription|hipaa/i;
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const s = ps(node);
          if (!HEALTH_FIELDS.test(s)) continue;
          const meta = ast.metadata as Record<string,unknown> | undefined;
          const hasDpa = meta?.dataProcessingAgreement || meta?.hipaaCompliance || meta?.article9Basis;
          if (!hasDpa) {
            findings.push({
              id: fid("PRV-018", node.id), ruleId: "PRV-018",
              ruleName: "Health Data Sent to Third Party Without DPA",
              severity: "CRITICAL", category: "PRIVACY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Health data in HTTP request, no DPA documented", detail: `"${node.name}" sends health-related data to a third party without documented HIPAA BAA or GDPR DPA.` },
              humanExplanation: "Health data is among the most sensitive categories. Sharing it with third parties without a BAA/DPA is a HIPAA and GDPR violation.",
              suggestedFix: "Verify you have a signed BAA/DPA with the third party. Document it in workflow metadata.",
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/PRV-018", penaltyPoints: 35,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PRV-019",
      name: "IP Address Logged Without Pseudonymisation",
      category: "PRIVACY",
      severity: "MEDIUM",
      description: "Workflow logs IP addresses — personal data under GDPR — without pseudonymisation.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PRV-019",
      detect(ast: ParsedWorkflow): Finding[] {
        const logsIp = ast.nodes.some((n) => {
          const s = ps(n).toLowerCase();
          return /ip.*address|remoteAddress|x-forwarded-for|clientIp/i.test(s);
        });
        if (!logsIp) return [];
        const hasAnon = ast.nodes.some((n) => {
          const s = ps(n);
          return /anonymize|pseudonymize|hash.*ip|ip.*hash|truncate.*ip/i.test(s);
        });
        if (hasAnon) return [];
        return [{
          id: "PRV-019-workflow", ruleId: "PRV-019",
          ruleName: "IP Address Logged Without Pseudonymisation",
          severity: "MEDIUM", category: "PRIVACY",
          location: {},
          evidence: { summary: "IP address collected with no anonymisation", detail: "Workflow captures client IP addresses without pseudonymisation — IP is personal data under GDPR." },
          humanExplanation: "The EU Court of Justice confirmed that IP addresses are personal data. Storing them without anonymisation requires a lawful basis.",
          suggestedFix: "Truncate the last octet of IPv4 addresses (x.x.x.0) or hash IPv6 addresses before storing.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-019", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "PRV-020",
      name: "Data Sharing With Subprocessor Not Documented",
      category: "PRIVACY",
      severity: "MEDIUM",
      description: "Workflow sends data to a third-party service not listed as an approved subprocessor.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PRV-020",
      detect(ast: ParsedWorkflow): Finding[] {
        const httpNodes = ast.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
        if (httpNodes.length === 0) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasSubprocessorList = meta?.subprocessors || meta?.approvedRecipients || meta?.dataRecipients;
        if (hasSubprocessorList) return [];
        const s = ast.nodes.map((n) => ps(n)).join(" ").toLowerCase();
        const hasPii = ["email","phone","userId","customerId"].some((f) => s.includes(`"${f}"`));
        if (!hasPii) return [];
        return [{
          id: "PRV-020-workflow", ruleId: "PRV-020",
          ruleName: "Data Sharing With Subprocessor Not Documented",
          severity: "MEDIUM", category: "PRIVACY",
          location: {},
          evidence: { summary: "PII sent to external services, no subprocessor list", detail: `Workflow sends personal data to ${httpNodes.length} external HTTP endpoint(s) with no subprocessor documentation.` },
          humanExplanation: "GDPR Article 28 requires documenting all subprocessors who receive personal data. Missing documentation creates audit risk.",
          suggestedFix: "Add a 'subprocessors' list to workflow metadata identifying each external service that receives personal data.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-020", penaltyPoints: 12,
        }];
      },
    },

    {
      id: "PRV-021",
      name: "Personal Data in URL Query Parameters",
      category: "PRIVACY",
      severity: "HIGH",
      description: "Personal data passed as URL query parameters — appears in server logs.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/PRV-021",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const pp = node.parameters as Record<string,unknown> | undefined;
          const url = String(pp?.url ?? "");
          if (/[?&](?:email|phone|name|userId|customerId)=/i.test(url)) {
            findings.push({
              id: fid("PRV-021", node.id), ruleId: "PRV-021",
              ruleName: "Personal Data in URL Query Parameters",
              severity: "HIGH", category: "PRIVACY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type, paramPath: "/parameters/url" },
              evidence: { summary: "PII in URL query string", value: url.slice(0, 80), detail: `"${node.name}" passes personal data as URL query parameters — visible in server access logs.` },
              humanExplanation: "Personal data in URLs is logged by every proxy, CDN, and web server in the path — a serious privacy violation.",
              suggestedFix: "Move personal data to the POST body or request headers instead of URL query parameters.",
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/PRV-021", penaltyPoints: 20,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PRV-022",
      name: "Missing Privacy Policy Reference",
      category: "PRIVACY",
      severity: "LOW",
      description: "Workflow that collects user data has no reference to a privacy policy.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/PRV-022",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasTrigger = ast.nodes.some((n) => n.isTrigger && n.isHttp);
        if (!hasTrigger) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasPolicy = meta?.privacyPolicyUrl || meta?.privacyPolicy || meta?.termsUrl;
        if (hasPolicy) return [];
        return [{
          id: "PRV-022-workflow", ruleId: "PRV-022",
          ruleName: "Missing Privacy Policy Reference",
          severity: "LOW", category: "PRIVACY",
          location: {},
          evidence: { summary: "No privacy policy URL in metadata", detail: "Workflow collects data via HTTP trigger but has no privacy policy reference in its metadata." },
          humanExplanation: "GDPR Article 13 requires informing users about data processing. Published workflows should reference a privacy policy.",
          suggestedFix: "Add a privacyPolicyUrl to workflow metadata pointing to your privacy policy.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-022", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "PRV-023",
      name: "Unencrypted PII at Rest in Plaintext Field",
      category: "PRIVACY",
      severity: "HIGH",
      description: "Sensitive personal data stored in a field with no encryption or hashing.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 18,
      docReference: "https://flowintel.io/rules/PRV-023",
      detect(ast: ParsedWorkflow): Finding[] {
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb"]);
        const findings: Finding[] = [];
        const SENSITIVE = ["ssn","nationalId","passport","creditCard","bankAccount","password"];
        for (const node of ast.nodes) {
          if (!DB.has(node.type)) return [];
          const s = ps(node).toLowerCase();
          const sensitiveFields = SENSITIVE.filter((f) => s.includes(`"${f.toLowerCase()}"`));
          if (sensitiveFields.length === 0) continue;
          const hasEncryption = ast.nodes.some((n) => {
            const ns = ps(n);
            return /encrypt|bcrypt|argon|pbkdf|AES|hash.*password/i.test(ns);
          });
          if (!hasEncryption) {
            findings.push({
              id: fid("PRV-023", node.id), ruleId: "PRV-023",
              ruleName: "Unencrypted PII at Rest in Plaintext Field",
              severity: "HIGH", category: "PRIVACY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Sensitive fields without encryption: ${sensitiveFields.join(", ")}`, detail: `"${node.name}" stores highly sensitive fields [${sensitiveFields.join(", ")}] without encryption.` },
              humanExplanation: "Storing national IDs, SSNs, or bank details in plaintext means a database breach exposes all values immediately.",
              suggestedFix: "Encrypt highly sensitive fields with AES-256 before storage, or hash passwords with bcrypt/argon2.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-023", penaltyPoints: 18,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PRV-024",
      name: "Third-Party Analytics Receives PII",
      category: "PRIVACY",
      severity: "HIGH",
      description: "Analytics or tracking service receives personal data that should be anonymised.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/PRV-024",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const ANALYTICS_DOMAINS = ["segment.io","mixpanel.com","amplitude.com","heap.io","intercom.io","ga4","google-analytics"];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const url = String((node.parameters as Record<string,unknown>)?.url ?? "").toLowerCase();
          if (!ANALYTICS_DOMAINS.some((d) => url.includes(d))) continue;
          const s = ps(node).toLowerCase();
          const hasPii = ["email","phone","name","userId"].some((f) => s.includes(`"${f}"`));
          if (hasPii) {
            findings.push({
              id: fid("PRV-024", node.id), ruleId: "PRV-024",
              ruleName: "Third-Party Analytics Receives PII",
              severity: "HIGH", category: "PRIVACY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "PII sent to analytics service", detail: `"${node.name}" sends personal data to an analytics platform — most analytics DPAs prohibit PII.` },
              humanExplanation: "Analytics platforms like Mixpanel and Amplitude explicitly prohibit PII in their DPAs. Sending it violates the agreement and GDPR.",
              suggestedFix: "Replace PII fields with anonymous identifiers (hashed userId) before sending to analytics platforms.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-024", penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PRV-025",
      name: "Missing Data Breach Notification Workflow",
      category: "PRIVACY",
      severity: "MEDIUM",
      description: "System handles significant PII volume but has no breach detection or notification path.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PRV-025",
      detect(ast: ParsedWorkflow): Finding[] {
        const piiFields = ["email","phone","ssn","creditCard","dateOfBirth"];
        const piiCount = piiFields.filter((f) =>
          ast.nodes.some((n) => ps(n).toLowerCase().includes(`"${f}"`))
        ).length;
        if (piiCount < 3) return [];
        const hasBreach = ast.nodes.some((n) => {
          const s = ps(n);
          return /breach|security.*incident|dataLeak|notify.*dpa|supervisory.*authority/i.test(s);
        });
        if (hasBreach) return [];
        return [{
          id: "PRV-025-workflow", ruleId: "PRV-025",
          ruleName: "Missing Data Breach Notification Workflow",
          severity: "MEDIUM", category: "PRIVACY",
          location: {},
          evidence: { summary: `Processes ${piiCount} PII categories with no breach notification path`, detail: `Workflow handles ${piiCount} categories of PII but has no breach detection or notification mechanism.` },
          humanExplanation: "GDPR Article 33 requires notifying supervisory authorities within 72 hours of a breach. Without detection logic, you cannot meet this deadline.",
          suggestedFix: "Create a companion breach-notification workflow that, on detection of a data incident, notifies the DPO and supervisory authority.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PRV-025", penaltyPoints: 10,
        }];
      },
    },
  ],
};
