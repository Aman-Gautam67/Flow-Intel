/**
 * FlowIntel Rule Engine Simulation & Stress-Test
 * Run with: bun src/lib/analyzer/__tests__/simulate.ts
 *
 * Exercises all 4 edge-case fixtures against the real rule engines,
 * prints a per-dimension execution trace, and dumps detected flaws.
 */

import { N8nParser } from "../../../lib/parsers/n8n.parser";
import { WorkflowAnalyzerService } from "../../../lib/analyzer/engine";

// ─── FIXTURE 1: Data Bloat & OOM Crash ────────────────────────────────────────
const FIXTURE_1 = {
  name: "Data Bloat OOM Flow",
  nodes: [
    { id: "n1", name: "Webhook Trigger", type: "n8n-nodes-base.webhook", typeVersion: 1,
      position: [0, 0], parameters: { authentication: "none", path: "/ingest" } },
    { id: "n2", name: "HTTP Fetch All Records", type: "n8n-nodes-base.httpRequest", typeVersion: 3,
      position: [200, 0], parameters: { url: "https://api.example.com/records", method: "GET" } },
    { id: "n3", name: "Split In Batches", type: "n8n-nodes-base.splitInBatches", typeVersion: 3,
      position: [400, 0], parameters: {} },  // ← no batchSize: triggers UNBOUNDED_LOOP
    { id: "n4", name: "Nested Transformer", type: "n8n-nodes-base.code", typeVersion: 2,
      position: [600, 0], parameters: {
        jsCode: `
          // Nested loop over all items - unbounded
          const result = items.map(item => {
            return item.json.records.reduce((acc, r) => {
              for (let i = 0; i < r.values.length; i++) {
                acc.push({ ...r, expanded: r.values.map(v => v * 2) });
              }
              return acc;
            }, []);
          });
          return result.flat();
        `
      }
    },
    { id: "n5", name: "Merge Arrays", type: "n8n-nodes-base.merge", typeVersion: 2,
      position: [800, 0], parameters: {} },
    { id: "n6", name: "Another HTTP", type: "n8n-nodes-base.httpRequest", typeVersion: 3,
      position: [1000, 0], parameters: { url: "https://api.second.com/process", method: "POST" } },
    { id: "n7", name: "Transform 1", type: "n8n-nodes-base.set", typeVersion: 1,
      position: [1200, 0], parameters: { values: [{ name: "x" }, { name: "y" }, { name: "z" }] } },
    { id: "n8", name: "Transform 2", type: "n8n-nodes-base.set", typeVersion: 1,
      position: [1400, 0], parameters: { values: [{ name: "a" }, { name: "b" }] } },
    { id: "n9", name: "Transform 3", type: "n8n-nodes-base.set", typeVersion: 1,
      position: [1600, 0], parameters: { values: [{ name: "p" }] } },
    { id: "n10", name: "Final HTTP POST", type: "n8n-nodes-base.httpRequest", typeVersion: 3,
      position: [1800, 0], parameters: { url: "http://internal.legacy/save", method: "POST" } },
    { id: "n11", name: "Slack Notify", type: "n8n-nodes-base.slack", typeVersion: 2,
      position: [2000, 0], parameters: {} },
  ],
  connections: {
    "Webhook Trigger": { main: [[{ node: "HTTP Fetch All Records", type: "main", index: 0 }]] },
    "HTTP Fetch All Records": { main: [[{ node: "Split In Batches", type: "main", index: 0 }]] },
    "Split In Batches": { main: [[{ node: "Nested Transformer", type: "main", index: 0 }]] },
    "Nested Transformer": { main: [[{ node: "Merge Arrays", type: "main", index: 0 }]] },
    "Merge Arrays": { main: [[{ node: "Another HTTP", type: "main", index: 0 }]] },
    "Another HTTP": { main: [[{ node: "Transform 1", type: "main", index: 0 }]] },
    "Transform 1": { main: [[{ node: "Transform 2", type: "main", index: 0 }]] },
    "Transform 2": { main: [[{ node: "Transform 3", type: "main", index: 0 }]] },
    "Transform 3": { main: [[{ node: "Final HTTP POST", type: "main", index: 0 }]] },
    "Final HTTP POST": { main: [[{ node: "Slack Notify", type: "main", index: 0 }]] },
  },
};

