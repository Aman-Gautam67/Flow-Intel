/**
 * FlowIntel QA — Negative Fixtures
 * ─────────────────────────────────────────────────────────────────────────────
 * Clean, legitimate workflows that MUST produce zero CRITICAL findings and
 * zero marketplaceBlocking: true findings. Used to guard against false positives.
 *
 * Add a fixture here whenever a real workflow is misidentified as having a
 * critical issue. Run: npx tsx src/lib/qa/audit-negative-fixtures.ts
 */

export interface NegativeFixture {
  id: string;
  platform: "n8n" | "make" | "zapier" | "flowise" | "airflow" | "prefect" | "generic" | "node-red" | "activepieces";
  label: string;
  /** Why this workflow is genuinely clean */
  cleanReason: string;
  workflow: unknown;
}

export const NEGATIVE_FIXTURES: NegativeFixture[] = [
  // ── n8n: simple authenticated webhook — no PII, has auth
  {
    id: "n8n-webhook-authenticated-clean",
    platform: "n8n",
    label: "Authenticated webhook with no PII — should not fire PRV-015",
    cleanReason:
      "Webhook has headerAuth credentials. No PII fields anywhere. No sensitive data.",
    workflow: {
      name: "[CLEAN] Authenticated Webhook Relay",
      nodes: [
        {
          id: "node-1", name: "Webhook",
          type: "n8n-nodes-base.webhook", typeVersion: 1,
          position: [200, 300],
          parameters: { path: "relay", httpMethod: "POST", authentication: "headerAuth" },
          credentials: { httpHeaderAuth: { id: "cred-1", name: "Relay Auth" } },
        },
        {
          id: "node-2", name: "Forward",
          type: "n8n-nodes-base.httpRequest", typeVersion: 4,
          position: [440, 300],
          parameters: {
            url: "https://api.internal.example.com/events",
            method: "POST",
            sendBody: true,
            bodyParameters: { parameters: [{ name: "event", value: "={{ $json.event }}" }] },
          },
          credentials: { httpHeaderAuth: { id: "cred-2", name: "Internal API" } },
        },
      ],
      connections: {
        "Webhook": { main: [[{ node: "Forward", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
      pinData: {}, meta: { instanceId: "flowintel-qa" },
    },
  },

  // ── n8n: scheduled file mover
  {
    id: "n8n-file-mover-clean",
    platform: "n8n",
    label: "Scheduled file mover — no executeCommand, no PII, no hardcoded secrets",
    cleanReason:
      "Uses scheduleTrigger + readBinaryFile + writeBinaryFile only.",
    workflow: {
      name: "[CLEAN] File Mover — Scheduled",
      nodes: [
        {
          id: "node-1", name: "Every Night",
          type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1,
          position: [200, 300],
          parameters: { rule: { interval: [{ field: "hours", hoursInterval: 24 }] } },
        },
        {
          id: "node-2", name: "Read Source File",
          type: "n8n-nodes-base.readBinaryFile", typeVersion: 1,
          position: [440, 300],
          parameters: { filePath: "/data/exports/daily-report.csv" },
        },
        {
          id: "node-3", name: "Write Archive",
          type: "n8n-nodes-base.writeBinaryFile", typeVersion: 1,
          position: [680, 300],
          parameters: { fileName: "/data/archive/report.csv" },
        },
      ],
      connections: {
        "Every Night":      { main: [[{ node: "Read Source File", type: "main", index: 0 }]] },
        "Read Source File": { main: [[{ node: "Write Archive",    type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
      pinData: {}, meta: { instanceId: "flowintel-qa" },
    },
  },
  {
    id: "node-red-clean-1",
    platform: "node-red",
    label: "Clean Node-RED flow with safe HTTP",
    cleanReason: "Uses HTTPS, no raw payload, no eval",
    workflow: [
      { id: "nr-1", name: "trig", type: "inject", wires: [["nr-2"]] },
      { id: "nr-2", name: "act", type: "http request", url: "https://api.example.com", method: "GET", wires: [[]] }
    ]
  },
  {
    id: "node-red-clean-2",
    platform: "node-red",
    label: "Clean Node-RED flow with proper auth",
    cleanReason: "Auth headers are used properly",
    workflow: [
      { id: "nr-3", name: "act", type: "http request", headers: { Authorization: "Basic credentials" }, wires: [[]] }
    ]
  },
  {
    id: "activepieces-clean-1",
    platform: "activepieces",
    label: "Clean Activepieces",
    cleanReason: "No PII, safe execution",
    workflow: {
      trigger: { name: "trig", type: "SCHEDULE", nextAction: { name: "act", type: "SLACK" } }
    }
  },
  {
    id: "activepieces-clean-2",
    platform: "activepieces",
    label: "Clean Activepieces 2",
    cleanReason: "Safe HTTP request",
    workflow: {
      trigger: { name: "trig", type: "WEBHOOK", nextAction: { name: "act", type: "HTTP", settings: { url: "https://api.example.com", method: "GET" } } }
    }
  }
];