/**
 * FlowIntel Performance Extension B — PER-015 to PER-025
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

export const PERFORMANCE_EXT_B: RulePackManifest = {
  id: "flowintel-performance-ext-b",
  name: "FlowIntel Performance Extension B",
  version: "2.0.0",
  description: "PER-015 through PER-025: connection pooling, N+1, AI token waste, memory leaks.",
  rules: [
    {
      id: "PER-015",
      name: "N+1 Database Query Pattern",
      category: "PERFORMANCE",
      severity: "HIGH",
      description: "Loop fetches individual database records per item instead of a single batch query.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/PER-015",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const LOOP = new Set(["n8n-nodes-base.splitInBatches","n8n-nodes-base.loopNode"]);
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb"]);
        for (const loop of ast.nodes) {
          if (!LOOP.has(loop.type)) continue;
          const dbChild = ast.edges
            .filter((e) => e.source === loop.name)
            .map((e) => ast.nodes.find((n) => n.name === e.target))
            .find((n) => n && DB.has(n.type));
          if (!dbChild) continue;
          const op = String((dbChild.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          if (["get","find","select","fetch","read"].some((v) => op.includes(v))) {
            findings.push({
              id: fid("PER-015", loop.id), ruleId: "PER-015",
              ruleName: "N+1 Database Query Pattern",
              severity: "HIGH", category: "PERFORMANCE",
              location: { nodeId: loop.id, nodeName: loop.name, nodeType: loop.type },
              evidence: { summary: `DB SELECT inside loop "${loop.name}"`, detail: `Loop "${loop.name}" runs a database SELECT on each item — classic N+1 pattern that becomes extremely slow at scale.` },
              humanExplanation: "N+1 queries mean 1000 items = 1000 database round-trips instead of 1. This is the most common performance killer in automation workflows.",
              suggestedFix: "Collect all IDs first, then run a single SELECT WHERE id IN (...) query outside the loop.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-015", penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PER-016",
      name: "Missing Connection Pooling for Database",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "Code node creates a new database connection per invocation instead of reusing a pool.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PER-016",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          if (/new Client\s*\(|new Pool\s*\(|createConnection\s*\(|connect\s*\(/.test(code)) {
            const hasPool = /Pool|pool|pooling|singleton|reuse/.test(code);
            if (!hasPool) {
              findings.push({
                id: fid("PER-016", node.id), ruleId: "PER-016",
                ruleName: "Missing Connection Pooling for Database",
                severity: "MEDIUM", category: "PERFORMANCE",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: { summary: "New DB connection created per invocation", detail: `"${node.name}" creates a new database connection — connecting is expensive (100-500ms).` },
                humanExplanation: "Creating a new database connection on every execution adds 100-500ms of cold-start latency and exhausts connection limits under load.",
                suggestedFix: "Use the built-in Postgres/MySQL nodes which handle connection pooling automatically, or use a persistent pool module.",
                marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-016", penaltyPoints: 10,
              });
            }
          }
        }
        return findings;
      },
    },

    {
      id: "PER-017",
      name: "Excessive AI Token Usage — No Max Token Limit",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "AI/LLM node has no maxTokens limit — may generate excessively long responses.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/PER-017",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const AI = ["langchain","openai","anthropic","llm","chatmodel","agent"];
        for (const node of ast.nodes) {
          const t = node.type.toLowerCase();
          if (!AI.some((a) => t.includes(a))) continue;
          const pp = node.parameters as Record<string,unknown> | undefined;
          const opts = pp?.options as Record<string,unknown> | undefined;
          if (!pp?.maxTokens && !opts?.maxTokens && !pp?.maxOutputTokens && !opts?.maxOutputTokens) {
            findings.push({
              id: fid("PER-017", node.id), ruleId: "PER-017",
              ruleName: "Excessive AI Token Usage — No Max Token Limit",
              severity: "MEDIUM", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "No maxTokens configured", detail: `"${node.name}" has no maxTokens limit — the model may generate very long responses, increasing latency and cost.` },
              humanExplanation: "Without a token limit, an AI response can run to thousands of tokens, causing long wait times and unexpected cost spikes.",
              suggestedFix: `Set maxTokens on "${node.name}" to the maximum useful response length for this task.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-017", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PER-018",
      name: "Repeated JSON Parsing of Same Data",
      category: "PERFORMANCE",
      severity: "LOW",
      description: "Multiple code nodes parse the same JSON string instead of parsing once and passing the object.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/PER-018",
      detect(ast: ParsedWorkflow): Finding[] {
        const parseNodes = ast.nodes.filter((n) => {
          if (!n.isCode) return false;
          const code = n.codeMeta?.codeSnippet ?? ps(n);
          return /JSON\.parse/.test(code);
        });
        if (parseNodes.length < 2) return [];
        return parseNodes.map((node) => ({
          id: fid("PER-018", node.id), ruleId: "PER-018",
          ruleName: "Repeated JSON Parsing of Same Data",
          severity: "LOW" as const, category: "PERFORMANCE" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: `${parseNodes.length} nodes call JSON.parse`, detail: `"${node.name}" is one of ${parseNodes.length} nodes calling JSON.parse — the same data may be parsed multiple times.` },
          humanExplanation: "Parsing JSON is CPU-intensive for large payloads. Parse once, pass the object through the workflow.",
          suggestedFix: "Parse the JSON once in an early Code node. Pass the resulting object through subsequent nodes.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-018", penaltyPoints: 5,
        }));
      },
    },

    {
      id: "PER-019",
      name: "High-Frequency Webhook With Synchronous Processing",
      category: "PERFORMANCE",
      severity: "HIGH",
      description: "High-frequency webhook processes each event synchronously — queue depth builds up.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/PER-019",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasWebhook = ast.nodes.some((n) => n.type === "n8n-nodes-base.webhook");
        if (!hasWebhook) return [];
        if (ast.nodes.length < 8) return [];
        const hasQueue = ast.nodes.some((n) => {
          const s = ps(n);
          return /queue|rabbitmq|redis.*lpush|bull|kafka|pubsub|async.*process/i.test(s);
        });
        if (hasQueue) return [];
        const webhook = ast.nodes.find((n) => n.type === "n8n-nodes-base.webhook")!;
        return [{
          id: fid("PER-019", webhook.id), ruleId: "PER-019",
          ruleName: "High-Frequency Webhook With Synchronous Processing",
          severity: "HIGH", category: "PERFORMANCE",
          location: { nodeId: webhook.id, nodeName: webhook.name, nodeType: webhook.type },
          evidence: { summary: "Complex webhook with no async queue", detail: `Webhook "${webhook.name}" has ${ast.nodes.length} downstream nodes processing synchronously — builds execution queue under load.` },
          humanExplanation: "A high-frequency webhook doing heavy synchronous processing will exhaust concurrency slots. Events pile up, increasing latency for all callers.",
          suggestedFix: "Immediately acknowledge the webhook (HTTP 200), push the event to a Redis queue, and process asynchronously.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-019", penaltyPoints: 12,
        }];
      },
    },

    {
      id: "PER-020",
      name: "Missing Pagination Limit on List Query",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "Database or API list query has no LIMIT/pagination — returns unbounded result sets.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PER-020",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb","n8n-nodes-base.airtable","n8n-nodes-base.googleSheets"]);
        for (const node of ast.nodes) {
          if (!DB.has(node.type)) continue;
          const pp = node.parameters as Record<string,unknown> | undefined;
          const op = String(pp?.operation ?? "").toLowerCase();
          if (!["getall","getmany","list","select","read","search"].some((v) => op.includes(v))) continue;
          const s = ps(node);
          if (!/limit|LIMIT|maxRows|pageSize|perPage|returnAll.*false/i.test(s) && !/returnAll.*true/i.test(s)) {
            findings.push({
              id: fid("PER-020", node.id), ruleId: "PER-020",
              ruleName: "Missing Pagination Limit on List Query",
              severity: "MEDIUM", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "List query with no LIMIT", detail: `"${node.name}" fetches a list with no row limit — returns entire table on large datasets.` },
              humanExplanation: "An unbounded list query on a table with millions of rows loads all rows into memory, causing OOM errors or extreme latency.",
              suggestedFix: `Set a LIMIT (e.g. 100) on "${node.name}" and implement pagination if all records are needed.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-020", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PER-021",
      name: "AI Embedding Generated Per Request Without Cache",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "Embedding node generates a new embedding on every execution without caching stable inputs.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PER-021",
      detect(ast: ParsedWorkflow): Finding[] {
        const embedNodes = ast.nodes.filter((n) =>
          n.type.toLowerCase().includes("embedding") || n.type.toLowerCase().includes("embeddings")
        );
        if (embedNodes.length === 0) return [];
        const hasCache = ast.nodes.some((n) => {
          const s = ps(n);
          return /redis|cache|memoize|vectorStore|pinecone|weaviate/i.test(s);
        });
        if (hasCache) return [];
        return embedNodes.map((node) => ({
          id: fid("PER-021", node.id), ruleId: "PER-021",
          ruleName: "AI Embedding Generated Per Request Without Cache",
          severity: "MEDIUM" as const, category: "PERFORMANCE" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Embedding node with no cache", detail: `"${node.name}" generates embeddings on every execution. If the input is stable, embeddings should be cached.` },
          humanExplanation: "Regenerating the same embeddings on every execution wastes 100-500ms and incurs per-call API costs for identical inputs.",
          suggestedFix: "Cache embeddings in a vector store or Redis with the input content hash as the key. Regenerate only when input changes.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-021", penaltyPoints: 10,
        }));
      },
    },

    {
      id: "PER-022",
      name: "String Concatenation in Loop (vs. Array Join)",
      category: "PERFORMANCE",
      severity: "LOW",
      description: "Code node builds a string by concatenation inside a loop instead of Array.join().",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/PER-022",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          if (/for\s*\(.*\)[\s\S]{0,200}[a-z]+\s*\+=\s*["'`]/.test(code)) {
            findings.push({
              id: fid("PER-022", node.id), ruleId: "PER-022",
              ruleName: "String Concatenation in Loop (vs. Array Join)",
              severity: "LOW", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "String += in loop detected", detail: `"${node.name}" concatenates strings inside a loop — O(n²) memory allocation pattern.` },
              humanExplanation: "String concatenation in a loop creates a new string on every iteration, causing O(n²) memory allocations for large arrays.",
              suggestedFix: "Collect parts into an array and call array.join('') once outside the loop.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-022", penaltyPoints: 5,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PER-023",
      name: "Download File Not Cleaned Up After Use",
      category: "PERFORMANCE",
      severity: "LOW",
      description: "Workflow downloads a binary file but has no cleanup node to free the memory/storage.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/PER-023",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasDownload = ast.nodes.some((n) =>
          n.type === "n8n-nodes-base.readBinaryFiles" ||
          n.type === "n8n-nodes-base.readBinaryFile" ||
          ps(n).includes("binaryData")
        );
        if (!hasDownload) return [];
        const hasCleanup = ast.nodes.some((n) => {
          const s = ps(n);
          return /delete.*binary|cleanup|remove.*file|unlink/i.test(s);
        });
        if (hasCleanup) return [];
        return [{
          id: "PER-023-workflow", ruleId: "PER-023",
          ruleName: "Download File Not Cleaned Up After Use",
          severity: "LOW", category: "PERFORMANCE",
          location: {},
          evidence: { summary: "Binary file loaded with no cleanup", detail: "Workflow downloads binary data but has no cleanup step — accumulates memory over repeated executions." },
          humanExplanation: "Unmanaged binary data in execution memory can cause memory growth over time in high-frequency workflows.",
          suggestedFix: "Add a Code node at the end to delete binary properties no longer needed: delete items[0].binary.data",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-023", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "PER-024",
      name: "Over-Scheduled Workflow",
      category: "PERFORMANCE",
      severity: "HIGH",
      description: "Workflow scheduled more frequently than its processing time allows — executions overlap.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/PER-024",
      detect(ast: ParsedWorkflow): Finding[] {
        const sched = ast.nodes.find((n) => n.type === "n8n-nodes-base.scheduleTrigger");
        if (!sched) return [];
        const pp = sched.parameters as Record<string,unknown> | undefined;
        const rule = pp?.rule as Record<string,unknown> | undefined;
        const interval = Number(rule?.interval ?? pp?.interval ?? 999);
        const unit = String(rule?.unit ?? pp?.unit ?? "minutes");
        const isVeryFrequent = (unit === "seconds" && interval < 30) ||
          (unit.includes("minute") && interval === 1);
        if (!isVeryFrequent) return [];
        if (ast.nodes.length < 10) return [];
        return [{
          id: fid("PER-024", sched.id), ruleId: "PER-024",
          ruleName: "Over-Scheduled Workflow",
          severity: "HIGH", category: "PERFORMANCE",
          location: { nodeId: sched.id, nodeName: sched.name, nodeType: sched.type },
          evidence: { summary: `Schedule every ${interval} ${unit} with ${ast.nodes.length} nodes`, detail: `Workflow runs every ${interval} ${unit} but has ${ast.nodes.length} nodes — processing may take longer than the schedule interval.` },
          humanExplanation: "If processing takes longer than the schedule interval, executions overlap, stacking up concurrency slots and potentially causing database deadlocks.",
          suggestedFix: "Increase the schedule interval or reduce workflow complexity. Add a concurrency limit of 1 to prevent overlapping executions.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-024", penaltyPoints: 12,
        }];
      },
    },

    {
      id: "PER-025",
      name: "Workflow Memory Leak — Growing In-Memory State",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "Code node accumulates data into a module-level array/object that grows across executions.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PER-025",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          if (/^(?:const|let|var)\s+\w+\s*=\s*\[\s*\]/m.test(code) &&
              /\.push\s*\(/.test(code) &&
              !/return|items\.push/.test(code.split(".push(")[0] ?? "")) {
            findings.push({
              id: fid("PER-025", node.id), ruleId: "PER-025",
              ruleName: "Workflow Memory Leak — Growing In-Memory State",
              severity: "MEDIUM", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Module-level array with .push() — potential unbounded growth", detail: `"${node.name}" may accumulate data into a persistent array across executions.` },
              humanExplanation: "In-memory state in n8n code nodes that is never cleared grows indefinitely, eventually exhausting available memory.",
              suggestedFix: "Ensure accumulated data is bounded or cleared at the end of each execution. Use external storage (Redis) for state that must persist across executions.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-025", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    // ── PER-026: O(n²) Nested Loop Over Same Array ────────────────────────────
    {
      id: "PER-026",
      name: "O(n²) Nested Loop Over Same Array",
      category: "PERFORMANCE",
      severity: "HIGH",
      description: "Code node contains a nested for-loop over the same items array, producing O(n²) complexity.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/PER-026",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);

          // Pattern 1: two for-loops iterating variables that share the same array
          // e.g. for(let i=0;i<items.length;i++){ for(let j=0;j<items.length;j++){
          // Use [\s\S] instead of /s flag for TS compat with older targets
          const NESTED_SAME_ARRAY =
            /for\s*\([^)]*<\s*(\w+)\.length[^)]*\)[^{]*\{[\s\S]{0,500}for\s*\([^)]*<\s*\1\.length/.test(code);

          // Pattern 2: two for-loops where both upper bounds reference .length of any var
          // catches: for(i=0;i<arr.length;i++){ for(j=0;j<arr.length;j++){
          const NESTED_LEN_LEN =
            /for\s*\([^)]*\blength\b[^)]*\)[\s\S]{0,800}for\s*\([^)]*\blength\b[^)]*\)/.test(code)
            && /for\s*\([^)]*\blength\b[^)]*\)/.test(code.slice(0, 600));

          if (NESTED_SAME_ARRAY || NESTED_LEN_LEN) {
            findings.push({
              id: fid("PER-026", node.id), ruleId: "PER-026",
              ruleName: "O(n²) Nested Loop Over Same Array",
              severity: "HIGH", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: {
                summary: "Nested for-loop with O(n²) complexity detected",
                detail: `"${node.name}" iterates the same array with nested for-loops. For 1000 items this executes 1,000,000 iterations.`,
              },
              humanExplanation:
                "Nested loops over the same array create O(n²) time complexity. At 100 items = 10,000 ops; at 10,000 items = 100M ops — workflow timeouts are likely.",
              suggestedFix:
                "Replace the nested loop with a Map/Set lookup (O(n log n) or O(n)) or use a single-pass aggregation with a dictionary.",
              marketplaceBlocking: false,
              docReference: "https://flowintel.io/rules/PER-026",
              penaltyPoints: 20,
            });
          }
        }
        return findings;
      },
    },
  ],
};
