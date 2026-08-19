/**
 * FlowIntel Context-Aware Upgrade Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates the DeepContextResolver, GraphBuilder, false positive suppressions,
 * and rollback feature flag behavior.
 */

import { parseWorkflow } from "@/lib/parsers";
import { DeepContextResolver } from "../deep-context";
import { buildConnectionGraph } from "../graph";
import { runAnalysis } from "../analysis-runner";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function runTests() {
  console.log("\n══════════════════════════════════════════");
  console.log("  FlowIntel Context-Aware Upgrade Tests");
  console.log("══════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  const test = (name: string, fn: () => void | Promise<void>) => {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ ${name}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  };

  // ── 1. DeepContextResolver Tests ──────────────────────────────────────────
  test("DeepContextResolver resolves nested options.authentication", () => {
    const rawJson = {
      nodes: [
        {
          id: "node-1",
          name: "Pharma Webhook",
          type: "n8n-nodes-base.webhook",
          parameters: {
            options: {
              authentication: "apiKey",
            },
          },
        },
      ],
    };
    const ctx = DeepContextResolver.resolve(rawJson);
    const nodeCtx = ctx.getNodeContext("node-1");
    assert(nodeCtx !== null, "nodeCtx should not be null");
    assert(nodeCtx?.resolvedAuth === "apiKey", `resolvedAuth should be 'apiKey', got '${nodeCtx?.resolvedAuth}'`);
    assert(nodeCtx?.hasAuth === true, "hasAuth should be true");
  });

  test("DeepContextResolver resolves root staticData.README", () => {
    const rawJson = {
      staticData: {
        README: "This is a comprehensive Pharma Cold Chain workflow documentation that details setup, credentials, and API endpoints for monitoring temperature sensitive medication shipments.",
      },
      nodes: [],
    };
    const ctx = DeepContextResolver.resolve(rawJson);
    assert(ctx.root.hasReadme === true, "hasReadme should be true");
    assert(ctx.root.readmeContent.includes("Pharma Cold Chain"), "readmeContent should contain Pharma Cold Chain text");
  });

  test("DeepContextResolver distinguishes variables vs literals", () => {
    const rawJson = {
      nodes: [
        {
          id: "node-2",
          name: "HTTP Request",
          type: "n8n-nodes-base.httpRequest",
          parameters: {
            url: "https://api.pharma.com/v1/shipments",
            apiKey: "{{ $env.PHARMA_API_KEY }}",
          },
        },
      ],
    };
    const ctx = DeepContextResolver.resolve(rawJson);
    const nodeCtx = ctx.getNodeContext("node-2");
    assert(nodeCtx?.variables.some((v) => v.value.includes("$env.PHARMA_API_KEY")) === true, "Variable reference detected");
    assert(nodeCtx?.literals.some((l) => l.value.includes("api.pharma.com")) === true, "Literal URL detected");
  });

  // ── 2. GraphBuilder Tests ──────────────────────────────────────────────────
  test("GraphBuilder computes correct out-degree and identifies fan-out splitter", () => {
    const connections = {
      "Splitter Node": {
        main: [
          [{ node: "Branch 1" }],
          [{ node: "Branch 2" }],
          [{ node: "Branch 3" }],
          [{ node: "Branch 4" }],
          [{ node: "Branch 5" }],
        ],
      },
    };
    const graph = buildConnectionGraph(connections);
    const splitter = graph["Splitter Node"];
    assert(splitter !== undefined, "Splitter node metric exists");
    assert(splitter.outDegree === 5, `outDegree should be 5, got ${splitter.outDegree}`);
    assert(splitter.isFanOutSplitter === true, "isFanOutSplitter should be true");
  });

  // ── 3. Pharma Cold Chain False Positives Tests ──────────────────────────────
  await (async () => {
    const pharmaWorkflow = {
      name: "Pharma Cold Chain Monitor",
      staticData: {
        README: "The Pharma Cold Chain Monitoring workflow ingests IoT sensor readings via secure Webhook, validates temperature bounds, logs metrics, and fans out alerts across 5 escalation channels.",
      },
      nodes: [
        {
          id: "wh-1",
          name: "Sensor Webhook",
          type: "n8n-nodes-base.webhook",
          parameters: {
            httpMethod: "POST",
            path: "sensor-data",
            options: {
              authentication: "apiKey",
            },
          },
        },
        {
          id: "logger-1",
          name: "Execution Logger",
          type: "n8n-nodes-base.code",
          parameters: {
            jsCode: "console.log('Logging sensor data'); return items;",
          },
        },
        {
          id: "branch-1", name: "Notify Slack", type: "n8n-nodes-base.slack", parameters: {}
        },
        {
          id: "branch-2", name: "Notify Email", type: "n8n-nodes-base.emailSend", parameters: {}
        },
        {
          id: "branch-3", name: "Notify PagerDuty", type: "n8n-nodes-base.httpRequest", parameters: {}
        },
        {
          id: "branch-4", name: "Notify SMS", type: "n8n-nodes-base.httpRequest", parameters: {}
        },
        {
          id: "branch-5", name: "Write Audit Log", type: "n8n-nodes-base.postgres", parameters: {}
        },
      ],
      connections: {
        "Sensor Webhook": {
          main: [[{ node: "Execution Logger" }]],
        },
        "Execution Logger": {
          main: [
            [{ node: "Notify Slack" }],
            [{ node: "Notify Email" }],
            [{ node: "Notify PagerDuty" }],
            [{ node: "Notify SMS" }],
            [{ node: "Write Audit Log" }],
          ],
        },
      },
    };

    const ast = parseWorkflow(pharmaWorkflow);
    const report = await runAnalysis(ast);

    test("Pharma Webhook Auth false positive suppressed (SEC-002)", () => {
      const sec002 = report.findings.find((f) => f.ruleId === "SEC-002");
      assert(sec002 === undefined, "SEC-002 should NOT be flagged when options.authentication = 'apiKey'");
    });

    test("Pharma staticData.README false positive suppressed (DOC-001)", () => {
      const doc001 = report.findings.find((f) => f.ruleId === "DOC-001");
      assert(doc001 === undefined, "DOC-001 should NOT be flagged when staticData.README is present");
    });

    test("Pharma Fan-out rule (REL-008) correctly evaluates out-degree on Logger", () => {
      const rel008 = report.findings.find((f) => f.ruleId === "REL-008" && f.location.nodeName === "Execution Logger");
      assert(rel008 !== undefined, "REL-008 should identify 5 outgoing connections on Execution Logger");
    });
  })();

  // ── 4. Rollback Flag Test ──────────────────────────────────────────────────
  await (async () => {
    process.env.DISABLE_DEEP_CONTEXT = "true";
    const unauthWebhookJson = {
      nodes: [
        {
          id: "w1",
          name: "Raw Webhook",
          type: "n8n-nodes-base.webhook",
          parameters: {},
        },
      ],
    };
    const ast = parseWorkflow(unauthWebhookJson);
    assert(ast.__deepContext === undefined, "__deepContext should be undefined when DISABLE_DEEP_CONTEXT=true");
    delete process.env.DISABLE_DEEP_CONTEXT;
    test("Rollback flag (DISABLE_DEEP_CONTEXT=true) correctly disables context layer", () => {});
  })();

  console.log("\n══════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("══════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

runTests();
