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
} from "../index";
import { runAnalysis, runAnalysisSync } from "@/lib/engine/analysis-runner";
import type { WorkflowPlatform } from "@/types";

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM 1: LANGFLOW TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe("LangFlow Parser", () => {
  const langflowParser = new LangflowParser();

  const FIXTURE_LANGFLOW_RAG = {
    id: "e891b920-5d6b-4e6f-b2b7-1c62ff929001",
    name: "RAG Document QA & Processing",
    description: "Retrieval Augmented Generation with Chroma, OpenAI, and Python transform",
    data: {
      nodes: [
        {
          id: "ChatInput-7E8F9",
          type: "chatInput",
          position: { x: -80, y: 120 },
          data: {
            type: "ChatInput",
            node: {
              template: {
                input_value: { type: "str", value: "What is the Q3 revenue projection?" },
              },
              display_name: "User Input 💬",
            },
          },
        },
        {
          id: "PromptTemplate-4C5D6",
          type: "genericNode",
          position: { x: 180, y: 120 },
          data: {
            type: "PromptTemplate",
            node: {
              template: {
                template: {
                  type: "str",
                  value: "Answer the query: {question}\nContext: {context}",
                },
                format_instructions: { type: "str", value: "Output valid JSON" },
              },
              display_name: "Prompt Template",
            },
          },
        },
        {
          id: "ChatOpenAI-1A2B3",
          type: "genericNode",
          position: { x: 450, y: 120 },
          data: {
            type: "ChatOpenAI",
            node: {
              template: {
                model_name: { type: "str", value: "gpt-4o", show: true },
                temperature: { type: "float", value: 0.2, show: true },
                max_tokens: { type: "int", value: 2048, show: true },
                openai_api_key: {
                  type: "str",
                  value: "sk-proj-live-mock-key-12345678901234567890",
                  password: true,
                },
              },
              description: "OpenAI Chat Model component",
              display_name: "OpenAI Chat",
              documentation: "https://platform.openai.com/docs",
            },
          },
        },
        {
          id: "Chroma-9Z8Y7",
          type: "genericNode",
          position: { x: 180, y: 320 },
          data: {
            type: "Chroma",
            node: {
              template: {
                collection_name: { type: "str", value: "knowledge_base" },
              },
              display_name: "Chroma Vector DB",
            },
          },
        },
        {
          id: "PythonFunction-5B6A7",
          type: "genericNode",
          position: { x: 720, y: 120 },
          data: {
            type: "PythonFunctionComponent",
            node: {
              template: {
                code: {
                  type: "code",
                  value: "def transform(inputs):\n    return {'status': 'ok', 'data': inputs}",
                },
              },
              display_name: "Python Transform",
            },
          },
        },
        {
          id: "APIRequest-3C2D1",
          type: "genericNode",
          position: { x: 980, y: 120 },
          data: {
            type: "APIRequest",
            node: {
              template: {
                url: { type: "str", value: "https://api.example.com/v1/enrich" },
                method: { type: "str", value: "POST" },
                headers: {
                  type: "dict",
                  value: { "Content-Type": "application/json" },
                },
              },
              display_name: "API Dispatcher",
            },
          },
        },
        {
          id: "ConditionalRouter-0F9E8",
          type: "genericNode",
          position: { x: 450, y: 320 },
          data: {
            type: "ConditionalRouter",
            node: {
              template: {
                condition: { type: "str", value: "len(text) > 0" },
              },
              display_name: "Response Router",
            },
          },
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "ChatInput-7E8F9",
          target: "PromptTemplate-4C5D6",
          sourceHandle: "message",
          targetHandle: "question",
        },
        {
          id: "edge-2",
          source: "Chroma-9Z8Y7",
          target: "PromptTemplate-4C5D6",
          sourceHandle: "documents",
          targetHandle: "context",
        },
        {
          id: "edge-3",
          source: "PromptTemplate-4C5D6",
          target: "ChatOpenAI-1A2B3",
          sourceHandle: "prompt",
          targetHandle: "prompt",
        },
        {
          id: "edge-4",
          source: "ChatOpenAI-1A2B3",
          target: "ConditionalRouter-0F9E8",
          sourceHandle: "text",
          targetHandle: "input",
        },
        {
          id: "edge-5",
          source: "ConditionalRouter-0F9E8",
          target: "PythonFunction-5B6A7",
          sourceHandle: "true",
          targetHandle: "inputs",
        },
        {
          id: "edge-6",
          source: "PythonFunction-5B6A7",
          target: "APIRequest-3C2D1",
          sourceHandle: "result",
          targetHandle: "body",
        },
      ],
    },
  };

  it("should accurately detect LangFlow workflows", () => {
    expect(detectPlatform(FIXTURE_LANGFLOW_RAG)).toBe("LANGFLOW");
    expect(langflowParser.supports(FIXTURE_LANGFLOW_RAG)).toBe(true);
    expect(langflowParser.supports({ platform: "LANGFLOW" })).toBe(true);
    expect(langflowParser.supports({ nodes: [{ data: { node_type: "ChatOpenAI" } }] })).toBe(true);
  });

  it("should normalize LangFlow AST into canonical structure", () => {
    const ast = parseWorkflow(FIXTURE_LANGFLOW_RAG);

    expect(ast.platform).toBe("LANGFLOW");
    expect(ast.name).toBe("RAG Document QA & Processing");
    expect(ast.nodeCount).toBe(7);
    expect(ast.connectionCount).toBe(6);
    expect(ast.nodes.length).toBe(7);
    expect(ast.edges.length).toBe(6);

    // Node classifications
    expect(ast.aiNodesCount).toBeGreaterThanOrEqual(2); // PromptTemplate, ChatOpenAI
    expect(ast.codeNodesCount).toBe(1); // PythonFunction
    expect(ast.httpNodesCount).toBe(1); // APIRequest
    expect(ast.hasBranches).toBe(true); // ConditionalRouter
    expect(ast.triggerNodes.length).toBeGreaterThanOrEqual(1);
    expect(ast.triggerNodes.some((t) => t.id === "ChatInput-7E8F9")).toBe(true);

    // AI Meta inspection
    const llmNode = ast.nodes.find((n) => n.id === "ChatOpenAI-1A2B3");
    expect(llmNode).toBeDefined();
    expect(llmNode?.isAi).toBe(true);
    expect(llmNode?.aiMeta?.model).toBe("gpt-4o");
    expect(llmNode?.aiMeta?.maxIterations).toBe(2048);

    // Code Meta inspection
    const codeNode = ast.nodes.find((n) => n.id === "PythonFunction-5B6A7");
    expect(codeNode).toBeDefined();
    expect(codeNode?.isCode).toBe(true);
    expect(codeNode?.codeMeta?.language).toBe("python");
    expect(codeNode?.codeMeta?.codeSnippet).toContain("def transform");

    // HTTP Meta inspection
    const httpNode = ast.nodes.find((n) => n.id === "APIRequest-3C2D1");
    expect(httpNode).toBeDefined();
    expect(httpNode?.isHttp).toBe(true);
    expect(httpNode?.httpMeta?.url).toBe("https://api.example.com/v1/enrich");
    expect(httpNode?.httpMeta?.method).toBe("POST");

    // Router inspection
    const routerNode = ast.nodes.find((n) => n.id === "ConditionalRouter-0F9E8");
    expect(routerNode).toBeDefined();
    expect(routerNode?.isBranch).toBe(true);
  });

  it("should extract embedded secrets and credentials from template parameters", () => {
    const ast = parseWorkflow(FIXTURE_LANGFLOW_RAG);
    expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(1);

    const llmNode = ast.nodes.find((n) => n.id === "ChatOpenAI-1A2B3");
    expect(llmNode?.isAuthenticated).toBe(true);
    expect(llmNode?.credentials).toHaveProperty("openai_api_key");
  });

  it("should handle root-level format and JSON-stringified sourceHandles gracefully", () => {
    const rootFormat = {
      nodes: [
        {
          id: "node_1",
          type: "genericNode",
          data: {
            node_type: "CustomComponent",
            node: { template: { code: { value: "x = 1" } } },
          },
        },
        {
          id: "node_2",
          type: "genericNode",
          data: {
            node_type: "ChatOpenAI",
            node: { template: { model_name: { value: "claude-3" } } },
          },
        },
      ],
      edges: [
        {
          source: "node_1",
          target: "node_2",
          sourceHandle: JSON.stringify({ name: "out_port", id: "p1" }),
        },
      ],
    };

    expect(langflowParser.supports(rootFormat)).toBe(true);
    const ast = langflowParser.parse(rootFormat);
    expect(ast.nodeCount).toBe(2);
    expect(ast.edges[0]?.sourceHandle).toBe("out_port");
  });

  it("should handle partial or malformed nodes without throwing uncaught exceptions", () => {
    const malformed = {
      platform: "LANGFLOW",
      nodes: [
        { id: "orphan_1" },
        { id: "orphan_2", data: null },
        { id: "orphan_3", data: { node: null } },
      ],
      edges: [],
    };

    expect(() => langflowParser.parse(malformed)).not.toThrow();
    const ast = langflowParser.parse(malformed);
    expect(ast.nodeCount).toBe(3);
    expect(ast.edges.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM 2: DIFY TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Dify Parser", () => {
  const difyParser = new DifyParser();

  const FIXTURE_DIFY_WORKFLOW = {
    app: {
      name: "Customer Support Automation DSL",
      description: "Triage support tickets, classify sentiment, invoke tools, and execute iteration",
      mode: "workflow",
      icon: "🤖",
    },
    workflow: {
      version: "0.1.0",
      environment_variables: [
        {
          name: "SUPPORT_WEBHOOK_URL",
          value: "http://insecure-internal.api/support",
          value_type: "string",
        },
        {
          name: "EXTERNAL_API_KEY",
          value: "sk-proj-dify-live-mock-secret-9876543210123456",
          value_type: "secret",
        },
      ],
      graph: {
        nodes: [
          {
            id: "start-node",
            title: "Start Workflow",
            type: "start",
            data: {
              type: "start",
              title: "Start Workflow",
              variables: [
                { label: "query", variable: "query", type: "string", required: true },
              ],
            },
            position: { x: 100, y: 200 },
          },
          {
            id: "llm-classifier",
            title: "Classify Query",
            type: "llm",
            data: {
              type: "llm",
              title: "Classify Query",
              model: {
                provider: "openai",
                name: "gpt-4o",
                mode: "chat",
                completion_params: {
                  temperature: 0.1,
                  max_tokens: 512,
                },
              },
              prompt_template: [
                { role: "system", text: "Classify incoming ticket query: {{#start-node.query#}}" },
              ],
              memory: { window: { enabled: true, size: 10 } },
            },
            position: { x: 380, y: 200 },
          },
          {
            id: "branch-condition",
            title: "Route by Category",
            type: "if-else",
            data: {
              type: "if-else",
              conditions: [
                {
                  logical_operator: "and",
                  conditions: [
                    {
                      variable_selector: ["llm-classifier", "text"],
                      comparison_operator: "contains",
                      value: "urgent",
                    },
                  ],
                },
              ],
            },
            position: { x: 680, y: 200 },
          },
          {
            id: "http-dispatch",
            title: "Post to Webhook",
            type: "http-request",
            data: {
              type: "http-request",
              method: "post",
              url: "http://insecure-internal.api/support",
              authorization: {
                type: "api-key",
                config: { api_key: "Bearer mock-token-12345678901234567890" },
              },
              body: {
                type: "json",
                data: '{"text": "{{#llm-classifier.text#}}"}',
              },
            },
            position: { x: 980, y: 140 },
          },
          {
            id: "code-transform",
            title: "Format Response",
            type: "code",
            data: {
              type: "code",
              code_language: "javascript",
              code: "function main({ input }) {\n  return { formatted: input.toUpperCase() };\n}",
            },
            position: { x: 980, y: 320 },
          },
          {
            id: "knowledge-retrieval",
            title: "Query Knowledge",
            type: "knowledge-retrieval",
            data: {
              type: "knowledge-retrieval",
              title: "Query Knowledge",
            },
            position: { x: 1200, y: 200 },
          },
          {
            id: "iteration-loop",
            title: "Iterate Items",
            type: "iteration",
            data: {
              type: "iteration",
              title: "Iterate Items",
            },
            position: { x: 1450, y: 200 },
          },
          {
            id: "end-node",
            title: "End Workflow",
            type: "end",
            data: {
              type: "end",
              outputs: [
                { value_selector: ["code-transform", "formatted"], variable: "result" },
              ],
            },
            position: { x: 1700, y: 200 },
          },
        ],
        edges: [
          { id: "e1", source: "start-node", target: "llm-classifier" },
          { id: "e2", source: "llm-classifier", target: "branch-condition" },
          { id: "e3", source: "branch-condition", target: "http-dispatch", sourceHandle: "true" },
          { id: "e4", source: "branch-condition", target: "code-transform", sourceHandle: "false" },
          { id: "e5", source: "http-dispatch", target: "knowledge-retrieval" },
          { id: "e6", source: "code-transform", target: "knowledge-retrieval" },
          { id: "e7", source: "knowledge-retrieval", target: "iteration-loop" },
          { id: "e8", source: "iteration-loop", target: "end-node" },
        ],
      },
    },
  };

  it("should detect Dify workflows across app modes and DSL specs", () => {
    expect(detectPlatform(FIXTURE_DIFY_WORKFLOW)).toBe("DIFY");
    expect(difyParser.supports(FIXTURE_DIFY_WORKFLOW)).toBe(true);
    expect(difyParser.supports({ kind: "app", spec: { workflow: { nodes: [] } } })).toBe(true);
    expect(difyParser.supports({ dsl_version: "0.1.1", workflow: {} })).toBe(true);
  });

  it("should normalize Dify AST into canonical structure", () => {
    const ast = parseWorkflow(FIXTURE_DIFY_WORKFLOW);

    expect(ast.platform).toBe("DIFY");
    expect(ast.name).toBe("Customer Support Automation DSL");
    expect(ast.nodeCount).toBe(8);
    expect(ast.connectionCount).toBe(8);

    // Node classifications
    expect(ast.aiNodesCount).toBe(2); // llm, knowledge-retrieval
    expect(ast.codeNodesCount).toBe(1); // code
    expect(ast.httpNodesCount).toBe(1); // http-request
    expect(ast.hasBranches).toBe(true); // if-else
    expect(ast.hasLoops).toBe(true); // iteration
    expect(ast.loopCount).toBe(1);
    expect(ast.branchCount).toBe(1);

    // Start node is trigger
    expect(ast.triggerNodes.length).toBe(1);
    expect(ast.triggerNodes[0]?.id).toBe("start-node");

    // LLM node metadata
    const llmNode = ast.nodes.find((n) => n.id === "llm-classifier");
    expect(llmNode).toBeDefined();
    expect(llmNode?.isAi).toBe(true);
    expect(llmNode?.aiMeta?.model).toBe("gpt-4o");
    expect(llmNode?.aiMeta?.maxIterations).toBe(512);

    // Code node metadata
    const codeNode = ast.nodes.find((n) => n.id === "code-transform");
    expect(codeNode).toBeDefined();
    expect(codeNode?.isCode).toBe(true);
    expect(codeNode?.codeMeta?.language).toBe("javascript");
    expect(codeNode?.codeMeta?.codeSnippet).toContain("function main");

    // HTTP node metadata
    const httpNode = ast.nodes.find((n) => n.id === "http-dispatch");
    expect(httpNode).toBeDefined();
    expect(httpNode?.isHttp).toBe(true);
    expect(httpNode?.httpMeta?.url).toBe("http://insecure-internal.api/support");
    expect(httpNode?.httpMeta?.method).toBe("POST");

    // Branch edge handles
    const trueEdge = ast.edges.find((e) => e.source === "branch-condition" && e.target === "http-dispatch");
    expect(trueEdge?.sourceHandle).toBe("true");
    const falseEdge = ast.edges.find((e) => e.source === "branch-condition" && e.target === "code-transform");
    expect(falseEdge?.sourceHandle).toBe("false");
  });

  it("should extract secrets from environment variables and HTTP authorizations", () => {
    const ast = parseWorkflow(FIXTURE_DIFY_WORKFLOW);
    expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(2);

    const secretParam = ast.extractedParameters.find((p) => p.key === "EXTERNAL_API_KEY");
    expect(secretParam).toBeDefined();
    expect(secretParam?.value).toBe("sk-proj-dify-live-mock-secret-9876543210123456");

    const httpNode = ast.nodes.find((n) => n.id === "http-dispatch");
    expect(httpNode?.isAuthenticated).toBe(true);
  });

  it("should handle empty or minimal Dify graphs without crashing", () => {
    const minimal = {
      app: { mode: "chat", name: "Empty Chat" },
      workflow: {
        version: "0.1.0",
        graph: { nodes: [], edges: [] },
      },
    };

    expect(difyParser.supports(minimal)).toBe(true);
    const ast = difyParser.parse(minimal);
    expect(ast.nodeCount).toBe(0);
    expect(ast.connectionCount).toBe(0);
    expect(ast.name).toBe("Empty Chat");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM 3: CREWAI TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe("CrewAI Parser", () => {
  const crewaiParser = new CrewAiParser();

  const FIXTURE_CREWAI_CREW = {
    crew: {
      name: "Financial Market Research Crew",
      description: "Autonomous equity research and quantitative risk modeling swarm",
      process: "hierarchical",
      manager_llm: "gpt-4o",
      memory: true,
      max_rpm: 100,
      verbose: true,
      agents: [
        {
          name: "Market_Analyst",
          role: "Senior Financial Market Analyst",
          goal: "Analyze market trends and identify high-growth equities",
          backstory: "You have 15 years of experience in Wall Street equity research.",
          llm: "gpt-4o",
          tools: ["YahooFinanceNewsTool", "SerperDevTool"],
          allow_delegation: true,
          max_iter: 20,
          memory: true,
        },
        {
          name: "Risk_Assessor",
          role: "Quantitative Risk Assessor",
          goal: "Evaluate downside risks and regulatory exposure",
          backstory: "Specialized in quantitative financial risk and portfolio optimization.",
          llm: "claude-3-5-sonnet",
          tools: ["SecFilingsSearchTool"],
          allow_delegation: false,
          max_iter: 15,
        },
      ],
      tasks: [
        {
          name: "market_scan_task",
          description: "Scrape and synthesize market trends for semiconductor sector.",
          expected_output: "Comprehensive analysis report with top 5 equities.",
          agent: "Market_Analyst",
          tools: ["YahooFinanceNewsTool"],
          async_execution: false,
        },
        {
          name: "risk_audit_task",
          description: "Perform stress testing and downside scenario modeling on selected equities.",
          expected_output: "Risk score card and hedging strategy in valid JSON.",
          agent: "Risk_Assessor",
          context: ["market_scan_task"],
          output_json: true,
        },
      ],
    },
  };

  it("should accurately detect CrewAI configurations", () => {
    expect(detectPlatform(FIXTURE_CREWAI_CREW)).toBe("CREWAI");
    expect(crewaiParser.supports(FIXTURE_CREWAI_CREW)).toBe(true);
    expect(crewaiParser.supports({ agents: [{ role: "Researcher", goal: "Find facts" }] })).toBe(true);
    expect(crewaiParser.supports({ tasks: [{ expected_output: "Summary", agent: "Analyst" }] })).toBe(true);
  });

  it("should normalize CrewAI multi-agent graph with agents, tasks, tools, and manager", () => {
    const ast = parseWorkflow(FIXTURE_CREWAI_CREW);

    expect(ast.platform).toBe("CREWAI");
    expect(ast.name).toBe("Financial Market Research Crew");

    // 1 Manager + 2 Agents + 2 Tasks + 3 Unique Tools = 8 nodes
    expect(ast.nodeCount).toBe(8);
    expect(ast.aiNodesCount).toBe(5); // Manager + 2 Agents + 2 Tasks
    expect(ast.hasBranches).toBe(true); // Hierarchical process + delegation

    // Manager Node
    const managerNode = ast.nodes.find((n) => n.id === "node_manager_crew");
    expect(managerNode).toBeDefined();
    expect(managerNode?.isAi).toBe(true);
    expect(managerNode?.isBranch).toBe(true);
    expect(managerNode?.isTrigger).toBe(true);
    expect(managerNode?.aiMeta?.model).toBe("gpt-4o");

    // Agent Nodes
    const analystNode = ast.nodes.find((n) => n.id === "agent_Market_Analyst");
    expect(analystNode).toBeDefined();
    expect(analystNode?.isAi).toBe(true);
    expect(analystNode?.aiMeta?.model).toBe("gpt-4o");
    expect(analystNode?.aiMeta?.maxIterations).toBe(20);

    const riskNode = ast.nodes.find((n) => n.id === "agent_Risk_Assessor");
    expect(riskNode).toBeDefined();
    expect(riskNode?.isAi).toBe(true);
    expect(riskNode?.aiMeta?.model).toBe("claude-3-5-sonnet");
    expect(riskNode?.aiMeta?.maxIterations).toBe(15);

    // Task Nodes
    const scanTask = ast.nodes.find((n) => n.id === "task_market_scan_task");
    expect(scanTask).toBeDefined();
    expect(scanTask?.isAi).toBe(true);

    const auditTask = ast.nodes.find((n) => n.id === "task_risk_audit_task");
    expect(auditTask).toBeDefined();
    expect(auditTask?.aiMeta?.hasStructuredOutput).toBe(true);

    // Edge Verifications
    // Manager -> Agent delegation edges
    expect(ast.edges.some((e) => e.source === "node_manager_crew" && e.target === "agent_Market_Analyst")).toBe(true);
    expect(ast.edges.some((e) => e.source === "node_manager_crew" && e.target === "agent_Risk_Assessor")).toBe(true);

    // Agent -> Task assignment edges
    expect(ast.edges.some((e) => e.source === "agent_Market_Analyst" && e.target === "task_market_scan_task")).toBe(true);
    expect(ast.edges.some((e) => e.source === "agent_Risk_Assessor" && e.target === "task_risk_audit_task")).toBe(true);

    // Context dependency edge between tasks
    expect(ast.edges.some((e) => e.source === "task_market_scan_task" && e.target === "task_risk_audit_task")).toBe(true);
  });

  it("should extract tools as action nodes and connect them via edges", () => {
    const ast = parseWorkflow(FIXTURE_CREWAI_CREW);

    const yahooTool = ast.nodes.find((n) => n.id === "tool_YahooFinanceNewsTool");
    expect(yahooTool).toBeDefined();
    expect(yahooTool?.type).toBe("crewai.tool");

    const serperTool = ast.nodes.find((n) => n.id === "tool_SerperDevTool");
    expect(serperTool).toBeDefined();

    expect(ast.edges.some((e) => e.target === "tool_YahooFinanceNewsTool")).toBe(true);
  });

  it("should support sequential process with sequential task chaining", () => {
    const sequentialCrew = {
      name: "Sequential Crew",
      process: "sequential",
      agents: [
        { name: "Researcher", role: "Researcher", goal: "Find data" },
        { name: "Writer", role: "Writer", goal: "Write report" },
      ],
      tasks: [
        { name: "Task_1", description: "Collect data", agent: "Researcher" },
        { name: "Task_2", description: "Draft report", agent: "Writer" },
      ],
    };

    expect(crewaiParser.supports(sequentialCrew)).toBe(true);
    const ast = crewaiParser.parse(sequentialCrew);

    expect(ast.platform).toBe("CREWAI");
    expect(ast.nodes.some((n) => n.id === "node_manager_crew")).toBe(false);

    // Sequence edge from Task_1 -> Task_2
    const seqEdge = ast.edges.find((e) => e.source === "task_Task_1" && e.target === "task_Task_2");
    expect(seqEdge).toBeDefined();
    expect(seqEdge?.type).toBe("sequence");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM 4: AUTOGEN TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe("AutoGen Parser", () => {
  const autogenParser = new AutoGenParser();

  const FIXTURE_AUTOGEN_GROUPCHAT = {
    name: "AutoGen Automated Code Engineering Group",
    description: "Collaborative coding and code review swarm with Docker execution",
    type: "groupchat",
    agents: [
      {
        name: "User_Proxy",
        type: "UserProxyAgent",
        human_input_mode: "ALWAYS",
        max_consecutive_auto_reply: 10,
        code_execution_config: {
          work_dir: "workspace",
          use_docker: true,
          timeout: 120,
        },
        system_message: "Human admin proxy that executes validated code.",
      },
      {
        name: "Software_Engineer",
        type: "AssistantAgent",
        system_message: "Senior Python developer. Write modular, secure code with unit tests.",
        llm_config: {
          config_list: [
            {
              model: "gpt-4o",
              api_key: "sk-proj-autogen-live-secret-1234567890abcdef",
              temperature: 0.2,
            },
          ],
          timeout: 60,
          cache_seed: 42,
        },
      },
      {
        name: "Security_Auditor",
        type: "AssistantAgent",
        system_message: "AppSec specialist. Inspect code for SQL injection, buffer overflows, and hardcoded keys.",
        llm_config: {
          config_list: [{ model: "gpt-4o", temperature: 0.0 }],
        },
      },
    ],
    groupchat: {
      agents: ["User_Proxy", "Software_Engineer", "Security_Auditor"],
      messages: [],
      max_round: 25,
      speaker_selection_method: "auto",
      admin_name: "User_Proxy",
    },
    manager: {
      name: "GroupChat_Manager",
      type: "GroupChatManager",
      llm_config: {
        config_list: [{ model: "gpt-4o" }],
      },
    },
  };

  it("should accurately detect AutoGen configurations", () => {
    expect(detectPlatform(FIXTURE_AUTOGEN_GROUPCHAT)).toBe("AUTOGEN");
    expect(autogenParser.supports(FIXTURE_AUTOGEN_GROUPCHAT)).toBe(true);
    expect(autogenParser.supports({ agents: [{ human_input_mode: "NEVER" }] })).toBe(true);
    expect(autogenParser.supports({ groupchat: { max_round: 10 } })).toBe(true);
  });

  it("should normalize AutoGen multi-agent system AST", () => {
    const ast = parseWorkflow(FIXTURE_AUTOGEN_GROUPCHAT);

    expect(ast.platform).toBe("AUTOGEN");
    expect(ast.name).toBe("AutoGen Automated Code Engineering Group");

    // 1 Manager + 3 Agents = 4 nodes
    expect(ast.nodeCount).toBe(4);
    expect(ast.nodes.length).toBe(4);

    // AI and Code nodes count
    expect(ast.aiNodesCount).toBe(3); // Manager + 2 AssistantAgents
    expect(ast.codeNodesCount).toBe(1); // User_Proxy with code_execution_config
    expect(ast.hasBranches).toBe(true); // GroupChat manager

    // UserProxy Node is trigger and code executor
    const userProxy = ast.nodes.find((n) => n.id === "agent_User_Proxy");
    expect(userProxy).toBeDefined();
    expect(userProxy?.isTrigger).toBe(true);
    expect(userProxy?.isCode).toBe(true);
    expect(userProxy?.isAi).toBe(false);
    expect(userProxy?.codeMeta?.language).toBe("python");

    // Assistant Agents
    const devAgent = ast.nodes.find((n) => n.id === "agent_Software_Engineer");
    expect(devAgent).toBeDefined();
    expect(devAgent?.isAi).toBe(true);
    expect(devAgent?.aiMeta?.model).toBe("gpt-4o");

    const secAgent = ast.nodes.find((n) => n.id === "agent_Security_Auditor");
    expect(secAgent).toBeDefined();
    expect(secAgent?.isAi).toBe(true);

    // GroupChat Manager
    const manager = ast.nodes.find((n) => n.id === "manager_GroupChat_Manager");
    expect(manager).toBeDefined();
    expect(manager?.isBranch).toBe(true);
    expect(manager?.aiMeta?.maxIterations).toBe(25);

    // Manager <-> Agents broadcast and reply edges
    expect(ast.edges.some((e) => e.source === "manager_GroupChat_Manager" && e.target === "agent_Software_Engineer")).toBe(true);
    expect(ast.edges.some((e) => e.source === "agent_Software_Engineer" && e.target === "manager_GroupChat_Manager")).toBe(true);
  });

  it("should extract embedded secrets from agent llm_config config_list", () => {
    const ast = parseWorkflow(FIXTURE_AUTOGEN_GROUPCHAT);
    expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(1);

    const devAgent = ast.nodes.find((n) => n.id === "agent_Software_Engineer");
    expect(devAgent?.isAuthenticated).toBe(true);
  });

  it("should handle 2-agent pairwise conversation without manager", () => {
    const pairwiseChat = {
      name: "Pairwise Coding",
      agents: [
        { name: "User", human_input_mode: "ALWAYS" },
        { name: "Coder", type: "AssistantAgent", llm_config: { model: "gpt-4o" } },
      ],
    };

    expect(autogenParser.supports(pairwiseChat)).toBe(true);
    const ast = autogenParser.parse(pairwiseChat);

    expect(ast.nodeCount).toBe(2);
    expect(ast.connectionCount).toBe(2); // User <-> Coder reciprocal turns
    expect(ast.edges.some((e) => e.source === "agent_User" && e.target === "agent_Coder")).toBe(true);
    expect(ast.edges.some((e) => e.source === "agent_Coder" && e.target === "agent_User")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM 5: PIPEDREAM TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Pipedream Parser", () => {
  const pipedreamParser = new PipedreamParser();

  const FIXTURE_PIPEDREAM_WORKFLOW = {
    id: "p_ws_123456",
    name: "Stripe to Slack & Database Sync",
    description: "Process Stripe charge events, transform payload, alert Slack, and insert to database",
    settings: {
      error_notification: true,
      auto_retry: true,
    },
    triggers: [
      {
        id: "trig_stripe_01",
        name: "New Stripe Event",
        type: "event_source",
        component_id: "stripe-new-event",
        props: {
          stripe: { authProvisionId: "apn_live_stripe_999" },
          event_types: ["charge.succeeded", "payment_intent.succeeded"],
        },
        configured_props: {
          event_types: ["charge.succeeded"],
        },
      },
    ],
    steps: [
      {
        id: "step_parse_charge",
        name: "sanitize_and_filter",
        type: "custom_code",
        language: "nodejs",
        code: "export default defineComponent({\n  async run({ steps, $ }) {\n    const event = steps.trigger.event;\n    if (event.data.object.amount < 1000) return $.flow.exit('Amount too low');\n    return { amountUsd: event.data.object.amount / 100, customer: event.data.object.customer };\n  }\n});",
      },
      {
        id: "step_send_slack",
        name: "notify_ops_channel",
        type: "action",
        app: "slack",
        action: "send_message_to_channel",
        props: {
          slack: { authProvisionId: "apn_live_slack_888" },
          channel: "#payments",
          text: "Payment received: ${{steps.sanitize_and_filter.$return_value.amountUsd}}",
        },
      },
      {
        id: "step_http_db",
        name: "sync_to_internal_db",
        type: "http",
        props: {
          url: "https://api.internal.com/v1/ledger",
          method: "POST",
          headers: {
            Authorization: "Bearer pd_live_mock_secret_abcdef1234567890",
          },
          body: "{{steps.sanitize_and_filter.$return_value}}",
        },
      },
      {
        id: "step_ai_summary",
        name: "generate_ai_summary",
        type: "action",
        app: "openai",
        action: "create_chat_completion",
        props: {
          model: "gpt-4o",
        },
      },
    ],
  };

  it("should accurately detect Pipedream workflows", () => {
    expect(detectPlatform(FIXTURE_PIPEDREAM_WORKFLOW)).toBe("PIPEDREAM");
    expect(pipedreamParser.supports(FIXTURE_PIPEDREAM_WORKFLOW)).toBe(true);
    expect(pipedreamParser.supports({ steps: [{ namespace: "custom", code: "export default" }] })).toBe(true);
    expect(pipedreamParser.supports({ triggers: [{ component_id: "http" }] })).toBe(true);
  });

  it("should normalize Pipedream AST into canonical structure", () => {
    const ast = parseWorkflow(FIXTURE_PIPEDREAM_WORKFLOW);

    expect(ast.platform).toBe("PIPEDREAM");
    expect(ast.name).toBe("Stripe to Slack & Database Sync");

    // 1 Trigger + 4 Steps = 5 nodes
    expect(ast.nodeCount).toBe(5);
    expect(ast.connectionCount).toBe(4); // Trigger -> Step 1 -> Step 2 -> Step 3 -> Step 4

    // Node classifications
    expect(ast.codeNodesCount).toBe(1); // sanitize_and_filter (custom_code)
    expect(ast.httpNodesCount).toBe(1); // sync_to_internal_db (http)
    expect(ast.aiNodesCount).toBe(1); // generate_ai_summary (openai)
    expect(ast.hasBranches).toBe(true); // $.flow.exit in code step

    // Trigger Node
    expect(ast.triggerNodes.length).toBe(1);
    expect(ast.triggerNodes[0]?.id).toBe("trig_stripe_01");

    // Code Meta inspection
    const codeStep = ast.nodes.find((n) => n.id === "step_parse_charge");
    expect(codeStep).toBeDefined();
    expect(codeStep?.isCode).toBe(true);
    expect(codeStep?.codeMeta?.language).toBe("javascript");
    expect(codeStep?.codeMeta?.codeSnippet).toContain("defineComponent");

    // HTTP Meta inspection
    const httpStep = ast.nodes.find((n) => n.id === "step_http_db");
    expect(httpStep).toBeDefined();
    expect(httpStep?.isHttp).toBe(true);
    expect(httpStep?.httpMeta?.url).toBe("https://api.internal.com/v1/ledger");
    expect(httpStep?.httpMeta?.method).toBe("POST");

    // AI Meta inspection
    const aiStep = ast.nodes.find((n) => n.id === "step_ai_summary");
    expect(aiStep).toBeDefined();
    expect(aiStep?.isAi).toBe(true);
    expect(aiStep?.aiMeta?.model).toBe("gpt-4o");

    // Sequential Edge Verification
    expect(ast.edges[0]?.source).toBe("trig_stripe_01");
    expect(ast.edges[0]?.target).toBe("step_parse_charge");
    expect(ast.edges[1]?.source).toBe("step_parse_charge");
    expect(ast.edges[1]?.target).toBe("step_send_slack");
    expect(ast.edges[2]?.source).toBe("step_send_slack");
    expect(ast.edges[2]?.target).toBe("step_http_db");
    expect(ast.edges[3]?.source).toBe("step_http_db");
    expect(ast.edges[3]?.target).toBe("step_ai_summary");
  });

  it("should extract secrets from props and authorization headers", () => {
    const ast = parseWorkflow(FIXTURE_PIPEDREAM_WORKFLOW);
    expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(1);

    const triggerNode = ast.nodes.find((n) => n.id === "trig_stripe_01");
    expect(triggerNode?.isAuthenticated).toBe(true);

    const slackNode = ast.nodes.find((n) => n.id === "step_send_slack");
    expect(slackNode?.isAuthenticated).toBe(true);
  });

  it("should support Python code steps", () => {
    const pythonWorkflow = {
      steps: [
        {
          name: "python_transform",
          type: "python",
          code: "def handler(pd: 'pipedream'):\n    return {'status': 'done'}",
        },
      ],
    };

    expect(pipedreamParser.supports(pythonWorkflow)).toBe(true);
    const ast = pipedreamParser.parse(pythonWorkflow);

    expect(ast.nodeCount).toBe(1);
    expect(ast.nodes[0]?.isCode).toBe(true);
    expect(ast.nodes[0]?.codeMeta?.language).toBe("python");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM 6: OPENAI AGENTS SDK / SWARM TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe("OpenAI Agents SDK / Swarm Parser", () => {
  const openaiParser = new OpenAiAgentsParser();

  const FIXTURE_OPENAI_AGENTS_SWARM = {
    name: "Customer Support Swarm",
    description: "Triage and specialized routing agent swarm with tool loops",
    starting_agent: "Triage_Agent",
    max_turns: 20,
    execute_tools_async: true,
    agents: [
      {
        name: "Triage_Agent",
        model: "gpt-4o",
        instructions: "You are the triage agent. Assess customer inquiry and route to Billing or Tech Support. Auth: sk-proj-swarm-secret-12345678901234567890",
        functions: [
          {
            name: "transfer_to_billing",
            description: "Transfer conversation to the Billing Specialist agent",
            is_handoff: true,
            target_agent: "Billing_Agent",
            parameters: {
              type: "object",
              properties: { issue_type: { type: "string" } },
            },
          },
          {
            name: "transfer_to_tech",
            description: "Transfer conversation to Technical Support agent",
            is_handoff: true,
            target_agent: "Tech_Agent",
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "lookup_user_account",
              description: "Fetch user subscription plan and email",
              parameters: {
                type: "object",
                properties: { user_id: { type: "string" } },
              },
            },
          },
        ],
      },
      {
        name: "Billing_Agent",
        model: "gpt-4o-mini",
        instructions: "You handle billing, refunds, and invoice adjustments.",
        functions: [
          {
            name: "process_refund",
            description: "Issue refund for a given transaction ID",
            parameters: {
              type: "object",
              properties: { tx_id: { type: "string" }, amount: { type: "number" } },
            },
          },
          {
            name: "transfer_back_to_triage",
            description: "Transfer conversation back to triage",
            is_handoff: true,
            target_agent: "Triage_Agent",
          },
        ],
      },
      {
        name: "Tech_Agent",
        model: "gpt-4o",
        instructions: "You troubleshoot software bugs and API errors.",
        functions: [],
      },
    ],
  };

  it("should accurately detect OpenAI Agents SDK / Swarm configurations", () => {
    expect(detectPlatform(FIXTURE_OPENAI_AGENTS_SWARM)).toBe("OPENAI_AGENTS");
    expect(openaiParser.supports(FIXTURE_OPENAI_AGENTS_SWARM)).toBe(true);
    expect(openaiParser.supports({ platform: "SWARM" })).toBe(true);
    expect(openaiParser.supports({ name: "SingleAgent", instructions: "Act as bot", model: "gpt-4o" })).toBe(true);
  });

  it("should normalize Swarm multi-agent AST with agents, tools, and handoff edges", () => {
    const ast = parseWorkflow(FIXTURE_OPENAI_AGENTS_SWARM);

    expect(ast.platform).toBe("OPENAI_AGENTS");
    expect(ast.name).toBe("Customer Support Swarm");

    // 3 Agents + 2 Unique Tool functions = 5 nodes
    expect(ast.nodeCount).toBe(5);
    expect(ast.aiNodesCount).toBe(3); // 3 Agents
    expect(ast.hasBranches).toBe(true); // Triage has 2 handoffs

    // Triage Agent is trigger
    const triageAgent = ast.nodes.find((n) => n.id === "agent_Triage_Agent");
    expect(triageAgent).toBeDefined();
    expect(triageAgent?.isTrigger).toBe(true);
    expect(triageAgent?.isAi).toBe(true);
    expect(triageAgent?.aiMeta?.model).toBe("gpt-4o");
    expect(triageAgent?.aiMeta?.maxIterations).toBe(20);
    expect(triageAgent?.aiMeta?.hasStructuredOutput).toBe(true);

    // Billing Agent
    const billingAgent = ast.nodes.find((n) => n.id === "agent_Billing_Agent");
    expect(billingAgent).toBeDefined();
    expect(billingAgent?.aiMeta?.model).toBe("gpt-4o-mini");

    // Tool Nodes
    const lookupTool = ast.nodes.find((n) => n.id === "tool_lookup_user_account");
    expect(lookupTool).toBeDefined();
    expect(lookupTool?.type).toBe("openai_agents.tool");

    const refundTool = ast.nodes.find((n) => n.id === "tool_process_refund");
    expect(refundTool).toBeDefined();

    // Handoff Edges
    expect(ast.edges.some((e) => e.source === "agent_Triage_Agent" && e.target === "agent_Billing_Agent" && e.type === "handoff")).toBe(true);
    expect(ast.edges.some((e) => e.source === "agent_Triage_Agent" && e.target === "agent_Tech_Agent" && e.type === "handoff")).toBe(true);
    expect(ast.edges.some((e) => e.source === "agent_Billing_Agent" && e.target === "agent_Triage_Agent" && e.type === "handoff")).toBe(true);

    // Tool Call Edges
    expect(ast.edges.some((e) => e.source === "agent_Triage_Agent" && e.target === "tool_lookup_user_account" && e.type === "tool_call")).toBe(true);
    expect(ast.edges.some((e) => e.source === "agent_Billing_Agent" && e.target === "tool_process_refund" && e.type === "tool_call")).toBe(true);
  });

  it("should extract embedded secrets from instructions or tools", () => {
    const ast = parseWorkflow(FIXTURE_OPENAI_AGENTS_SWARM);
    expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(1);

    const triageAgent = ast.nodes.find((n) => n.id === "agent_Triage_Agent");
    expect(triageAgent?.isAuthenticated).toBe(true);
  });

  it("should support explicit handoffs array", () => {
    const handoffArraySwarm = {
      name: "Handoff Swarm",
      agents: [
        {
          name: "Agent_A",
          instructions: "First agent",
          handoffs: ["Agent_B"],
        },
        {
          name: "Agent_B",
          instructions: "Second agent",
        },
      ],
    };

    expect(openaiParser.supports(handoffArraySwarm)).toBe(true);
    const ast = openaiParser.parse(handoffArraySwarm);

    expect(ast.nodeCount).toBe(2);
    expect(ast.edges.some((e) => e.source === "agent_Agent_A" && e.target === "agent_Agent_B" && e.type === "handoff")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-PLATFORM DETECTION & INVARIANT VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Cross-Platform Detection & AST Invariants", () => {
  it("should distinguish all 6 extended platforms cleanly without collisions", () => {
    const platforms = [
      {
        expected: "LANGFLOW",
        data: { nodes: [{ data: { node: { template: { model_name: { value: "gpt-4" } } } } }] },
      },
      {
        expected: "DIFY",
        data: { app: { mode: "workflow" }, workflow: { graph: { nodes: [], edges: [] } } },
      },
      {
        expected: "CREWAI",
        data: { crew: { agents: [{ role: "Dev" }], tasks: [{ description: "Code" }] } },
      },
      {
        expected: "AUTOGEN",
        data: { agents: [{ name: "User", human_input_mode: "ALWAYS" }] },
      },
      {
        expected: "PIPEDREAM",
        data: { steps: [{ name: "step1", namespace: "custom", code: "export default" }] },
      },
      {
        expected: "OPENAI_AGENTS",
        data: { starting_agent: "Bot", agents: [{ name: "Bot", instructions: "Help" }] },
      },
    ];

    for (const { expected, data } of platforms) {
      expect(detectPlatform(data)).toBe(expected as WorkflowPlatform);
      const parsed = parseWorkflow(data);
      expect(parsed.platform).toBe(expected as WorkflowPlatform);
    }
  });

  it("should enforce mathematical invariants on all normalized ASTs", () => {
    const sampleFixtures = [
      { nodes: [{ id: "1", type: "chatInput", data: { node_type: "chatInput" } }], edges: [] }, // LangFlow
      { app: { mode: "workflow" }, workflow: { graph: { nodes: [{ id: "1", type: "start" }], edges: [] } } }, // Dify
      { agents: [{ name: "A", role: "Dev" }], tasks: [{ name: "T", description: "Do", agent: "A" }] }, // CrewAI
      { agents: [{ name: "U", human_input_mode: "ALWAYS" }, { name: "B", llm_config: { model: "gpt-4" } }] }, // AutoGen
      { steps: [{ name: "s1", type: "nodejs", code: "return true;" }] }, // Pipedream
      { starting_agent: "A", agents: [{ name: "A", instructions: "Go", functions: [{ name: "f", target_agent: "B", is_handoff: true }] }, { name: "B", instructions: "Sub" }] }, // OpenAI Agents
    ];

    for (const fixture of sampleFixtures) {
      const ast = parseWorkflow(fixture);

      // Invariants
      expect(ast.nodeCount).toBe(ast.nodes.length);
      expect(ast.connectionCount).toBe(ast.edges.length);
      expect(ast.httpNodesCount).toBe(ast.nodes.filter((n) => n.isHttp).length);
      expect(ast.codeNodesCount).toBe(ast.nodes.filter((n) => n.isCode).length);
      expect(ast.aiNodesCount).toBe(ast.nodes.filter((n) => n.isAi).length);
      expect(ast.hasBranches).toBe(ast.nodes.filter((n) => n.isBranch).length > 0 || ast.branchCount > 0);
      expect(ast.hasLoops).toBe(ast.nodes.filter((n) => n.isLoop).length > 0 || ast.loopCount > 0);
      expect(Array.isArray(ast.extractedParameters)).toBe(true);
      expect(Array.isArray(ast.triggerNodes)).toBe(true);
      expect(ast.rawJson).toBe(fixture);
    }
  });

  it("should gracefully handle unsupported formats and invalid inputs", () => {
    expect(() => parseWorkflow(null)).toThrow("Unsupported workflow format");
    expect(() => parseWorkflow(undefined)).toThrow("Unsupported workflow format");
    expect(() => parseWorkflow(12345)).toThrow("Unsupported workflow format");
    expect(() => parseWorkflow("string")).toThrow("Unsupported workflow format");
    expect(() => parseWorkflow({ unknown_key: true })).toThrow("Unsupported workflow format");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOWNSTREAM ENGINE COMPATIBILITY (V2 ENGINE INTEGRATION)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Downstream Engine Compatibility (V2 Engine)", () => {
  const extendedFixtures = [
    {
      platform: "LANGFLOW",
      data: {
        id: "lf_test",
        name: "Langflow QA",
        data: {
          nodes: [
            { id: "input", type: "chatInput", data: { type: "ChatInput", node: { template: { input: { value: "hi" } } } } },
            { id: "llm", type: "genericNode", data: { type: "ChatOpenAI", node: { template: { model_name: { value: "gpt-4o" } } } } },
          ],
          edges: [{ source: "input", target: "llm" }],
        },
      },
    },
    {
      platform: "DIFY",
      data: {
        app: { name: "Dify App", mode: "workflow" },
        workflow: {
          version: "0.1.0",
          graph: {
            nodes: [
              { id: "s1", type: "start", data: { type: "start" } },
              { id: "l1", type: "llm", data: { type: "llm", model: { name: "gpt-4o" } } },
            ],
            edges: [{ source: "s1", target: "l1" }],
          },
        },
      },
    },
    {
      platform: "CREWAI",
      data: {
        crew: {
          name: "Crew Test",
          agents: [{ name: "Writer", role: "Copywriter", goal: "Write" }],
          tasks: [{ name: "Draft", description: "Write blog post", agent: "Writer" }],
        },
      },
    },
    {
      platform: "AUTOGEN",
      data: {
        name: "AutoGen Test",
        agents: [
          { name: "User", human_input_mode: "ALWAYS" },
          { name: "Assistant", type: "AssistantAgent", llm_config: { model: "gpt-4o" } },
        ],
      },
    },
    {
      platform: "PIPEDREAM",
      data: {
        name: "Pipedream Test",
        triggers: [{ id: "trig", component_id: "http" }],
        steps: [{ id: "step", type: "custom_code", code: "return true;" }],
      },
    },
    {
      platform: "OPENAI_AGENTS",
      data: {
        name: "Swarm Test",
        starting_agent: "Bot",
        agents: [{ name: "Bot", model: "gpt-4o", instructions: "Assist user" }],
      },
    },
  ];

  for (const { platform, data } of extendedFixtures) {
    it(`should successfully run v2 analysis pipeline on ${platform} AST`, async () => {
      const ast = parseWorkflow(data);
      expect(ast.platform).toBe(platform as WorkflowPlatform);

      const syncReport = runAnalysisSync(ast);
      expect(syncReport).toBeDefined();
      expect(syncReport.fqiScore).toBeGreaterThanOrEqual(0);
      expect(syncReport.fqiScore).toBeLessThanOrEqual(100);
      expect(syncReport.qualityGates).toBeDefined();
      expect(syncReport.categoryScores).toBeDefined();
      expect(syncReport.findings).toBeDefined();

      const asyncReport = await runAnalysis(ast);
      expect(asyncReport).toBeDefined();
      expect(asyncReport.fqiScore).toBe(syncReport.fqiScore);
      expect(asyncReport.fingerprint).toBeDefined();
      expect(asyncReport.passport).toBeDefined();
    });
  }
});

