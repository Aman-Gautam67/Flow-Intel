import type { IWorkflowParser, ParsedWorkflow } from "@/types";
import { N8nParser }    from "./n8n.parser";
import { MakeParser }   from "./make.parser";
import { ZapierParser } from "./zapier.parser";
import { FlowiseParser } from "./flowise.parser";
import { AirflowParser } from "./airflow.parser";
import { PrefectParser } from "./prefect.parser";
import { GenericParser } from "./generic.parser";

import { NodeRedParser } from "./node-red.parser";
import { ActivepiecesParser } from "./activepieces.parser";

// Parser registry — order matters: most specific detectors first.
// Airflow and Prefect have strong discriminating fields (dag_id, type:"flow")
// so they are safe before the permissive n8n / generic fallbacks.
const parsers: IWorkflowParser[] = [
  new FlowiseParser(),  // Flowise/LangFlow: nodes[] with data.name shape
  new MakeParser(),     // Make: flow[] present, no nodes[]
  new ZapierParser(),   // Zapier: steps[] or node-map
  new AirflowParser(),  // Airflow: dag_id + tasks[]
  new PrefectParser(),  // Prefect: type:"flow" or flow_run shape
  new NodeRedParser(),  // Node-RED: array of nodes with id, type, wires
  new ActivepiecesParser(), // Activepieces: trigger node with nextAction/settings
  new N8nParser(),      // n8n: nodes[] + connections{}  (permissive — before generic)
  new GenericParser(),  // Generic DAG fallback: any nodes/tasks/steps/jobs array
];

export function parseWorkflow(json: unknown): ParsedWorkflow {
  for (const parser of parsers) {
    if (parser.supports(json)) return parser.parse(json);
  }
  throw new Error(
    "Unsupported workflow format. Supported platforms: n8n, Make (Integromat), Zapier, " +
    "Flowise/LangFlow, Apache Airflow, Prefect, or any JSON with nodes/tasks/steps/jobs arrays."
  );
}

export { N8nParser, MakeParser, ZapierParser, FlowiseParser, AirflowParser, PrefectParser, GenericParser };
