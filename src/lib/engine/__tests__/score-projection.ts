/**
 * Quick score projection for the "Intentionally Bad Workflow"
 * Shows what the UI will render after the bridge fix.
 */
import { parseWorkflow } from "../../parsers/index";
import { registerAllPacks } from "../rule-packs/index";
import { registry } from "../registry";
import { executeRules } from "../rule-engine";
import { computeCategoryScores, computeOverallFqi, determineApplicableCategories } from "../category-engine";
import { evaluateAllGates } from "../quality-gates";
import { adaptToLegacyScoreBreakdown } from "../adapter-bridge";

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
    { id: "1", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [200, 300], parameters: { path: "public-api", httpMethod: "POST", responseMode: "lastNode" } },
    { id: "2", name: "Code",    type: "n8n-nodes-base.code",    typeVersion: 2, position: [500, 300], parameters: { jsCode } },
    { id: "3", name: "HTTP Request", type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [850, 300], parameters: { url: "http://example.com/api", method: "POST", sendHeaders: true, headerParameters: { parameters: [{ name: "Authorization", value: "Bearer sk_live_123456789" }] }, sendBody: true, specifyBody: "json", jsonBody: "={{$json}}" } },
  ],
  connections: {
    Webhook: { main: [[{ node: "Code",         type: "main", index: 0 }]] },
    Code:    { main: [[{ node: "HTTP Request",  type: "main", index: 0 }]] },
  },
  settings: {}, pinData: {}, meta: {},
};

const ast = parseWorkflow(workflow);
const findings = executeRules(ast, registry);
const applicableCategories = determineApplicableCategories(findings, {
  hasHttpNodes:  ast.httpNodesCount > 0,
  hasAiNodes:    ast.aiNodesCount > 0,
  hasWebhooks:   ast.hasWebhooks,
  hasLoops:      ast.nodes.some(n => n.type.includes("splitInBatches") || n.type.includes("loop")),
  hasCodeNodes:  ast.nodes.some(n => n.isCode),
  nodeCount:     ast.nodes.length,
});
const categoryScores = computeCategoryScores(findings, applicableCategories);
const fqiScore = computeOverallFqi(categoryScores);
const networkNodes = ast.nodes.filter(n =>
  n.type.includes("httpRequest") || n.type.includes("webhook") || n.type.includes("http")
).length;
const gates = evaluateAllGates(findings, categoryScores, { totalNetworkNodes: networkNodes });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const report = {
  findings,
  categoryScores,
  fqiScore,
  qualityGates: gates,
  certificate: null,
  passport: null,
  estimatedMonthlyCostUsd: 0,
  ast,
  reportVersion: "2.0" as const,
  fingerprint: { hash: "test", nodeCount: 3, connectionCount: 2, nodeTypeSignature: [], fingerprintedAt: new Date().toISOString() },
  analysedAt: new Date().toISOString(),
} satisfies import("../types").AnalysisReport;

const legacy = adaptToLegacyScoreBreakdown(report);

console.log("══════════════════════════════════════════════════════════");
console.log("  Projected Score Report — Intentionally Bad Workflow");
console.log("══════════════════════════════════════════════════════════");
console.log();
console.log(`  FQI (Overall):   ${fqiScore}  (was: 87 in old report)`);
console.log();
console.log("  UI Category Scores (legacy bridge output):");
console.log(`    Health:         ${legacy.healthScore}  (was: 100)`);
console.log(`    Security:       ${legacy.securityScore}`);
console.log(`    Simplicity:     ${legacy.complexityScore}`);
console.log(`    Reliability:    ${legacy.reliabilityScore}`);
console.log(`    Debt:           ${legacy.debtScore}  (was: 100)`);
console.log(`    Memory:         ${legacy.memoryScore}`);
console.log(`    Resilience:     ${legacy.resilienceScore}`);
console.log(`    Privacy:        ${legacy.privacyScore}`);
console.log(`    AI Guard:       ${legacy.aiGuardrailsScore ?? "N/A (no AI nodes)"}`);
console.log();
console.log("  Quality Gates:");
gates.forEach(g => {
  const icon = g.passed ? "✅" : "❌";
  console.log(`    ${icon} ${g.gate}: ${g.passed ? "PASS" : "FAIL"}`);
  if (!g.passed) g.failReasons.forEach(r => console.log(`         └─ ${r}`));
});
console.log();
console.log("  Finding Summary:");
const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
findings.forEach(f => counts[f.severity as keyof typeof counts]++);
Object.entries(counts).filter(([,v])=>v>0).forEach(([k,v]) => console.log(`    ${k}: ${v}`));
console.log("══════════════════════════════════════════════════════════");
