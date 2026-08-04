/**
 * Detection test for the "Intentionally Bad Workflow" submitted by the creator.
 * Verifies that all 6 embedded flaws are caught by the engine.
 */
import { parseWorkflow as parse } from "../../parsers/index";
import { registerAllPacks } from "../rule-packs/index";
import { registry } from "../registry";
import { executeRules } from "../rule-engine";

registerAllPacks();

const jsCode = [
  "const apiKey='sk_live_123456789';",
  "const itemsIn=items;",
  "for(let i=0;i<itemsIn.length;i++){",
  " for(let j=0;j<itemsIn.length;j++){",
  "   itemsIn[i].json.count=(itemsIn[i].json.count||0)+1;",
  " }",
  "}",
  "itemsIn.forEach(i=>{i.json.query=\"SELECT * FROM users WHERE id='\"+i.json.userId+\"'\"});",
  "return itemsIn;",
].join("\n");

const workflow = {
  name: "Intentionally Bad Workflow",
  nodes: [
    {
      id: "1", name: "Webhook",
      type: "n8n-nodes-base.webhook", typeVersion: 2, position: [200, 300],
      parameters: { path: "public-api", httpMethod: "POST", responseMode: "lastNode" },
    },
    {
      id: "2", name: "Code",
      type: "n8n-nodes-base.code", typeVersion: 2, position: [500, 300],
      parameters: { jsCode },
    },
    {
      id: "3", name: "HTTP Request",
      type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [850, 300],
      parameters: {
        url: "http://example.com/api", method: "POST",
        sendHeaders: true,
        headerParameters: { parameters: [{ name: "Authorization", value: "Bearer sk_live_123456789" }] },
        sendBody: true, specifyBody: "json", jsonBody: "={{$json}}",
      },
    },
  ],
  connections: {
    Webhook: { main: [[{ node: "Code", type: "main", index: 0 }]] },
    Code: { main: [[{ node: "HTTP Request", type: "main", index: 0 }]] },
  },
  settings: {}, pinData: {}, meta: {},
};

const ast = parse(workflow);
const codeNode = ast.nodes.find((n) => n.name === "Code")!;

console.log("── AST Parser Check ──────────────────────────────────────────────────────");
console.log(`  Code node isCode:      ${codeNode.isCode}`);
console.log(`  codeSnippet length:    ${codeNode.codeMeta?.codeSnippet?.length ?? 0}`);
console.log();

const findings = executeRules(ast, registry);

function check(label: string, ruleIds: string[], expectMatch = true): boolean {
  const matched = findings.filter((f) => ruleIds.includes(f.ruleId));
  const ok = expectMatch ? matched.length > 0 : matched.length === 0;
  const icon = ok ? "✅" : "❌";
  if (matched.length > 0) {
    console.log(`  ${icon} ${label}: ${matched.map((f) => `${f.ruleId}(${f.severity})`).join(", ")}`);
  } else {
    console.log(`  ${icon} ${label}: NOT DETECTED — rules: ${ruleIds.join(", ")}`);
  }
  return ok;
}

console.log("── Detection Results ─────────────────────────────────────────────────────");
let passes = 0;
let failures = 0;

const tests: Array<[string, string[]]> = [
  ["Unauthenticated webhook",             ["SEC-002"]],
  ["HTTP not HTTPS",                      ["SEC-003"]],
  ["Hardcoded Stripe key in Code node",   ["SEC-001", "SEC-036"]],
  ["Bearer token in HTTP header",         ["SEC-001", "SEC-037"]],
  ["SQL injection (concat)",              ["SEC-008"]],
  ["O(n²) nested loop",                  ["PER-026", "PER-022"]],
  ["Secret leakage to external API",      ["SEC-037", "SEC-005", "SEC-001"]],
];

for (const [label, ruleIds] of tests) {
  const ok = check(label, ruleIds);
  if (ok) passes++; else failures++;
}

console.log();
console.log("── All findings by rule ──────────────────────────────────────────────────");
const byRule = new Map<string, number>();
for (const f of findings) byRule.set(f.ruleId, (byRule.get(f.ruleId) ?? 0) + 1);
[...byRule.entries()].sort().forEach(([k, v]) => console.log(`  ${k}: ${v}`));

console.log();
console.log("══════════════════════════════════════════");
console.log(`  Results: ${passes} passed, ${failures} failed`);
console.log("══════════════════════════════════════════");
if (failures > 0) process.exit(1);
