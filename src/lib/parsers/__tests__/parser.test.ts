import { describe, expect, test } from "bun:test";
import { parseWorkflow } from "../index";

describe("Node-RED Parser", () => {
  test("Basic HTTP Flow with HTTP In, Function, HTTP Response", () => {
    const json = [
      { id: "1", type: "http in", name: "GET /api", wires: [["2"]] },
      { id: "2", type: "function", name: "Process", wires: [["3"]] },
      { id: "3", type: "http response", name: "Return", wires: [] }
    ];
    const parsed = parseWorkflow(json);
    expect(parsed.platform).toBe("NODE_RED");
    expect(parsed.nodeCount).toBe(3);
    expect(parsed.connectionCount).toBe(2);
    expect(parsed.httpNodesCount).toBe(2); // http in, http response
    expect(parsed.codeNodesCount).toBe(1); // function
    expect(parsed.aiNodesCount).toBe(0);
    expect(parsed.hasWebhooks).toBe(true);
    expect(parsed.triggerNodes.length).toBe(1);
    expect(parsed.triggerNodes[0].type).toBe("http in");
  });

  test("AI Flow with OpenAI and Branches", () => {
    const json = [
      { id: "1", type: "inject", name: "Start", wires: [["2"]] },
      { id: "2", type: "openai-api", name: "Ask LLM", wires: [["3", "4"]] },
      { id: "3", type: "debug", name: "Success", wires: [] },
      { id: "4", type: "debug", name: "Failure", wires: [] },
      { id: "5", type: "switch", name: "Branching", wires: [[]] }
    ];
    const parsed = parseWorkflow(json);
    expect(parsed.platform).toBe("NODE_RED");
    expect(parsed.nodeCount).toBe(5);
    expect(parsed.connectionCount).toBe(3); // Start -> Ask LLM, Ask LLM -> Success/Failure
    expect(parsed.aiNodesCount).toBe(1);
    expect(parsed.hasBranches).toBe(true);
  });

  test("Complex flat connections", () => {
    const json = [
      { id: "n1", type: "inject", wires: [["n2"], ["n3"]] },
      { id: "n2", type: "template", wires: [["n4"]] },
      { id: "n3", type: "http request", wires: [["n4"]] },
      { id: "n4", type: "debug", wires: [] }
    ];
    const parsed = parseWorkflow(json);
    expect(parsed.platform).toBe("NODE_RED");
    expect(parsed.nodeCount).toBe(4);
    expect(parsed.connectionCount).toBe(4);
    expect(parsed.codeNodesCount).toBe(1); // template
    expect(parsed.httpNodesCount).toBe(1); // http request
  });
});

describe("Activepieces Parser", () => {
  test("Basic Trigger and Action", () => {
    const json = {
      displayName: "Test Flow",
      trigger: {
        name: "trigger_1",
        type: "WEBHOOK_TRIGGER",
        settings: {},
        nextAction: {
          name: "step_1",
          type: "PIECE",
          settings: { pieceName: "@activepieces/piece-http", actionName: "send_request" }
        }
      }
    };
    const parsed = parseWorkflow(json);
    expect(parsed.platform).toBe("ACTIVEPIECES");
    expect(parsed.nodeCount).toBe(2);
    expect(parsed.connectionCount).toBe(1);
    expect(parsed.hasWebhooks).toBe(true);
    expect(parsed.httpNodesCount).toBe(1);
  });

  test("AI Piece and Branching", () => {
    const json = {
      trigger: {
        name: "start",
        type: "PIECE_TRIGGER",
        settings: { pieceName: "@activepieces/piece-schedule" },
        nextAction: {
          name: "ai_step",
          type: "PIECE",
          settings: { pieceName: "@activepieces/piece-openai", actionName: "generate" },
          nextAction: {
            name: "branch_step",
            type: "BRANCH",
            onSuccessAction: {
              name: "success_log",
              type: "CODE"
            }
          }
        }
      }
    };
    const parsed = parseWorkflow(json);
    expect(parsed.platform).toBe("ACTIVEPIECES");
    expect(parsed.nodeCount).toBe(4);
    expect(parsed.connectionCount).toBe(3); // start->ai, ai->branch, branch->success
    expect(parsed.aiNodesCount).toBe(1);
    expect(parsed.codeNodesCount).toBe(1);
    expect(parsed.hasSchedules).toBe(true);
    expect(parsed.hasBranches).toBe(true);
  });

  test("Loops and missing next actions", () => {
    const json = {
      trigger: {
        name: "hook",
        type: "WEBHOOK_TRIGGER",
        nextAction: {
          name: "loop",
          type: "LOOP_ON_ITEMS",
          firstLoopAction: {
            name: "inner_step",
            type: "CODE"
          }
        }
      }
    };
    const parsed = parseWorkflow(json);
    expect(parsed.platform).toBe("ACTIVEPIECES");
    expect(parsed.nodeCount).toBe(3);
    expect(parsed.connectionCount).toBe(2);
    expect(parsed.hasLoops).toBe(true);
    expect(parsed.loopCount).toBe(1);
  });
});