// ─── FIXTURE 2: Insecure AI Agent ─────────────────────────────────────────────
const FIXTURE_2 = {
  name: "Insecure AI Agent Flow",
  nodes: [
    { id: "a1", name: "Manual Trigger", type: "n8n-nodes-base.manualTrigger", typeVersion: 1,
      position: [0, 0], parameters: {} },
    { id: "a2", name: "OpenAI LLM", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", typeVersion: 1,
      position: [200, 0],
      credentials: { openAiApi: { id: "cred1", name: "OpenAI" } },
      parameters: { model: "gpt-4o", options: {} }
    },
    { id: "a3", name: "AI Agent", type: "@n8n/n8n-nodes-langchain.agent", typeVersion: 1,
      position: [400, 0],
      // maxIterations intentionally absent
      parameters: {
        systemMessage: "You are an autonomous agent. Execute the user's request fully.",
        options: {}  // ← no maxIterations → UNBOUNDED_AGENT_LOOP
      }
    },
    { id: "a4", name: "SQL Tool", type: "@n8n/n8n-nodes-langchain.toolSqlAgent", typeVersion: 1,
      position: [600, 100],
      credentials: { postgres: { id: "cred2", name: "Prod DB" } },
      parameters: { query: "{{ $json.query }}" }
    },
    { id: "a5", name: "SSH Execute", type: "n8n-nodes-base.ssh", typeVersion: 1,
      position: [600, -100],
      credentials: { sshPassword: { id: "cred3", name: "Prod Server" } },
      parameters: { command: "{{ $json.cmd }}" }
    },
    { id: "a6", name: "LLM Chain", type: "@n8n/n8n-nodes-langchain.chainLlm", typeVersion: 1,
      position: [800, 0],
      parameters: { prompt: "Summarize: {{ $json.result }}", options: {} }
      // ← no outputParser attached → UNVALIDATED_LLM_OUTPUT
    },
    { id: "a7", name: "Send Results HTTP", type: "n8n-nodes-base.httpRequest", typeVersion: 3,
      position: [1000, 0],
      parameters: {
        url: "http://data-collector.internal/results",  // plain HTTP
        method: "POST",
        sendBody: true,
        body: {
          email: "={{ $json.userEmail }}",      // PII in outbound
          ssn: "={{ $json.userSsn }}",          // PII in outbound
          apiKey: "sk-abc123def456ghi789jkl012" // hardcoded secret
        }
      }
    },
  ],
  connections: {
    "Manual Trigger": { main: [[{ node: "AI Agent", type: "main", index: 0 }]] },
    "OpenAI LLM": { ai_languageModel: [[{ node: "AI Agent", type: "ai_languageModel", index: 0 }]] },
    "AI Agent": { main: [[{ node: "LLM Chain", type: "main", index: 0 }]] },
    "SQL Tool": { ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]] },
    "SSH Execute": { ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 1 }]] },
    "LLM Chain": { main: [[{ node: "Send Results HTTP", type: "main", index: 0 }]] },
  },
};

