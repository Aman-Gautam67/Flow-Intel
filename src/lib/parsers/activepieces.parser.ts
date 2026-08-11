import type { IWorkflowParser, NormalEdge, NormalNode, ParsedWorkflow } from "@/types";
import { flattenParams } from "./normalise";

export class ActivepiecesParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as any;
    return obj.trigger && typeof obj.trigger.name === "string" && typeof obj.trigger.type === "string" && 
           (obj.trigger.nextAction || obj.trigger.settings);
  }

  parse(json: unknown): ParsedWorkflow {
    const obj = json as any;
    
    const nodes: NormalNode[] = [];
    const edges: NormalEdge[] = [];
    let extractedParameters: any[] = [];
    const triggerNodes: any[] = [];
    const integrations: any[] = [];
    
    let aiNodesCount = 0;
    let httpNodesCount = 0;
    let codeNodesCount = 0;

    let currentNode = obj.trigger;

    // A queue for processing branches
    const queue: { action: any; parentId?: string; branchHandle?: string }[] = [];
    if (currentNode) {
      queue.push({ action: currentNode });
    }

    while (queue.length > 0) {
      const { action, parentId, branchHandle } = queue.shift()!;
      if (!action) continue;

      const id = action.name || `node_${nodes.length}`;
      const type = action.type;
      
      const settings = action.settings || {};
      const pieceName = settings.pieceName || "";
      const actionName = settings.actionName || "";
      
      const pieceNameLower = pieceName.toLowerCase();
      const actionNameLower = actionName.toLowerCase();
      
      const isAi = pieceNameLower.includes("openai") || pieceNameLower.includes("anthropic") || pieceNameLower.includes("langchain");
      const isHttp = pieceName === "@activepieces/piece-http" || actionNameLower.includes("http");
      const isCode = type === "CODE";
      const isTrigger = type === "PIECE_TRIGGER" || type === "WEBHOOK_TRIGGER";

      if (isAi) aiNodesCount++;
      if (isHttp) httpNodesCount++;
      if (isCode) codeNodesCount++;

      if (parentId) {
        edges.push({
          source: parentId,
          target: id,
          sourceHandle: branchHandle || "main"
        });
      }

      const parameters = { ...settings };

      const node: NormalNode = {
        id,
        name: id,
        type: pieceName ? `${pieceName}:${actionName || type}` : type,
        parameters,
        credentials: {},
        isTrigger,
        isHttp,
        isCode,
        isAi,
        isLoop: type === "LOOP_ON_ITEMS",
        isBranch: type === "BRANCH",
        isDelay: pieceName === "@activepieces/piece-delay",
      };

      if (isTrigger) {
        triggerNodes.push({ id: node.id, name: node.name, type: node.type, isAuthenticated: false });
      }

      nodes.push(node);
      extractedParameters.push(...flattenParams(node.id, parameters));

      if (action.nextAction) {
        queue.push({ action: action.nextAction, parentId: id });
      }

      // Handle branches
      if (type === "BRANCH" && action.onSuccessAction) {
        queue.push({ action: action.onSuccessAction, parentId: id, branchHandle: "true" });
      }
      if (type === "BRANCH" && action.onFailureAction) {
        queue.push({ action: action.onFailureAction, parentId: id, branchHandle: "false" });
      }

      // Handle loops
      if (type === "LOOP_ON_ITEMS" && action.firstLoopAction) {
        queue.push({ action: action.firstLoopAction, parentId: id, branchHandle: "loop" });
      }
    }

    return {
      name: obj.displayName || "Activepieces Flow",
      platform: "ACTIVEPIECES",
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
      hasWebhooks: nodes.some(n => n.type.includes("WEBHOOK")),
      hasSchedules: nodes.some(n => n.type.includes("schedule")),
      hasBranches: nodes.some(n => n.isBranch),
      hasLoops: nodes.some(n => n.isLoop),
      branchCount: nodes.filter(n => n.isBranch).length,
      loopCount: nodes.filter(n => n.isLoop).length,
      extractedSecretsCount: 0,
      rawNodes: [obj.trigger],
      rawConnections: {}
    };
  }
}
