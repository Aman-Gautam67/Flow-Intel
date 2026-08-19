import type { IWorkflowParser, NormalEdge, NormalNode, ParsedWorkflow } from "@/types";
import { flattenParams } from "./normalise";

export class NodeRedParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!Array.isArray(json)) return false;
    // Node-RED is an array of nodes, each needs an id, type, wires
    return json.some((n: unknown) => Boolean(n && typeof n === "object" && typeof (n as Record<string, unknown>).id === "string" && typeof (n as Record<string, unknown>).type === "string" && Array.isArray((n as Record<string, unknown>).wires)));
  }

  parse(json: unknown): ParsedWorkflow {
    const rawNodes = Array.isArray(json) ? json : [];
    
    const nodes: NormalNode[] = [];
    const edges: NormalEdge[] = [];
    const extractedParameters: ReturnType<typeof flattenParams> = [];
    const triggerNodes: ParsedWorkflow["triggerNodes"] = [];
    const integrations: ParsedWorkflow["integrations"] = [];
    
    let aiNodesCount = 0;
    let httpNodesCount = 0;
    let codeNodesCount = 0;

    for (const n of rawNodes) {
      if (!n || typeof n !== "object" || typeof n.id !== "string" || typeof n.type !== "string") continue;

      const typeLower = n.type.toLowerCase();
      const isAi = typeLower.includes("openai") || typeLower.includes("anthropic") || typeLower.includes("langchain");
      const isHttp = typeLower === "http request" || typeLower === "http in" || typeLower === "http response";
      const isCode = typeLower === "function" || typeLower === "template";
      const isTrigger = typeLower === "inject" || typeLower === "http in" || typeLower.endsWith(" in"); // heuristically identify triggers

      if (isAi) aiNodesCount++;
      if (isHttp) httpNodesCount++;
      if (isCode) codeNodesCount++;
      
      const parameters = { ...n };
      delete parameters.id;
      delete parameters.type;
      delete parameters.name;
      delete parameters.wires;
      delete parameters.x;
      delete parameters.y;
      delete parameters.z;

      const credentials = {};

      const node: NormalNode = {
        id: n.id,
        name: n.name || n.type,
        type: n.type,
        parameters,
        credentials,
        isTrigger,
        isHttp,
        isCode,
        isAi,
        isLoop: false, // difficult to detect in flat graph without cyclic traversal
        isBranch: typeLower === "switch",
        isDelay: typeLower === "delay",
      };

      if (isTrigger) {
        triggerNodes.push({ id: node.id, name: node.name, type: node.type, isAuthenticated: false });
      }

      nodes.push(node);
      extractedParameters.push(...flattenParams(node.id, parameters));

      if (Array.isArray(n.wires)) {
        for (let portIndex = 0; portIndex < n.wires.length; portIndex++) {
          const targets = n.wires[portIndex];
          if (Array.isArray(targets)) {
            for (const targetId of targets) {
              if (typeof targetId === "string") {
                edges.push({
                  source: n.id,
                  target: targetId,
                  sourceHandle: portIndex.toString()
                });
              }
            }
          }
        }
      }
    }

    return {
      name: "Node-RED Flow",
      platform: "NODE_RED",
      nodeCount: nodes.length,
      connectionCount: edges.length,
      nodes,
      edges,
      extractedParameters,
      triggerNodes,
      integrations,
      httpNodesCount,
      codeNodesCount,
      aiNodesCount,
      hasWebhooks: nodes.some(n => n.type === "http in"),
      hasSchedules: nodes.some(n => n.type === "inject" && n.parameters?.repeat),
      hasBranches: nodes.some(n => n.isBranch),
      hasLoops: false,
      branchCount: nodes.filter(n => n.isBranch).length,
      loopCount: 0,
      extractedSecretsCount: 0,
      rawNodes,
      rawConnections: {}
    };
  }
}