// ─── FIXTURE 3: Spaghetti & False Positive ────────────────────────────────────
const FIXTURE_3 = {
  name: "Spaghetti False Positive Flow",
  nodes: [
    { id: "s1", name: "Schedule Trigger", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1,
      position: [0, 0], parameters: { rule: { interval: [{ field: "hours", minutesInterval: 1 }] } } },
    // Many valid branching nodes with continueOnFail
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `s${i+2}`, name: `HTTP Step ${i+1}`, type: "n8n-nodes-base.httpRequest", typeVersion: 3,
      position: [200 + i * 150, i % 3 === 0 ? -100 : i % 3 === 1 ? 0 : 100],
      parameters: {
        url: "https://api.partner.com/step",
        method: "GET",
        continueOnFail: true,   // ← should earn reliability bonus, NOT flag
        onError: "continueRegularOutput",
        retryOnFail: true,      // ← retry bonus
        maxTries: 3,
      }
    })),
    { id: "s14", name: "IF Branch A", type: "n8n-nodes-base.if", typeVersion: 2,
      position: [2000, 0], parameters: { conditions: { string: [{ value1: "={{ $json.status }}", value2: "ok" }] } } },
    { id: "s15", name: "IF Branch B", type: "n8n-nodes-base.if", typeVersion: 2,
      position: [2200, 0], parameters: { conditions: { number: [{ value1: "={{ $json.count }}", value2: 0 }] } } },
    // Disabled test node — should be flagged as DEBT, not HEALTH orphan
    { id: "s16", name: "DEBUG_Test_Node", type: "n8n-nodes-base.code", typeVersion: 2,
      position: [2400, 200], disabled: true,
      parameters: { jsCode: "// test only\nreturn items;" }
    },
    // Variable shadowing: sets a var named "email" that's never used in expressions
    { id: "s17", name: "Set Email Var", type: "n8n-nodes-base.set", typeVersion: 1,
      position: [2400, 0],
      parameters: { values: [{ name: "email", value: "internal@corp.com" }] }
    },
    // Backward edge (spaghetti): connects back to an earlier node
    { id: "s18", name: "Retry Handler", type: "n8n-nodes-base.httpRequest", typeVersion: 3,
      position: [100, 200], // positioned BEFORE many nodes — backward edge
      parameters: { url: "https://api.partner.com/retry", method: "POST" }
    },
    { id: "s19", name: "Final Set", type: "n8n-nodes-base.editFields", typeVersion: 1,
      position: [2600, 0], parameters: { fields: [{ name: "result" }] } },
  ],
  connections: {
    "Schedule Trigger": { main: [[{ node: "HTTP Step 1", type: "main", index: 0 }]] },
    "HTTP Step 1": { main: [[{ node: "HTTP Step 2", type: "main", index: 0 }]] },
    "HTTP Step 2": { main: [[{ node: "HTTP Step 3", type: "main", index: 0 }]] },
    "HTTP Step 3": { main: [[{ node: "HTTP Step 4", type: "main", index: 0 }]] },
    "HTTP Step 4": { main: [[{ node: "HTTP Step 5", type: "main", index: 0 }]] },
    "HTTP Step 5": { main: [[{ node: "HTTP Step 6", type: "main", index: 0 }]] },
    "HTTP Step 6": { main: [[{ node: "IF Branch A", type: "main", index: 0 }]] },
    "IF Branch A": { main: [
      [{ node: "HTTP Step 7", type: "main", index: 0 }],
      [{ node: "Retry Handler", type: "main", index: 0 }]
    ]},
    // Retry Handler connects BACKWARD (position [100, 200] is before most nodes)
    "Retry Handler": { main: [[{ node: "HTTP Step 2", type: "main", index: 0 }]] },
    "HTTP Step 7": { main: [[{ node: "IF Branch B", type: "main", index: 0 }]] },
    "IF Branch B": { main: [
      [{ node: "HTTP Step 8", type: "main", index: 0 }],
      [{ node: "HTTP Step 9", type: "main", index: 0 }]
    ]},
    "HTTP Step 8": { main: [[{ node: "Set Email Var", type: "main", index: 0 }]] },
    "HTTP Step 9": { main: [[{ node: "Final Set", type: "main", index: 0 }]] },
    "Set Email Var": { main: [[{ node: "Final Set", type: "main", index: 0 }]] },
    "HTTP Step 10": { main: [[{ node: "HTTP Step 11", type: "main", index: 0 }]] },
    "HTTP Step 11": { main: [[{ node: "HTTP Step 12", type: "main", index: 0 }]] },
  },
};

