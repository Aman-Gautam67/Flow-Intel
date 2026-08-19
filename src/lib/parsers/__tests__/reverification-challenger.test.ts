// @ts-expect-error Bun test type definitions
import { describe, it, expect } from "bun:test";
import {
  parseWorkflow,
  detectPlatform,
  LangflowParser,
  DifyParser,
  CrewAiParser,
  AutoGenParser,
  PipedreamParser,
  OpenAiAgentsParser,
  N8nParser,
  MakeParser,
  ZapierParser,
  FlowiseParser,
  NodeRedParser,
  ActivepiecesParser,
  AirflowParser,
  PrefectParser,
  GenericParser,
} from "../index";
import { runAnalysis, runAnalysisSync } from "@/lib/engine/analysis-runner";
import type { ParsedWorkflow, Platform } from "@/types";

describe("Challenger Remediation Iteration 2 Re-Verification Suite", () => {
  const parsers = [
    { name: "LANGFLOW", parser: new LangflowParser() },
    { name: "DIFY", parser: new DifyParser() },
    { name: "CREWAI", parser: new CrewAiParser() },
    { name: "AUTOGEN", parser: new AutoGenParser() },
    { name: "PIPEDREAM", parser: new PipedreamParser() },
    { name: "OPENAI_AGENTS", parser: new OpenAiAgentsParser() },
    { name: "N8N", parser: new N8nParser() },
    { name: "MAKE", parser: new MakeParser() },
    { name: "ZAPIER", parser: new ZapierParser() },
    { name: "FLOWISE", parser: new FlowiseParser() },
    { name: "NODE_RED", parser: new NodeRedParser() },
    { name: "ACTIVEPIECES", parser: new ActivepiecesParser() },
    { name: "AIRFLOW", parser: new AirflowParser() },
    { name: "PREFECT", parser: new PrefectParser() },
    { name: "GENERIC", parser: new GenericParser() },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. RE-VERIFY ITERATION 1 CRASH DEFECTS (Null / Undefined Array Elements)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("1. Re-Verification of Iteration 1 Null/Corrupted Array Defect", () => {
    it("FlowiseParser.supports must return boolean and not throw when nodes contain null or non-objects", () => {
      const flowise = new FlowiseParser();
      expect(flowise.supports({ nodes: [null] })).toBe(false);
      expect(flowise.supports({ nodes: [undefined] })).toBe(false);
      expect(flowise.supports({ nodes: [null, { data: null }] })).toBe(false);
      expect(flowise.supports({ nodes: [null, { data: { category: "Agents" } }] })).toBe(true);
      expect(flowise.supports({ nodes: [123, "invalid", null, {}] })).toBe(false);
      expect(flowise.supports({ nodes: null })).toBe(false);
    });

    it("All 15 parsers must handle null/corrupted elements inside their target envelopes in supports()", () => {
      const corruptPayloads = [
        { nodes: [null, undefined, 42, "bad", {}, { id: null, data: null }] },
        { edges: [null, undefined, "bad", { source: null, target: undefined }] },
        { steps: [null, undefined, false, { name: null }] },
        { agents: [null, undefined, { role: null }] },
        { tasks: [null, undefined, { description: null }] },
        { tools: [null, undefined] },
        { triggers: [null, undefined] },
        { flow: [null, undefined, { id: null }] },
        { data: { nodes: [null, undefined, { data: null }], edges: [null] } },
        { trigger: null },
        { trigger: { type: null, nextAction: null } },
        { tasks: [null, { id: null, depends_on: [null, undefined] }] },
      ];

      for (const { name, parser } of parsers) {
        for (const payload of corruptPayloads) {
          expect(() => {
            const res = parser.supports(payload);
            expect(typeof res).toBe("boolean");
          }).not.toThrow();
        }
      }
    });

    it("All 15 parsers must handle null/corrupted array elements in parse() without throwing", () => {
      const corruptPayloads = [
        { nodes: [null, undefined, 42, "bad", {}, { id: "node1", name: null, data: null }] },
        { edges: [null, undefined, "bad", { source: "node1", target: "node2" }] },
        { steps: [null, undefined, false, { name: "step1", type: "code" }] },
        { agents: [null, undefined, { role: "Researcher", goal: null, tools: [null] }] },
        { tasks: [null, undefined, { description: "Analyze", agent: null, tools: [null] }] },
        { flow: [null, undefined, { id: 1, module: "http:ActionSendRequest" }] },
        { data: { nodes: [null, { id: "n1", data: { type: "ChatOpenAI", node: { template: null } } }], edges: [null] } },
        { trigger: { type: "WEBHOOK", nextAction: null } },
      ];

      for (const { name, parser } of parsers) {
        for (const payload of corruptPayloads) {
          expect(() => {
            const ast = parser.parse(payload);
            expect(Array.isArray(ast.nodes)).toBe(true);
            expect(Array.isArray(ast.edges)).toBe(true);
            expect(typeof ast.nodeCount).toBe("number");
            expect(typeof ast.connectionCount).toBe("number");
            expect(typeof ast.platform).toBe("string");
          }).not.toThrow();
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. RE-VERIFY GENERIC PARSER DAG ORIENTATION & FALSE CYCLE ELIMINATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("2. GenericParser DAG Dependency Orientation and Cycle Prevention", () => {
    const generic = new GenericParser();

    it("correctly models upstream dependencies as source = dependency, target = dependent", () => {
      const dagWorkflow = {
        name: "Build Pipeline",
        tasks: [
          { id: "build", name: "Build App" },
          { id: "test", name: "Run Tests", depends_on: ["build"] },
          { id: "deploy", name: "Deploy Prod", depends_on: ["test"] },
        ],
      };

      const ast = generic.parse(dagWorkflow);
      expect(ast.nodeCount).toBe(3);
      expect(ast.connectionCount).toBe(2);

      // Verify exact edges: build -> test, test -> deploy
      const edge1 = ast.edges.find((e) => e.source === "build" && e.target === "test");
      const edge2 = ast.edges.find((e) => e.source === "test" && e.target === "deploy");
      expect(edge1).toBeDefined();
      expect(edge2).toBeDefined();

      // Ensure reverse edges are NOT created
      const reverse1 = ast.edges.find((e) => e.source === "test" && e.target === "build");
      const reverse2 = ast.edges.find((e) => e.source === "deploy" && e.target === "test");
      expect(reverse1).toBeUndefined();
      expect(reverse2).toBeUndefined();
    });

    it("correctly models various dependency alias keywords (upstream, upstream_task_ids, after, requires)", () => {
      const aliasWorkflow = {
        name: "DAG with various aliases",
        nodes: [
          { id: "taskA" },
          { id: "taskB", upstream: ["taskA"] },
          { id: "taskC", upstream_task_ids: ["taskA"] },
          { id: "taskD", after: ["taskB", "taskC"] },
          { id: "taskE", requires: ["taskD"] },
        ],
      };

      const ast = generic.parse(aliasWorkflow);
      expect(ast.nodeCount).toBe(5);
      expect(ast.connectionCount).toBe(5);

      expect(ast.edges.some((e) => e.source === "taskA" && e.target === "taskB")).toBe(true);
      expect(ast.edges.some((e) => e.source === "taskA" && e.target === "taskC")).toBe(true);
      expect(ast.edges.some((e) => e.source === "taskB" && e.target === "taskD")).toBe(true);
      expect(ast.edges.some((e) => e.source === "taskC" && e.target === "taskD")).toBe(true);
      expect(ast.edges.some((e) => e.source === "taskD" && e.target === "taskE")).toBe(true);
    });

    it("correctly models downstream dependency keywords (downstream_task_ids, next)", () => {
      const downstreamWorkflow = {
        steps: [
          { id: "step1", next: ["step2", "step3"] },
          { id: "step2", downstream_task_ids: ["step4"] },
          { id: "step3", next: ["step4"] },
          { id: "step4" },
        ],
      };

      const ast = generic.parse(downstreamWorkflow);
      expect(ast.nodeCount).toBe(4);
      expect(ast.connectionCount).toBe(4);

      expect(ast.edges.some((e) => e.source === "step1" && e.target === "step2")).toBe(true);
      expect(ast.edges.some((e) => e.source === "step1" && e.target === "step3")).toBe(true);
      expect(ast.edges.some((e) => e.source === "step2" && e.target === "step4")).toBe(true);
      expect(ast.edges.some((e) => e.source === "step3" && e.target === "step4")).toBe(true);
    });

    it("applies linear chaining ONLY when no explicit dependencies are defined", () => {
      const linearWorkflow = {
        pipeline: [
          { id: "p1" },
          { id: "p2" },
          { id: "p3" },
        ],
      };

      const ast = generic.parse(linearWorkflow);
      expect(ast.nodeCount).toBe(3);
      expect(ast.connectionCount).toBe(2);
      expect(ast.edges.some((e) => e.source === "p1" && e.target === "p2")).toBe(true);
      expect(ast.edges.some((e) => e.source === "p2" && e.target === "p3")).toBe(true);
    });

    it("does not create spurious cycles or duplicate edges in downstream engine analysis", () => {
      const dagWorkflow = {
        name: "Clean Acyclic DAG",
        nodes: [
          { id: "extract", type: "http", url: "https://api.example.com/data" },
          { id: "transform", type: "code", depends_on: ["extract"] },
          { id: "load", type: "http", depends_on: ["transform"], url: "https://db.example.com/load" },
        ],
      };

      const ast = generic.parse(dagWorkflow);
      const report = runAnalysisSync(ast);
      expect(report.fqiScore).toBeGreaterThanOrEqual(50);

      // Verify no cycle or recursion findings were falsely triggered
      const cycleFindings = report.findings.filter((f) => f.ruleId === "REL-011" || f.ruleId === "PER-026");
      expect(cycleFindings.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. RE-VERIFY ACTIVEPIECES DETECTION AND BRANCH / LOOP HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  describe("3. ActivepiecesParser Schema Variations and Resilience", () => {
    const activepieces = new ActivepiecesParser();

    it("detects Activepieces workflow without requiring trigger.name", () => {
      const payload1 = {
        displayName: "Webhook Flow",
        trigger: {
          type: "WEBHOOK_TRIGGER",
          nextAction: {
            name: "send_http",
            type: "PIECE",
            settings: { pieceName: "@activepieces/piece-http", actionName: "send_request" },
          },
        },
      };

      expect(activepieces.supports(payload1)).toBe(true);
      expect(detectPlatform(payload1)).toBe("ACTIVEPIECES");

      const ast = activepieces.parse(payload1);
      expect(ast.nodeCount).toBe(2);
      expect(ast.connectionCount).toBe(1);
      expect(ast.hasWebhooks).toBe(true);
      expect(ast.httpNodesCount).toBe(1);
    });

    it("safely handles branches and loops with null or non-object actions", () => {
      const branchedPayload = {
        trigger: {
          name: "trig",
          type: "PIECE_TRIGGER",
          nextAction: {
            name: "branch1",
            type: "BRANCH",
            onSuccessAction: null,
            onFailureAction: undefined,
          },
        },
      };

      expect(() => {
        const ast = activepieces.parse(branchedPayload);
        expect(ast.nodeCount).toBe(2);
        expect(ast.connectionCount).toBe(1);
      }).not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. PATHOLOGICAL ENVELOPE STRESS (Deep recursion, extreme sizes, garbage)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("4. Pathological and Hostile Environment Testing", () => {
    it("survives 1,000-node disconnected graphs across all 6 new parsers", () => {
      const count = 1000;

      // Langflow
      const lfData = {
        data: {
          nodes: Array.from({ length: count }, (_, i) => ({
            id: `lf_${i}`,
            data: { type: "PromptTemplate", node: { template: `Hello ${i}` } },
          })),
          edges: [],
        },
      };
      const lfAst = parseWorkflow(lfData);
      expect(lfAst.nodeCount).toBe(count);

      // Dify
      const difyData = {
        app: { mode: "workflow" },
        workflow: {
          nodes: Array.from({ length: count }, (_, i) => ({
            id: `df_${i}`,
            data: { type: "code", title: `Code ${i}`, code: "return {};" },
          })),
          edges: [],
        },
      };
      const difyAst = parseWorkflow(difyData);
      expect(difyAst.nodeCount).toBe(count);

      // CrewAI
      const crewData = {
        crew: {
          agents: Array.from({ length: count }, (_, i) => ({
            role: `Agent ${i}`,
            goal: `Goal ${i}`,
          })),
          tasks: [],
        },
      };
      const crewAst = parseWorkflow(crewData);
      expect(crewAst.nodeCount).toBe(count);

      // AutoGen
      const autogenData = {
        autogen_version: "0.2",
        agents: Array.from({ length: count }, (_, i) => ({
          name: `Assistant_${i}`,
          type: "AssistantAgent",
        })),
      };
      const autogenAst = parseWorkflow(autogenData);
      expect(autogenAst.nodeCount).toBe(count);

      // Pipedream
      const pipedreamData = {
        steps: Array.from({ length: count }, (_, i) => ({
          name: `step_${i}`,
          type: "nodejs",
        })),
      };
      const pipedreamAst = parseWorkflow(pipedreamData);
      expect(pipedreamAst.nodeCount).toBe(count);

      // OpenAI Agents
      const openaiData = {
        agents: Array.from({ length: count }, (_, i) => ({
          name: `Agent_${i}`,
          instructions: `Instruct ${i}`,
        })),
      };
      const openaiAst = parseWorkflow(openaiData);
      expect(openaiAst.nodeCount).toBe(count);
    });

    it("survives deeply recursive circular references without stack overflow", () => {
      const circular: Record<string, unknown> = {
        name: "Circular",
        platform: "GENERIC",
        nodes: [{ id: "n1", name: "Node 1" }],
      };
      circular.self = circular;
      (circular.nodes as any[])[0].parent = circular;

      expect(() => {
        const platform = detectPlatform(circular);
        expect(typeof platform).toBe("string");
      }).not.toThrow();
    });

    it("survives extreme Unicode, control characters, XSS, and SQL injection strings", () => {
      const maliciousPayload = {
        data: {
          nodes: [
            {
              id: "xss_<script>alert(1)</script>",
              data: {
                type: "ChatOpenAI",
                node: {
                  template: "SELECT * FROM users WHERE id = '" + "1' OR '1'='1" + "'; -- \u0000\uFFFF\uD83D\uDE00",
                  api_key: "sk-ant-api03-" + "A".repeat(80),
                },
              },
            },
          ],
          edges: [],
        },
      };

      const ast = parseWorkflow(maliciousPayload);
      expect(ast.nodeCount).toBe(1);
      expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(1);

      const report = runAnalysisSync(ast);
      expect(report.fqiScore).toBeGreaterThanOrEqual(0);
      expect(report.fqiScore).toBeLessThanOrEqual(100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. SECRET DETECTOR COMPREHENSIVENESS ACROSS ALL PLATFORMS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("5. Secret Extraction Across All Extended Platforms", () => {
    it("extracts secrets embedded across diverse configuration properties", () => {
      // 1. LangFlow
      const lf = parseWorkflow({
        data: {
          nodes: [
            {
              id: "n1",
              data: {
                node: {
                  template: {
                    api_key: { value: "ghp_abcdef1234567890abcdef1234567890abcdef" },
                  },
                },
              },
            },
          ],
        },
      });
      expect(lf.extractedSecretsCount).toBe(1);

      // 2. Dify
      const df = parseWorkflow({
        app: { mode: "workflow" },
        workflow: {
          nodes: [
            {
              id: "n1",
              data: {
                type: "http-request",
                headers: "Authorization: Bearer sk-1234567890abcdef1234567890abcdef",
              },
            },
          ],
        },
      });
      expect(df.extractedSecretsCount).toBeGreaterThanOrEqual(1);

      // 3. CrewAI
      const cr = parseWorkflow({
        crew: {
          agents: [
            {
              role: "Coder",
              llm: {
                api_key: "sk-ant-api03-abcdef1234567890abcdef1234567890abcdef",
              },
            },
          ],
        },
      });
      expect(cr.extractedSecretsCount).toBe(1);

      // 4. AutoGen
      const ag = parseWorkflow({
        autogen_version: "0.2",
        agents: [
          {
            name: "Assistant",
            llm_config: {
              config_list: [{ api_key: "sk-proj-abcdef1234567890abcdef1234567890abcdef" }],
            },
          },
        ],
      });
      expect(ag.extractedSecretsCount).toBeGreaterThanOrEqual(1);

      // 5. Pipedream
      const pd = parseWorkflow({
        steps: [
          {
            name: "send_slack",
            type: "action",
            configured_props: {
              slack_token: "xoxb-1234567890-1234567890-abcdef123456",
            },
          },
        ],
      });
      expect(pd.extractedSecretsCount).toBe(1);

      // 6. OpenAI Agents
      const oa = parseWorkflow({
        agents: [
          {
            name: "Agent",
            instructions: "Use key ak-abcdef1234567890abcdef1234567890",
            tools: [
              {
                name: "call_external",
                parameters: { api_token: "ghp_123456789012345678901234567890123456" },
              },
            ],
          },
        ],
      });
      expect(oa.extractedSecretsCount).toBeGreaterThanOrEqual(1);
    });
  });
});
