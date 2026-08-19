/**
 * FlowIntel Reliability Extension A — REL-006 to REL-018
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(rule: string, node: string, sfx?: string) {
  return [rule, node, sfx].filter(Boolean).join("-");
}
function p(node: { parameters?: unknown }): Record<string, unknown> {
  return (node.parameters ?? {}) as Record<string, unknown>;
}
function ps(node: { parameters?: unknown }): string {
  return JSON.stringify(node.parameters ?? {});
}

const HTTP_TYPES = new Set([
  "n8n-nodes-base.httpRequest","n8n-nodes-base.slack","n8n-nodes-base.gmail",
  "n8n-nodes-base.github","n8n-nodes-base.stripe","n8n-nodes-base.openAi",
  "@n8n/n8n-nodes-langchain.openAi","n8n-nodes-base.postgres",
  "n8n-nodes-base.mysql","n8n-nodes-base.mongodb",
]);
const LOOP_TYPES = new Set(["n8n-nodes-base.splitInBatches","n8n-nodes-base.loopNode"]);

export const RELIABILITY_EXT_A: RulePackManifest = {
  id: "flowintel-reliability-ext-a",
  name: "FlowIntel Reliability Extension A",
  version: "2.0.0",
  description: "REL-006 through REL-018: circuit breakers, fan-out, dead branches, fallbacks.",
  rules: [
    {
      id: "REL-006",
      name: "Missing Retry on Critical Network Node",
      category: "RELIABILITY",
      severity: "HIGH",
      description: "Critical network nodes (payment, DB write) have no retry configured.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/REL-006",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const CRITICAL = new Set(["n8n-nodes-base.stripe","n8n-nodes-base.paypal","n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb"]);
        for (const node of ast.nodes) {
          if (!CRITICAL.has(node.type)) continue;
          const pp = p(node);
          const opts = (pp.options ?? {}) as Record<string,unknown>;
          const hasRetry = pp.retryOnFail === true || opts.retryOnFail === true || (typeof pp.maxTries === "number" && pp.maxTries > 1);
          if (!hasRetry) {
            findings.push({
              id: fid("REL-006", node.id),
              ruleId: "REL-006", ruleName: "Missing Retry on Critical Network Node",
              severity: "HIGH", category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "No retry on critical node", detail: `"${node.name}" performs a critical operation (${node.type}) with no retry configured.` },
              humanExplanation: "Critical operations like payments and DB writes need retry logic to survive transient network failures.",
              suggestedFix: `Enable Retry On Fail on "${node.name}" with a max of 3 tries and a wait interval.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-006", penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "REL-007",
      name: "No Fallback Branch on Conditional Node",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "If/Switch node has outputs that lead to dead ends — no fallback path.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/REL-007",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const COND = new Set(["n8n-nodes-base.if","n8n-nodes-base.switch"]);
        const nodeNames = new Set(ast.nodes.map((n) => n.name));
        for (const node of ast.nodes) {
          if (!COND.has(node.type)) continue;
          const outEdges = ast.edges.filter((e) => e.source === node.name);
          if (outEdges.length === 0) continue;
          const deadOut = outEdges.filter((e) => !nodeNames.has(e.target) || !ast.edges.some((e2) => e2.source === e.target));
          if (deadOut.length > 0) {
            findings.push({
              id: fid("REL-007", node.id),
              ruleId: "REL-007", ruleName: "No Fallback Branch on Conditional Node",
              severity: "MEDIUM", category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "One or more output branches lead to dead ends", detail: `"${node.name}" has ${deadOut.length} output(s) with no downstream nodes — data silently dropped.` },
              humanExplanation: "Dead-end branches silently discard data. In production this causes invisible data loss.",
              suggestedFix: `Connect all output branches of "${node.name}" to processing nodes or a logging node.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-007", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "REL-008",
      name: "Fan-out Explosion Risk",
      category: "RELIABILITY",
      severity: "HIGH",
      description: "A single node fans out to 5+ downstream nodes without a throttle — execution parallelism explosion.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/REL-008",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const graph = (ast as any).__graph;
        for (const node of ast.nodes) {
          const legacyOutCount = ast.edges.filter((e) => e.source === node.name || e.source === node.id).length;
          const graphNode = graph ? (graph[node.name] || graph[node.id]) : null;
          const outCount = graphNode ? graphNode.outDegree : legacyOutCount;
          if (outCount >= 5) {
            findings.push({
              id: fid("REL-008", node.id),
              ruleId: "REL-008", ruleName: "Fan-out Explosion Risk",
              severity: "HIGH", category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Node fans out to ${outCount} nodes`, detail: `"${node.name}" has ${outCount} direct output connections — this may saturate concurrency on large item counts.` },
              humanExplanation: "Massive fan-out can exhaust concurrency limits, triggering timeouts or throttle errors across all branches simultaneously.",
              suggestedFix: "Use SplitInBatches to limit concurrency or restructure the fan-out with a controlling loop.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-008", penaltyPoints: 12,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "REL-009",
      name: "Missing Dead Letter Queue / Error Storage",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "Workflow has error handling but doesn't persist failed items anywhere.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/REL-009",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasErrorEdge = ast.edges.some((e) => e.sourceHandle === "error" || e.type === "error");
        if (!hasErrorEdge) return [];
        const STORAGE = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.redis","n8n-nodes-base.airtable","n8n-nodes-base.googleSheets","n8n-nodes-base.notion","n8n-nodes-base.mongodb"]);
        const hasStorage = ast.nodes.some((n) => STORAGE.has(n.type));
        if (hasStorage) return [];
        return [{
          id: "REL-009-workflow",
          ruleId: "REL-009", ruleName: "Missing Dead Letter Queue / Error Storage",
          severity: "MEDIUM", category: "RELIABILITY",
          location: {},
          evidence: { summary: "Error branch exists but failed items are not stored", detail: "Workflow handles errors but does not persist failing records — they are lost on failure." },
          humanExplanation: "Without a dead letter queue, failed items cannot be replayed, investigated, or manually corrected.",
          suggestedFix: "On error paths, write the failed item + error message to a database table or Google Sheet for later review.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-009", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "REL-010",
      name: "Single Point of Failure — Only One Trigger",
      category: "RELIABILITY",
      severity: "LOW",
      description: "Critical workflows relying on a single schedule trigger have no fallback activation path.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/REL-010",
      detect(ast: ParsedWorkflow): Finding[] {
        const triggers = ast.nodes.filter((n) => n.isTrigger);
        if (triggers.length !== 1) return [];
        const t = triggers[0]!;
        if (t.type !== "n8n-nodes-base.scheduleTrigger") return [];
        return [{
          id: fid("REL-010", t.id),
          ruleId: "REL-010", ruleName: "Single Point of Failure — Only One Trigger",
          severity: "LOW", category: "RELIABILITY",
          location: { nodeId: t.id, nodeName: t.name, nodeType: t.type },
          evidence: { summary: "Only one schedule trigger, no manual/webhook fallback", detail: "If the schedule misses (server downtime, timezone error), there is no alternative way to trigger this workflow." },
          humanExplanation: "A missed schedule with no fallback means the workflow simply doesn't run — often undetected until downstream data is stale.",
          suggestedFix: "Add a manual trigger or webhook trigger as a fallback activation path.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-010", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "REL-011",
      name: "Infinite Loop Risk — No Exit Condition",
      category: "RELIABILITY",
      severity: "CRITICAL",
      description: "Loop node with no detectable exit/completion condition — may run forever.",
      enabled: true,
      marketplaceBlocking: true,
      penaltyPoints: 25,
      docReference: "https://flowintel.io/rules/REL-011",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!LOOP_TYPES.has(node.type)) continue;
          const pp = p(node);
          const hasBatch = typeof pp.batchSize === "number" && pp.batchSize > 0;
          const hasMax = typeof pp.maxItems === "number" && pp.maxItems > 0;
          // Check if a downstream If/Switch provides the loop exit
          const hasExitNode = ast.edges
            .filter((e) => e.source === node.name)
            .map((e) => ast.nodes.find((n) => n.name === e.target))
            .some((n) => n && (n.type === "n8n-nodes-base.if" || n.type === "n8n-nodes-base.switch"));
          if (!hasBatch && !hasMax && !hasExitNode) {
            findings.push({
              id: fid("REL-011", node.id),
              ruleId: "REL-011", ruleName: "Infinite Loop Risk — No Exit Condition",
              severity: "CRITICAL", category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Loop with no exit condition or batch limit", detail: `"${node.name}" has no batchSize, maxItems, or conditional exit — may execute indefinitely.` },
              humanExplanation: "Infinite loops consume all execution credits, pin concurrency slots, and can bring down an n8n instance.",
              suggestedFix: `Set a batchSize on "${node.name}" or add an If node downstream that breaks the loop after a maximum iteration count.`,
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/REL-011", penaltyPoints: 25,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "REL-012",
      name: "Missing Webhook Response on Error Path",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "Webhook workflow does not send a response on its error path — caller hangs waiting.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/REL-012",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasWebhook = ast.nodes.some((n) => n.type === "n8n-nodes-base.webhook");
        if (!hasWebhook) return [];
        const errorEdges = ast.edges.filter((e) => e.sourceHandle === "error" || e.type === "error");
        if (errorEdges.length === 0) return [];
        const errorTargets = new Set(errorEdges.map((e) => e.target));
        const hasResp = [...errorTargets].some((t) =>
          ast.nodes.find((n) => n.name === t && n.type === "n8n-nodes-base.respondToWebhook")
        );
        if (hasResp) return [];
        return [{
          id: "REL-012-workflow",
          ruleId: "REL-012", ruleName: "Missing Webhook Response on Error Path",
          severity: "MEDIUM", category: "RELIABILITY",
          location: {},
          evidence: { summary: "Error path does not send webhook response", detail: "When an error occurs the webhook caller receives no response and times out." },
          humanExplanation: "A hanging webhook response causes client-side timeout errors and makes integrations appear unreliable.",
          suggestedFix: "Add a Respond to Webhook node on the error path returning a 4xx/5xx status with an error message.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-012", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "REL-013",
      name: "Concurrent Execution Not Restricted",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "Workflow has no concurrent execution limit — simultaneous triggers can corrupt shared state.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/REL-013",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasTrigger = ast.nodes.some((n) => n.isTrigger);
        if (!hasTrigger) return [];
        const DB_WRITE = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb","n8n-nodes-base.redis"]);
        const hasDbWrite = ast.nodes.some((n) => {
          if (!DB_WRITE.has(n.type)) return false;
          const op = String(p(n).operation ?? "").toLowerCase();
          return ["insert","update","upsert","create","write"].some((v) => op.includes(v));
        });
        if (!hasDbWrite) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasConcurrencyLimit = meta?.settings && (meta.settings as Record<string,unknown>)?.executionOrder !== undefined;
        if (hasConcurrencyLimit) return [];
        const trigger = ast.nodes.find((n) => n.isTrigger)!;
        return [{
          id: fid("REL-013", trigger.id),
          ruleId: "REL-013", ruleName: "Concurrent Execution Not Restricted",
          severity: "MEDIUM", category: "RELIABILITY",
          location: { nodeId: trigger.id, nodeName: trigger.name, nodeType: trigger.type },
          evidence: { summary: "No concurrency limit with shared-state writes", detail: "Workflow writes to shared state without a concurrency limit — two simultaneous executions may corrupt data." },
          humanExplanation: "Race conditions in concurrent workflows cause data corruption, duplicate records, and inconsistent state.",
          suggestedFix: "Set 'Max concurrent executions' to 1 in Workflow Settings, or use Redis-based locking before write operations.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-013", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "REL-014",
      name: "Long-Running Workflow Without Checkpoint",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "Workflow with many sequential nodes has no intermediate state save — full restart on failure.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/REL-014",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.nodes.length < 15) return [];
        const hasCheckpoint = ast.nodes.some((n) => {
          const s = ps(n);
          return /checkpoint|saveProgress|progressKey/i.test(s);
        });
        if (hasCheckpoint) return [];
        return [{
          id: "REL-014-workflow",
          ruleId: "REL-014", ruleName: "Long-Running Workflow Without Checkpoint",
          severity: "MEDIUM", category: "RELIABILITY",
          location: {},
          evidence: { summary: `${ast.nodes.length} nodes with no checkpoint`, detail: `Workflow has ${ast.nodes.length} nodes and no intermediate state persistence. A failure near the end requires a full restart.` },
          humanExplanation: "Long workflows without checkpoints waste processing time and may re-process expensive operations (AI calls, payments) on restart.",
          suggestedFix: "Store progress (last-processed ID or step) to a database or Redis at key milestones so partial runs can resume.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-014", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "REL-015",
      name: "Missing Timeout on AI/LLM Node",
      category: "RELIABILITY",
      severity: "HIGH",
      description: "AI/LLM node has no timeout — a hung model call blocks the workflow indefinitely.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/REL-015",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const AI_TYPES = ["langchain","openai","anthropic","llm","chatmodel","agent"];
        for (const node of ast.nodes) {
          const t = node.type.toLowerCase();
          if (!AI_TYPES.some((a) => t.includes(a))) continue;
          const pp = p(node);
          const opts = (pp.options ?? {}) as Record<string,unknown>;
          if (!pp.timeout && !opts.timeout && !pp.requestTimeout && !opts.requestTimeout) {
            findings.push({
              id: fid("REL-015", node.id),
              ruleId: "REL-015", ruleName: "Missing Timeout on AI/LLM Node",
              severity: "HIGH", category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "No timeout on AI node", detail: `"${node.name}" calls an AI/LLM service without a timeout — model overload or outages will hang the workflow.` },
              humanExplanation: "AI inference can take minutes on overloaded providers. Without a timeout, one slow call pins a concurrency slot permanently.",
              suggestedFix: `Add a timeout (e.g. 60000ms) to "${node.name}" via Options → Timeout.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-015", penaltyPoints: 12,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "REL-016",
      name: "No Health Check Trigger",
      category: "RELIABILITY",
      severity: "LOW",
      description: "Production workflow has no health-check webhook to verify it is operational.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/REL-016",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasHealthCheck = ast.nodes.some((n) => {
          const s = ps(n) + n.name.toLowerCase();
          return /health|ping|status|alive|heartbeat/i.test(s);
        });
        if (hasHealthCheck) return [];
        if (ast.nodes.length < 5) return [];
        return [{
          id: "REL-016-workflow",
          ruleId: "REL-016", ruleName: "No Health Check Trigger",
          severity: "LOW", category: "RELIABILITY",
          location: {},
          evidence: { summary: "No health-check endpoint detected", detail: "Workflow has no /health or /ping endpoint for external monitoring systems." },
          humanExplanation: "Without a health check, uptime monitors cannot verify the workflow is deployed and responsive.",
          suggestedFix: "Add a second webhook trigger path (e.g. /health) that immediately returns {status:'ok'}.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-016", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "REL-017",
      name: "External Dependency Without Circuit Breaker",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "Workflow calls an external API repeatedly with no circuit-breaker or backoff logic.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/REL-017",
      detect(ast: ParsedWorkflow): Finding[] {
        const httpNodes = ast.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
        if (httpNodes.length < 3) return [];
        const hasCircuitBreaker = ast.nodes.some((n) => {
          const s = ps(n);
          return /circuitBreaker|backoff|exponential|jitter|retryAfter/i.test(s);
        });
        if (hasCircuitBreaker) return [];
        return [{
          id: "REL-017-workflow",
          ruleId: "REL-017", ruleName: "External Dependency Without Circuit Breaker",
          severity: "MEDIUM", category: "RELIABILITY",
          location: {},
          evidence: { summary: `${httpNodes.length} HTTP calls with no backoff logic`, detail: "Multiple external API calls with no backoff/circuit-breaker — a cascade failure will hammer the downstream service." },
          humanExplanation: "Without circuit-breaking, a failing external dependency receives a flood of retries — worsening its recovery time and triggering ban/throttle.",
          suggestedFix: "Implement exponential backoff in a Code node: wait 2^attempt seconds between retries with jitter.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-017", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "REL-018",
      name: "Missing Pagination Handling",
      category: "RELIABILITY",
      severity: "MEDIUM",
      description: "API call retrieves list data but has no pagination logic — only first page is processed.",
      enabled: true,
      marketplaceBlocking: false,
      penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/REL-018",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const pp = p(node);
          const method = String(pp.method ?? "GET").toUpperCase();
          if (method !== "GET") continue;
          const s = ps(node);
          const hasPagination = /page|limit|offset|cursor|nextPage|after|perPage|pageSize/i.test(s);
          if (!hasPagination) continue;
          const hasLoop = ast.nodes.some((n) => LOOP_TYPES.has(n.type) || n.type === "n8n-nodes-base.splitInBatches");
          if (!hasLoop) {
            findings.push({
              id: fid("REL-018", node.id),
              ruleId: "REL-018", ruleName: "Missing Pagination Handling",
              severity: "MEDIUM", category: "RELIABILITY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Paginated API with no loop", detail: `"${node.name}" fetches paginated data but the workflow has no loop to retrieve subsequent pages.` },
              humanExplanation: "Processing only the first page silently drops all remaining records — data loss that may go undetected for weeks.",
              suggestedFix: "Add a SplitInBatches loop that increments the page cursor and continues until the response contains no next-page token.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/REL-018", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },
  ],
};
