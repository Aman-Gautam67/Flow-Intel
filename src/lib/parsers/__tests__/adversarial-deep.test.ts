// @ts-expect-error Bun test type definitions
import { describe, expect, it } from 'bun:test';
import {
  detectPlatform,
  LangflowParser,
  DifyParser,
  CrewAiParser,
  AutoGenParser,
  PipedreamParser,
  OpenAiAgentsParser,
} from '../index';

describe('Adversarial Deep Stress and Vulnerability Suite', () => {
  const langflow = new LangflowParser();
  const dify = new DifyParser();
  const crewai = new CrewAiParser();
  const autogen = new AutoGenParser();
  const pipedream = new PipedreamParser();
  const openaiAgents = new OpenAiAgentsParser();

  describe('A. Null/Corrupted Array Elements Inside Valid Envelopes', () => {
    it('LangFlow: survives valid envelopes', () => {
      const payload = {
        data: {
          nodes: [{ id: 'valid_1', data: { node: { template: {} } } }],
          edges: [{ source: 'valid_1', target: 'non_existent', sourceHandle: null }],
        },
      };
      expect(langflow.supports(payload)).toBe(true);
      const ast = langflow.parse(payload);
      expect(ast.platform).toBe('LANGFLOW');
      expect(ast.nodeCount).toBe(1);
    });

    it('Dify: survives valid envelopes', () => {
      const payload = {
        app: { mode: 'workflow' },
        workflow: {
          graph: {
            nodes: [
              { id: 'n1', type: 'llm' },
              { id: 'n2', data: { type: 'code' } },
            ],
            edges: [{ source: 'n1', target: 'n2' }],
          },
          environment_variables: [{ name: 'V1', value: 'secret' }],
        },
      };
      expect(dify.supports(payload)).toBe(true);
      const ast = dify.parse(payload);
      expect(ast.platform).toBe('DIFY');
    });

    it('CrewAI: survives valid crew configs', () => {
      const payload = {
        crew: {
          agents: [{ name: 'A1', role: 'Dev', tools: ['Tool1'] }],
          tasks: [{ name: 'T1', description: 'Do work', tools: [] }],
        },
      };
      expect(crewai.supports(payload)).toBe(true);
      const ast = crewai.parse(payload);
      expect(ast.platform).toBe('CREWAI');
    });

    it('AutoGen: survives valid autogen configs', () => {
      const payload = {
        agents: [
          {
            name: 'A1',
            llm_config: {
              config_list: [{ model: 'gpt-4o' }],
            },
          },
        ],
        groupchat: { agents: ['A1'] },
      };
      expect(autogen.supports(payload)).toBe(true);
      const ast = autogen.parse(payload);
      expect(ast.platform).toBe('AUTOGEN');
    });

    it('Pipedream: survives valid pipedream configs', () => {
      const payload = {
        triggers: [{ id: 't1', component_id: 'http' }],
        steps: [{ id: 's1', type: 'nodejs', code: 'return true;' }],
      };
      expect(pipedream.supports(payload)).toBe(true);
      const ast = pipedream.parse(payload);
      expect(ast.platform).toBe('PIPEDREAM');
    });

    it('OpenAI Agents: survives valid swarm configs', () => {
      const payload = {
        starting_agent: 'A1',
        agents: [
          {
            name: 'A1',
            instructions: 'test',
            functions: [],
            tools: ['tool_name'],
            handoffs: ['A2'],
          },
        ],
      };
      expect(openaiAgents.supports(payload)).toBe(true);
      const ast = openaiAgents.parse(payload);
      expect(ast.platform).toBe('OPENAI_AGENTS');
    });
  });

  describe('B. ReDoS and Long String Stress Testing', () => {
    it('handles long input strings (100,000 chars) in parameters without hanging or TLE', () => {
      const longA = 'a'.repeat(100000);
      const longPayload = {
        data: {
          nodes: [
            {
              id: 'n1',
              data: {
                node: {
                  template: {
                    huge_field: { value: longA },
                  },
                },
              },
            },
          ],
          edges: [],
        },
      };

      const start = performance.now();
      const ast = langflow.parse(longPayload);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
      expect(ast.extractedSecretsCount).toBe(0);
    });

    it('handles repetitive delimiter attacks against secret scanner regexes', () => {
      const evilDelimiters = 'api_key: = = = " \ '.repeat(5000) + 'sk-proj-validsecret1234567890';
 const payload = {
 steps: [
 {
 id: 's1',
 type: 'nodejs',
 code: evilDelimiters,
 },
 ],
 };
 const start = performance.now();
 const ast = pipedream.parse(payload);
 const elapsed = performance.now() - start;
 expect(elapsed).toBeLessThan(500);
 expect(ast.extractedSecretsCount).toBeGreaterThanOrEqual(1);
 });
 });

 describe('C. Cross-Platform Non-Collision Matrix (15 Parsers)', () => {
 const matrix = [
 { name: 'LangFlow', json: { data: { nodes: [{ data: { node_type: 'ChatOpenAI' } }] } }, expected: 'LANGFLOW' },
 { name: 'Dify', json: { app: { mode: 'workflow' }, workflow: { graph: { nodes: [] } } }, expected: 'DIFY' },
 { name: 'CrewAI', json: { crew: { agents: [{ role: 'Tester' }], tasks: [] } }, expected: 'CREWAI' },
 { name: 'AutoGen', json: { agents: [{ name: 'A', human_input_mode: 'NEVER' }] }, expected: 'AUTOGEN' },
 { name: 'Pipedream', json: { triggers: [{ component_id: 'http' }] }, expected: 'PIPEDREAM' },
 { name: 'OpenAI Agents', json: { starting_agent: 'Main', agents: [{ name: 'Main', instructions: 'Hi' }] }, expected: 'OPENAI_AGENTS' },
 { name: 'Flowise', json: { nodes: [{ id: '1', data: { name: 'chatOpenAI', category: 'Chat Models', baseClasses: ['BaseChatModel'] } }] }, expected: 'FLOWISE' },
 { name: 'Make', json: { flow: [{ id: 1, module: 'json:ParseJSON' }] }, expected: 'MAKE' },
 { name: 'Zapier', json: { steps: [{ id: '1', type: 'action', app: 'slack' }] }, expected: 'ZAPIER' },
 { name: 'Airflow', json: { dag_id: 'sample_dag', tasks: [{ task_id: 't1' }] }, expected: 'AIRFLOW' },
 { name: 'Prefect', json: { type: 'flow', flow_run: { name: 'run1' } }, expected: 'PREFECT' },
 { name: 'Node-RED', json: [{ id: 'n1', type: 'tab' }, { id: 'n2', type: 'http in', wires: [['n3']] }], expected: 'NODE_RED' },
 { name: 'Activepieces', json: { trigger: { type: 'WEBHOOK', nextAction: { name: 'act' } } }, expected: 'ACTIVEPIECES' },
 { name: 'n8n', json: { nodes: [{ name: 'Start', type: 'n8n-nodes-base.start' }], connections: {} }, expected: 'N8N' },
 { name: 'Generic DAG', json: { pipeline: 'custom', jobs: [{ id: 'j1', name: 'build' }] }, expected: 'GENERIC' },
 ];

 for (const item of matrix) {
 it('accurately routes authentic ' + item.name + ' payload to ' + item.expected, () => {
 const detected = detectPlatform(item.json);
 expect(detected).toBe(item.expected);
 });
 }
 });
});