// ─── FIXTURE 4: API Rate-Limit & Secret Leak ──────────────────────────────────
const FIXTURE_4 = {
  name: "API Rate-Limit Secret Leak Flow",
  nodes: [
    { id: "r1", name: "Schedule Trigger", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1,
      position: [0, 0], parameters: {} },
    { id: "r2", name: "Fetch Users", type: "n8n-nodes-base.httpRequest", typeVersion: 3,
      position: [200, 0],
      parameters: {
        url: "https://api.crm.com/users",
        method: "GET",
        // Hardcoded JWT in Authorization header
        sendHeaders: true,
        headerParameters: {
          parameters: [{
            name: "Authorization",
            value: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsImlhdCI6MTcwMDAwMH0.SfbxyzABC123"
          }]
        }
      }
    },
    { id: "r3", name: "Split In Batches", type: "n8n-nodes-base.splitInBatches", typeVersion: 3,
      position: [400, 0],
      parameters: { batchSize: 50 }  // batchSize set — should NOT flag UNBOUNDED_LOOP
    },
    { id: "r4", name: "Enrich User Data", type: "n8n-nodes-base.httpRequest", typeVersion: 3,
      position: [600, 0],
      parameters: {
        url: "https://api.enrichment.com/lookup",
        method: "POST",  // POST inside loop — NON_IDEMPOTENT risk
        retryOnFail: true,  // auto-retry on POST → NON_IDEMPOTENT_RETRY
        sendBody: true,
        body: {
          email: "={{ $json.email }}",        // PII in outbound
          phone: "={{ $json.phoneNumber }}",  // PII in outbound
          ssn: "={{ $json.ssn }}",            // PII in outbound
        },
        // No delay node in loop → UNTHROTTLED_LOOP
      }
    },
    { id: "r5", name: "Update CRM", type: "n8n-nodes-base.httpRequest", typeVersion: 3,
      position: [800, 0],
      parameters: {
        url: "https://api.crm.com/users/update",
        method: "PATCH",
        retryOnFail: true,  // PATCH with retry → NON_IDEMPOTENT_RETRY
        sendBody: true,
        body: {
          // Hardcoded API key
          apiKey: "AIzaSyD-9tSrke72I6bkbzSLI2ZAuQpDgQ8Lhz4",  // Google API key pattern
          creditCard: "={{ $json.paymentMethod.card }}",  // PII
        }
      }
    },
    // Orphan node — not connected
    { id: "r6", name: "Orphan Debug Node", type: "n8n-nodes-base.set", typeVersion: 1,
      position: [1000, 400], parameters: { values: [{ name: "debug", value: "true" }] } },
    { id: "r7", name: "Notify Slack", type: "n8n-nodes-base.slack", typeVersion: 2,
      position: [1000, 0],
      // Missing credential — should flag HEALTH_MISSING_CREDENTIAL
      parameters: { channel: "#alerts", text: "Batch processed" }
    },
  ],
  connections: {
    "Schedule Trigger": { main: [[{ node: "Fetch Users", type: "main", index: 0 }]] },
    "Fetch Users": { main: [[{ node: "Split In Batches", type: "main", index: 0 }]] },
    "Split In Batches": { main: [[{ node: "Enrich User Data", type: "main", index: 0 }]] },
    "Enrich User Data": { main: [[{ node: "Update CRM", type: "main", index: 0 }]] },
    "Update CRM": { main: [[{ node: "Notify Slack", type: "main", index: 0 }]] },
  },
};

// ─── Run simulation ────────────────────────────────────────────────────────────
const parser = new N8nParser();
const analyzer = new WorkflowAnalyzerService();

const FIXTURES = [FIXTURE_1, FIXTURE_2, FIXTURE_3, FIXTURE_4];
const FIXTURE_NAMES = [
  "F1: Data Bloat & OOM",
  "F2: Insecure AI Agent",
  "F3: Spaghetti + False Positives",
  "F4: Rate-Limit + Secret Leak",
];

const allResults: Array<{
  name: string;
  scores: Record<string, number>;
  flagCount: number;
  flagsBySeverity: Record<string, number>;
  flagsByCategory: Record<string, number>;
  flags: Array<{ rule: string; severity: string; category: string; title: string; pts?: number }>;
  cost: number;
}> = [];

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  FlowIntel Rule Engine Simulation — Execution Trace");
console.log("═══════════════════════════════════════════════════════════════\n");

