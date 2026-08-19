import type { IWorkflowParser, ParsedWorkflow, Platform } from "@/types";
import { DifyParser } from "./dify.parser";
import { CrewAiParser } from "./crewai.parser";
import { AutoGenParser } from "./autogen.parser";
import { OpenAiAgentsParser } from "./openai-agents.parser";
import { PipedreamParser } from "./pipedream.parser";
import { LangflowParser } from "./langflow.parser";
import { FlowiseParser } from "./flowise.parser";
import { MakeParser } from "./make.parser";
import { ZapierParser } from "./zapier.parser";
import { AirflowParser } from "./airflow.parser";
import { PrefectParser } from "./prefect.parser";
import { NodeRedParser } from "./node-red.parser";
import { ActivepiecesParser } from "./activepieces.parser";
import { PowerAutomateParser } from "./power-automate.parser";
import { N8nParser } from "./n8n.parser";
import { GenericParser } from "./generic.parser";

import { DeepContextResolver } from "@/lib/engine/deep-context";
import { buildConnectionGraph } from "@/lib/engine/graph";

// Parser registry — order matters: most specific detectors first.
export const PARSERS: IWorkflowParser[] = [
  new DifyParser(),          // Dify DSL (app.mode, workflow.graph.nodes, dsl_version)
  new CrewAiParser(),        // CrewAI (agents[] + tasks[] or crew{})
  new AutoGenParser(),       // AutoGen (UserProxyAgent, AssistantAgent, llm_config, groupchat)
  new OpenAiAgentsParser(),  // OpenAI Agents / Swarm (instructions + handoffs/functions)
  new PipedreamParser(),     // Pipedream (steps[] with namespace/configured_props/triggers)
  new LangflowParser(),      // LangFlow (data.node.template, ReactFlow component graph)
  new FlowiseParser(),       // Flowise (data.name, baseClasses, Flowise ReactFlow)
  new PowerAutomateParser(), // Power Automate / Logic Apps (definition.triggers/actions, runAfter)
  new MakeParser(),          // Make (flow[] present, no nodes[])
  new ZapierParser(),        // Zapier (steps[] or node-map)
  new AirflowParser(),       // Airflow (dag_id + tasks[])
  new PrefectParser(),       // Prefect (type:"flow" or flow_run shape)
  new NodeRedParser(),       // Node-RED (array of nodes with id, type, wires)
  new ActivepiecesParser(),  // Activepieces (trigger node with nextAction/settings)
  new N8nParser(),           // n8n (nodes[] + connections{}) — permissive before generic
  new GenericParser(),       // Generic DAG fallback: any nodes/tasks/steps/jobs array
];

export const parsers = PARSERS;

export function detectPlatform(json: unknown): Platform {
  if (!json || typeof json !== "object") return "GENERIC";
  const obj = json as Record<string, unknown>;

  // Check explicit platform tag
  if (typeof obj.platform === "string") {
    const p = obj.platform.toUpperCase();
    if (
      p === "N8N" ||
      p === "MAKE" ||
      p === "ZAPIER" ||
      p === "FLOWISE" ||
      p === "LANGFLOW" ||
      p === "AIRFLOW" ||
      p === "PREFECT" ||
      p === "DAGSTER" ||
      p === "GENERIC" ||
      p === "NODE_RED" ||
      p === "ACTIVEPIECES" ||
      p === "DIFY" ||
      p === "CREWAI" ||
      p === "AUTOGEN" ||
      p === "PIPEDREAM" ||
      p === "OPENAI_AGENTS" ||
      p === "SWARM" ||
      p === "POWER_AUTOMATE" ||
      p === "LOGIC_APPS"
    ) {
      if (p === "SWARM") return "OPENAI_AGENTS";
      if (p === "LOGIC_APPS") return "POWER_AUTOMATE";
      return p as Platform;
    }
  }

  for (const parser of PARSERS) {
    if (parser.supports(json)) {
      if (parser instanceof DifyParser) return "DIFY";
      if (parser instanceof CrewAiParser) return "CREWAI";
      if (parser instanceof AutoGenParser) return "AUTOGEN";
      if (parser instanceof OpenAiAgentsParser) return "OPENAI_AGENTS";
      if (parser instanceof PipedreamParser) return "PIPEDREAM";
      if (parser instanceof LangflowParser) return "LANGFLOW";
      if (parser instanceof FlowiseParser) return "FLOWISE";
      if (parser instanceof PowerAutomateParser) return "POWER_AUTOMATE";
      if (parser instanceof MakeParser) return "MAKE";
      if (parser instanceof ZapierParser) return "ZAPIER";
      if (parser instanceof AirflowParser) return "AIRFLOW";
      if (parser instanceof PrefectParser) return "PREFECT";
      if (parser instanceof NodeRedParser) return "NODE_RED";
      if (parser instanceof ActivepiecesParser) return "ACTIVEPIECES";
      if (parser instanceof N8nParser) return "N8N";
      if (parser instanceof GenericParser) return "GENERIC";
    }
  }

  return "GENERIC";
}

export function parseWorkflow(json: unknown): ParsedWorkflow {
  for (const parser of PARSERS) {
    if (parser.supports(json)) {
      const ast = parser.parse(json);
      ast.rawJson = json;

      if (process.env.DISABLE_DEEP_CONTEXT !== "true") {
        try {
          ast.__deepContext = DeepContextResolver.resolve(json, ast);
          ast.__graph = buildConnectionGraph(ast.rawConnections, ast.nodes, ast.edges);
        } catch (err) {
          console.warn("[ParseWorkflow] Pre-processing context resolution error:", err);
        }
      }

      return ast;
    }
  }
  throw new Error(
    "Unsupported workflow format. Supported platforms: n8n, Make (Integromat), Zapier, " +
    "Flowise, LangFlow, Dify, CrewAI, AutoGen, Pipedream, OpenAI Agents / Swarm, " +
    "Apache Airflow, Prefect, Node-RED, Activepieces, Power Automate, or any DAG JSON."
  );
}

export {
  N8nParser,
  MakeParser,
  ZapierParser,
  FlowiseParser,
  LangflowParser,
  AirflowParser,
  PrefectParser,
  NodeRedParser,
  ActivepiecesParser,
  DifyParser,
  CrewAiParser,
  AutoGenParser,
  PipedreamParser,
  OpenAiAgentsParser,
  PowerAutomateParser,
  GenericParser,
};
