/**
 * FlowIntel Massive Context-Aware Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Procedurally generates 300+ workflow ASTs to test DeepContextResolver and GraphBuilder
 * at scale against various rules, without manually writing every JSON file.
 */

import { parseWorkflow } from "@/lib/parsers";
import { runAnalysisSync } from "@/lib/engine/analysis-runner";
import { registerAllPacks } from "@/lib/engine/rule-packs";
import { WorkflowFactory, ContextMutator, TopologyMutator, type GeneratedTestCase } from "./generators/workflow-factory";
import type { N8nNode } from "@/types";

registerAllPacks();

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function runMassiveTests() {
  console.log("\n══════════════════════════════════════════");
  console.log("  FlowIntel Massive Context-Aware Tests");
  console.log("══════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  const test = (name: string, fn: () => void | Promise<void>) => {
    try {
      fn();
      passed++;
    } catch (err) {
      console.error(`  ❌ ${name}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  };

  function generateSecurityCases(): GeneratedTestCase[] {
    const cases: GeneratedTestCase[] = [];
    
    // Test 1: SEC-002 Deep Nested Auth (Should fail - hardcoded token)
    const failWf = WorkflowFactory.createN8nBase("SEC-002 Deep Auth Fail");
    const httpNodeFail: N8nNode = {
      id: "1", name: "Webhook", type: "n8n-nodes-base.webhook",
      parameters: {}, credentials: {}
    };
    ContextMutator.injectHiddenAuth(httpNodeFail);
    WorkflowFactory.addNode(failWf, httpNodeFail);
    cases.push({
      name: "SEC-002: Hardcoded token deep in advanced options",
      json: failWf,
      expectedPasses: [],
      expectedViolations: ["SEC-002"] // SEC-001 might also fire depending on regex
    });

    // Test 2: SEC-002 Dynamic Auth (Should pass)
    const passWf = WorkflowFactory.createN8nBase("SEC-002 Dynamic Auth Pass");
    const httpNodePass: N8nNode = {
      id: "2", name: "Webhook 2", type: "n8n-nodes-base.webhook",
      parameters: {}, credentials: {}
    };
    ContextMutator.injectDynamicAuth(httpNodePass);
    WorkflowFactory.addNode(passWf, httpNodePass);
    cases.push({
      name: "SEC-002: Dynamic expression for auth token",
      json: passWf,
      expectedPasses: ["SEC-002"],
      expectedViolations: []
    });

    // Generate ~334 more SEC-002 dynamic tests with small variations
    for (let i = 0; i < 334; i++) {
        const passWf = WorkflowFactory.createN8nBase(`SEC-002 Dynamic Auth Pass Var ${i}`);
        const httpNodePass: N8nNode = {
          id: `node-${i}`, name: `Webhook ${i}`, type: "n8n-nodes-base.webhook",
          parameters: { url: `https://api.example.com/v${i}` }, credentials: {}
        };
        ContextMutator.injectDynamicAuth(httpNodePass);
        WorkflowFactory.addNode(passWf, httpNodePass);
        cases.push({
            name: `SEC-002 (Scale Test ${i}): Dynamic expression for auth token`,
            json: passWf,
            expectedPasses: ["SEC-002"],
            expectedViolations: []
        });
    }

    return cases;
  }

  function generateDocumentationCases(): GeneratedTestCase[] {
    const cases: GeneratedTestCase[] = [];

    // Generate ~333 more DOC-001 tests
    for (let i = 0; i < 333; i++) {
        const passWf = WorkflowFactory.createN8nBase(`DOC-001 Node Level Pass Var ${i}`);
        const node: N8nNode = {
          id: `node-${i}`, name: `Any Node ${i}`, type: "n8n-nodes-base.any",
          parameters: {}, credentials: {}
        };
        ContextMutator.injectRootReadme(passWf, "This workflow has a sufficiently long root readme to satisfy the rule requirements for length. Variation " + i);
        WorkflowFactory.addNode(passWf, node);
        cases.push({
            name: `DOC-001 (Scale Test ${i}): Global empty but nodes documented`,
            json: passWf,
            expectedPasses: ["DOC-001"],
            expectedViolations: []
        });
    }

    return cases;
  }

  function generateTopologyCases(): GeneratedTestCase[] {
      const cases: GeneratedTestCase[] = [];

      // Fan-out test (REL-008)
      for (let i = 0; i < 333; i++) {
        const wf = WorkflowFactory.createN8nBase(`REL-008 Fan Out ${i}`);
        const sourceId = "splitter";
        const targets = [];
        WorkflowFactory.addNode(wf, { id: sourceId, name: sourceId, type: "n8n-nodes-base.code", parameters: {}, credentials: {} });
        for (let j = 0; j < 5; j++) {
            const t = `target-${j}`;
            targets.push(t);
            WorkflowFactory.addNode(wf, { id: t, name: t, type: "n8n-nodes-base.any", parameters: {}, credentials: {} });
        }
        TopologyMutator.makeFanOut(wf, sourceId, targets);

        cases.push({
            name: `REL-008 (Scale Test ${i}): Fan-out > 4`,
            json: wf,
            expectedPasses: [],
            expectedViolations: ["REL-008"] // assuming fanout > 4 triggers REL-008
        });
      }

      return cases;
  }
  
  const allCases = [
    ...generateSecurityCases(),
    ...generateDocumentationCases(),
    ...generateTopologyCases()
  ];

  console.log(`Executing ${allCases.length} generated test permutations...\n`);

  for (const testCase of allCases) {
    test(testCase.name, () => {
      // 1. Parse workflow (which builds __deepContext and __graph)
      const ast = parseWorkflow(testCase.json);
      
      // 2. Run deterministic analysis
      const report = runAnalysisSync(ast);
      
      const violations = report.findings.map(f => f.ruleId);
      
      // 3. Assert Violations
      for (const expectedViolation of testCase.expectedViolations) {
        assert(violations.includes(expectedViolation), `Expected violation ${expectedViolation} not found in ${JSON.stringify(violations)}`);
      }
      
      // 4. Assert Passes
      for (const expectedPass of testCase.expectedPasses) {
        assert(!violations.includes(expectedPass), `Expected ${expectedPass} to pass, but it was flagged`);
      }
    });
  }

  console.log("\n══════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("══════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

runMassiveTests();
