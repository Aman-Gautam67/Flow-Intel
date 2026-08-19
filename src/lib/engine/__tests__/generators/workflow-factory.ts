import type { N8nWorkflowJson, N8nNode } from "@/types";

export interface GeneratedTestCase {
  name: string;
  json: N8nWorkflowJson; // currently supporting n8n format
  expectedPasses: string[];
  expectedViolations: string[];
}

export class WorkflowFactory {
  /**
   * Generates a base N8N synthetic workflow skeleton.
   */
  static createN8nBase(name = "Synthetic Workflow"): N8nWorkflowJson {
    return {
      name,
      nodes: [],
      connections: {},
      settings: {},
    };
  }

  static addNode(wf: N8nWorkflowJson, node: N8nNode) {
    if (!wf.nodes) wf.nodes = [];
    wf.nodes.push(node);
    return wf;
  }

  static addConnection(wf: N8nWorkflowJson, source: string, target: string, sourcePort = 0, targetPort = 0) {
    if (!wf.connections) wf.connections = {};
    if (!wf.connections[source]) {
      // Create 'main' handle map
      (wf.connections as any)[source] = { main: [] };
    }
    
    // Ensure array index exists
    const mainArr = (wf.connections as any)[source]["main"] as any[];
    while (mainArr.length <= sourcePort) {
      mainArr.push([]);
    }
    
    mainArr[sourcePort].push({
      node: target,
      type: "main",
      index: targetPort,
    });
    
    return wf;
  }
}

export class ContextMutator {
  /**
   * Injects a raw hardcoded token deeply into parameters.
   * Useful for testing SEC-002 fallback resolving.
   */
  static injectHiddenAuth(node: N8nNode): N8nNode {
    node.parameters = node.parameters || {};
    node.parameters.deepNested = {
      options: {
        advanced: {
          headers: {
            Authorization: "Bearer hardcoded_token_123"
          }
        }
      }
    };
    return node;
  }

  /**
   * Injects an expression token, simulating secure dynamic resolution.
   */
  static injectDynamicAuth(node: N8nNode): N8nNode {
    node.parameters = node.parameters || {};
    node.parameters.authentication = "={{ $env.API_KEY }}";
    return node;
  }

  /**
   * Injects documentation into root staticData instead of root workflow description.
   * Useful for testing DOC-001 fallback.
   */
  static injectRootReadme(wf: N8nWorkflowJson, docString = "Valid documentation notes for a very complex Pharma Cold Chain workflow"): N8nWorkflowJson {
    (wf as any).staticData = { README: docString };
    return wf;
  }
}

export class TopologyMutator {
  /**
   * Wires node A to node B and node B back to node A.
   * Useful for testing graph cycles.
   */
  static makeCyclic(wf: N8nWorkflowJson, nodeA: string, nodeB: string) {
    WorkflowFactory.addConnection(wf, nodeA, nodeB);
    WorkflowFactory.addConnection(wf, nodeB, nodeA);
    return wf;
  }

  /**
   * Wires a source node to many target nodes.
   */
  static makeFanOut(wf: N8nWorkflowJson, source: string, targets: string[]) {
    targets.forEach(t => WorkflowFactory.addConnection(wf, source, t));
    return wf;
  }
}
