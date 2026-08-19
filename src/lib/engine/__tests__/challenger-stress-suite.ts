/**
 * FlowIntel Challenger 2 — Downstream Engine Compatibility & Adversarial Stress Suite
 * ─────────────────────────────────────────────────────────────────────────────────
 * EMPIRICAL ADVERSARIAL CHALLENGE:
 * 1. Downstream Engine Compatibility across all 6 new parsers (LangFlow, Dify, CrewAI, AutoGen, Pipedream, OpenAI Agents).
 * 2. Determinism, mathematical invariants, FQI bounds, and zero RULE_CRASH findings.
 * 3. Adversarial & Malformed inputs (cycles, self-loops, extreme text, injection payloads, empty graphs).
 * 4. Massive Scale & Performance Stress Testing (100+, 250+, 500+ nodes across all 6 platforms).
 * 5. Minimal & Empty Graph payloads across all platforms.
 * 6. Null & Undefined node properties resilience.
 * 7. 1,000-node linear chain traversal & call stack limit.
 * 8. Secret penetration & security quality gate enforcement.
 */

import { parseWorkflow, detectPlatform } from "@/lib/parsers";
import { runAnalysis, runAnalysisSync } from "@/lib/engine/analysis-runner";

let passedCount = 0;
let failedCount = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failedCount++;
    const msg = detail ? `  ❌ ${label} — ${detail}` : `  ❌ ${label}`;
    failures.push(msg);
    console.error(msg);
  }
}