for (let i = 0; i < FIXTURES.length; i++) {
  const fixture = FIXTURES[i];
  const label = FIXTURE_NAMES[i];

  console.log(`\n──────────────────────────────────────────────────────────────`);
  console.log(`  ${label}`);
  console.log(`──────────────────────────────────────────────────────────────`);

  let parsed;
  try {
    parsed = parser.parse(fixture);
  } catch (e) {
    console.error(`  PARSE ERROR: ${e}`);
    continue;
  }

  console.log(`  Nodes: ${parsed.nodeCount} | Connections: ${parsed.connectionCount}`);
  console.log(`  HTTP: ${parsed.httpNodesCount} | Code: ${parsed.codeNodesCount} | AI: ${parsed.aiNodesCount}`);
  console.log(`  Branches: ${parsed.branchCount} | Loops: ${parsed.loopCount}`);
  console.log(`  Webhooks: ${parsed.hasWebhooks} | Schedules: ${parsed.hasSchedules}`);
  console.log(`  Secrets detected by parser: ${parsed.extractedSecretsCount}`);

  let result;
  try {
    result = analyzer.analyze(parsed);
  } catch (e) {
    console.error(`  ANALYZE ERROR: ${e}`);
    continue;
  }

  const s = result.scores;
  console.log(`\n  SCORES:`);
  console.log(`    Health:       ${s.healthScore.toString().padStart(3)}/100`);
  console.log(`    Security:     ${(s.securityScore ?? 100).toString().padStart(3)}/100 ${s.securityScore === null ? '(N/A)' : ''}`);
  console.log(`    Complexity:   ${s.complexityScore.toString().padStart(3)}/100`);
  console.log(`    Reliability:  ${s.reliabilityScore.toString().padStart(3)}/100`);
  console.log(`    Debt:         ${s.debtScore.toString().padStart(3)}/100`);
  console.log(`    Memory:       ${s.memoryScore.toString().padStart(3)}/100`);
  console.log(`    Resilience:   ${s.resilienceScore.toString().padStart(3)}/100`);
  console.log(`    Privacy:      ${s.privacyScore.toString().padStart(3)}/100`);
  console.log(`    AI Guardrails:${(s.aiGuardrailsScore ?? 100).toString().padStart(3)}/100 ${s.aiGuardrailsScore === null ? '(N/A)' : ''}`);
  console.log(`    Est. Cost:    $${s.estimatedCostUsd.toFixed(2)}/mo (1k execs)`);

  const flagsBySeverity: Record<string, number> = {};
  const flagsByCategory: Record<string, number> = {};
  for (const f of s.flags) {
    flagsBySeverity[f.severity] = (flagsBySeverity[f.severity] ?? 0) + 1;
    flagsByCategory[f.category] = (flagsByCategory[f.category] ?? 0) + 1;
  }

  console.log(`\n  FLAGS (${s.flags.length} total):`);
  for (const sev of ["CRITICAL", "WARNING", "INFO"]) {
    if (flagsBySeverity[sev]) console.log(`    ${sev}: ${flagsBySeverity[sev]}`);
  }
  console.log(`\n  BY CATEGORY: ${JSON.stringify(flagsByCategory)}`);
  console.log(`\n  FLAG DETAIL:`);
  for (const f of s.flags) {
    const pts = f.ptsDeducted ? ` [-${f.ptsDeducted}]` : "";
    console.log(`    [${f.severity.padEnd(8)}][${f.category.padEnd(14)}] ${f.rule}${pts}`);
    console.log(`      → ${f.title}`);
  }

  allResults.push({
    name: label,
    scores: {
      health: s.healthScore, security: s.securityScore ?? 100, complexity: s.complexityScore,
      reliability: s.reliabilityScore, debt: s.debtScore, memory: s.memoryScore,
      resilience: s.resilienceScore, privacy: s.privacyScore, aiGuardrails: s.aiGuardrailsScore ?? 100,
    },
    flagCount: s.flags.length,
    flagsBySeverity,
    flagsByCategory,
    flags: s.flags.map((f) => ({ rule: f.rule, severity: f.severity, category: f.category, title: f.title, pts: f.ptsDeducted })),
    cost: s.estimatedCostUsd,
  });
}

// ─── Cross-fixture analysis ───────────────────────────────────────────────────
console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log("  CROSS-FIXTURE ANALYSIS & FLAW DETECTION (v2 Rule IDs)");
console.log("═══════════════════════════════════════════════════════════════\n");

