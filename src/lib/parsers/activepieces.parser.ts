import type { IWorkflowParser, NormalEdge, NormalNode, ParsedWorkflow } from "@/types";
import { flattenParams } from "./normalise";

export class ActivepiecesParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;
    if (obj.platform === "ACTIVEPIECES" || obj.platform === "activepieces") return true;
    if (!obj.trigger || typeof obj.trigger !== "object") return false;
    const trigger = obj.trigger as Record<string, unknown>;
    return (
      typeof trigger.type === "string" &&
      (trigger.nextAction !== undefined ||
        trigger.settings !== undefined ||
        typeof trigger.name === "string" ||
        typeof trigger.displayName === "string")
    );
  }

  parse(json: unknown): ParsedWorkflow {
    const obj = (json && typeof json === "object") ? (json as Record<string, unknown>) : {};
    
    const nodes: NormalNode[] = [];
    const edges: NormalEdge[] = [];
    const extractedParameters: ReturnType<typeof flattenParams> = [];
    const triggerNodes: ParsedWorkflow["triggerNodes"] = [];
    const integrations: ParsedWorkflow["integrations"] = [];
    
    let aiNodesCount = 0;
    let httpNodesCount = 0;
    let codeNodesCount = 0;

    const currentNode = (obj.trigger && typeof obj.trigger === "object") ? (obj.trigger as Record<string, unknown>) : undefined;

    // A queue for processing branches
    const queue: { action: Record<string, unknown>; parentId?: string; branchHandle?: string }[] = [];
    if (currentNode) {
      queue.push({ action: currentNode });
    }

    while (queue.length > 0) {
      const { action, parentId, branchHandle } = queue.shift()!;
      if (!action || typeof action !== "object") continue;

      const id = String(action.name ?? `node_${nodes.length}`);
      const type = String(action.type ?? "PIECE");
      
      const settings = (action.settings && typeof action.settings === "object") ? (action.settings as Record<string, unknown>) : {};
      const pieceName = String(settings.pieceName ?? "");
      const actionName = String(settings.actionName ?? "");
      
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

      if (action.nextAction && typeof action.nextAction === "object") {
        queue.push({ action: action.nextAction as Record<string, unknown>, parentId: id });
      }

      // Handle branches
      if (type === "BRANCH" && action.onSuccessAction && typeof action.onSuccessAction === "object") {
        queue.push({ action: action.onSuccessAction as Record<string, unknown>, parentId: id, branchHandle: "true" });
      }
      if (type === "BRANCH" && action.onFailureAction && typeof action.onFailureAction === "object") {
        queue.push({ action: action.onFailureAction as Record<string, unknown>, parentId: id, branchHandle: "false" });
      }

      // Handle loops
      if (type === "LOOP_ON_ITEMS" && action.firstLoopAction && typeof action.firstLoopAction === "object") {
        queue.push({ action: action.firstLoopAction as Record<string, unknown>, parentId: id, branchHandle: "loop" });
      }
    }

    return {
      name: String(obj.displayName ?? "Activepieces Flow"),
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
      rawNodes: obj.trigger ? [obj.trigger] : [],
      rawConnections: {}
    };
  }
}