function assertEq<T>(actual: T, expected: T, label: string) {
  assert(actual === expected, label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertRange(val: number, min: number, max: number, label: string) {
  assert(val >= min && val <= max, label, `expected [${min}, ${max}], got ${val}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURE GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

export class AdversarialFixtureGenerator {
  /**
   * LangFlow Generator
   */
  static generateLangflow(nodeCount: number, withCycles = false, textMultiplier = 1) {
    const nodes: any[] = [];
    const edges: any[] = [];
    const baseText = "A".repeat(textMultiplier);

    for (let i = 0; i < nodeCount; i++) {
      const typeIndex = i % 8;
      const id = `lf_node_${i}`;
      let data: any = {};

      if (typeIndex === 0) {
        data = {
          type: "ChatInput",
          node: {
            display_name: `User Input ${i} ${baseText.slice(0, 20)}`,
            template: { input_value: { type: "str", value: `Question ${i} ${baseText}` } },
          },
        };
      } else if (typeIndex === 1) {
        data = {
          type: "ChatOpenAI",
          node: {
            display_name: `OpenAI LLM ${i}`,
            template: {
              model_name: { type: "str", value: "gpt-4o" },
              temperature: { type: "float", value: 0.7 },
              max_tokens: { type: "int", value: 2000 },
              openai_api_key: { type: "str", value: "sk-proj-testkey1234567890abcdef12345678" },
            },
          },
        };
      } else if (typeIndex === 2) {
        data = {
          type: "PythonFunction",
          node: {
            display_name: `Python Transform ${i}`,
            template: {
              code: {
                type: "code",
                value: `def run(input_data):\n    # transform step ${i}\n    return {'result': input_data, 'text': '${baseText.slice(0, 100)}'}\n`,
              },
            },
          },
        };
      } else if (typeIndex === 3) {
        data = {
          type: "Chroma",
          node: {
            display_name: `Vector DB ${i}`,
            template: { collection_name: { type: "str", value: `collection_${i}` } },
          },
        };
      } else if (typeIndex === 4) {
        data = {
          type: "ApiRequest",
          node: {
            display_name: `HTTP Node ${i}`,
            template: {
              url: { type: "str", value: `https://api.example.com/v1/resource/${i}` },
              method: { type: "str", value: "POST" },
              headers: { type: "dict", value: { Authorization: "Bearer my-secret-token-12345678" } },
            },
          },
        };
      } else if (typeIndex === 5) {
        data = {
          type: "ConditionalRouter",
          node: {
            display_name: `Router ${i}`,
            template: { condition: { type: "str", value: `input.score > 0.5` } },
          },
        };
      } else if (typeIndex === 6) {
        data = {
          type: "ToolCallingAgent",
          node: {
            display_name: `Agent ${i}`,
            template: { max_iterations: { type: "int", value: 5 } },
          },
        };
      } else {
        data = {
          type: "LoopComponent",
          node: {
            display_name: `Batch Loop ${i}`,
            template: { batch_size: { type: "int", value: 10 } },
          },
        };
      }

      nodes.push({
        id,
        type: data.type.toLowerCase(),
        position: { x: (i % 10) * 200, y: Math.floor(i / 10) * 150 },
        data,
      });

      if (i > 0) {
        edges.push({
          id: `edge_${i - 1}_to_${i}`,
          source: `lf_node_${i - 1}`,
          target: id,
          sourceHandle: "output",
          targetHandle: "input",
        });
      }
    }

    if (withCycles && nodeCount > 2) {
      edges.push({
        id: "cycle_edge_back",
        source: `lf_node_${nodeCount - 1}`,
        target: "lf_node_0",
      });
    }

    return {
      id: `langflow_bench_${nodeCount}`,
      name: `LangFlow Benchmark ${nodeCount}`,
      description: `Synthetic LangFlow graph with ${nodeCount} nodes`,
      data: { nodes, edges },
    };
  }

  /**
   * Dify Generator
   */
  static generateDify(nodeCount: number, withCycles = false, textMultiplier = 1) {
    const nodes: any[] = [];
    const edges: any[] = [];
    const baseText = "B".repeat(textMultiplier);

    // Start node
    nodes.push({
      id: "dify_start",
      type: "start",
      data: {
        type: "start",
        title: "Workflow Start",
        variables: [{ variable: "query", type: "string", default: `Initial query ${baseText.slice(0, 50)}` }],
      },
    });

    for (let i = 1; i < nodeCount; i++) {
      const typeIndex = i % 6;
      const id = `dify_node_${i}`;
      let data: any = {};

      if (typeIndex === 0) {
        data = {
          type: "llm",
          title: `LLM Step ${i}`,
          model: { provider: "openai", name: "gpt-4o", mode: "chat" },
          prompt_template: [{ role: "system", text: `You are assistant ${i} ${baseText}` }],
        };
      } else if (typeIndex === 1) {
        data = {
          type: "code",
          title: `Code Step ${i}`,
          code_language: "javascript",
          code: `function main(params) {\n  return { transformed: params.input + '${baseText.slice(0, 50)}' };\n}`,
        };
      } else if (typeIndex === 2) {
        data = {
          type: "http-request",
          title: `HTTP Request ${i}`,
          method: "POST",
          url: `https://api.service.io/v2/items/${i}`,
          authorization: { type: "api-key", config: { api_key: "pd_live_12345678901234567890" } },
        };
      } else if (typeIndex === 3) {
        data = {
          type: "if-else",
          title: `Branch Condition ${i}`,
          conditions: [{ variable: "status", comparison_operator: "equal", value: "200" }],
        };
      } else if (typeIndex === 4) {
        data = {
          type: "template-transform",
          title: `Template ${i}`,
          template: `Result for item {{#${id}#.result}}: ${baseText.slice(0, 50)}`,
        };
      } else {
        data = {
          type: "tool",
          title: `Tool Node ${i}`,
          provider_id: "google_search",
          tool_name: "web_search",
          tool_parameters: { query: "search keyword" },
        };
      }

      nodes.push({
        id,
        type: data.type,
        data,
      });

      const prevId = i === 1 ? "dify_start" : `dify_node_${i - 1}`;
      edges.push({
        id: `dify_edge_${prevId}_to_${id}`,
        source: prevId,
        target: id,
      });
    }

    if (withCycles && nodeCount > 2) {
      edges.push({
        id: "dify_cycle_back",
        source: `dify_node_${nodeCount - 1}`,
        target: "dify_node_1",
      });
    }

    return {
      app: { name: `Dify Benchmark ${nodeCount}`, mode: "workflow" },
      workflow: {
        version: "0.1.2",
        environment_variables: [
          { name: "API_KEY", value: "sk-proj-environment-secret-12345678" },
          { name: "APP_ENV", value: "production" },
        ],
        graph: { nodes, edges },
      },
    };
  }

  /**
   * CrewAI Generator
   */
  static generateCrewAi(agentCount: number, withManager = true, textMultiplier = 1) {
    const agents: any[] = [];
    const tasks: any[] = [];
    const baseText = "C".repeat(textMultiplier);

    for (let i = 0; i < agentCount; i++) {
      const agentName = `Agent_${i}`;
      agents.push({
        name: agentName,
        role: `Senior Specialist ${i}`,
        goal: `Accomplish specialized objective ${i} ${baseText.slice(0, 50)}`,
        backstory: `Experienced engineer with decade of practice in domain ${i}. ${baseText.slice(0, 100)}`,
        llm: i % 2 === 0 ? "gpt-4o" : "claude-3-5-sonnet",
        verbose: true,
        allow_delegation: i % 3 === 0,
        tools: [
          { name: `SearchTool_${i}`, description: `Custom search for agent ${i}` },
          { name: `DatabaseTool_${i}`, description: `DB access for agent ${i}` },
        ],
      });

      tasks.push({
        name: `Task_${i}`,
        description: `Execute comprehensive domain analysis for step ${i} ${baseText.slice(0, 80)}`,
        expected_output: `Structured report ${i} with verified metrics`,
        agent: agentName,
        tools: [`SearchTool_${i}`],
      });
    }

    return {
      crew: {
        name: `CrewAI Benchmark ${agentCount}`,
        process: withManager ? "hierarchical" : "sequential",
        manager_llm: withManager ? "gpt-4o" : undefined,
        memory: true,
        verbose: true,
        agents,
        tasks,
      },
    };
  }

  /**
   * AutoGen Generator
   */
  static generateAutoGen(agentCount: number, withGroupChat = true, textMultiplier = 1) {
    const agents: any[] = [];
    const baseText = "D".repeat(textMultiplier);

    // User Proxy
    agents.push({
      name: "UserProxy",
      type: "UserProxyAgent",
      human_input_mode: "NEVER",
      max_consecutive_auto_reply: 10,
      code_execution_config: {
        work_dir: "coding",
        use_docker: false,
      },
    });

    for (let i = 1; i < agentCount; i++) {
      agents.push({
        name: `Assistant_${i}`,
        type: "AssistantAgent",
        system_message: `You are domain expert ${i}. Follow protocol carefully. ${baseText.slice(0, 80)}`,
        llm_config: {
          config_list: [
            {
              model: i % 2 === 0 ? "gpt-4o" : "gpt-4-turbo",
              api_key: `sk-proj-autogen-key-${i}-1234567890abcdef`,
              temperature: 0.2,
            },
          ],
          timeout: 120,
        },
      });
    }

    return {
      name: `AutoGen Benchmark ${agentCount}`,
      agents,
      groupchat: withGroupChat
        ? {
            admin_name: "UserProxy",
            max_round: agentCount * 2,
            speaker_selection_method: "round_robin",
            messages: [{ sender: "UserProxy", content: `Start multi-agent deliberation ${baseText.slice(0, 50)}` }],
          }
        : undefined,
    };
  }

  /**
   * Pipedream Generator
   */
  static generatePipedream(stepCount: number, textMultiplier = 1) {
    const triggers: any[] = [
      {
        id: "pd_http_trigger",
        name: "Incoming Webhook Trigger",
        component_id: "http",
        configured_props: {
          auth: { secret: "pd_live_1234567890abcdef12345678" },
          path: "/webhook/v1/intake",
        },
      },
    ];

    const steps: any[] = [];
    const baseText = "E".repeat(textMultiplier);

    for (let i = 0; i < stepCount; i++) {
      const typeIndex = i % 4;
      const id = `pd_step_${i}`;

      if (typeIndex === 0) {
        steps.push({
          id,
          name: `NodeJS Step ${i}`,
          type: "custom_code",
          language: "nodejs20.x",
          code: `export default defineComponent({\n  async run({ steps, $ }) {\n    // Node code step ${i}\n    return { ok: true, data: "${baseText.slice(0, 50)}" };\n  }\n});`,
          configured_props: { apiKey: "pd_live_pipedream_step_secret_1234" },
        });
      } else if (typeIndex === 1) {
        steps.push({
          id,
          name: `Python Step ${i}`,
          type: "custom_code",
          language: "python3.11",
          code: `def handler(pd):\n    # Python step ${i}\n    return {"step": ${i}, "payload": "${baseText.slice(0, 50)}"}\n`,
        });
      } else if (typeIndex === 2) {
        steps.push({
          id,
          name: `HTTP Action ${i}`,
          type: "action",
          package: "@pipedream/http",
          action: "send_http_request",
          configured_props: {
            url: `https://api.pipedream.net/v1/events/${i}`,
            method: "POST",
            headers: { Authorization: "Bearer pd_bearer_secret_12345678" },
          },
        });
      } else {
        steps.push({
          id,
          name: `Data Transformer ${i}`,
          type: "action",
          package: "@pipedream/data_stores",
          action: "set_record",
          configured_props: {
            key: `record_${i}`,
            value: { payload: `Transformed payload ${i} ${baseText.slice(0, 50)}` },
          },
        });
      }
    }

    return {
      name: `Pipedream Benchmark ${stepCount}`,
      triggers,
      steps,
    };
  }

  /**
   * OpenAI Agents / Swarm Generator
   */
  static generateOpenAiAgents(agentCount: number, withHandoffs = true, textMultiplier = 1) {
    const agents: any[] = [];
    const baseText = "F".repeat(textMultiplier);

    for (let i = 0; i < agentCount; i++) {
      const agentName = `SwarmAgent_${i}`;
      const nextAgentName = `SwarmAgent_${(i + 1) % agentCount}`;

      const functions: any[] = [
        {
          name: `fetch_metrics_${i}`,
          description: `Fetch system metrics for node ${i} ${baseText.slice(0, 50)}`,
          parameters: { type: "object", properties: { limit: { type: "number" } } },
        },
        {
          name: `transfer_to_${nextAgentName}`,
          description: `Handoff conversation to ${nextAgentName}`,
        },
      ];

      agents.push({
        name: agentName,
        model: i % 2 === 0 ? "gpt-4o" : "gpt-4o-mini",
        instructions: `You are specialized agent ${agentName}. Coordinate with peers. ${baseText.slice(0, 100)}`,
        functions,
        handoffs: withHandoffs ? [nextAgentName] : [],
        temperature: 0.1,
      });
    }

    return {
      name: `OpenAI Swarm Benchmark ${agentCount}`,
      starting_agent: "SwarmAgent_0",
      agents,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════════════════════

async function runChallengerSuite() {
  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("  FLOWINTEL CHALLENGER 2 — ADVERSARIAL DOWNSTREAM COMPATIBILITY SUITE");
  console.log("═══════════════════════════════════════════════════════════════════════════\n");

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 1: Downstream Pipeline Compatibility & Invariant Checks (All 6 Platforms)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("── SUITE 1: Downstream Engine Compatibility & Rule Execution ──────────────");

  const platforms = [
    { name: "LANGFLOW", gen: () => AdversarialFixtureGenerator.generateLangflow(12, false, 10) },
    { name: "DIFY", gen: () => AdversarialFixtureGenerator.generateDify(12, false, 10) },
    { name: "CREWAI", gen: () => AdversarialFixtureGenerator.generateCrewAi(10, true, 10) },
    { name: "AUTOGEN", gen: () => AdversarialFixtureGenerator.generateAutoGen(10, true, 10) },
    { name: "PIPEDREAM", gen: () => AdversarialFixtureGenerator.generatePipedream(12, 10) },
    { name: "OPENAI_AGENTS", gen: () => AdversarialFixtureGenerator.generateOpenAiAgents(10, true, 10) },
  ];

  for (const { name, gen } of platforms) {
    const raw = gen();
    const detected = detectPlatform(raw);
    assertEq(detected, name, `S1.1 Platform detector identifies ${name}`);

    const ast = parseWorkflow(raw);
    assert(ast.nodes.length > 0, `S1.2 [${name}] Parser produces non-empty nodes (count: ${ast.nodes.length})`);
    assert(Array.isArray(ast.edges), `S1.3 [${name}] Parser produces valid edges array`);
    assert(typeof ast.nodeCount === "number" && ast.nodeCount === ast.nodes.length, `S1.4 [${name}] nodeCount matches nodes.length`);
    assert(typeof ast.connectionCount === "number" && ast.connectionCount === ast.edges.length, `S1.5 [${name}] connectionCount matches edges.length`);

    // Run Sync Analysis
    const syncReport = runAnalysisSync(ast);
    assert(syncReport !== null && syncReport !== undefined, `S1.6 [${name}] runAnalysisSync succeeds`);
    assertRange(syncReport.fqiScore, 0, 100, `S1.7 [${name}] Sync FQI score is in [0, 100] (got ${syncReport.fqiScore})`);

    // Run Async Full Analysis
    const asyncReport = await runAnalysis(ast);
    assert(asyncReport !== null && asyncReport !== undefined, `S1.8 [${name}] runAnalysis succeeds`);
    assertEq(asyncReport.fqiScore, syncReport.fqiScore, `S1.9 [${name}] Async FQI matches Sync FQI`);
    assert(typeof asyncReport.fingerprint.hash === "string" && asyncReport.fingerprint.hash.length === 64, `S1.10 [${name}] SHA-256 fingerprint generated (64 hex chars)`);
    assert(asyncReport.passport !== null, `S1.11 [${name}] Workflow passport generated`);

    // CRITICAL EMPIRICAL CHECK: Check for RULE_CRASH findings
    const ruleCrashes = asyncReport.findings.filter((f) => f.id.startsWith("RULE_CRASH"));
    assertEq(ruleCrashes.length, 0, `S1.12 [${name}] ZERO rule crashes during execution (got ${ruleCrashes.length})`);
    if (ruleCrashes.length > 0) {
      console.error(`    Rule crash details:`, ruleCrashes.map((r) => r.evidence.detail));
    }

    // Verify Quality Gates evaluate cleanly
    assert(Array.isArray(asyncReport.qualityGates), `S1.12b [${name}] qualityGates is an array (len: ${asyncReport.qualityGates.length})`);
    assert(asyncReport.qualityGates.some((g) => g.gate === "SECURITY_GATE"), `S1.13 [${name}] SECURITY_GATE present`);
    assert(asyncReport.qualityGates.some((g) => g.gate === "RELIABILITY_GATE"), `S1.14 [${name}] RELIABILITY_GATE present`);
    assert(asyncReport.qualityGates.some((g) => g.gate === "MARKETPLACE_GATE"), `S1.15 [${name}] MARKETPLACE_GATE present`);
    assert(asyncReport.qualityGates.some((g) => g.gate === "PRODUCTION_GATE"), `S1.16 [${name}] PRODUCTION_GATE present`);
    assert(asyncReport.qualityGates.some((g) => g.gate === "ENTERPRISE_GATE"), `S1.17 [${name}] ENTERPRISE_GATE present`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 2: Determinism, State Isolation & Repeatability
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── SUITE 2: Determinism & Execution State Isolation ────────────────────────");

  for (const { name, gen } of platforms) {
    const raw = gen();
    const ast = parseWorkflow(raw);

    const report1 = await runAnalysis(ast);
    const report2 = await runAnalysis(ast);
    const report3 = await runAnalysis(ast);

    assertEq(report1.fqiScore, report2.fqiScore, `S2.1 [${name}] FQI score deterministic run 1 vs 2 (${report1.fqiScore})`);
    assertEq(report2.fqiScore, report3.fqiScore, `S2.2 [${name}] FQI score deterministic run 2 vs 3 (${report2.fqiScore})`);
    assertEq(report1.fingerprint.hash, report2.fingerprint.hash, `S2.3 [${name}] Fingerprint deterministic across runs`);
    assertEq(report1.findings.length, report2.findings.length, `S2.4 [${name}] Findings count deterministic (${report1.findings.length})`);

    const scoreKeys = Object.keys(report1.categoryScores);
    let allCatEqual = true;
    for (const k of scoreKeys) {
      if (report1.categoryScores[k as any]?.score !== report2.categoryScores[k as any]?.score) {
        allCatEqual = false;
        break;
      }
    }
    assert(allCatEqual, `S2.5 [${name}] All 10 category scores identical across runs`);

    const gates1 = JSON.stringify(report1.qualityGates);
    const gates2 = JSON.stringify(report2.qualityGates);
    assertEq(gates1, gates2, `S2.6 [${name}] All quality gate results identical across runs`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 3: Adversarial Edge Cases (Cycles, Self-Loops, Empty, Injections)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── SUITE 3: Adversarial Edge Cases & Malformed Inputs ──────────────────────");

  // 3.1 Cycles & Self-Loops
  const cyclicLangflow = AdversarialFixtureGenerator.generateLangflow(8, true);
  const cyclicDify = AdversarialFixtureGenerator.generateDify(8, true);

  const lfCyclicAst = parseWorkflow(cyclicLangflow);
  const lfCyclicReport = await runAnalysis(lfCyclicAst);
  assert(lfCyclicReport.findings.length > 0, `S3.1 Langflow cycle handled gracefully without infinite loop`);
  const lfCycleCrashes = lfCyclicReport.findings.filter((f) => f.id.startsWith("RULE_CRASH"));
  assertEq(lfCycleCrashes.length, 0, `S3.2 Langflow cyclic graph produces 0 rule crashes`);

  const difyCyclicAst = parseWorkflow(cyclicDify);
  const difyCyclicReport = await runAnalysis(difyCyclicAst);
  assert(difyCyclicReport.findings.length > 0, `S3.3 Dify cycle handled gracefully without infinite loop`);
  const difyCycleCrashes = difyCyclicReport.findings.filter((f) => f.id.startsWith("RULE_CRASH"));
  assertEq(difyCycleCrashes.length, 0, `S3.4 Dify cyclic graph produces 0 rule crashes`);

  // 3.2 Massive String Payloads (100KB prompt, 50KB code)
  const massiveLangflow = AdversarialFixtureGenerator.generateLangflow(6, false, 10000);
  const lfMassiveAst = parseWorkflow(massiveLangflow);
  const lfMassiveReport = await runAnalysis(lfMassiveAst);
  assertRange(lfMassiveReport.fqiScore, 0, 100, `S3.5 Langflow with massive 100KB prompt payload computes FQI (${lfMassiveReport.fqiScore})`);
  const lfMassiveCrashes = lfMassiveReport.findings.filter((f) => f.id.startsWith("RULE_CRASH"));
  assertEq(lfMassiveCrashes.length, 0, `S3.6 Massive prompt payload produces 0 rule crashes`);

  // 3.3 Injection Payloads & Unicode in Names / Roles / Prompts
  const injectionCrew = {
    crew: {
      name: "Crew <script>alert(1)</script> ; DROP TABLE workflows; --",
      process: "sequential",
      agents: [
        {
          name: "Agent \u0000\u001F <svg onload=alert(1)>",
          role: "SQL Injection ' OR '1'='1",
          goal: "{{$json.userInput}} \${process.env.SECRET}",
          tools: [{ name: "Tool & Special Chars: <>\"'/" }],
        },
      ],
      tasks: [
        {
          name: "Task ` rm -rf / `",
          description: "Dangerous command test with eval() and exec()",
          agent: "Agent \u0000\u001F <svg onload=alert(1)>",
        },
      ],
    },
  };
  const injectionCrewAst = parseWorkflow(injectionCrew);
  const injectionCrewReport = await runAnalysis(injectionCrewAst);
  assertRange(injectionCrewReport.fqiScore, 0, 100, `S3.7 Injection payloads parsed and scored safely (FQI: ${injectionCrewReport.fqiScore})`);
  const injectionCrewCrashes = injectionCrewReport.findings.filter((f) => f.id.startsWith("RULE_CRASH"));
  assertEq(injectionCrewCrashes.length, 0, `S3.8 Injection payloads produce 0 rule crashes`);

  // 3.4 Disconnected & Sparse Graphs
  const sparseAutogen = {
    name: "Sparse AutoGen",
    agents: [
      { name: "Isolated_1", type: "AssistantAgent" },
      { name: "Isolated_2", type: "UserProxyAgent" },
      { name: "Isolated_3", type: "AssistantAgent" },
    ],
  };
  const sparseAutogenAst = parseWorkflow(sparseAutogen);
  const sparseAutogenReport = await runAnalysis(sparseAutogenAst);
  assertRange(sparseAutogenReport.fqiScore, 0, 100, `S3.9 Disconnected AutoGen agents scored safely (FQI: ${sparseAutogenReport.fqiScore})`);
  const sparseAutogenCrashes = sparseAutogenReport.findings.filter((f) => f.id.startsWith("RULE_CRASH"));
  assertEq(sparseAutogenCrashes.length, 0, `S3.10 Disconnected AutoGen produces 0 rule crashes`);

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 4: Scalability & Performance Stress Testing (100+, 250+, 500+ Nodes)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── SUITE 4: Scalability & Performance Stress Testing (100+ & 500+ Nodes) ───");

  const scaleBenchmarks = [
    { name: "LANGFLOW", nodeCount: 100, gen: (n: number) => AdversarialFixtureGenerator.generateLangflow(n) },
    { name: "LANGFLOW", nodeCount: 500, gen: (n: number) => AdversarialFixtureGenerator.generateLangflow(n) },
    { name: "DIFY", nodeCount: 100, gen: (n: number) => AdversarialFixtureGenerator.generateDify(n) },
    { name: "DIFY", nodeCount: 500, gen: (n: number) => AdversarialFixtureGenerator.generateDify(n) },
    { name: "CREWAI", nodeCount: 100, gen: (n: number) => AdversarialFixtureGenerator.generateCrewAi(n / 2, true) }, // 50 agents + 50 tasks = 100 nodes
    { name: "CREWAI", nodeCount: 500, gen: (n: number) => AdversarialFixtureGenerator.generateCrewAi(n / 2, true) }, // 250 agents + 250 tasks = 500 nodes
    { name: "AUTOGEN", nodeCount: 100, gen: (n: number) => AdversarialFixtureGenerator.generateAutoGen(n, true) },
    { name: "AUTOGEN", nodeCount: 500, gen: (n: number) => AdversarialFixtureGenerator.generateAutoGen(n, true) },
    { name: "PIPEDREAM", nodeCount: 100, gen: (n: number) => AdversarialFixtureGenerator.generatePipedream(n) },
    { name: "PIPEDREAM", nodeCount: 500, gen: (n: number) => AdversarialFixtureGenerator.generatePipedream(n) },
    { name: "OPENAI_AGENTS", nodeCount: 100, gen: (n: number) => AdversarialFixtureGenerator.generateOpenAiAgents(n, true) },
    { name: "OPENAI_AGENTS", nodeCount: 500, gen: (n: number) => AdversarialFixtureGenerator.generateOpenAiAgents(n, true) },
  ];

  for (const bench of scaleBenchmarks) {
    const raw = bench.gen(bench.nodeCount);

    const memBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const ast = parseWorkflow(raw);
    const tParse = performance.now() - t0;

    assert(ast.nodes.length >= bench.nodeCount, `S4.1 [${bench.name} ${bench.nodeCount}-node] AST has >= ${bench.nodeCount} nodes (got ${ast.nodes.length})`);
    assert(tParse < 500, `S4.2 [${bench.name} ${bench.nodeCount}-node] Parse time < 500ms (took ${tParse.toFixed(2)}ms)`);

    const tEngine0 = performance.now();
    const report = await runAnalysis(ast);
    const tEngine = performance.now() - tEngine0;
    const memAfter = process.memoryUsage().heapUsed;
    const heapDeltaMb = ((memAfter - memBefore) / 1024 / 1024).toFixed(2);

    assertRange(report.fqiScore, 0, 100, `S4.3 [${bench.name} ${bench.nodeCount}-node] FQI in [0, 100] (got ${report.fqiScore})`);
    assert(tEngine < 2000, `S4.4 [${bench.name} ${bench.nodeCount}-node] Analysis time < 2000ms (took ${tEngine.toFixed(2)}ms)`);
    assert(report.findings.length >= 0, `S4.5 [${bench.name} ${bench.nodeCount}-node] Findings generated cleanly (count: ${report.findings.length})`);

    const scaleRuleCrashes = report.findings.filter((f) => f.id.startsWith("RULE_CRASH"));
    assertEq(scaleRuleCrashes.length, 0, `S4.6 [${bench.name} ${bench.nodeCount}-node] ZERO rule crashes during scale run`);

    console.log(`    ⚡ Benchmark [${bench.name} ${bench.nodeCount} nodes]: parse=${tParse.toFixed(2)}ms | engine=${tEngine.toFixed(2)}ms | findings=${report.findings.length} | heapDelta=${heapDeltaMb}MB | FQI=${report.fqiScore}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 5: Minimal & Empty Graph Payloads (All 6 Platforms)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── SUITE 5: Minimal & Empty Graph Payloads ─────────────────────────────────");

  const emptyFixtures = [
    { name: "LANGFLOW", raw: { platform: "LANGFLOW", id: "empty_lf", name: "Empty LF", data: { nodes: [], edges: [] } } },
    { name: "DIFY", raw: { app: { name: "Empty Dify", mode: "workflow" }, workflow: { graph: { nodes: [], edges: [] } } } },
    { name: "CREWAI", raw: { crew: { name: "Empty Crew", agents: [], tasks: [] } } },
    { name: "AUTOGEN", raw: { name: "Empty AutoGen", groupchat: { max_round: 10 }, agents: [] } },
    { name: "PIPEDREAM", raw: { platform: "PIPEDREAM", name: "Empty Pipedream", steps: [] } },
    { name: "OPENAI_AGENTS", raw: { starting_agent: "agent_0", name: "Empty Swarm", agents: [] } },
  ];

  for (const { name, raw } of emptyFixtures) {
    try {
      const ast = parseWorkflow(raw);
      assertEq(ast.nodes.length, 0, `S5.1 [${name}] Empty workflow parses to 0 nodes`);
      assertEq(ast.edges.length, 0, `S5.2 [${name}] Empty workflow parses to 0 edges`);

      const report = await runAnalysis(ast);
      assertRange(report.fqiScore, 90, 100, `S5.3 [${name}] Empty workflow FQI in [90, 100] (got ${report.fqiScore})`);
      assert(report.findings.filter((f) => f.id.startsWith("RULE_CRASH")).length === 0, `S5.4 [${name}] Empty workflow produces 0 rule crashes`);
      assert(report.fingerprint.hash.length === 64, `S5.5 [${name}] Empty workflow produces valid SHA-256 fingerprint`);
    } catch (err: any) {
      assert(false, `S5.x [${name}] Empty workflow threw: ${err.message}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 6: Null & Undefined Properties inside Nodes
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── SUITE 6: Null & Undefined Properties Robustness ─────────────────────────");

  const dirtyLangflow = {
    platform: "LANGFLOW",
    data: {
      nodes: [
        { id: "lf_dirty_1", type: null, data: null },
        { id: "lf_dirty_2", type: "genericNode", data: { type: "ChatOpenAI", node: { template: null } } },
        { id: "lf_dirty_3", data: { node: { template: { field1: { value: null, type: null } } } } },
      ],
      edges: [
        { id: "e1", source: "lf_dirty_1", target: "lf_dirty_2" },
        { id: "e2", source: "lf_dirty_2", target: "non_existent_node" },
      ],
    },
  };
  const dirtyLfAst = parseWorkflow(dirtyLangflow);
  const dirtyLfReport = await runAnalysis(dirtyLfAst);
  assert(dirtyLfReport.findings.filter((f) => f.id.startsWith("RULE_CRASH")).length === 0, `S6.1 Dirty LangFlow parses and analyzes with 0 rule crashes`);

  const dirtyDify = {
    platform: "DIFY",
    app: { mode: "workflow" },
    workflow: {
      graph: {
        nodes: [
          { id: "d1", type: "llm", data: null },
          { id: "d2", type: "code", data: { code: null, code_language: null } },
          { id: "d3", type: "http-request", data: { url: null, method: null, authorization: null } },
        ],
        edges: [{ source: null, target: null }],
      },
    },
  };
  const dirtyDifyAst = parseWorkflow(dirtyDify);
  const dirtyDifyReport = await runAnalysis(dirtyDifyAst);
  assert(dirtyDifyReport.findings.filter((f) => f.id.startsWith("RULE_CRASH")).length === 0, `S6.2 Dirty Dify parses and analyzes with 0 rule crashes`);

  const dirtyCrew = {
    platform: "CREWAI",
    crew: {
      agents: [
        { name: null, role: null, goal: null, tools: null, llm: null },
        { name: "AgentWithNullTask", role: "Specialist", goal: "Test" },
      ],
      tasks: [
        { name: null, description: null, agent: "NonExistentAgent", tools: null },
        { name: "TaskWithNullDesc", agent: "AgentWithNullTask" },
      ],
    },
  };
  const dirtyCrewAst = parseWorkflow(dirtyCrew);
  const dirtyCrewReport = await runAnalysis(dirtyCrewAst);
  assert(dirtyCrewReport.findings.filter((f) => f.id.startsWith("RULE_CRASH")).length === 0, `S6.3 Dirty CrewAI parses and analyzes with 0 rule crashes`);

  const dirtyAutoGen = {
    platform: "AUTOGEN",
    agents: [
      { name: null, type: null, llm_config: null, code_execution_config: null },
      { name: "Agent2", llm_config: { config_list: null } },
      { name: "Agent3", llm_config: { config_list: [{ model: null, api_key: null }] } },
    ],
    groupchat: { messages: null, admin_name: null },
  };
  const dirtyAutoGenAst = parseWorkflow(dirtyAutoGen);
  const dirtyAutoGenReport = await runAnalysis(dirtyAutoGenAst);
  assert(dirtyAutoGenReport.findings.filter((f) => f.id.startsWith("RULE_CRASH")).length === 0, `S6.4 Dirty AutoGen parses and analyzes with 0 rule crashes`);

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 7: Deep Linear Chain (1,000 Nodes) Call Stack & Graph Traversal Limit
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── SUITE 7: Deep Linear Chain (1,000 Nodes) Traversal & Recursion ──────────");

  const deepChain = AdversarialFixtureGenerator.generateLangflow(1000);
  const deepAst = parseWorkflow(deepChain);
  const tDeep0 = performance.now();
  const deepReport = await runAnalysis(deepAst);
  const tDeep = performance.now() - tDeep0;

  assertEq(deepAst.nodes.length, 1000, `S7.1 1,000-node graph parsed correctly`);
  assert(tDeep < 3000, `S7.2 1,000-node graph analyzed without stack overflow in < 3000ms (took ${tDeep.toFixed(2)}ms)`);
  assert(deepReport.findings.filter((f) => f.id.startsWith("RULE_CRASH")).length === 0, `S7.3 1,000-node graph produces 0 rule crashes`);
  assertRange(deepReport.fqiScore, 0, 100, `S7.4 1,000-node graph computes valid FQI (${deepReport.fqiScore})`);

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 8: Secret Penetration & Downstream Security Gate Enforcement
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── SUITE 8: Secret Penetration & Security Gate Block Enforcement ───────────");

  const secretFixtures = [
    {
      name: "LANGFLOW",
      raw: {
        platform: "LANGFLOW",
        data: {
          nodes: [
            {
              id: "sec_lf",
              type: "genericNode",
              data: {
                type: "ChatOpenAI",
                node: {
                  template: {
                    openai_api_key: { value: "sk-1234567890abcdefghijklmnopqrstuvwxyz1234" },
                  },
                },
              },
            },
          ],
          edges: [],
        },
      },
    },
    {
      name: "DIFY",
      raw: {
        app: { mode: "workflow" },
        workflow: {
          environment_variables: [{ name: "DB_PASS", value: "password=SuperSecretPassword123" }],
          graph: {
            nodes: [
              {
                id: "sec_dify",
                type: "http-request",
                data: {
                  url: "https://api.internal.org",
                  authorization: { config: { api_key: "pd_live_difysecretkey1234567890" } },
                },
              },
            ],
            edges: [],
          },
        },
      },
    },
    {
      name: "AUTOGEN",
      raw: {
        agents: [
          {
            name: "SecretAgent",
            type: "AssistantAgent",
            llm_config: {
              config_list: [{ model: "gpt-4o", api_key: "sk-autogensecretkey1234567890123456" }],
            },
          },
        ],
      },
    },
    {
      name: "PIPEDREAM",
      raw: {
        steps: [
          {
            id: "sec_pd",
            type: "action",
            configured_props: {
              token: "token=ghp_123456789012345678901234567890123456",
            },
          },
        ],
      },
    },
  ];

  for (const { name, raw } of secretFixtures) {
    const ast = parseWorkflow(raw);
    assert(ast.extractedSecretsCount > 0, `S8.1 [${name}] Parser extracted embedded secrets (count: ${ast.extractedSecretsCount})`);

    const report = await runAnalysis(ast);
    const secFindings = report.findings.filter((f) => f.ruleId === "SEC-001" || f.category === "SECURITY");
    assert(secFindings.length > 0, `S8.2 [${name}] Downstream Security rule pack flagged exposed secrets (count: ${secFindings.length})`);

    const secGate = report.qualityGates.find((g) => g.gate === "SECURITY_GATE");
    assert(secGate !== undefined, `S8.3 [${name}] Security gate evaluated`);
    // CRITICAL secret should fail security or marketplace gate
    assert(secGate?.passed === false || report.qualityGates.find((g) => g.gate === "MARKETPLACE_GATE")?.passed === false, `S8.4 [${name}] Exposed secret fails Security or Marketplace gate`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log(`  CHALLENGER 2 SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("═══════════════════════════════════════════════════════════════════════════\n");

  if (failedCount > 0) {
    console.error("Failures list:");
    failures.forEach((f) => console.error(f));
    process.exit(1);
  } else {
    console.log("🏆 ALL ADVERSARIAL CHALLENGES AND DOWNSTREAM STRESS TESTS PASSED 100%!");
  }
}

runChallengerSuite().catch((err) => {
  console.error("Fatal unhandled exception in challenger suite:", err);
  process.exit(1);
});
