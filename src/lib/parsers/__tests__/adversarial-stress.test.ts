// @ts-expect-error Bun test type definitions
import { describe, expect, it } from 'bun:test';
import {
  detectPlatform,
  parseWorkflow,
  PARSERS,
  LangflowParser,
  DifyParser,
  CrewAiParser,
  AutoGenParser,
  PipedreamParser,
  OpenAiAgentsParser,
} from '../index';
import { runAnalysis, runAnalysisSync } from '@/lib/engine/analysis-runner';
import type { ParsedWorkflow } from '@/types';

describe('Adversarial Stress Testing — 6 New AST Parsers', () => {
  const langflowParser = new LangflowParser();
  const difyParser = new DifyParser();
  const crewaiParser = new CrewAiParser();
  const autogenParser = new AutoGenParser();
  const pipedreamParser = new PipedreamParser();
  const openaiAgentsParser = new OpenAiAgentsParser();

  describe('1. Empty, Null, Primitive, and Malformed Inputs', () => {
    const edgeInputs = [
      null,
      undefined,
      {},
      [],
      '',
      'string',
      123,
      0,
      -1,
      true,
      false,
      { nodes: null },
      { nodes: 'invalid' },
      { nodes: [null, undefined, 123, 'str', {}, { id: null }] },
      { edges: null },
      { edges: [null, {}] },
      { workflow: null },
      { app: null, workflow: null },
      { crew: null },
      { agents: null },
      { tasks: null },
      { groupchat: null },
      { steps: null },
      { triggers: null },
      { data: null },
      { data: { nodes: null, edges: null } },
      { ['__proto__']: { admin: true } },
    ];

    it('supports() must return boolean and never throw on any malformed input', () => {
      for (const parser of PARSERS) {
        for (const input of edgeInputs) {
          expect(() => {
            const res = parser.supports(input);
            expect(typeof res).toBe('boolean');
          }).not.toThrow();
        }
      }
    });

    it('detectPlatform() must return GENERIC or fallback without throwing on corrupt inputs', () => {
      for (const input of edgeInputs) {
        expect(() => {
          const platform = detectPlatform(input);
          expect(typeof platform).toBe('string');
        }).not.toThrow();
      }
    });

    it('parse() on each parser must survive corrupt or partially missing data structures', () => {
      const brokenDify = {
        app: { mode: 'workflow' },
        workflow: {
          graph: {
            nodes: [
              null as unknown as Record<string, unknown>,
              {},
              { id: 'd1', type: 'llm', data: null },
              { id: 'd2', data: { model: null, authorization: null } },
            ],
            edges: [null as unknown as Record<string, unknown>, {}, { source: 'd1', target: 'd2' }],
          },
          environment_variables: [null as unknown as Record<string, unknown>, { name: 'SECRET', value: null }],
        },
      };
      expect(() => difyParser.parse(brokenDify)).not.toThrow();
      const difyAst = difyParser.parse(brokenDify);
      expect(difyAst.platform).toBe('DIFY');

      const brokenLangflow = {
        data: {
          nodes: [
            null as unknown as Record<string, unknown>,
            {},
            { id: 'lf1', data: { node: { template: { api_key: { value: null } } } } },
            { id: 'lf2', type: null, data: null },
          ],
          edges: [null as unknown as Record<string, unknown>, { source: 'lf1', target: 'lf2', sourceHandle: '{invalid_json' }],
        },
      };
      expect(() => langflowParser.parse(brokenLangflow)).not.toThrow();
      const lfAst = langflowParser.parse(brokenLangflow);
      expect(lfAst.platform).toBe('LANGFLOW');

      const brokenCrewAi = {
        crew: {
          agents: [null as unknown as Record<string, unknown>, {}, { name: null, role: null, llm: null, tools: [null, {}] }],
          tasks: [null as unknown as Record<string, unknown>, {}, { name: null, description: null, agent: null, tools: [null] }],
        },
      };
      expect(() => crewaiParser.parse(brokenCrewAi)).not.toThrow();
      const crewAst = crewaiParser.parse(brokenCrewAi);
      expect(crewAst.platform).toBe('CREWAI');

      const brokenAutoGen = {
        agents: [
          null as unknown as Record<string, unknown>,
          {},
          { name: null, type: null, llm_config: null, code_execution_config: null },
          { name: 'a1', llm_config: { config_list: [null, { model: null, api_key: null }] } },
        ],
        groupchat: { agents: [null], max_round: null },
      };
      expect(() => autogenParser.parse(brokenAutoGen)).not.toThrow();
      const autoAst = autogenParser.parse(brokenAutoGen);
      expect(autoAst.platform).toBe('AUTOGEN');

      const brokenPipedream = {
        triggers: [null as unknown as Record<string, unknown>, {}, { id: null, type: null, props: null }],
        steps: [
          null as unknown as Record<string, unknown>,
          {},
          { id: null, type: null, app: null, code: null, props: null, configured_props: null },
        ],
      };
      expect(() => pipedreamParser.parse(brokenPipedream)).not.toThrow();
      const pdAst = pipedreamParser.parse(brokenPipedream);
      expect(pdAst.platform).toBe('PIPEDREAM');

      const brokenOpenAiAgents = {
        agents: [
          null as unknown as Record<string, unknown>,
          {},
          {
            name: null,
            instructions: null,
            functions: [null, {}, { name: null, is_handoff: true, target_agent: null }],
            tools: [null, 'tool_str', { type: 'function', function: null }],
            handoffs: [null, 'target_str', {}],
          },
        ],
      };
      expect(() => openaiAgentsParser.parse(brokenOpenAiAgents)).not.toThrow();
      const oaiAst = openaiAgentsParser.parse(brokenOpenAiAgents);
      expect(oaiAst.platform).toBe('OPENAI_AGENTS');
    });
  });

  describe('2. Cross-Platform Discrimination and Parser Isolation', () => {
    const langflowSample = {
      data: {
        nodes: [{ id: 'lf1', type: 'chatOpenAI', data: { node: { template: { model_name: { value: 'gpt-4' } } } } }],
        edges: [],
      },
    };

    const difySample = {
      app: { name: 'Dify Flow', mode: 'workflow' },
      workflow: {
        graph: {
          nodes: [{ id: 'd1', type: 'llm', data: { model: { name: 'gpt-4o' } } }],
          edges: [],
        },
      },
    };

    const crewaiSample = {
      crew: {
        process: 'sequential',
        agents: [{ name: 'Researcher', role: 'Research topics', goal: 'Gather data' }],
        tasks: [{ name: 'ResearchTask', description: 'Search data', expected_output: 'Summary' }],
      },
    };

    const autogenSample = {
      agents: [
        { name: 'user_proxy', human_input_mode: 'ALWAYS' },
        { name: 'coder', type: 'AssistantAgent', llm_config: { model: 'gpt-4o' } },
      ],
      groupchat: { max_round: 10 },
    };

    const pipedreamSample = {
      triggers: [{ id: 't1', type: 'http', component_id: 'http_webhook' }],
      steps: [{ id: 's1', type: 'nodejs', code: 'export default defineComponent({})' }],
    };

    const openaiAgentsSample = {
      starting_agent: 'TriageAgent',
      agents: [
        {
          name: 'TriageAgent',
          instructions: 'Triage user queries',
          handoffs: ['SalesAgent'],
        },
        {
          name: 'SalesAgent',
          instructions: 'Handle sales questions',
        },
      ],
    };

    it('detectPlatform must discriminate all 6 formats without cross-contamination', () => {
      expect(detectPlatform(langflowSample)).toBe('LANGFLOW');
      expect(detectPlatform(difySample)).toBe('DIFY');
      expect(detectPlatform(crewaiSample)).toBe('CREWAI');
      expect(detectPlatform(autogenSample)).toBe('AUTOGEN');
      expect(detectPlatform(pipedreamSample)).toBe('PIPEDREAM');
      expect(detectPlatform(openaiAgentsSample)).toBe('OPENAI_AGENTS');
    });

    it('parseWorkflow must instantiate the precise platform AST for each sample', () => {
      expect(parseWorkflow(langflowSample).platform).toBe('LANGFLOW');
      expect(parseWorkflow(difySample).platform).toBe('DIFY');
      expect(parseWorkflow(crewaiSample).platform).toBe('CREWAI');
      expect(parseWorkflow(autogenSample).platform).toBe('AUTOGEN');
      expect(parseWorkflow(pipedreamSample).platform).toBe('PIPEDREAM');
      expect(parseWorkflow(openaiAgentsSample).platform).toBe('OPENAI_AGENTS');
    });

    it('arbitrary non-platform DAG JSON must route to GENERIC fallback', () => {
      const genericDag = {
        name: 'My Pipeline',
        tasks: [
          { id: 'job1', name: 'Build', type: 'exec' },
          { id: 'job2', name: 'Deploy', type: 'http', depends_on: ['job1'] },
        ],
      };
      expect(detectPlatform(genericDag)).toBe('GENERIC');
      const ast = parseWorkflow(genericDag);
      expect(ast.platform).toBe('GENERIC');
      expect(ast.nodeCount).toBe(2);
      expect(ast.connectionCount).toBe(1);
    });

    it('completely unsupported non-DAG object must be handled safely', () => {
      const randomJson = {
        users: [{ name: 'Alice', age: 30 }],
        settings: { theme: 'dark' },
      };
      expect(detectPlatform(randomJson)).toBe('GENERIC');
      expect(() => parseWorkflow(randomJson)).toThrow(/Unsupported workflow format/);
    });
  });

  describe('3. Deeply Nested Secret Extraction Stress-Test', () => {
    const HIGH_ENTROPY_OPENAI_KEY = 'sk-proj-00000000000000000000000000000000';
    const BEARER_TOKEN = 'Bearer eyJ0000000000000000000000000000000000000000';
    const STRIPE_SECRET = 'pd_live_000000000000000000000000';
    const GITHUB_TOKEN = 'ghp_000000000000000000000000000000000000';
    const AWS_KEY = 'AKIA0000000000000000';

    it('LangFlow parser extracts secrets from nested template fields and credentials', () => {
      const payload = {
        data: {
          nodes: [
            {
              id: 'node_1',
              data: {
                node: {
                  template: {
                    openai_api_key: { value: HIGH_ENTROPY_OPENAI_KEY, password: true },
                    custom_header: { value: BEARER_TOKEN },
                  },
                },
              },
            },
          ],
          edges: [],
        },
      };
      const ast = langflowParser.parse(payload);
      expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(2);
      const params = ast.extractedParameters.map((p) => p.value);
      expect(params).toContain(HIGH_ENTROPY_OPENAI_KEY);
      expect(params).toContain(BEARER_TOKEN);
    });

    it('Dify parser extracts secrets from env vars, auth headers, and model configs', () => {
      const payload = {
        app: { mode: 'workflow' },
        workflow: {
          graph: {
            nodes: [
              {
                id: 'http_1',
                type: 'http-request',
                data: {
                  authorization: {
                    type: 'api-key',
                    config: { api_key: STRIPE_SECRET, header: 'Authorization' },
                  },
                },
              },
            ],
            edges: [],
          },
          environment_variables: [
            { name: 'OPENAI_KEY', value: HIGH_ENTROPY_OPENAI_KEY, value_type: 'secret' },
            { name: 'GH_TOKEN', value: GITHUB_TOKEN },
          ],
        },
      };
      const ast = difyParser.parse(payload);
      expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(3);
      const paramKeys = ast.extractedParameters.map((p) => p.key);
      expect(paramKeys).toContain('OPENAI_KEY');
      expect(paramKeys).toContain('GH_TOKEN');
    });

    it('CrewAI parser extracts secrets from agent llm configs and tool parameters', () => {
      const payload = {
        crew: {
          agents: [
            {
              name: 'Coder',
              role: 'Software Engineer',
              llm: {
                model: 'gpt-4o',
                api_key: HIGH_ENTROPY_OPENAI_KEY,
              },
            },
          ],
          tasks: [
            {
              name: 'DeployTask',
              description: 'Deploy with ' + AWS_KEY,
              expected_output: 'Deployed URL',
            },
          ],
        },
      };
      const ast = crewaiParser.parse(payload);
      expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(2);
      expect(ast.nodes.some((n) => n.isAuthenticated)).toBe(true);
    });

    it('AutoGen parser extracts secrets from agent config_list', () => {
      const payload = {
        agents: [
          {
            name: 'Assistant',
            llm_config: {
              config_list: [
                { model: 'gpt-4o', api_key: HIGH_ENTROPY_OPENAI_KEY },
                { model: 'claude-3-sonnet', api_key: GITHUB_TOKEN },
              ],
            },
          },
        ],
      };
      const ast = autogenParser.parse(payload);
      expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(2);
      expect(ast.nodes[0]!.isAuthenticated).toBe(true);
    });

    it('Pipedream parser extracts secrets from step configured_props and authProvisionId', () => {
      const payload = {
        steps: [
          {
            id: 'step1',
            type: 'nodejs',
            configured_props: {
              apiKey: HIGH_ENTROPY_OPENAI_KEY,
              bearerToken: BEARER_TOKEN,
            },
          },
        ],
      };
      const ast = pipedreamParser.parse(payload);
      expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(2);
      expect(ast.nodes[0]!.isAuthenticated).toBe(true);
    });

    it('OpenAI Agents parser extracts secrets from instructions, parameters, and tools', () => {
      const payload = {
        agents: [
          {
            name: 'SupportAgent',
            instructions: 'Use secret key ' + HIGH_ENTROPY_OPENAI_KEY + ' to authenticate',
            tools: [
              {
                type: 'function',
                function: {
                  name: 'fetch_secret',
                  parameters: { token: BEARER_TOKEN },
                },
              },
            ],
          },
        ],
      };
      const ast = openaiAgentsParser.parse(payload);
      expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('4. Deep Nesting and High Volume Scaling', () => {
    it('handles 500-node linear pipeline across all parsers within sub-second time', () => {
      const N = 500;

      // Pipedream 500 steps
      const pipedreamLarge = {
        steps: Array.from({ length: N }, (_, i) => ({
          id: 'step_' + i,
          name: 'Step ' + i,
          type: 'nodejs',
          code: 'console.log(' + i + ');',
        })),
      };
      const pdStart = performance.now();
      const pdAst = pipedreamParser.parse(pipedreamLarge);
      const pdDuration = performance.now() - pdStart;
      expect(pdAst.nodeCount).toBe(N);
      expect(pdAst.connectionCount).toBe(N - 1);
      expect(pdDuration).toBeLessThan(1000);

      // CrewAI 250 agents + 250 tasks
      const crewLarge = {
        crew: {
          agents: Array.from({ length: 250 }, (_, i) => ({
            name: 'Agent_' + i,
            role: 'Role ' + i,
            goal: 'Goal ' + i,
          })),
          tasks: Array.from({ length: 250 }, (_, i) => ({
            name: 'Task_' + i,
            description: 'Task description ' + i,
            agent: 'Agent_' + i,
          })),
        },
      };
      const crewStart = performance.now();
      const crewAst = crewaiParser.parse(crewLarge);
      const crewDuration = performance.now() - crewStart;
      expect(crewAst.nodeCount).toBe(500);
      expect(crewDuration).toBeLessThan(1000);

      // Dify 500 nodes + 499 edges
      const difyLarge = {
        app: { mode: 'workflow' },
        workflow: {
          graph: {
            nodes: Array.from({ length: N }, (_, i) => ({
              id: 'node_' + i,
              type: i === 0 ? 'start' : 'code',
              data: { title: 'Node ' + i },
            })),
            edges: Array.from({ length: N - 1 }, (_, i) => ({
              id: 'edge_' + i,
              source: 'node_' + i,
              target: 'node_' + (i + 1),
            })),
          },
        },
      };
      const difyStart = performance.now();
      const difyAst = difyParser.parse(difyLarge);
      const difyDuration = performance.now() - difyStart;
      expect(difyAst.nodeCount).toBe(N);
      expect(difyAst.connectionCount).toBe(N - 1);
      expect(difyDuration).toBeLessThan(1000);
    });

    it('handles deeply nested object structures (> 15 levels) without stack overflow', () => {
      let nested: Record<string, unknown> = { secret: 'sk-proj-nested1234567890abcdef' };
      for (let i = 0; i < 20; i++) {
        nested = { child: nested, level: i };
      }
      const langflowDeep = {
        data: {
          nodes: [
            {
              id: 'deep_node',
              data: {
                node: {
                  template: {
                    deep_param: { value: nested },
                  },
                },
              },
            },
          ],
          edges: [],
        },
      };
      expect(() => langflowParser.parse(langflowDeep)).not.toThrow();
    });
  });

  describe('5. Downstream V2 Engine Invariant Verification', () => {
    it('all parsed ASTs pass downstream v2 engine evaluation and compute consistent FQI', async () => {
      const workflows: ParsedWorkflow[] = [
        parseWorkflow({
          data: {
            nodes: [{ id: 'lf1', type: 'chatOpenAI', data: { node: { template: { model_name: { value: 'gpt-4' } } } } }],
            edges: [],
          },
        }),
        parseWorkflow({
          app: { name: 'Dify Flow', mode: 'workflow' },
          workflow: {
            graph: {
              nodes: [{ id: 'd1', type: 'llm', data: { model: { name: 'gpt-4o' } } }],
              edges: [],
            },
          },
        }),
        parseWorkflow({
          crew: {
            process: 'sequential',
            agents: [{ name: 'Researcher', role: 'Research', goal: 'Gather data' }],
            tasks: [{ name: 'Task1', description: 'Search', expected_output: 'Summary' }],
          },
        }),
        parseWorkflow({
          agents: [
            { name: 'user_proxy', human_input_mode: 'ALWAYS' },
            { name: 'coder', type: 'AssistantAgent', llm_config: { model: 'gpt-4o' } },
          ],
          groupchat: { max_round: 10 },
        }),
        parseWorkflow({
          triggers: [{ id: 't1', type: 'http', component_id: 'http_webhook' }],
          steps: [{ id: 's1', type: 'nodejs', code: 'export default defineComponent({})' }],
        }),
        parseWorkflow({
          starting_agent: 'Agent1',
          agents: [{ name: 'Agent1', instructions: 'Help user' }],
        }),
      ];

      for (const ast of workflows) {
        const syncResult = runAnalysisSync(ast);
        expect(syncResult).toBeDefined();
        expect(syncResult.fqiScore).toBeGreaterThanOrEqual(0);
        expect(syncResult.fqiScore).toBeLessThanOrEqual(100);
        expect(syncResult.qualityGates).toBeDefined();
        expect(Array.isArray(syncResult.findings)).toBe(true);

        const asyncResult = await runAnalysis(ast);
        expect(asyncResult).toBeDefined();
        expect(asyncResult.fqiScore).toBe(syncResult.fqiScore);
      }
    });
  });
});
