/**
 * FlowIntel Cost Optimization Extension — CST-004 to CST-020
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

const EXPENSIVE_MODELS = new Set([
  "gpt-4", "gpt-4-turbo", "gpt-4o", "gpt-4.1",
  "claude-3-opus", "claude-opus", "claude-3-5-sonnet", "claude-3-7-sonnet", "claude-4-sonnet",
  "gemini-ultra", "gemini-1.5-pro", "gemini-2.0-pro", "gemini-2.5-pro",
  "o1", "o1-preview", "o1-pro", "o3", "o3-mini",
]);
const CHEAP_MODELS = new Set([
  "gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-3.5-turbo",
  "claude-3-haiku", "claude-haiku", "claude-3-5-haiku",
  "gemini-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash",
  "deepseek-chat", "deepseek-v3", "deepseek-r1",
  "llama-3.1-8b", "llama-3.2-3b", "llama-4-scout",
  "mistral-7b", "mistral-nemo", "mistral-small",
]);

export const COST_OPTIMIZATION_EXT: RulePackManifest = {
  id: "flowintel-cost-optimization-ext",
  name: "FlowIntel Cost Optimization Extension",
  version: "2.0.0",
  description: "CST-004 through CST-020: model selection, duplicate calls, polling waste, caching.",
  rules: [
    {
      id: "CST-004",
      name: "Premium AI Model for Trivial Task",
      category: "COST_OPTIMIZATION",
      severity: "MEDIUM",
      description: "Expensive frontier model used for a simple task that a cheaper model handles well.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CST-004",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const pp = node.parameters as Record<string,unknown> | undefined;
          const model = String(pp?.model ?? pp?.modelId ?? "").toLowerCase();
          if (!EXPENSIVE_MODELS.has(model)) continue;
          const s = ps(node).toLowerCase();
          if (/summarize|classify|translate|extract.*email|is.*yes.*no|sentiment|categorize/i.test(s)) {
            findings.push({
              id: fid("CST-004", node.id), ruleId: "CST-004",
              ruleName: "Premium AI Model for Trivial Task",
              severity: "MEDIUM", category: "COST_OPTIMIZATION",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `${model} for simple task`, detail: `"${node.name}" uses ${model} for a task achievable with a cheaper model at 95%+ quality.` },
              humanExplanation: `${model} costs ~20× more than gpt-4o-mini for simple tasks like classification or summarisation with no quality difference.`,
              suggestedFix: `Switch "${node.name}" to gpt-4o-mini or claude-3-haiku for this task. Reserve ${model} for complex reasoning.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-004", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CST-005",
      name: "Duplicate AI Calls With Same Prompt",
      category: "COST_OPTIMIZATION",
      severity: "HIGH",
      description: "Two or more AI nodes receive an identical prompt — one call is redundant.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CST-005",
      detect(ast: ParsedWorkflow): Finding[] {
        const AI = ["langchain","openai","anthropic","llm","chatmodel"];
        const aiNodes = ast.nodes.filter((n) => AI.some((a) => n.type.toLowerCase().includes(a)));
        if (aiNodes.length < 2) return [];
        const promptMap = new Map<string, string>();
        const findings: Finding[] = [];
        for (const node of aiNodes) {
          const pp = node.parameters as Record<string,unknown> | undefined;
          const prompt = String(pp?.prompt ?? pp?.systemMessage ?? pp?.text ?? "").trim().slice(0, 100);
          if (!prompt) continue;
          if (promptMap.has(prompt)) {
            findings.push({
              id: fid("CST-005", node.id), ruleId: "CST-005",
              ruleName: "Duplicate AI Calls With Same Prompt",
              severity: "HIGH", category: "COST_OPTIMIZATION",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Duplicate prompt of "${promptMap.get(prompt)}"`, detail: `"${node.name}" has the same prompt as "${promptMap.get(prompt)}" — one call is redundant.` },
              humanExplanation: "Identical AI calls cost twice as much. Cache the result of the first call and reuse it.",
              suggestedFix: `Remove "${node.name}" and reuse the output of "${promptMap.get(prompt)}" via a Set node.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-005", penaltyPoints: 15,
            });
          } else {
            promptMap.set(prompt, node.name);
          }
        }
        return findings;
      },
    },

    {
      id: "CST-006",
      name: "No AI Response Caching",
      category: "COST_OPTIMIZATION",
      severity: "MEDIUM",
      description: "AI calls on deterministic inputs with no caching — identical inputs billed repeatedly.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CST-006",
      detect(ast: ParsedWorkflow): Finding[] {
        const AI = ["langchain","openai","anthropic","llm","chatmodel"];
        const hasAI = ast.nodes.some((n) => AI.some((a) => n.type.toLowerCase().includes(a)));
        if (!hasAI) return [];
        const hasCache = ast.nodes.some((n) => {
          const s = ps(n);
          return /redis|cache|memoize|cacheKey|cached.*response/i.test(s);
        });
        if (hasCache) return [];
        const aiNode = ast.nodes.find((n) => AI.some((a) => n.type.toLowerCase().includes(a)))!;
        return [{
          id: fid("CST-006", aiNode.id), ruleId: "CST-006",
          ruleName: "No AI Response Caching",
          severity: "MEDIUM", category: "COST_OPTIMIZATION",
          location: { nodeId: aiNode.id, nodeName: aiNode.name, nodeType: aiNode.type },
          evidence: { summary: "AI calls with no cache layer", detail: "AI node has no response caching — identical inputs are billed on every execution." },
          humanExplanation: "AI API calls can cost $0.01–$0.10 each. Caching responses for identical inputs can reduce costs by 60–90% in repetitive workflows.",
          suggestedFix: "Add a Redis cache keyed by a hash of the prompt. Return cached response if hit; call AI only on cache miss.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-006", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "CST-007",
      name: "Frequent Schedule With No Data Change Detection",
      category: "COST_OPTIMIZATION",
      severity: "MEDIUM",
      description: "Frequently scheduled workflow makes API calls even when data hasn't changed.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CST-007",
      detect(ast: ParsedWorkflow): Finding[] {
        const sched = ast.nodes.find((n) => n.type === "n8n-nodes-base.scheduleTrigger");
        if (!sched) return [];
        const pp = sched.parameters as Record<string,unknown> | undefined;
        const rule = pp?.rule as Record<string,unknown> | undefined;
        const interval = Number(rule?.interval ?? pp?.interval ?? 999);
        const unit = String(rule?.unit ?? pp?.unit ?? "hours");
        const isFrequent = (unit.includes("minute") && interval <= 15) || (unit === "seconds");
        if (!isFrequent) return [];
        const hasChangeDetect = ast.nodes.some((n) => {
          const s = ps(n);
          return /ETag|Last-Modified|If-None-Match|If-Modified-Since|hash.*compare|unchanged/i.test(s);
        });
        if (hasChangeDetect) return [];
        return [{
          id: fid("CST-007", sched.id), ruleId: "CST-007",
          ruleName: "Frequent Schedule With No Data Change Detection",
          severity: "MEDIUM", category: "COST_OPTIMIZATION",
          location: { nodeId: sched.id, nodeName: sched.name, nodeType: sched.type },
          evidence: { summary: `Polls every ${interval} ${unit} with no change detection`, detail: "High-frequency schedule makes API calls even when data hasn't changed — wasting API quota and execution credits." },
          humanExplanation: "Polling every minute makes 1440 API calls/day. If the data changes only a few times per day, 99% of calls are wasted.",
          suggestedFix: "Add ETag/Last-Modified caching: store the last-seen hash of the response and skip processing if unchanged.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-007", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "CST-008",
      name: "Large AI Context Window Not Needed",
      category: "COST_OPTIMIZATION",
      severity: "MEDIUM",
      description: "Using a 128k context model when the actual prompt fits in 8k — paying 4× unnecessarily.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/CST-008",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const LARGE_CONTEXT = new Set(["gpt-4-turbo-preview","gpt-4-128k","claude-3-opus-200k","gemini-1.5-pro"]);
        for (const node of ast.nodes) {
          const pp = node.parameters as Record<string,unknown> | undefined;
          const model = String(pp?.model ?? "");
          if (!LARGE_CONTEXT.has(model)) continue;
          const prompt = String(pp?.prompt ?? pp?.systemMessage ?? "");
          const estTokens = Math.ceil(prompt.length / 4);
          if (estTokens < 4000) {
            findings.push({
              id: fid("CST-008", node.id), ruleId: "CST-008",
              ruleName: "Large AI Context Window Not Needed",
              severity: "MEDIUM", category: "COST_OPTIMIZATION",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `${model} with ~${estTokens} token prompt`, detail: `"${node.name}" uses ${model} (128k context) with an estimated ${estTokens}-token prompt — a standard 8k model is sufficient.` },
              humanExplanation: "128k context models cost 3-4× more per token than standard models. Only use them when actually needed.",
              suggestedFix: `Switch "${node.name}" to a standard context model (gpt-4o or claude-3-sonnet) unless your inputs regularly exceed 8k tokens.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-008", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CST-009",
      name: "AI Called Inside Loop Without Result Reuse",
      category: "COST_OPTIMIZATION",
      severity: "HIGH",
      description: "AI node inside a loop where the result from iteration N is not reused in N+1.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CST-009",
      detect(ast: ParsedWorkflow): Finding[] {
        const LOOP = new Set(["n8n-nodes-base.splitInBatches","n8n-nodes-base.loopNode"]);
        const AI = ["langchain","openai","anthropic","llm","chatmodel"];
        const findings: Finding[] = [];
        for (const loop of ast.nodes) {
          if (!LOOP.has(loop.type)) continue;
          const aiChild = ast.edges
            .filter((e) => e.source === loop.name)
            .map((e) => ast.nodes.find((n) => n.name === e.target))
            .find((n) => n && AI.some((a) => n.type.toLowerCase().includes(a)));
          if (!aiChild) continue;
          const hasCache = ast.nodes.some((n) => {
            const s = ps(n);
            return /cache|redis|memoize/i.test(s);
          });
          if (!hasCache) {
            findings.push({
              id: fid("CST-009", loop.id), ruleId: "CST-009",
              ruleName: "AI Called Inside Loop Without Result Reuse",
              severity: "HIGH", category: "COST_OPTIMIZATION",
              location: { nodeId: loop.id, nodeName: loop.name, nodeType: loop.type },
              evidence: { summary: `AI call per loop iteration in "${loop.name}"`, detail: `Loop "${loop.name}" makes an AI call on each item with no result caching — N items = N API bills.` },
              humanExplanation: "1000 items × $0.01/call = $10 per execution. Caching identical prompts can reduce this to near zero.",
              suggestedFix: "Before the loop, pre-compute AI results for unique inputs and store in a lookup map. Reference the map inside the loop.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-009", penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CST-010",
      name: "Unused Workflow Running on Schedule",
      category: "COST_OPTIMIZATION",
      severity: "HIGH",
      description: "Scheduled workflow has all-disabled nodes — runs on schedule but does nothing.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/CST-010",
      detect(ast: ParsedWorkflow): Finding[] {
        if (!ast.nodes.some((n) => n.type === "n8n-nodes-base.scheduleTrigger")) return [];
        const nonTrigger = ast.nodes.filter((n) => !n.isTrigger);
        if (nonTrigger.length === 0) return [];
        const allDisabled = nonTrigger.every((n) => n.disabled === true);
        if (!allDisabled) return [];
        return [{
          id: "CST-010-workflow", ruleId: "CST-010",
          ruleName: "Unused Workflow Running on Schedule",
          severity: "HIGH", category: "COST_OPTIMIZATION",
          location: {},
          evidence: { summary: "Scheduled workflow with all non-trigger nodes disabled", detail: "Workflow executes on schedule but all nodes are disabled — consuming execution quota for no result." },
          humanExplanation: "Every scheduled execution consumes an execution credit even if all nodes are disabled. This is pure waste.",
          suggestedFix: "Disable the workflow entirely (not just its nodes) or delete it if it is no longer needed.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-010", penaltyPoints: 15,
        }];
      },
    },

    {
      id: "CST-011",
      name: "Repeated HTTP GET Without HTTP Caching Headers",
      category: "COST_OPTIMIZATION",
      severity: "MEDIUM",
      description: "Multiple identical HTTP GET requests in the same execution could share a cached response.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/CST-011",
      detect(ast: ParsedWorkflow): Finding[] {
        const getNodes = ast.nodes.filter((n) => {
          if (n.type !== "n8n-nodes-base.httpRequest") return false;
          const m = String((n.parameters as Record<string,unknown>)?.method ?? "GET").toUpperCase();
          return m === "GET";
        });
        if (getNodes.length < 2) return [];
        const urlMap = new Map<string, string>();
        const findings: Finding[] = [];
        for (const node of getNodes) {
          const url = String((node.parameters as Record<string,unknown>)?.url ?? "");
          if (!url) continue;
          if (urlMap.has(url)) {
            findings.push({
              id: fid("CST-011", node.id), ruleId: "CST-011",
              ruleName: "Repeated HTTP GET Without HTTP Caching Headers",
              severity: "MEDIUM", category: "COST_OPTIMIZATION",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `Duplicate GET: ${url.slice(0, 60)}`, detail: `"${node.name}" makes the same GET request as "${urlMap.get(url)}" — response could be reused.` },
              humanExplanation: "Making the same GET request twice in one execution doubles the API call count and latency with no benefit.",
              suggestedFix: `Remove "${node.name}" and use the output from "${urlMap.get(url)}" via a Set node reference.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-011", penaltyPoints: 8,
            });
          } else {
            urlMap.set(url, node.name);
          }
        }
        return findings;
      },
    },

    {
      id: "CST-012",
      name: "Storage Writes Not Batched",
      category: "COST_OPTIMIZATION",
      severity: "MEDIUM",
      description: "Individual database writes in a loop instead of a single batch insert.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CST-012",
      detect(ast: ParsedWorkflow): Finding[] {
        const LOOP = new Set(["n8n-nodes-base.splitInBatches","n8n-nodes-base.loopNode"]);
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb","n8n-nodes-base.airtable","n8n-nodes-base.googleSheets"]);
        const findings: Finding[] = [];
        for (const loop of ast.nodes) {
          if (!LOOP.has(loop.type)) continue;
          const dbChild = ast.edges
            .filter((e) => e.source === loop.name)
            .map((e) => ast.nodes.find((n) => n.name === e.target))
            .find((n) => n && DB.has(n.type));
          if (!dbChild) continue;
          const op = String((dbChild.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          if (!["insert","create","append","write"].some((v) => op.includes(v))) continue;
          findings.push({
            id: fid("CST-012", loop.id), ruleId: "CST-012",
            ruleName: "Storage Writes Not Batched",
            severity: "MEDIUM", category: "COST_OPTIMIZATION",
            location: { nodeId: loop.id, nodeName: loop.name, nodeType: loop.type },
            evidence: { summary: "Individual DB write per loop iteration", detail: `Loop "${loop.name}" writes to "${dbChild?.name}" one record at a time — N items = N transactions.` },
            humanExplanation: "Individual writes cost N database transactions. A single batch insert costs 1 transaction and is typically 10-100× faster.",
            suggestedFix: "Collect all items from the loop, then perform a single batch insert outside the loop.",
            marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-012", penaltyPoints: 10,
          });
        }
        return findings;
      },
    },

    {
      id: "CST-013",
      name: "Sending Full Payload to AI When Subset Needed",
      category: "COST_OPTIMIZATION",
      severity: "MEDIUM",
      description: "Entire JSON object passed to AI when only a few fields are needed for the task.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/CST-013",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const AI = ["langchain","openai","anthropic","llm","chatmodel"];
        for (const node of ast.nodes) {
          const t = node.type.toLowerCase();
          if (!AI.some((a) => t.includes(a))) continue;
          const s = ps(node);
          if (/\$json\b(?!\.[A-Za-z])|\{\{\s*\$json\s*\}\}/.test(s)) {
            findings.push({
              id: fid("CST-013", node.id), ruleId: "CST-013",
              ruleName: "Sending Full Payload to AI When Subset Needed",
              severity: "MEDIUM", category: "COST_OPTIMIZATION",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Entire $json passed to AI prompt", detail: `"${node.name}" injects the full $json into the AI prompt — unnecessary tokens billed.` },
              humanExplanation: "Passing an entire 10KB JSON object when only 200 bytes are needed multiplies token costs by up to 50×.",
              suggestedFix: "Select only the fields the AI needs with a Set node before the AI call. Pass $json.fieldName instead of $json.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-013", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CST-014",
      name: "Notification Sent on Every Execution",
      category: "COST_OPTIMIZATION",
      severity: "LOW",
      description: "Workflow sends a Slack/email notification on every run regardless of outcome.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/CST-014",
      detect(ast: ParsedWorkflow): Finding[] {
        const NOTIF = new Set(["n8n-nodes-base.slack","n8n-nodes-base.discord","n8n-nodes-base.telegram","n8n-nodes-base.gmail","n8n-nodes-base.sendEmail"]);
        const notifNodes = ast.nodes.filter((n) => NOTIF.has(n.type));
        if (notifNodes.length === 0) return [];
        return notifNodes.filter((node) => {
          const upstream = ast.edges.filter((e) => e.target === node.name).map((e) => e.source);
          return !upstream.some((src) => {
            const srcNode = ast.nodes.find((n) => n.name === src);
            return srcNode && (srcNode.type === "n8n-nodes-base.if" || srcNode.type === "n8n-nodes-base.switch");
          });
        }).map((node) => ({
          id: fid("CST-014", node.id), ruleId: "CST-014",
          ruleName: "Notification Sent on Every Execution",
          severity: "LOW" as const, category: "COST_OPTIMIZATION" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Unconditional notification node", detail: `"${node.name}" sends a notification on every execution without a conditional gate.` },
          humanExplanation: "Sending a Slack message every minute is noisy, costs API quota, and leads to notification fatigue.",
          suggestedFix: "Add an If node before the notification that only sends when there is something meaningful to report.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-014", penaltyPoints: 5,
        }));
      },
    },

    {
      id: "CST-015",
      name: "Cheap Model Available for This AI Task",
      category: "COST_OPTIMIZATION",
      severity: "INFO",
      description: "Workflow uses a mid-tier model where a cheap model would suffice.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 0,
      docReference: "https://flowintel.io/rules/CST-015",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const pp = node.parameters as Record<string,unknown> | undefined;
          const model = String(pp?.model ?? "").toLowerCase();
          if (!model || CHEAP_MODELS.has(model) || EXPENSIVE_MODELS.has(model)) continue;
          const s = ps(node).toLowerCase();
          if (/classify|summarize|translate|extract/i.test(s)) {
            findings.push({
              id: fid("CST-015", node.id), ruleId: "CST-015",
              ruleName: "Cheap Model Available for This AI Task",
              severity: "INFO", category: "COST_OPTIMIZATION",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `${model} for simple task`, detail: `"${node.name}" uses ${model} for a simple task — a cheaper model may cut costs by 80%.` },
              humanExplanation: "Simple NLP tasks (classification, summarisation, extraction) perform nearly identically on cheap vs. expensive models.",
              suggestedFix: "Benchmark gpt-4o-mini or claude-3-haiku for this task before using a more expensive model.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-015", penaltyPoints: 3,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "CST-016",
      name: "Oversized Data Passed Between Nodes",
      category: "COST_OPTIMIZATION",
      severity: "MEDIUM",
      description: "Workflow passes large binary or JSON objects through nodes that don't use them.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/CST-016",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasBinary = ast.nodes.some((n) => {
          const s = ps(n);
          return /binaryData|downloadFile|readBinary/i.test(s);
        });
        if (!hasBinary) return [];
        if (ast.nodes.length < 5) return [];
        const hasEarlyPrune = ast.nodes.slice(0, 3).some((n) =>
          n.type === "n8n-nodes-base.set" || n.type === "n8n-nodes-base.editFields"
        );
        if (hasEarlyPrune) return [];
        return [{
          id: "CST-016-workflow", ruleId: "CST-016",
          ruleName: "Oversized Data Passed Between Nodes",
          severity: "MEDIUM", category: "COST_OPTIMIZATION",
          location: {},
          evidence: { summary: "Large binary data without early pruning", detail: "Workflow carries large binary data through many nodes without pruning — increasing serialisation/deserialisation cost at every step." },
          humanExplanation: "n8n serialises item data between nodes. Carrying a 5MB binary through 10 nodes = 50MB of serialisation overhead per execution.",
          suggestedFix: "Process the binary data as early as possible and prune it from the item before passing to downstream nodes.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-016", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "CST-017",
      name: "Missing Cost Estimate in Workflow Metadata",
      category: "COST_OPTIMIZATION",
      severity: "INFO",
      description: "Workflow uses paid services but has no estimated cost per execution in its metadata.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 0,
      docReference: "https://flowintel.io/rules/CST-017",
      detect(ast: ParsedWorkflow): Finding[] {
        const PAID = new Set(["n8n-nodes-base.stripe","n8n-nodes-base.openAi","@n8n/n8n-nodes-langchain.openAi","n8n-nodes-base.awsS3"]);
        const hasPaid = ast.nodes.some((n) => PAID.has(n.type));
        if (!hasPaid) return [];
        const meta = ast.metadata as Record<string,unknown> | undefined;
        const hasCostEst = meta?.estimatedCostPerRun || meta?.costEstimate || meta?.pricingNotes;
        if (hasCostEst) return [];
        return [{
          id: "CST-017-workflow", ruleId: "CST-017",
          ruleName: "Missing Cost Estimate in Workflow Metadata",
          severity: "INFO", category: "COST_OPTIMIZATION",
          location: {},
          evidence: { summary: "Paid services with no cost estimate", detail: "Workflow uses paid APIs but provides no estimated cost per execution." },
          humanExplanation: "Without a cost estimate, users who run this workflow at scale may incur unexpected API charges.",
          suggestedFix: "Add estimatedCostPerRun: '$0.01-$0.05' to workflow metadata based on your usage analysis.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-017", penaltyPoints: 2,
        }];
      },
    },

    {
      id: "CST-018",
      name: "Premium Tier Service Used When Free Tier Sufficient",
      category: "COST_OPTIMIZATION",
      severity: "LOW",
      description: "Workflow uses a paid service endpoint when a free alternative exists for the same operation.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/CST-018",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const FREE_ALTERNATIVES: Record<string, string> = {
          "api.ip-api.com/json": "Free IP geolocation — no charge",
          "geocode.maps.co": "Free geocoding (500 req/day)",
          "exchangerate-api.com": "Free forex rates",
        };
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const url = String((node.parameters as Record<string,unknown>)?.url ?? "").toLowerCase();
          for (const [alt, desc] of Object.entries(FREE_ALTERNATIVES)) {
            if (url.includes("ipinfo.io") && alt.includes("ip-api")) {
              findings.push({
                id: fid("CST-018", node.id) + "-ip",
                ruleId: "CST-018", ruleName: "Premium Tier Service Used When Free Tier Sufficient",
                severity: "LOW", category: "COST_OPTIMIZATION",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: { summary: "ipinfo.io (paid) vs ip-api.com (free)", detail: `"${node.name}" uses ipinfo.io which has a paid tier. Alternative: ${alt} (${desc}).` },
                humanExplanation: "ipinfo.io charges after 50k lookups/month. ip-api.com is free for 45 req/minute without signup.",
                suggestedFix: `Consider switching to ${alt} for IP geolocation if the rate limit fits your usage.`,
                marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-018", penaltyPoints: 5,
              });
            }
          }
        }
        return findings;
      },
    },

    {
      id: "CST-019",
      name: "AI Called Synchronously in User-Facing Flow",
      category: "COST_OPTIMIZATION",
      severity: "MEDIUM",
      description: "AI call is in the critical user-facing path — latency and cost would be better served async.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/CST-019",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasWebhook = ast.nodes.some((n) => n.type === "n8n-nodes-base.webhook");
        const hasResponse = ast.nodes.some((n) => n.type === "n8n-nodes-base.respondToWebhook");
        if (!hasWebhook || !hasResponse) return [];
        const AI = ["langchain","openai","anthropic","llm","chatmodel"];
        const aiNode = ast.nodes.find((n) => AI.some((a) => n.type.toLowerCase().includes(a)));
        if (!aiNode) return [];
        return [{
          id: fid("CST-019", aiNode.id), ruleId: "CST-019",
          ruleName: "AI Called Synchronously in User-Facing Flow",
          severity: "MEDIUM", category: "COST_OPTIMIZATION",
          location: { nodeId: aiNode.id, nodeName: aiNode.name, nodeType: aiNode.type },
          evidence: { summary: "AI in synchronous webhook path", detail: `"${aiNode.name}" runs synchronously in a user-facing webhook flow — adds 1-5s latency to every user request.` },
          humanExplanation: "Synchronous AI calls in user-facing flows add perceptible latency. Async processing + polling/callback is cheaper and faster for users.",
          suggestedFix: "Return a jobId immediately, process AI asynchronously, and provide a polling endpoint or webhook callback for the result.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-019", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "CST-020",
      name: "No Budget Alert or Spend Cap Configured",
      category: "COST_OPTIMIZATION",
      severity: "MEDIUM",
      description: "Workflow uses paid APIs with no spend cap or budget alert mechanism.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/CST-020",
      detect(ast: ParsedWorkflow): Finding[] {
        const PAID = ["n8n-nodes-base.openAi","@n8n/n8n-nodes-langchain.openAi","n8n-nodes-base.stripe"];
        const hasPaid = ast.nodes.some((n) => PAID.includes(n.type));
        if (!hasPaid) return [];
        const hasBudgetGuard = ast.nodes.some((n) => {
          const s = ps(n);
          return /budget|spendCap|maxCost|costLimit|billingAlert|usageLimit/i.test(s);
        });
        if (hasBudgetGuard) return [];
        return [{
          id: "CST-020-workflow", ruleId: "CST-020",
          ruleName: "No Budget Alert or Spend Cap Configured",
          severity: "MEDIUM", category: "COST_OPTIMIZATION",
          location: {},
          evidence: { summary: "Paid API with no budget guard", detail: "Workflow uses paid APIs (OpenAI, Stripe) with no spend cap or budget alert logic." },
          humanExplanation: "A bug in an infinite loop calling OpenAI can generate a $10,000 API bill overnight. Budget caps prevent runaway costs.",
          suggestedFix: "Implement a daily usage counter in Redis. If daily spend exceeds your budget cap, stop executing and send an alert.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-020", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "CST-021",
      name: "Workflow Not Disabled When Not In Use",
      category: "COST_OPTIMIZATION",
      severity: "INFO",
      description: "Scheduled workflow has not been executed recently — may be obsolete and wasting quota.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 0,
      docReference: "https://flowintel.io/rules/CST-021",
      detect(ast: ParsedWorkflow): Finding[] {
        const meta = ast.metadata as Record<string,unknown> | undefined;
        if (!meta) return [];
        const lastRun = meta.lastExecutedAt ?? meta.lastRun ?? meta.lastUsed;
        if (!lastRun) return [];
        const lastRunDate = new Date(String(lastRun));
        if (isNaN(lastRunDate.getTime())) return [];
        const daysSince = (Date.now() - lastRunDate.getTime()) / 86_400_000;
        if (daysSince < 30) return [];
        const hasSchedule = ast.nodes.some((n) => n.type === "n8n-nodes-base.scheduleTrigger");
        if (!hasSchedule) return [];
        return [{
          id: "CST-021-workflow", ruleId: "CST-021",
          ruleName: "Workflow Not Disabled When Not In Use",
          severity: "INFO", category: "COST_OPTIMIZATION",
          location: {},
          evidence: { summary: `Last run ${Math.round(daysSince)} days ago`, detail: `Scheduled workflow was last executed ${Math.round(daysSince)} days ago — still consuming quota on every schedule tick.` },
          humanExplanation: "Inactive scheduled workflows continue to fire and consume execution credits until explicitly disabled.",
          suggestedFix: "If this workflow is no longer needed, disable it or delete it to stop consuming execution quota.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/CST-021", penaltyPoints: 2,
        }];
      },
    },
  ],
};
