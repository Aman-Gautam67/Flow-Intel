/**
 * FlowIntel Performance Extension A — PER-004 to PER-014
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }
const LOOP_TYPES = new Set(["n8n-nodes-base.splitInBatches","n8n-nodes-base.loopNode"]);

export const PERFORMANCE_EXT_A: RulePackManifest = {
  id: "flowintel-performance-ext-a",
  name: "FlowIntel Performance Extension A",
  version: "2.0.0",
  description: "PER-004 through PER-014: parallelization, caching, polling waste, payload size.",
  rules: [
    {
      id: "PER-004",
      name: "Sequential API Calls That Can Be Parallelized",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "Multiple independent HTTP Request nodes are chained sequentially instead of running in parallel.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PER-004",
      detect(ast: ParsedWorkflow): Finding[] {
        const httpNodes = ast.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
        if (httpNodes.length < 3) return [];
        // Find 3+ HTTP nodes in a direct chain (each one's output feeds the next)
        let chainLen = 0, maxChain = 0, chainStart = "";
        for (let i = 0; i < httpNodes.length - 1; i++) {
          const a = httpNodes[i]!, b = httpNodes[i + 1]!;
          const isChained = ast.edges.some((e) => e.source === a.name && e.target === b.name);
          if (isChained) {
            if (chainLen === 0) chainStart = a.id;
            chainLen++;
            maxChain = Math.max(maxChain, chainLen);
          } else chainLen = 0;
        }
        if (maxChain < 2) return [];
        const startNode = ast.nodes.find((n) => n.id === chainStart) ?? httpNodes[0]!;
        return [{
          id: fid("PER-004", startNode.id), ruleId: "PER-004",
          ruleName: "Sequential API Calls That Can Be Parallelized",
          severity: "MEDIUM", category: "PERFORMANCE",
          location: { nodeId: startNode.id, nodeName: startNode.name, nodeType: startNode.type },
          evidence: { summary: `${maxChain + 1} HTTP nodes chained sequentially`, detail: `${maxChain + 1} HTTP Request nodes run one-after-another. If they are independent, they waste wall-clock time waiting for each to finish.` },
          humanExplanation: "Sequential independent API calls multiply latency. 3 calls × 500ms each = 1500ms instead of 500ms in parallel.",
          suggestedFix: "Use a Merge node with 'Wait for All' mode and connect independent HTTP Request nodes to it so they run in parallel.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-004", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "PER-005",
      name: "Missing Response Caching on Repeated API Call",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "HTTP GET node called inside a loop with the same URL pattern — results should be cached.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PER-005",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const hasLoop = ast.nodes.some((n) => LOOP_TYPES.has(n.type));
        if (!hasLoop) return [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const p = node.parameters as Record<string,unknown> | undefined;
          if (String(p?.method ?? "GET").toUpperCase() !== "GET") continue;
          const inLoop = ast.edges.some((e) => {
            const src = ast.nodes.find((n) => n.name === e.source);
            return e.target === node.name && src && LOOP_TYPES.has(src.type);
          });
          if (!inLoop) continue;
          const hasCache = ast.nodes.some((n) => {
            const s = ps(n);
            return /redis|cache|memoize|cached|cacheKey/i.test(s);
          });
          if (!hasCache) {
            findings.push({
              id: fid("PER-005", node.id), ruleId: "PER-005",
              ruleName: "Missing Response Caching on Repeated API Call",
              severity: "MEDIUM", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "GET node inside loop with no cache", detail: `"${node.name}" makes repeated GET requests inside a loop without caching — same data fetched on each iteration.` },
              humanExplanation: "Fetching the same data on every loop iteration multiplies API calls and latency by the item count.",
              suggestedFix: "Cache the GET response in Redis or a Set node before the loop. Reference the cached value inside the loop.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-005", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PER-006",
      name: "Polling Instead of Webhook Trigger",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "Workflow uses frequent polling (schedule < 5 min) where a webhook would be more efficient.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PER-006",
      detect(ast: ParsedWorkflow): Finding[] {
        const sched = ast.nodes.find((n) => n.type === "n8n-nodes-base.scheduleTrigger");
        if (!sched) return [];
        const pp = sched.parameters as Record<string,unknown> | undefined;
        const rule = pp?.rule as Record<string,unknown> | undefined;
        const interval = Number(rule?.interval ?? pp?.interval ?? 999);
        const unit = String(rule?.unit ?? pp?.unit ?? "minutes");
        const isFrequent = (unit === "seconds") ||
          (unit === "minutes" && interval <= 5) ||
          (unit.includes("minute") && interval <= 5);
        if (!isFrequent) return [];
        const hasHttp = ast.nodes.some((n) => n.type === "n8n-nodes-base.httpRequest");
        if (!hasHttp) return [];
        return [{
          id: fid("PER-006", sched.id), ruleId: "PER-006",
          ruleName: "Polling Instead of Webhook Trigger",
          severity: "MEDIUM", category: "PERFORMANCE",
          location: { nodeId: sched.id, nodeName: sched.name, nodeType: sched.type },
          evidence: { summary: `Schedule interval ≤5 min with HTTP calls`, detail: `Workflow polls every ${interval} ${unit} — if the upstream service supports webhooks, this wastes API quota and adds latency.` },
          humanExplanation: "Polling every minute makes 1440 API calls/day. A webhook fires only when there is actual data, reducing calls by 99% or more.",
          suggestedFix: "Replace the schedule trigger + HTTP poll with a webhook trigger if the upstream service supports push notifications.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-006", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "PER-007",
      name: "Large Payload Passed Through All Nodes",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "Binary or large data object passed through many nodes when only a subset is needed.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/PER-007",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasBinary = ast.nodes.some((n) => {
          const s = ps(n);
          return /binaryData|binary.*property|downloadFile/i.test(s);
        });
        if (!hasBinary) return [];
        if (ast.nodes.length < 8) return [];
        // Check if data is pruned early (Set/EditFields near the start)
        const earlyPrune = ast.nodes.slice(0, 4).some((n) =>
          n.type === "n8n-nodes-base.set" || n.type === "n8n-nodes-base.editFields"
        );
        if (earlyPrune) return [];
        return [{
          id: "PER-007-workflow", ruleId: "PER-007",
          ruleName: "Large Payload Passed Through All Nodes",
          severity: "MEDIUM", category: "PERFORMANCE",
          location: {},
          evidence: { summary: "Binary/large data with no early field pruning", detail: `Workflow handles binary data but does not prune the payload early — carries large objects through ${ast.nodes.length} nodes.` },
          humanExplanation: "Carrying large payloads through many nodes consumes memory proportional to node count × item count.",
          suggestedFix: "Add a Set/Edit Fields node early in the workflow to select only the fields needed downstream.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-007", penaltyPoints: 8,
        }];
      },
    },

    {
      id: "PER-008",
      name: "Synchronous File Read in Code Node",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "Code node uses readFileSync (blocking I/O) instead of async readFile.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/PER-008",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          if (/readFileSync|writeFileSync|execSync|spawnSync/.test(code)) {
            findings.push({
              id: fid("PER-008", node.id), ruleId: "PER-008",
              ruleName: "Synchronous File Read in Code Node",
              severity: "MEDIUM", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Sync I/O detected", detail: `"${node.name}" uses synchronous I/O (readFileSync/execSync) which blocks the Node.js event loop.` },
              humanExplanation: "Synchronous I/O in Node.js blocks all other concurrent work while waiting — degrading performance of every other running workflow.",
              suggestedFix: "Replace with async equivalents: await fs.promises.readFile() or await execAsync().",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-008", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PER-009",
      name: "Unbatched Loop — Single-Item HTTP Calls",
      category: "PERFORMANCE",
      severity: "HIGH",
      description: "Loop makes one HTTP call per item instead of batching into a bulk API call.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/PER-009",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const loopNode of ast.nodes) {
          if (!LOOP_TYPES.has(loopNode.type)) continue;
          const children = ast.edges
            .filter((e) => e.source === loopNode.name)
            .map((e) => ast.nodes.find((n) => n.name === e.target))
            .filter(Boolean);
          const httpChild = children.find((n) => n && n.type === "n8n-nodes-base.httpRequest");
          if (!httpChild) continue;
          const pp = httpChild.parameters as Record<string,unknown> | undefined;
          const url = String(pp?.url ?? "");
          const hasBulkEndpoint = /bulk|batch|multiple|many|all/i.test(url);
          if (!hasBulkEndpoint) {
            findings.push({
              id: fid("PER-009", loopNode.id), ruleId: "PER-009",
              ruleName: "Unbatched Loop — Single-Item HTTP Calls",
              severity: "HIGH", category: "PERFORMANCE",
              location: { nodeId: loopNode.id, nodeName: loopNode.name, nodeType: loopNode.type },
              evidence: { summary: "One HTTP call per loop item", detail: `Loop "${loopNode.name}" calls "${httpChild?.name}" for each item individually — check if a bulk API endpoint exists.` },
              humanExplanation: "Making N individual API calls instead of one batch call multiplies latency and API quota usage by N.",
              suggestedFix: "Collect all items first (Merge), then send a single bulk API request. Most major APIs support batch endpoints.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-009", penaltyPoints: 15,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PER-010",
      name: "AI Model Used for Simple Pattern Match",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "LLM/AI node is used for a task achievable with a simple regex or If node.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/PER-010",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const AI = ["langchain","openai","anthropic","llm","chatmodel"];
        for (const node of ast.nodes) {
          const t = node.type.toLowerCase();
          if (!AI.some((a) => t.includes(a))) continue;
          const s = ps(node);
          if (/classify.*true.*false|is.*yes.*no|check.*if|contains.*keyword|extract.*email|extract.*phone/i.test(s)) {
            findings.push({
              id: fid("PER-010", node.id), ruleId: "PER-010",
              ruleName: "AI Model Used for Simple Pattern Match",
              severity: "MEDIUM", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "AI used for simple classification/extraction", detail: `"${node.name}" appears to use an LLM for a task (yes/no classification, email extraction) achievable with a regex or If node.` },
              humanExplanation: "Using a 500ms AI API call to check if a string contains a keyword adds latency and cost for zero quality benefit.",
              suggestedFix: "Replace with an If node or Code node using a regex. Reserve AI for tasks requiring genuine language understanding.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-010", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PER-011",
      name: "Missing Database Index Hint",
      category: "PERFORMANCE",
      severity: "LOW",
      description: "Database query filters on a column with no indication that an index exists.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/PER-011",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql"]);
        for (const node of ast.nodes) {
          if (!DB.has(node.type)) continue;
          const s = ps(node);
          if (/WHERE.*email|WHERE.*name|WHERE.*description/i.test(s) && !/index|INDEX|EXPLAIN/i.test(s)) {
            findings.push({
              id: fid("PER-011", node.id), ruleId: "PER-011",
              ruleName: "Missing Database Index Hint",
              severity: "LOW", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Query on potentially unindexed column", detail: `"${node.name}" filters on a text column (email/name) — verify this column is indexed in your database.` },
              humanExplanation: "Full-table scans on unindexed columns degrade exponentially with table size.",
              suggestedFix: `Ensure the filtered column has a database index. Add a comment in "${node.name}" confirming the index exists.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-011", penaltyPoints: 5,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PER-012",
      name: "Redundant Data Transformation",
      category: "PERFORMANCE",
      severity: "LOW",
      description: "Two consecutive Set/EditFields nodes transform the same fields — can be merged.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/PER-012",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const TRANSFORM = new Set(["n8n-nodes-base.set","n8n-nodes-base.editFields"]);
        for (const node of ast.nodes) {
          if (!TRANSFORM.has(node.type)) continue;
          const nextEdge = ast.edges.find((e) => e.source === node.name);
          if (!nextEdge) continue;
          const next = ast.nodes.find((n) => n.name === nextEdge.target);
          if (next && TRANSFORM.has(next.type)) {
            findings.push({
              id: fid("PER-012", node.id), ruleId: "PER-012",
              ruleName: "Redundant Data Transformation",
              severity: "LOW", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: `"${node.name}" → "${next.name}" two consecutive transforms`, detail: `"${node.name}" is immediately followed by "${next.name}" — two transform nodes that could be merged into one.` },
              humanExplanation: "Each transform node processes the entire item array. Two consecutive transforms doubles processing time for no benefit.",
              suggestedFix: `Merge "${node.name}" and "${next.name}" into a single Set/Edit Fields node.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-012", penaltyPoints: 5,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PER-013",
      name: "Missing Compression on Large HTTP Payload",
      category: "PERFORMANCE",
      severity: "LOW",
      description: "HTTP Request sends or receives large payloads without compression headers.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/PER-013",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (node.type !== "n8n-nodes-base.httpRequest") continue;
          const s = ps(node);
          const hasBody = /"body"|"bodyParameters"|"jsonBody"/.test(s);
          if (!hasBody) continue;
          if (!/accept-encoding|content-encoding|gzip|deflate|compress/i.test(s)) {
            findings.push({
              id: fid("PER-013", node.id), ruleId: "PER-013",
              ruleName: "Missing Compression on Large HTTP Payload",
              severity: "LOW", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "HTTP Request body with no compression header", detail: `"${node.name}" sends a request body without Accept-Encoding/Content-Encoding headers — uncompressed transfers.` },
              humanExplanation: "Enabling gzip compression typically reduces payload size by 70-90%, reducing transfer time and egress costs.",
              suggestedFix: "Add Accept-Encoding: gzip, deflate header to request and ensure the server response is decompressed.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-013", penaltyPoints: 5,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "PER-014",
      name: "Eager Loading of All Fields in DB Query",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      description: "Database query selects all columns (SELECT *) when only a few are needed.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/PER-014",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb"]);
        for (const node of ast.nodes) {
          if (!DB.has(node.type)) continue;
          const s = ps(node);
          if (/SELECT \*|returnAll.*true|fetchAll/i.test(s)) {
            findings.push({
              id: fid("PER-014", node.id), ruleId: "PER-014",
              ruleName: "Eager Loading of All Fields in DB Query",
              severity: "MEDIUM", category: "PERFORMANCE",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "SELECT * or returnAll:true", detail: `"${node.name}" fetches all columns — carries unnecessary data through the workflow.` },
              humanExplanation: "Fetching all columns transfers and processes data that is never used, wasting memory and bandwidth.",
              suggestedFix: `Specify only the required columns in "${node.name}"'s query or column selection.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/PER-014", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },
  ],
};
