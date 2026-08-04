import type { IWorkflowParser, ParsedWorkflow } from "@/types";
import { N8nParser } from "./n8n.parser";
import { MakeParser } from "./make.parser";
import { ZapierParser } from "./zapier.parser";
import { FlowiseParser } from "./flowise.parser";

// Parser registry — order matters: most specific detectors first
const parsers: IWorkflowParser[] = [
  new FlowiseParser(),  // Flowise/LangFlow: nodes[] with data.name shape
  new MakeParser(),     // Make: flow[] present, no nodes[]
  new ZapierParser(),   // Zapier: steps[] or node-map
  new N8nParser(),      // n8n: nodes[] + connections{}  (most permissive — last)
];

export function parseWorkflow(json: unknown): ParsedWorkflow {
  for (const parser of parsers) {
    if (parser.supports(json)) return parser.parse(json);
  }
  throw new Error(
    "Unsupported workflow format. Supported platforms: n8n, Make (Integromat), Zapier, and Flowise/LangFlow."
  );
}

export { N8nParser, MakeParser, ZapierParser, FlowiseParser };