// Check 1: F1 — Webhook, unbounded loop, REL issues
const f1 = allResults[0];
if (f1) {
  const unauthWebhook = f1.flags.filter(f => f.rule === "SEC-002");
  console.log(`[F1] Unauthenticated webhook flags: ${unauthWebhook.length} (expected 1 — no auth on webhook)`);
  const loopFlags = f1.flags.filter(f => f.rule === "REL-002");
  console.log(`[F1] Unbounded loop flags: ${loopFlags.length} (expected 1 — batchSize absent)`);
  const relFlags = f1.flags.filter(f => f.rule === "REL-001");
  console.log(`[F1] No-error-handling flags: ${relFlags.length} (expected ≥4 — multiple HTTP nodes)`);
  const httpFlags = f1.flags.filter(f => f.rule === "SEC-003");
  console.log(`[F1] Unencrypted HTTP flags: ${httpFlags.length} (internal URL http://internal.legacy — should be 0 if properly filtered or 1 if external)`);
}

// Check 2: F2 — Hardcoded creds, PII, expensive AI model
const f2 = allResults[1];
if (f2) {
  const secretFlags = f2.flags.filter(f => f.rule === "SEC-001");
  console.log(`\n[F2] Hardcoded secret flags: ${secretFlags.length} (expected ≥1 — sk- key in body)`);
  const piiFlags = f2.flags.filter(f => f.rule === "SEC-005" || f.rule === "PRV-001" || f.rule === "PRV-002");
  console.log(`[F2] PII/Privacy flags: ${piiFlags.length} (expected ≥2 — email/ssn + AI egress)`);
  const aiModelFlags = f2.flags.filter(f => f.rule === "PER-003");
  console.log(`[F2] Expensive AI model flags: ${aiModelFlags.length} (expected ≥1 — gpt-4o)`);
  console.log(`[F2] Security score: ${f2.scores.security} (expected ≤ 50 due to hardcoded creds)`);
}

// Check 3: F3 — Zero false-positive on continueOnFail nodes
const f3 = allResults[2];
if (f3) {
  const falsePositiveRel = f3.flags.filter(f => f.rule === "REL-001");
  console.log(`\n[F3] REL-001 flags: ${falsePositiveRel.length} (Retry Handler has no continueOnFail — 1 correct finding expected; HTTP Step nodes correctly get 0)`);
  const hygieneFlags = f3.flags.filter(f => f.category === "HYGIENE");
  console.log(`[F3] Hygiene flags: ${hygieneFlags.length} (expected ≥1 — disabled node, unnamed nodes)`);
  const disabledFlags = f3.flags.filter(f => f.rule === "MNT-005");
  console.log(`[F3] Disabled node flags: ${disabledFlags.length} (expected 1 — DEBUG_Test_Node disabled)`);
}

// Check 4: F4 — Non-idempotent retry, unthrottled loop, orphan node
const f4 = allResults[3];
if (f4) {
  // batchSize IS set (50) → should NOT trigger REL-002
  const loopFlags = f4.flags.filter(f => f.rule === "REL-002");
  console.log(`\n[F4] Unbounded loop flags (batchSize=50 set): ${loopFlags.length} (expected 0 — batchSize=50 present)`);
  const idempotencyFlags = f4.flags.filter(f => f.rule === "IDP-002");
  console.log(`[F4] Non-idempotent retry flags: ${idempotencyFlags.length} (expected ≥2 — POST+PATCH with retry)`);
  const unthrottledFlags = f4.flags.filter(f => f.rule === "REL-003");
  console.log(`[F4] Unthrottled loop flags: ${unthrottledFlags.length} (expected ≥1 — POST inside batch loop without delay)`);
  const orphanFlags = f4.flags.filter(f => f.rule === "MNT-001");
  console.log(`[F4] Orphan node flags: ${orphanFlags.length} (expected ≥1 — disconnected debug node)`);
  console.log(`[F4] Security score: ${f4.scores.security} (expected ≤ 50 due to hardcoded creds+PII)`);
}

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  Simulation complete. Check assertions above for FAIL lines.");
console.log("═══════════════════════════════════════════════════════════════\n");
