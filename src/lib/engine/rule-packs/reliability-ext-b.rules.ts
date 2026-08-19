/**
 * FlowIntel Reliability Extension B — REL-019 to REL-034
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

export const RELIABILITY_EXT_B: RulePackManifest = {
  id: "flowintel-reliability-ext-b",
  name: "FlowIntel Reliability Extension B",
  version: "2.0.0",
  description: "REL-019 through REL-034: recovery gaps, missing alerts, safe-shutdown, partition tolerance, LLM JSON parsing, retry backoff, and batch isolation.",
  rules: [
    {
      id: "REL-019",
      name: "Unhandled Promise Rejection in Code Node",
      category: "RELIABILITY",
      severity: "HIGH",
      description: "Code node uses async/await without a try-catch wrapper.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/REL-019",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          const hasAsync = /\bawait\b/.test(code);
          const hasTryCatch = /try\s*\{/.test(code);
          if (hasAsync && !hasTryCatch) {
            findings.push({
              id: fid("REL-019", node.id), ruleId: "REL-019",
              ruleName: "Unhandled Promise Rejection in Code Node",
              severity: "HIGH", category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "await without try-catch", detail: `"${node.name}" uses await but has no try-catch — any rejected promise crashes the node.` },
              humanExplanation: "Unhandled promise rejections in n8n code nodes cause the entire execution to fail with no recovery path.",
              suggestedFix: `Wrap the async code in "${node.name}" with try { ... } catch (err) { ... } to handle rejections gracefully.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-019", penaltyPoints: 12,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "REL-020",
      name: "Missing Input Type Validation Before DB Write",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "Data written to a database has no type/null check before the write node.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/REL-020",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const DB_WRITE = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb","n8n-nodes-base.airtable"]);
        for (const node of ast.nodes) {
          if (!DB_WRITE.has(node.type)) continue;
          const op = String((node.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          if (!["insert","create","upsert","write","append","add"].some((v) => op.includes(v))) continue;
          // Check for a validation/IF node immediately upstream
          const upstream = ast.edges.filter((e) => e.target === node.name).map((e) => e.source);
          const hasValidation = upstream.some((src) => {
            const srcNode = ast.nodes.find((n) => n.name === src);
            if (!srcNode) return false;
            return srcNode.type === "n8n-nodes-base.if" || srcNode.isCode;
          });
          if (!hasValidation) {
            findings.push({
              id: fid("REL-020", node.id), ruleId: "REL-020",
              ruleName: "Missing Input Type Validation Before DB Write",
              severity: "MEDIUM", category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "DB write without upstream validation", detail: `"${node.name}" writes to a database without an upstream If or Code validation node.` },
              humanExplanation: "Writing null/wrong-type values to a database causes constraint violations, corrupt records, or silent data loss.",
              suggestedFix: `Add an If node before "${node.name}" that validates required fields are non-null and correctly typed.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-020", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "REL-021",
      name: "Retry With No Wait Interval",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "Retry is enabled but waitBetweenTries is zero — instant hammering on failure.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/REL-021",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const pp = node.parameters as Record<string,unknown> | undefined;
          if (!pp) continue;
          const opts = (pp.options ?? {}) as Record<string,unknown>;
          const hasRetry = pp.retryOnFail === true || opts.retryOnFail === true;
          if (!hasRetry) continue;
          const wait = Number(pp.waitBetweenTries ?? opts.waitBetweenTries ?? 0);
          if (wait === 0) {
            findings.push({
              id: fid("REL-021", node.id), ruleId: "REL-021",
              ruleName: "Retry With No Wait Interval",
              severity: "MEDIUM", category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Retry enabled with 0ms wait", detail: `"${node.name}" retries immediately on failure — instant retry hammering a failing service.` },
              humanExplanation: "Zero-wait retries hammer a struggling service, preventing recovery and worsening cascading failures.",
              suggestedFix: `Set waitBetweenTries to at least 1000ms on "${node.name}" to give the downstream service recovery time.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-021", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "REL-022",
      name: "Missing Graceful Degradation on AI Failure",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "AI node failure has no fallback path — entire workflow breaks when AI provider is unavailable.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/REL-022",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const AI = ["langchain","openai","anthropic","llm","chatmodel"];
        for (const node of ast.nodes) {
          const t = node.type.toLowerCase();
          if (!AI.some((a) => t.includes(a))) continue;
          const hasErrorEdge = ast.edges.some((e) => e.source === node.name && (e.sourceHandle === "error" || e.type === "error"));
          const pp = node.parameters as Record<string,unknown> | undefined;
          const hasContinue = pp?.continueOnFail === true || (pp?.options as Record<string,unknown>)?.continueOnFail === true;
          if (!hasErrorEdge && !hasContinue) {
            findings.push({
              id: fid("REL-022", node.id), ruleId: "REL-022",
              ruleName: "Missing Graceful Degradation on AI Failure",
              severity: "MEDIUM", category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "AI node with no error/fallback path", detail: `"${node.name}" has no error branch — AI provider outage breaks the entire workflow.` },
              humanExplanation: "AI providers have outages. A workflow with no AI fallback stops working completely when the provider is down.",
              suggestedFix: `Enable Continue On Fail on "${node.name}" and add a Set node on the error path that provides a default/cached response.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-022", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "REL-023",
      name: "Empty Item List Not Handled",
      category: "RELIABILITY",
      severity: "LOW",
      description: "Workflow does not check for empty arrays before processing — may produce silent no-ops.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/REL-023",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasLoop = ast.nodes.some((n) => n.type === "n8n-nodes-base.splitInBatches" || n.type === "n8n-nodes-base.loopNode");
        if (!hasLoop) return [];
        const hasEmptyCheck = ast.nodes.some((n) => {
          const s = ps(n);
          return /length\s*===?\s*0|isEmpty|\.length\b.*if/i.test(s);
        });
        if (hasEmptyCheck) return [];
        return [{
          id: "REL-023-workflow", ruleId: "REL-023",
          ruleName: "Empty Item List Not Handled",
          severity: "LOW", category: "RELIABILITY",
          location: {},
          evidence: { summary: "Loop without empty-array guard", detail: "Workflow iterates a list without checking if it is empty — edge cases with empty inputs may produce confusing behaviour." },
          humanExplanation: "Processing an empty list without a guard can cause zero executions with no log entry — making debugging difficult.",
          suggestedFix: "Add an If node before the loop that checks $json.items.length > 0 and exits cleanly with a log message if empty.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-023", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "REL-024",
      name: "Missing Execution Timeout on Entire Workflow",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "No workflow-level execution timeout is set in workflow settings.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/REL-024",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const settings = meta?.settings as Record<string,unknown> | undefined;
        const hasTimeout = settings?.executionTimeout || settings?.timeout;
        if (hasTimeout) return [];
        if (ast.nodes.length < 8) return [];
        return [{
          id: "REL-024-workflow", ruleId: "REL-024",
          ruleName: "Missing Execution Timeout on Entire Workflow",
          severity: "MEDIUM", category: "RELIABILITY",
          location: {},
          evidence: { summary: "No execution timeout in workflow settings", detail: "Workflow has no maximum execution time configured — a stuck execution runs until the global n8n timeout." },
          humanExplanation: "Workflows without a timeout can run for hours, consuming concurrency slots and preventing other workflows from executing.",
          suggestedFix: "Set a workflow-level execution timeout (e.g. 300 seconds) in Workflow Settings → Execution Timeout.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-024", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "REL-025",
      name: "Third-Party Service Without SLA Awareness",
      category: "RELIABILITY",
      severity: "LOW",
      description: "Workflow integrates a third-party service with known reliability issues without compensating logic.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/REL-025",
      detect(ast: ParsedWorkflow): Finding[] {
        // Services historically known for reliability issues
        const UNRELIABLE = new Set(["n8n-nodes-base.twitter","n8n-nodes-base.instagram","n8n-nodes-base.facebookGraphApi"]);
        const found = ast.nodes.filter((n) => UNRELIABLE.has(n.type));
        if (found.length === 0) return [];
        const hasRetry = found.every((n) => {
          const pp = n.parameters as Record<string,unknown> | undefined;
          return pp?.retryOnFail === true;
        });
        if (hasRetry) return [];
        return found.filter((n) => {
          const pp = n.parameters as Record<string,unknown> | undefined;
          return pp?.retryOnFail !== true;
        }).map((node) => ({
          id: fid("REL-025", node.id), ruleId: "REL-025",
          ruleName: "Third-Party Service Without SLA Awareness",
          severity: "LOW" as const, category: "RELIABILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: `${node.type} without retry compensation`, detail: `"${node.name}" uses a service with variable reliability without retry or fallback logic.` },
          humanExplanation: "Some third-party APIs have high error rates or rate limits. Workflows must compensate with retry or caching.",
          suggestedFix: `Enable retry on "${node.name}" and add a fallback path for when the service is unavailable.`,
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-025", penaltyPoints: 5,
        }));
      },
    },

    {
      id: "REL-026",
      name: "Missing Rate-Limit Response Handling",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "HTTP nodes do not handle 429 Too Many Requests responses.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/REL-026",
      detect(ast: ParsedWorkflow): Finding[] {
        const httpNodes = ast.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
        if (httpNodes.length === 0) return [];
        const handles429 = ast.nodes.some((n) => {
          const s = ps(n);
          return /429|rateLimitExceeded|too many requests|retryAfter|Retry-After/i.test(s);
        });
        if (handles429) return [];
        return httpNodes.slice(0, 1).map((node) => ({
          id: fid("REL-026", node.id), ruleId: "REL-026",
          ruleName: "Missing Rate-Limit Response Handling",
          severity: "MEDIUM" as const, category: "RELIABILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "No 429 handling logic found", detail: "Workflow makes HTTP requests but does not handle 429 rate-limit responses — will crash on throttling." },
          humanExplanation: "APIs rate-limit callers. Without handling 429s, the workflow crashes instead of waiting and retrying.",
          suggestedFix: "Add a Code node that checks the status code; if 429, wait for the Retry-After header duration before retrying.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-026", penaltyPoints: 10,
        }));
      },
    },

    {
      id: "REL-027",
      name: "Synchronous Webhook — Slow Downstream",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "Synchronous webhook waits for slow downstream (AI/DB) before responding — callers may time out.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/REL-027",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasWebhook = ast.nodes.some((n) => n.type === "n8n-nodes-base.webhook");
        if (!hasWebhook) return [];
        const SLOW = new Set(["@n8n/n8n-nodes-langchain.openAi","n8n-nodes-base.openAi","n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb"]);
        const hasSlowNode = ast.nodes.some((n) => SLOW.has(n.type));
        if (!hasSlowNode) return [];
        // Check if workflow responds immediately (async pattern) before the slow nodes
        const webhook = ast.nodes.find((n) => n.type === "n8n-nodes-base.webhook")!;
        const immediateResp = ast.edges.some((e) => {
          if (e.source !== webhook.name) return false;
          const target = ast.nodes.find((n) => n.name === e.target);
          return target?.type === "n8n-nodes-base.respondToWebhook";
        });
        if (immediateResp) return [];
        return [{
          id: fid("REL-027", webhook.id), ruleId: "REL-027",
          ruleName: "Synchronous Webhook — Slow Downstream",
          severity: "MEDIUM", category: "RELIABILITY",
          location: { nodeId: webhook.id, nodeName: webhook.name, nodeType: webhook.type },
          evidence: { summary: "Synchronous webhook with slow AI/DB operations", detail: "Webhook waits for AI/DB processing before responding — callers with short timeouts will get errors." },
          humanExplanation: "Holding open an HTTP connection through slow operations causes timeouts in the calling system (e.g. 30-second HTTP timeouts).",
          suggestedFix: "Respond immediately with a job ID, then process asynchronously. Send results via callback or polling endpoint.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-027", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "REL-028",
      name: "Missing Rollback Logic on Multi-Step Write",
      category: "RELIABILITY",
      severity: "HIGH",
      description: "Workflow writes to multiple systems but has no compensating rollback if a later step fails.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/REL-028",
      detect(ast: ParsedWorkflow): Finding[] {
        const WRITE = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb","n8n-nodes-base.airtable","n8n-nodes-base.stripe"]);
        const writeNodes = ast.nodes.filter((n) => {
          if (!WRITE.has(n.type)) return false;
          const op = String((n.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          return ["insert","create","charge","upsert","update","write"].some((v) => op.includes(v));
        });
        if (writeNodes.length < 2) return [];
        const hasRollback = ast.nodes.some((n) => {
          const s = ps(n);
          return /rollback|compensat|undo|reverse|cancel|refund/i.test(s);
        });
        if (hasRollback) return [];
        return [{
          id: "REL-028-workflow", ruleId: "REL-028",
          ruleName: "Missing Rollback Logic on Multi-Step Write",
          severity: "HIGH", category: "RELIABILITY",
          location: {},
          evidence: { summary: `${writeNodes.length} write nodes with no rollback`, detail: `Workflow writes to ${writeNodes.length} systems (${writeNodes.map((n) => n.name).join(", ")}) with no compensating rollback — partial failure leaves data in inconsistent state.` },
          humanExplanation: "Partial writes without rollback create data inconsistencies — e.g. charging a customer but failing to create their account.",
          suggestedFix: "Implement saga pattern: on error, add compensating actions (refund charge, delete created record) on the error path.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-028", penaltyPoints: 15,
        }];
      },
    },

    {
      id: "REL-029",
      name: "Missing Output Validation After Data Transform",
      category: "RELIABILITY",
      severity: "LOW",
      description: "Set/Edit Fields transformation has no downstream validation — silent data corruption.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/REL-029",
      detect(ast: ParsedWorkflow): Finding[] {
        const transformNodes = ast.nodes.filter((n) =>
          n.type === "n8n-nodes-base.set" || n.type === "n8n-nodes-base.editFields"
        );
        if (transformNodes.length === 0) return [];
        const hasValidation = ast.nodes.some((n) => {
          const s = ps(n);
          return n.type === "n8n-nodes-base.if" || /assert|validate|schema/i.test(s);
        });
        if (hasValidation) return [];
        return transformNodes.slice(0, 1).map((node) => ({
          id: fid("REL-029", node.id), ruleId: "REL-029",
          ruleName: "Missing Output Validation After Data Transform",
          severity: "LOW" as const, category: "RELIABILITY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Transform node with no downstream validation", detail: `"${node.name}" transforms data but there is no If or Code node downstream to validate the result.` },
          humanExplanation: "Silent field mismatches after transformations cause downstream write failures or incorrect business logic.",
          suggestedFix: "Add an If node after the transform to verify key output fields are defined and correctly typed.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-029", penaltyPoints: 5,
        }));
      },
    },

    {
      id: "REL-030",
      name: "Unacknowledged Webhook — Fire and Forget Risk",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "Workflow triggered by webhook but never sends a response — provider will retry delivery.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/REL-030",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasWebhook = ast.nodes.some((n) => n.type === "n8n-nodes-base.webhook");
        if (!hasWebhook) return [];
        const hasResponse = ast.nodes.some((n) => n.type === "n8n-nodes-base.respondToWebhook");
        if (hasResponse) return [];
        const webhook = ast.nodes.find((n) => n.type === "n8n-nodes-base.webhook")!;
        return [{
          id: fid("REL-030", webhook.id), ruleId: "REL-030",
          ruleName: "Unacknowledged Webhook — Fire and Forget Risk",
          severity: "MEDIUM", category: "RELIABILITY",
          location: { nodeId: webhook.id, nodeName: webhook.name, nodeType: webhook.type },
          evidence: { summary: "Webhook with no Respond to Webhook node", detail: "This webhook workflow never sends a response. The sender will wait until timeout and may retry delivery, causing duplicate executions." },
          humanExplanation: "Without an explicit response, webhook senders assume failure and retry — causing duplicate processing and potential double-charges or double-writes.",
          suggestedFix: "Add a Respond to Webhook node early in the workflow that immediately returns HTTP 200 to acknowledge receipt.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-030", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "REL-031",
      name: "Fragile JSON Parsing on LLM Output",
      category: "RELIABILITY",
      severity: "HIGH",
      description: "Code node invokes JSON.parse on upstream LLM output without stripping markdown code fences or wrapping in try/catch.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/REL-031",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          const hasUpstreamAi = ast.aiNodesCount > 0 || ast.nodes.some((n) => n.isAi);

          for (const node of ast.nodes) {
            if (!node.isCode) continue;
            const code = String(node.codeMeta?.codeSnippet ?? ps(node));

            if (!code.includes("JSON.parse")) continue;

            const referencesAi =
              hasUpstreamAi ||
              /(ai|llm|chat|openai|anthropic|completion|response|model|prompt|gpt)/i.test(code);

            if (!referencesAi) continue;

            const hasTryCatch = /try\s*\{[\s\S]*JSON\.parse[\s\S]*\}\s*catch/i.test(code);
            const hasFenceStripping =
              /replace\s*\(\s*\/[`]{3}(json)?|replace\s*\(\s*["']```(json)?/i.test(code) ||
              /replace\s*\(\s*[`"']```/i.test(code) ||
              /match\s*\(\s*\/\{[\s\S]*\}/i.test(code) ||
              /substring|slice/i.test(code);

            if (!hasTryCatch || !hasFenceStripping) {
              findings.push({
                id: fid("REL-031", node.id),
                ruleId: "REL-031",
                ruleName: "Fragile JSON Parsing on LLM Output",
                severity: "HIGH",
                category: "RELIABILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: "JSON.parse on LLM output without markdown fence stripping or try-catch",
                  detail: `"${node.name}" uses JSON.parse on AI output without stripping markdown fences (\`\`\`json) or wrapping in try/catch. LLMs frequently return markdown-wrapped JSON which causes JSON.parse to throw.`,
                },
                humanExplanation: "LLM responses often wrap JSON in ```json ... ``` markdown fences or add conversational preamble. Direct JSON.parse without fence stripping or error handling causes workflow crashes.",
                suggestedFix: "1) Strip markdown fences: text.replace(/```json\\n?|```/g, '').trim(). 2) Wrap JSON.parse in a try/catch block with fallback handling.",
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/REL-031",
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
      id: "REL-032",
      name: "Make/PA Error Directive Recognition",
      category: "RELIABILITY",
      severity: "INFO",
      description: "Recognizes and verifies valid platform error handling directives (Make BasicBreak/Resume/Ignore/Commit/Rollback and Power Automate runAfter Failed/TimedOut).",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 0,
      docReference: "https://flowintel.io/rules/REL-032",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          const MAKE_DIRECTIVES = ["BasicBreak", "BasicResume", "BasicIgnore", "BasicCommit", "BasicRollback"];

          for (const node of ast.nodes) {
            const s = ps(node);
            const t = node.type;

            const makeMatch = MAKE_DIRECTIVES.find((dir) => t.includes(dir) || s.includes(dir));
            if (makeMatch) {
              findings.push({
                id: fid("REL-032", node.id),
                ruleId: "REL-032",
                ruleName: "Make/PA Error Directive Recognition",
                severity: "INFO",
                category: "RELIABILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: `Make error handling directive recognized: ${makeMatch}`,
                  detail: `"${node.name}" uses Make native error directive "${makeMatch}" to handle downstream failures.`,
                },
                humanExplanation: "Make error directives (Break, Resume, Ignore, Commit, Rollback) provide platform-native resilience and error recovery.",
                suggestedFix: "No action needed — native Make error directive recognized.",
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/REL-032",
                penaltyPoints: 0,
              });
              continue;
            }

            const p = (node.parameters ?? {}) as Record<string, unknown>;
            const runAfter = (p.runAfter ?? {}) as Record<string, unknown>;
            const hasPaErrorHandling =
              Object.values(runAfter).some((statuses) =>
                Array.isArray(statuses) && statuses.some((st) => st === "Failed" || st === "TimedOut")
              ) ||
              (ast.edges.some((e) => e.target === node.id && e.type === "error"));

            if (hasPaErrorHandling && (ast.platform === "POWER_AUTOMATE" || t.startsWith("powerautomate"))) {
              findings.push({
                id: fid("REL-032", node.id),
                ruleId: "REL-032",
                ruleName: "Make/PA Error Directive Recognition",
                severity: "INFO",
                category: "RELIABILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: "Power Automate runAfter error handler recognized",
                  detail: `"${node.name}" is configured with runAfter Failed/TimedOut to catch and handle parent action errors.`,
                },
                humanExplanation: "Power Automate runAfter condition handlers allow workflows to intercept failures and execute recovery branches.",
                suggestedFix: "No action needed — native Power Automate error handler recognized.",
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/REL-032",
                penaltyPoints: 0,
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
      id: "REL-033",
      name: "Retry Without Exponential Backoff",
      category: "RELIABILITY",
      severity: "LOW",
      description: "Node retries on failure (retryOnFail: true or maxTries > 1) but uses a fixed wait interval without exponential backoff.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/REL-033",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          for (const node of ast.nodes) {
            const s = ps(node);
            if (!s.includes("retry") && !s.includes("maxTries")) continue;

            const p = (node.parameters ?? {}) as Record<string, unknown>;
            const opts = (p.options ?? {}) as Record<string, unknown>;

            const hasRetry =
              p.retryOnFail === true ||
              opts.retryOnFail === true ||
              (typeof p.maxTries === "number" && p.maxTries > 1) ||
              (typeof opts.maxTries === "number" && (opts.maxTries as number) > 1) ||
              /["']?(retryOnFail|auto_retry)["']?\s*:\s*true/i.test(s) ||
              /["']?maxTries["']?\s*:\s*[2-9]/i.test(s);

            if (!hasRetry) continue;

            const hasExpBackoff =
              p.waitBetweenTriesExponential === true ||
              opts.waitBetweenTriesExponential === true ||
              p.exponentialBackoff === true ||
              opts.exponentialBackoff === true ||
              /exponential|backoffFactor|backoff_factor|jitter/i.test(s);

            if (!hasExpBackoff) {
              findings.push({
                id: fid("REL-033", node.id),
                ruleId: "REL-033",
                ruleName: "Retry Without Exponential Backoff",
                severity: "LOW",
                category: "RELIABILITY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: {
                  summary: "Retry enabled with fixed wait interval (no exponential backoff)",
                  detail: `"${node.name}" retries failed requests but does not enable exponential backoff. Retrying with static delays exacerbates server rate limits and network congestion.`,
                },
                humanExplanation: "Fixed-delay retries hit already-stressed servers at predictable intervals. Exponential backoff spreads out retry attempts, significantly increasing recovery success rates.",
                suggestedFix: "Enable exponential backoff (waitBetweenTriesExponential: true or exponentialBackoff: true) and add randomized jitter to retry intervals.",
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/REL-033",
                penaltyPoints: 5,
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
      id: "REL-034",
      name: "Missing Item-Level Error Isolation in Batch Loop",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "A splitInBatches or iteration loop processes items, but inner child nodes lack continueOnFail or error routing, causing an error on one item to abort the entire batch.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/REL-034",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        try {
          const BATCH_LOOP_TYPES = ["n8n-nodes-base.splitinbatches", "iteration", "foreach", "loopnode"];
          const batchNodes = ast.nodes.filter((n) =>
            n.isLoop || BATCH_LOOP_TYPES.some((bt) => n.type.toLowerCase().includes(bt))
          );

          if (batchNodes.length === 0) return [];

          const errorSourceSet = new Set(
            ast.edges
              .filter((e) => e.type === "error" || e.sourceHandle === "error" || e.sourceHandle === "1")
              .map((e) => e.source)
          );

          const nonBatchActionNodes = ast.nodes.filter((n) =>
            !n.isTrigger && !n.isLoop && (n.isHttp || n.isCode || n.type.includes("postgres") || n.type.includes("slack"))
          );

          const unisolatedNodes = nonBatchActionNodes.filter((n) => {
            const p = (n.parameters ?? {}) as Record<string, unknown>;
            const opts = (p.options ?? {}) as Record<string, unknown>;
            const hasIsolation =
              p.continueOnFail === true ||
              opts.continueOnFail === true ||
              p.onError === "continueRegularOutput" ||
              p.onError === "continueErrorOutput" ||
              opts.onError === "continueRegularOutput" ||
              opts.onError === "continueErrorOutput" ||
              errorSourceSet.has(n.id) ||
              errorSourceSet.has(n.name);
            return !hasIsolation;
          });

          if (unisolatedNodes.length > 0) {
            for (const batchNode of batchNodes) {
              findings.push({
                id: fid("REL-034", batchNode.id),
                ruleId: "REL-034",
                ruleName: "Missing Item-Level Error Isolation in Batch Loop",
                severity: "MEDIUM",
                category: "RELIABILITY",
                location: { nodeId: batchNode.id, nodeName: batchNode.name, nodeType: batchNode.type },
                evidence: {
                  summary: "Batch loop contains action nodes without continueOnFail error isolation",
                  detail: `Batch loop "${batchNode.name}" contains ${unisolatedNodes.length} node(s) (e.g. "${unisolatedNodes[0]?.name}") that do not isolate item-level errors. A single failed item will crash the entire batch execution.`,
                },
                humanExplanation: "When processing items in batches, individual item failures should not crash processing of the remaining items in the loop.",
                suggestedFix: `Enable 'Continue On Fail' or configure error routing on child nodes in the "${batchNode.name}" loop to isolate per-item errors.`,
                marketplaceBlocking: false,
                docReference: "https://flowintel.io/rules/REL-034",
                penaltyPoints: 8,
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
