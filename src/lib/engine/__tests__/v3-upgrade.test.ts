/**
 * FlowIntel Comprehensive Engine Upgrade v3.0 Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete test coverage across all 9 requirement areas (R1 through R9):
 *  1. R1: Power Automate Parser & Platform Detection
 *  2. R2: AI Model Cost Registry & CST-004 logic
 *  3. R3: New Security Rules (SEC-036 to SEC-040) & SEC-016 boundary tags
 *  4. R4: New Reliability Rules (REL-031 to REL-034)
 *  5. R5: Penalty Point Normalization & Marketplace Blocking
 *  6. R6: Performance Skip Sets
 *  7. R7: Drift Database Pipeline Integration
 *  8. R8: Multi-Platform Compatibility Rules (CMP-031 to CMP-041)
 *  9. R9: Duplicate Rule Consolidation
 */

// @ts-expect-error Bun test type definitions
import { describe, expect, it } from "bun:test";
import type { NormalNode, ParsedWorkflow } from "@/types";
import { detectPlatform, parseWorkflow, PowerAutomateParser, PARSERS } from "@/lib/parsers";
import { registry } from "../registry";
import {
  AI_ONLY_RULES,
  CODE_ONLY_RULES,
  HTTP_ONLY_RULES,
  executeRules,
  executeSingleRule,
} from "../rule-engine";
import { runAnalysis, runAnalysisSync } from "../analysis-runner";
import { registerAllPacks } from "../rule-packs";

// Ensure all rule packs are registered
registerAllPacks();

// ── Test Helpers & Fixture Builders ──────────────────────────────────────────

function makeNode(overrides: Partial<NormalNode> = {}): NormalNode {
  return {
    id: overrides.id ?? "node-1",
    name: overrides.name ?? "Test Node",
    type: overrides.type ?? "n8n-nodes-base.set",
    parameters: overrides.parameters ?? {},
    credentials: overrides.credentials ?? {},
    isTrigger: overrides.isTrigger ?? false,
    isHttp: overrides.isHttp ?? false,
    isCode: overrides.isCode ?? false,
    isAi: overrides.isAi ?? false,
    isLoop: overrides.isLoop ?? false,
    isBranch: overrides.isBranch ?? false,
    isDelay: overrides.isDelay ?? false,
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<ParsedWorkflow> = {}): ParsedWorkflow {
  const nodes = overrides.nodes ?? [];
  const edges = overrides.edges ?? [];
  return {
    name: overrides.name ?? "Test Workflow",
    description: overrides.description,
    platform: overrides.platform ?? "N8N",
    rawWorkflowName: overrides.rawWorkflowName ?? overrides.name ?? "Test Workflow",
    nodeCount: nodes.length,
    connectionCount: edges.length,
    nodes,
    edges,
    extractedParameters: overrides.extractedParameters ?? [],
    triggerNodes:
      overrides.triggerNodes ??
      nodes
        .filter((n) => n.isTrigger)
        .map((n) => ({
          id: n.id,
          name: n.name,
          type: n.type,
          isAuthenticated: n.isAuthenticated ?? false,
        })),
    integrations: overrides.integrations ?? [],
    httpNodesCount: overrides.httpNodesCount ?? nodes.filter((n) => n.isHttp).length,
    codeNodesCount: overrides.codeNodesCount ?? nodes.filter((n) => n.isCode).length,
    aiNodesCount: overrides.aiNodesCount ?? nodes.filter((n) => n.isAi).length,
    hasWebhooks:
      overrides.hasWebhooks ??
      nodes.some((n) => n.isTrigger && n.type.toLowerCase().includes("webhook")),
    hasSchedules:
      overrides.hasSchedules ??
      nodes.some((n) => n.isTrigger && n.type.toLowerCase().includes("schedule")),
    hasBranches: overrides.hasBranches ?? nodes.some((n) => n.isBranch),
    hasLoops: overrides.hasLoops ?? nodes.some((n) => n.isLoop),
    branchCount: overrides.branchCount ?? nodes.filter((n) => n.isBranch).length,
    loopCount: overrides.loopCount ?? nodes.filter((n) => n.isLoop).length,
    extractedSecretsCount: overrides.extractedSecretsCount ?? 0,
    rawNodes: overrides.rawNodes ?? [],
    rawConnections: overrides.rawConnections ?? {},
    metadata: overrides.metadata ?? {},
    rawJson: overrides.rawJson,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// R1: Power Automate Parser & Platform Detection
// ─────────────────────────────────────────────────────────────────────────────

describe("R1: Power Automate Parser & Platform Detection", () => {
  it("detectPlatform() detects explicit POWER_AUTOMATE and LOGIC_APPS platform strings", () => {
    expect(detectPlatform({ platform: "POWER_AUTOMATE" })).toBe("POWER_AUTOMATE");
    expect(detectPlatform({ platform: "power_automate" })).toBe("POWER_AUTOMATE");
    expect(detectPlatform({ platform: "LOGIC_APPS" })).toBe("POWER_AUTOMATE");
    expect(detectPlatform({ platform: "logic_apps" })).toBe("POWER_AUTOMATE");
  });

  it("detectPlatform() detects Power Automate JSON by $schema", () => {
    const paSchemaJson = {
      $schema:
        "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      actions: {},
      triggers: {},
    };
    expect(detectPlatform(paSchemaJson)).toBe("POWER_AUTOMATE");
  });

  it("detectPlatform() detects Power Automate JSON by definition wrapper structure", () => {
    const paDefinitionJson = {
      definition: {
        $schema:
          "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        triggers: {
          manual: { type: "Request", kind: "Http" },
        },
        actions: {
          Send_email: { type: "ApiConnection" },
        },
      },
    };
    expect(detectPlatform(paDefinitionJson)).toBe("POWER_AUTOMATE");
  });

  it("detectPlatform() detects Power Automate JSON by raw triggers/actions objects", () => {
    const paRawJson = {
      triggers: {
        manual: { type: "Request" },
      },
      actions: {
        Initialize_variable: { type: "InitializeVariable" },
      },
    };
    expect(detectPlatform(paRawJson)).toBe("POWER_AUTOMATE");
  });

  it("PowerAutomateParser is included in PARSERS registry and exported", () => {
    expect(PARSERS.some((p) => p instanceof PowerAutomateParser)).toBe(true);
  });

  it("parseWorkflow() correctly parses a comprehensive Power Automate workflow", () => {
    const fullPowerAutomateJson = {
      $schema:
        "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      description: "Customer Onboarding & AI Triage Flow",
      triggers: {
        When_a_HTTP_request_is_received: {
          type: "Request",
          kind: "Http",
          inputs: {
            method: "POST",
            schema: "https://schema.example.com/payload.json",
          },
        },
      },
      actions: {
        Get_user_profile: {
          type: "ApiConnection",
          inputs: {
            host: {
              connection: {
                name: "shared_office365",
              },
            },
          },
          runAfter: {
            When_a_HTTP_request_is_received: ["Succeeded"],
          },
        },
        Call_OpenAI_Analysis: {
          type: "ApiConnection",
          inputs: {
            host: {
              connection: {
                name: "shared_openai",
              },
            },
            model: "gpt-4o",
          },
          runAfter: {
            Get_user_profile: ["Succeeded"],
          },
        },
        HTTP_Post_Webhook: {
          type: "Http",
          inputs: {
            uri: "https://api.internal.corp/events",
            method: "POST",
          },
          runAfter: {
            Call_OpenAI_Analysis: ["Succeeded"],
          },
        },
        Execute_Script: {
          type: "JavaScriptCode",
          inputs: {
            code: "return { processed: true };",
          },
          runAfter: {
            HTTP_Post_Webhook: ["Succeeded"],
          },
        },
        Evaluate_Risk: {
          type: "If",
          actions: {
            Approve_Action: {
              type: "Compose",
              inputs: { status: "APPROVED" },
            },
          },
          else: {
            actions: {
              Reject_Action: {
                type: "Compose",
                inputs: { status: "REJECTED" },
              },
            },
          },
          runAfter: {
            Execute_Script: ["Succeeded"],
          },
        },
        Batch_Process_Items: {
          type: "Foreach",
          actions: {
            Process_Item: {
              type: "Compose",
            },
          },
          runAfter: {
            Evaluate_Risk: ["Succeeded"],
          },
        },
        Error_Recovery_Handler: {
          type: "Scope",
          actions: {
            Log_Error: {
              type: "Compose",
            },
          },
          runAfter: {
            HTTP_Post_Webhook: ["Failed", "TimedOut"],
          },
        },
      },
    };

    const ast = parseWorkflow(fullPowerAutomateJson);

    expect(ast.platform).toBe("POWER_AUTOMATE");
    expect(ast.name).toBe("Customer Onboarding & AI Triage Flow");
    expect(ast.nodes.length).toBeGreaterThanOrEqual(8);
    expect(ast.triggerNodes.length).toBe(1);
    expect(ast.triggerNodes[0].id).toBe("When_a_HTTP_request_is_received");
    expect(ast.httpNodesCount).toBeGreaterThanOrEqual(2);
    expect(ast.aiNodesCount).toBeGreaterThanOrEqual(1);
    expect(ast.codeNodesCount).toBeGreaterThanOrEqual(1);
    expect(ast.hasBranches).toBe(true);
    expect(ast.hasLoops).toBe(true);

    // Verify runAfter error edge creation
    const errorEdge = ast.edges.find(
      (e) => e.source === "HTTP_Post_Webhook" && e.target === "Error_Recovery_Handler"
    );
    expect(errorEdge).toBeDefined();
    expect(errorEdge?.type).toBe("error");

    // Verify integrations classification
    const office365 = ast.integrations.find((i) => i.name.includes("office365"));
    const openai = ast.integrations.find((i) => i.name.includes("openai"));
    expect(office365).toBeDefined();
    expect(openai).toBeDefined();
    expect(openai?.isAi).toBe(true);
  });

  it("parseWorkflow() error message mentions Power Automate on unsupported formats", () => {
    expect(() => parseWorkflow("invalid-primitive-string")).toThrow(
      /Power Automate/i
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R2: AI Model Cost Registry Modernization & CST-004
// ─────────────────────────────────────────────────────────────────────────────

describe("R2: AI Model Cost Registry Modernization & CST-004", () => {
  const cst004Rule = registry.getRule("CST-004")!;

  it("registry contains CST-004 rule definition", () => {
    expect(cst004Rule).toBeDefined();
    expect(cst004Rule.category).toBe("COST_OPTIMIZATION");
    expect(cst004Rule.severity).toBe("MEDIUM");
    expect(cst004Rule.penaltyPoints).toBe(10);
  });

  it("CST-004 flags expensive frontier models for trivial tasks", () => {
    const expensiveModels = [
      "gpt-4",
      "gpt-4-turbo",
      "gpt-4o",
      "gpt-4.1",
      "claude-3-5-sonnet",
      "claude-3-7-sonnet",
      "claude-4-sonnet",
      "gemini-1.5-pro",
      "gemini-2.0-pro",
      "gemini-2.5-pro",
      "o1",
      "o1-preview",
      "o1-pro",
      "o3",
      "o3-mini",
    ];

    for (const model of expensiveModels) {
      const ast = makeWorkflow({
        aiNodesCount: 1,
        nodes: [
          makeNode({
            id: `ai-${model}`,
            name: `AI-${model}`,
            type: "@n8n/n8n-nodes-langchain.openAi",
            isAi: true,
            parameters: {
              model,
              prompt: "Please summarize this text and classify sentiment as positive or negative.",
            },
          }),
        ],
      });

      const findings = executeSingleRule(ast, cst004Rule);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].ruleId).toBe("CST-004");
      expect(findings[0].penaltyPoints).toBe(10);
    }
  });

  it("CST-004 does NOT flag cheap/cost-effective models for trivial tasks", () => {
    const cheapModels = [
      "gpt-4o-mini",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "claude-3-5-haiku",
      "gemini-1.5-flash",
      "gemini-2.0-flash",
      "gemini-2.5-flash",
      "deepseek-chat",
      "deepseek-v3",
      "deepseek-r1",
      "llama-3.1-8b",
      "llama-3.2-3b",
      "llama-4-scout",
      "mistral-nemo",
      "mistral-small",
    ];

    for (const model of cheapModels) {
      const ast = makeWorkflow({
        aiNodesCount: 1,
        nodes: [
          makeNode({
            id: `ai-${model}`,
            name: `AI-${model}`,
            type: "@n8n/n8n-nodes-langchain.openAi",
            isAi: true,
            parameters: {
              model,
              prompt: "Please summarize this text and classify sentiment as positive or negative.",
            },
          }),
        ],
      });

      const findings = executeSingleRule(ast, cst004Rule);
      expect(findings.length).toBe(0);
    }
  });

  it("CST-004 does NOT flag expensive models used for complex/non-trivial tasks", () => {
    const ast = makeWorkflow({
      aiNodesCount: 1,
      nodes: [
        makeNode({
          id: "ai-complex",
          name: "Complex Reasoning AI",
          type: "@n8n/n8n-nodes-langchain.openAi",
          isAi: true,
          parameters: {
            model: "gpt-4o",
            prompt: "Solve this complex multi-body gravitational physics differential equation system.",
          },
        }),
      ],
    });

    const findings = executeSingleRule(ast, cst004Rule);
    expect(findings.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R3: New Security Rules (SEC-036 to SEC-040) & SEC-016 Boundary Tags
// ─────────────────────────────────────────────────────────────────────────────

describe("R3: New Security Rules (SEC-036 to SEC-040) & SEC-016 boundary tags", () => {
  // SEC-036: SSL/TLS Disabled
  describe("SEC-036: SSL/TLS Certificate Verification Disabled", () => {
    const sec036Rule = registry.getRule("SEC-036")!;

    it("rule definition is registered correctly", () => {
      expect(sec036Rule).toBeDefined();
      expect(sec036Rule.severity).toBe("HIGH");
      expect(sec036Rule.penaltyPoints).toBe(15);
      expect(sec036Rule.marketplaceBlocking).toBe(false);
    });

    it("detects ignoreSslIssues: true", () => {
      const ast = makeWorkflow({
        httpNodesCount: 1,
        nodes: [
          makeNode({
            id: "http-insecure-1",
            type: "n8n-nodes-base.httpRequest",
            isHttp: true,
            parameters: { url: "https://api.example.com", ignoreSslIssues: true },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec036Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("SEC-036");
      expect(findings[0].penaltyPoints).toBe(15);
    });

    it("detects rejectUnauthorized: false inside options", () => {
      const ast = makeWorkflow({
        httpNodesCount: 1,
        nodes: [
          makeNode({
            id: "http-insecure-2",
            type: "n8n-nodes-base.httpRequest",
            isHttp: true,
            parameters: {
              url: "https://api.example.com",
              options: { rejectUnauthorized: false },
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec036Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("SEC-036");
    });

    it("does not fire on secure default TLS settings", () => {
      const ast = makeWorkflow({
        httpNodesCount: 1,
        nodes: [
          makeNode({
            id: "http-secure",
            type: "n8n-nodes-base.httpRequest",
            isHttp: true,
            parameters: {
              url: "https://api.example.com",
              options: { rejectUnauthorized: true },
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec036Rule);
      expect(findings.length).toBe(0);
    });
  });

  // SEC-037: Command Injection in Native Execute/SSH Nodes
  describe("SEC-037: Command Injection in Native Execute/SSH Nodes", () => {
    const sec037Rule = registry.getRule("SEC-037")!;

    it("rule definition is registered correctly (CRITICAL, 30pts, marketplaceBlocking)", () => {
      expect(sec037Rule).toBeDefined();
      expect(sec037Rule.severity).toBe("CRITICAL");
      expect(sec037Rule.penaltyPoints).toBe(30);
      expect(sec037Rule.marketplaceBlocking).toBe(true);
    });

    it("detects unescaped $json variables in executeCommand node", () => {
      const ast = makeWorkflow({
        codeNodesCount: 1,
        nodes: [
          makeNode({
            id: "exec-cmd-1",
            type: "n8n-nodes-base.executeCommand",
            isCode: true,
            parameters: {
              command: "cat /tmp/$json.userFile && ls -la",
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec037Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("SEC-037");
      expect(findings[0].marketplaceBlocking).toBe(true);
      expect(findings[0].penaltyPoints).toBe(30);
    });

    it("detects unescaped dynamic expressions in ssh node", () => {
      const ast = makeWorkflow({
        codeNodesCount: 1,
        nodes: [
          makeNode({
            id: "ssh-node-1",
            type: "n8n-nodes-base.ssh",
            isCode: true,
            parameters: {
              command: "docker run --rm {{$json.imageName}}",
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec037Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("SEC-037");
    });

    it("does not fire on static shell commands", () => {
      const ast = makeWorkflow({
        codeNodesCount: 1,
        nodes: [
          makeNode({
            id: "exec-cmd-static",
            type: "n8n-nodes-base.executeCommand",
            isCode: true,
            parameters: { command: "uptime && df -h" },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec037Rule);
      expect(findings.length).toBe(0);
    });
  });

  // SEC-038: Cloud Metadata Endpoint Access
  describe("SEC-038: Cloud Metadata Endpoint Access", () => {
    const sec038Rule = registry.getRule("SEC-038")!;

    it("rule definition is registered correctly (CRITICAL, 30pts, marketplaceBlocking)", () => {
      expect(sec038Rule).toBeDefined();
      expect(sec038Rule.severity).toBe("CRITICAL");
      expect(sec038Rule.penaltyPoints).toBe(30);
      expect(sec038Rule.marketplaceBlocking).toBe(true);
    });

    it("detects AWS/GCP/Azure IMDS endpoint 169.254.169.254", () => {
      const ast = makeWorkflow({
        httpNodesCount: 1,
        nodes: [
          makeNode({
            id: "http-ssrf-imds",
            type: "n8n-nodes-base.httpRequest",
            isHttp: true,
            httpMeta: { url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/" },
            parameters: { url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/" },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec038Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("SEC-038");
      expect(findings[0].marketplaceBlocking).toBe(true);
      expect(findings[0].penaltyPoints).toBe(30);
    });

    it("detects Google Cloud metadata.google.internal endpoint", () => {
      const ast = makeWorkflow({
        httpNodesCount: 1,
        nodes: [
          makeNode({
            id: "http-ssrf-gcp",
            type: "n8n-nodes-base.httpRequest",
            isHttp: true,
            parameters: {
              url: "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec038Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("SEC-038");
    });

    it("does not fire on standard public URLs", () => {
      const ast = makeWorkflow({
        httpNodesCount: 1,
        nodes: [
          makeNode({
            id: "http-public",
            type: "n8n-nodes-base.httpRequest",
            isHttp: true,
            parameters: { url: "https://api.github.com/repos" },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec038Rule);
      expect(findings.length).toBe(0);
    });
  });

  // SEC-039: Excessive Agency in AI Agent
  describe("SEC-039: Excessive Agency in AI Agent", () => {
    const sec039Rule = registry.getRule("SEC-039")!;

    it("rule definition is registered correctly (HIGH, 20pts)", () => {
      expect(sec039Rule).toBeDefined();
      expect(sec039Rule.severity).toBe("HIGH");
      expect(sec039Rule.penaltyPoints).toBe(20);
      expect(sec039Rule.marketplaceBlocking).toBe(false);
    });

    it("flags AI Agent workflow with unmitigated executeCommand destructive tool", () => {
      const ast = makeWorkflow({
        aiNodesCount: 1,
        codeNodesCount: 1,
        nodes: [
          makeNode({
            id: "agent-1",
            name: "Autonomous Agent",
            type: "@n8n/n8n-nodes-langchain.agent",
            isAi: true,
          }),
          makeNode({
            id: "cmd-1",
            name: "Execute Tool",
            type: "n8n-nodes-base.executeCommand",
            isCode: true,
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec039Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("SEC-039");
      expect(findings[0].penaltyPoints).toBe(20);
    });

    it("flags AI Agent workflow with unmitigated Postgres DELETE operation", () => {
      const ast = makeWorkflow({
        aiNodesCount: 1,
        nodes: [
          makeNode({
            id: "agent-2",
            name: "DB AI Agent",
            type: "@n8n/n8n-nodes-langchain.agent",
            isAi: true,
          }),
          makeNode({
            id: "db-delete",
            name: "Postgres Delete",
            type: "n8n-nodes-base.postgres",
            parameters: { operation: "delete", table: "users" },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec039Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("SEC-039");
    });

    it("does NOT fire when human approval gate (Wait/Approval node) is present", () => {
      const ast = makeWorkflow({
        aiNodesCount: 1,
        codeNodesCount: 1,
        nodes: [
          makeNode({
            id: "agent-approved",
            name: "Guarded Agent",
            type: "@n8n/n8n-nodes-langchain.agent",
            isAi: true,
          }),
          makeNode({
            id: "wait-approval",
            name: "Wait For User Approval",
            type: "n8n-nodes-base.wait",
            parameters: { requireApproval: true },
          }),
          makeNode({
            id: "cmd-exec",
            name: "Execute Command",
            type: "n8n-nodes-base.executeCommand",
            isCode: true,
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec039Rule);
      expect(findings.length).toBe(0);
    });
  });

  // SEC-040 & SEC-016: Prompt Injection & Boundary Isolation Tags
  describe("SEC-040 & SEC-016: Prompt Injection Boundary Isolation", () => {
    const sec040Rule = registry.getRule("SEC-040")!;
    const sec016Rule = registry.getRule("SEC-016")!;

    it("SEC-040 rule definition is registered correctly (MEDIUM, 10pts)", () => {
      expect(sec040Rule).toBeDefined();
      expect(sec040Rule.severity).toBe("MEDIUM");
      expect(sec040Rule.penaltyPoints).toBe(10);
    });

    it("SEC-040 flags dynamic user prompt without boundary tags", () => {
      const ast = makeWorkflow({
        aiNodesCount: 1,
        nodes: [
          makeNode({
            id: "ai-node-raw",
            name: "OpenAI Raw Prompt",
            type: "@n8n/n8n-nodes-langchain.openAi",
            isAi: true,
            parameters: {
              prompt: "Translate the following user query: $json.userInput",
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec040Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("SEC-040");
      expect(findings[0].penaltyPoints).toBe(10);
    });

    it("SEC-040 does NOT flag when boundary tags (<user_input>) are present", () => {
      const ast = makeWorkflow({
        aiNodesCount: 1,
        nodes: [
          makeNode({
            id: "ai-node-tagged",
            name: "OpenAI Tagged Prompt",
            type: "@n8n/n8n-nodes-langchain.openAi",
            isAi: true,
            parameters: {
              prompt: "Translate the following text: <user_input>{{$json.userInput}}</user_input>",
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec040Rule);
      expect(findings.length).toBe(0);
    });

    it("SEC-016 is suppressed when boundary tags (<data>, <user_input>, <context>, [USER_DATA]) are present", () => {
      const tags = ["<data>", "<user_input>", "<context>", "[USER_DATA]"];
      for (const tag of tags) {
        const closingTag = tag.startsWith("[") ? "[/USER_DATA]" : `</${tag.slice(1, -1)}>`;
        const ast = makeWorkflow({
          aiNodesCount: 1,
          nodes: [
            makeNode({
              id: `ai-tagged-${tag}`,
              name: `AI Tagged ${tag}`,
              type: "@n8n/n8n-nodes-langchain.openAi",
              isAi: true,
              parameters: {
                prompt: `Summarize this text: ${tag}$json.userInput${closingTag}`,
              },
            }),
          ],
        });
        const findings = executeSingleRule(ast, sec016Rule);
        expect(findings.length).toBe(0);
      }
    });

    it("SEC-016 fires when neither boundary tags nor strong system guardrails exist", () => {
      const ast = makeWorkflow({
        aiNodesCount: 1,
        nodes: [
          makeNode({
            id: "ai-unguarded",
            name: "AI Unguarded",
            type: "@n8n/n8n-nodes-langchain.openAi",
            isAi: true,
            parameters: {
              prompt: "Process raw user input: $json.userInput",
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, sec016Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("SEC-016");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R4: New Reliability Rules (REL-031 to REL-034)
// ─────────────────────────────────────────────────────────────────────────────

describe("R4: New Reliability Rules (REL-031 to REL-034)", () => {
  // REL-031: Fragile JSON Parsing on LLM Output
  describe("REL-031: Fragile JSON Parsing on LLM Output", () => {
    const rel031Rule = registry.getRule("REL-031")!;

    it("rule definition is registered correctly (HIGH, 15pts)", () => {
      expect(rel031Rule).toBeDefined();
      expect(rel031Rule.severity).toBe("HIGH");
      expect(rel031Rule.penaltyPoints).toBe(15);
    });

    it("flags direct JSON.parse on AI output without markdown fence stripping or try-catch", () => {
      const ast = makeWorkflow({
        aiNodesCount: 1,
        codeNodesCount: 1,
        nodes: [
          makeNode({
            id: "ai-gen",
            name: "LLM Generation",
            type: "@n8n/n8n-nodes-langchain.openAi",
            isAi: true,
          }),
          makeNode({
            id: "code-parser",
            name: "JSON Parse Code Node",
            type: "n8n-nodes-base.code",
            isCode: true,
            codeMeta: {
              language: "javascript",
              codeSnippet: "const parsed = JSON.parse($node['LLM Generation'].json.response); return parsed;",
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, rel031Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("REL-031");
      expect(findings[0].penaltyPoints).toBe(15);
    });

    it("does NOT flag when fence stripping and try-catch are used", () => {
      const ast = makeWorkflow({
        aiNodesCount: 1,
        codeNodesCount: 1,
        nodes: [
          makeNode({
            id: "ai-gen-safe",
            type: "@n8n/n8n-nodes-langchain.openAi",
            isAi: true,
          }),
          makeNode({
            id: "code-parser-safe",
            type: "n8n-nodes-base.code",
            isCode: true,
            codeMeta: {
              language: "javascript",
              codeSnippet: `
                const raw = $node['AI'].json.response;
                try {
                  const cleaned = raw.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
                  return JSON.parse(cleaned);
                } catch (err) {
                  return { error: true, fallback: true };
                }
              `,
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, rel031Rule);
      expect(findings.length).toBe(0);
    });
  });

  // REL-032: Make/PA Error Directive Recognition
  describe("REL-032: Make/PA Error Directive Recognition", () => {
    const rel032Rule = registry.getRule("REL-032")!;

    it("rule definition is registered correctly (INFO, 0pts)", () => {
      expect(rel032Rule).toBeDefined();
      expect(rel032Rule.severity).toBe("INFO");
      expect(rel032Rule.penaltyPoints).toBe(0);
    });

    it("recognizes Make native error directives (BasicBreak, BasicResume, BasicIgnore)", () => {
      const ast = makeWorkflow({
        platform: "MAKE",
        nodes: [
          makeNode({
            id: "make-break",
            name: "Error Break Directive",
            type: "make.module.BasicBreak",
          }),
        ],
      });
      const findings = executeSingleRule(ast, rel032Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("REL-032");
      expect(findings[0].severity).toBe("INFO");
      expect(findings[0].penaltyPoints).toBe(0);
    });

    it("recognizes Power Automate runAfter Failed/TimedOut error handlers", () => {
      const ast = makeWorkflow({
        platform: "POWER_AUTOMATE",
        nodes: [
          makeNode({
            id: "pa-action-catch",
            name: "Catch Handler",
            type: "powerautomate.action.scope",
            parameters: {
              runAfter: {
                PreviousAction: ["Failed", "TimedOut"],
              },
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, rel032Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("REL-032");
      expect(findings[0].penaltyPoints).toBe(0);
    });
  });

  // REL-033: Retry Without Exponential Backoff
  describe("REL-033: Retry Without Exponential Backoff", () => {
    const rel033Rule = registry.getRule("REL-033")!;

    it("rule definition is registered correctly (LOW, 5pts)", () => {
      expect(rel033Rule).toBeDefined();
      expect(rel033Rule.severity).toBe("LOW");
      expect(rel033Rule.penaltyPoints).toBe(5);
    });

    it("flags node with retryOnFail: true but fixed delay (no exponential backoff)", () => {
      const ast = makeWorkflow({
        httpNodesCount: 1,
        nodes: [
          makeNode({
            id: "http-retry-fixed",
            type: "n8n-nodes-base.httpRequest",
            isHttp: true,
            parameters: {
              url: "https://api.example.com",
              retryOnFail: true,
              waitBetweenTries: 2000,
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, rel033Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("REL-033");
      expect(findings[0].penaltyPoints).toBe(5);
    });

    it("does NOT flag node when exponential backoff is enabled", () => {
      const ast = makeWorkflow({
        httpNodesCount: 1,
        nodes: [
          makeNode({
            id: "http-retry-exponential",
            type: "n8n-nodes-base.httpRequest",
            isHttp: true,
            parameters: {
              url: "https://api.example.com",
              retryOnFail: true,
              waitBetweenTriesExponential: true,
            },
          }),
        ],
      });
      const findings = executeSingleRule(ast, rel033Rule);
      expect(findings.length).toBe(0);
    });
  });

  // REL-034: Missing Item-Level Error Isolation in Batch Loop
  describe("REL-034: Missing Item-Level Error Isolation in Batch Loop", () => {
    const rel034Rule = registry.getRule("REL-034")!;

    it("rule definition is registered correctly (MEDIUM, 8pts)", () => {
      expect(rel034Rule).toBeDefined();
      expect(rel034Rule.severity).toBe("MEDIUM");
      expect(rel034Rule.penaltyPoints).toBe(8);
    });

    it("flags batch loop where child action node lacks continueOnFail", () => {
      const ast = makeWorkflow({
        hasLoops: true,
        nodes: [
          makeNode({
            id: "batch-loop-1",
            name: "SplitInBatches Loop",
            type: "n8n-nodes-base.splitInBatches",
            isLoop: true,
          }),
          makeNode({
            id: "http-in-loop",
            name: "Sync To External API",
            type: "n8n-nodes-base.httpRequest",
            isHttp: true,
            parameters: {
              url: "https://api.crm.com/sync",
            },
          }),
        ],
        edges: [
          { source: "SplitInBatches Loop", target: "Sync To External API", type: "main" },
        ],
      });
      const findings = executeSingleRule(ast, rel034Rule);
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe("REL-034");
      expect(findings[0].penaltyPoints).toBe(8);
    });

    it("does NOT flag batch loop when child node has continueOnFail: true", () => {
      const ast = makeWorkflow({
        hasLoops: true,
        nodes: [
          makeNode({
            id: "batch-loop-2",
            name: "SplitInBatches Loop",
            type: "n8n-nodes-base.splitInBatches",
            isLoop: true,
          }),
          makeNode({
            id: "http-in-loop-safe",
            name: "Sync Safe",
            type: "n8n-nodes-base.httpRequest",
            isHttp: true,
            parameters: {
              url: "https://api.crm.com/sync",
              continueOnFail: true,
            },
          }),
        ],
        edges: [
          { source: "SplitInBatches Loop", target: "Sync Safe", type: "main" },
        ],
      });
      const findings = executeSingleRule(ast, rel034Rule);
      expect(findings.length).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R5: Penalty Point Normalization & Marketplace Blocking
// ─────────────────────────────────────────────────────────────────────────────

describe("R5: Penalty Point Normalization & Marketplace Blocking", () => {
  const NORMALIZED_RULES_MAP: Record<string, { expectedPoints: number; isInfo: boolean }> = {
    "PRV-002": { expectedPoints: 15, isInfo: false },
    "PRV-003": { expectedPoints: 12, isInfo: false },
    "PRV-010": { expectedPoints: 15, isInfo: false },
    "PRV-012": { expectedPoints: 12, isInfo: false },
    "PRV-020": { expectedPoints: 12, isInfo: false },
    "REL-003": { expectedPoints: 12, isInfo: false },
    "REL-005": { expectedPoints: 8, isInfo: false },
    "PER-001": { expectedPoints: 6, isInfo: false },
    "PER-003": { expectedPoints: 0, isInfo: true },
    "OBS-001": { expectedPoints: 8, isInfo: false },
    "OBS-003": { expectedPoints: 0, isInfo: true },
    "CST-002": { expectedPoints: 6, isInfo: false },
    "CST-003": { expectedPoints: 0, isInfo: true },
    "IDP-001": { expectedPoints: 15, isInfo: false },
    "IDP-007": { expectedPoints: 12, isInfo: false },
    "IDP-009": { expectedPoints: 12, isInfo: false },
    "IDP-016": { expectedPoints: 12, isInfo: false },
    "MNT-001": { expectedPoints: 6, isInfo: false },
    "CMP-002": { expectedPoints: 12, isInfo: false },
    "CMP-003": { expectedPoints: 0, isInfo: true },
    "CMP-004": { expectedPoints: 12, isInfo: false },
    "CMP-016": { expectedPoints: 12, isInfo: false },
    "CMP-023": { expectedPoints: 12, isInfo: false },
    "DOC-002": { expectedPoints: 6, isInfo: false },
  };

  it("all 24 normalized rules have exact manifest penaltyPoints alignment", () => {
    for (const [ruleId, meta] of Object.entries(NORMALIZED_RULES_MAP)) {
      const rule = registry.getRule(ruleId);
      expect(rule).toBeDefined();
      expect(rule?.penaltyPoints).toBe(meta.expectedPoints);
      if (meta.isInfo) {
        expect(rule?.severity).toBe("INFO");
      }
    }
  });

  it("DOC-004, DOC-005, and DOC-013 have marketplaceBlocking === true", () => {
    const doc004 = registry.getRule("DOC-004")!;
    const doc005 = registry.getRule("DOC-005")!;
    const doc013 = registry.getRule("DOC-013")!;

    expect(doc004).toBeDefined();
    expect(doc004.marketplaceBlocking).toBe(true);

    expect(doc005).toBeDefined();
    expect(doc005.marketplaceBlocking).toBe(true);

    expect(doc013).toBeDefined();
    expect(doc013.marketplaceBlocking).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R6: Performance Skip Sets Implementation
// ─────────────────────────────────────────────────────────────────────────────

describe("R6: Performance Skip Sets", () => {
  it("exports AI_ONLY_RULES, HTTP_ONLY_RULES, and CODE_ONLY_RULES sets with expected rule IDs", () => {
    expect(AI_ONLY_RULES instanceof Set).toBe(true);
    expect(HTTP_ONLY_RULES instanceof Set).toBe(true);
    expect(CODE_ONLY_RULES instanceof Set).toBe(true);

    expect(AI_ONLY_RULES.has("SEC-016")).toBe(true);
    expect(AI_ONLY_RULES.has("CST-004")).toBe(true);
    expect(AI_ONLY_RULES.has("REL-031")).toBe(true);
    expect(AI_ONLY_RULES.has("SEC-039")).toBe(true);
    expect(AI_ONLY_RULES.has("SEC-040")).toBe(true);

    expect(HTTP_ONLY_RULES.has("SEC-003")).toBe(true);
    expect(HTTP_ONLY_RULES.has("SEC-036")).toBe(true);
    expect(HTTP_ONLY_RULES.has("SEC-038")).toBe(true);
    expect(HTTP_ONLY_RULES.has("REL-001")).toBe(true);
    expect(HTTP_ONLY_RULES.has("CMP-019")).toBe(true);

    expect(CODE_ONLY_RULES.has("SEC-008")).toBe(true);
    expect(CODE_ONLY_RULES.has("SEC-037")).toBe(true);
    expect(CODE_ONLY_RULES.has("REL-019")).toBe(true);
  });

  it("executeRules() skips AI_ONLY_RULES when aiNodesCount === 0", () => {
    let aiRuleCalled = false;
    const mockRegistry = {
      getEnabledRules: () => [
        {
          id: "SEC-016",
          name: "Mock Prompt Injection",
          detect: () => {
            aiRuleCalled = true;
            return [];
          },
        },
      ],
    };

    const astNoAi = makeWorkflow({ aiNodesCount: 0, nodes: [makeNode()] });
    executeRules(astNoAi, mockRegistry);
    expect(aiRuleCalled).toBe(false);

    const astWithAi = makeWorkflow({ aiNodesCount: 1, nodes: [makeNode({ isAi: true })] });
    executeRules(astWithAi, mockRegistry);
    expect(aiRuleCalled).toBe(true);
  });

  it("executeRules() skips HTTP_ONLY_RULES when httpNodesCount === 0", () => {
    let httpRuleCalled = false;
    const mockRegistry = {
      getEnabledRules: () => [
        {
          id: "SEC-036",
          name: "Mock SSL Rule",
          detect: () => {
            httpRuleCalled = true;
            return [];
          },
        },
      ],
    };

    const astNoHttp = makeWorkflow({ httpNodesCount: 0, nodes: [makeNode()] });
    executeRules(astNoHttp, mockRegistry);
    expect(httpRuleCalled).toBe(false);

    const astWithHttp = makeWorkflow({ httpNodesCount: 1, nodes: [makeNode({ isHttp: true })] });
    executeRules(astWithHttp, mockRegistry);
    expect(httpRuleCalled).toBe(true);
  });

  it("executeRules() skips CODE_ONLY_RULES when no code nodes exist", () => {
    let codeRuleCalled = false;
    const mockRegistry = {
      getEnabledRules: () => [
        {
          id: "SEC-037",
          name: "Mock Command Injection",
          detect: () => {
            codeRuleCalled = true;
            return [];
          },
        },
      ],
    };

    const astNoCode = makeWorkflow({ codeNodesCount: 0, nodes: [makeNode({ isCode: false })] });
    executeRules(astNoCode, mockRegistry);
    expect(codeRuleCalled).toBe(false);

    const astWithCode = makeWorkflow({ codeNodesCount: 1, nodes: [makeNode({ isCode: true })] });
    executeRules(astWithCode, mockRegistry);
    expect(codeRuleCalled).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R7: Drift Database Pipeline Integration
// ─────────────────────────────────────────────────────────────────────────────

describe("R7: Drift Database Pipeline Integration", () => {
  it("runAnalysis() detects compatibility drift, converts to COMPATIBILITY findings, and populates driftResults", async () => {
    // n8n-nodes-base.function is a documented drift record in drift-database.ts
    const astWithDrift = makeWorkflow({
      platform: "N8N",
      nodes: [
        makeNode({
          id: "func-legacy",
          name: "Legacy Function",
          type: "n8n-nodes-base.function",
        }),
      ],
    });

    const report = await runAnalysis(astWithDrift);

    expect(report.driftResults).toBeDefined();
    expect(report.driftResults!.length).toBeGreaterThan(0);
    expect(report.driftResults!.some((d) => d.record.id === "n8n-function-deprecated")).toBe(true);

    const driftFinding = report.findings.find(
      (f) => f.category === "COMPATIBILITY" && f.id.startsWith("DRIFT-n8n-function-deprecated")
    );
    expect(driftFinding).toBeDefined();
    expect(driftFinding?.ruleName).toContain("Function");
  });

  it("runAnalysisSync() also includes driftResults and COMPATIBILITY drift findings", () => {
    const astWithDrift = makeWorkflow({
      platform: "N8N",
      nodes: [
        makeNode({
          id: "func-legacy-sync",
          name: "Legacy Function Sync",
          type: "n8n-nodes-base.function",
        }),
      ],
    });

    const report = runAnalysisSync(astWithDrift);
    expect(report.driftResults).toBeDefined();
    expect(report.driftResults!.length).toBeGreaterThan(0);
    expect(report.findings.some((f) => f.id.startsWith("DRIFT-"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R8: Multi-Platform Compatibility Rules (CMP-031 to CMP-041)
// ─────────────────────────────────────────────────────────────────────────────

describe("R8: Multi-Platform Compatibility Rules (CMP-031 to CMP-041)", () => {
  // CMP-031: Power Automate Outlook REST v2
  it("CMP-031 flags deprecated Outlook REST v2 and ignores modern Graph endpoints", () => {
    const rule = registry.getRule("CMP-031")!;
    expect(rule).toBeDefined();

    const badAst = makeWorkflow({
      nodes: [
        makeNode({
          parameters: { url: "https://outlook.office.com/api/v2.0/me/messages" },
        }),
      ],
    });
    const goodAst = makeWorkflow({
      nodes: [
        makeNode({
          parameters: { url: "https://graph.microsoft.com/v1.0/me/messages" },
        }),
      ],
    });

    const badFindings = executeSingleRule(badAst, rule);
    const goodFindings = executeSingleRule(goodAst, rule);

    expect(badFindings.length).toBe(1);
    expect(badFindings[0].ruleId).toBe("CMP-031");
    expect(badFindings[0].penaltyPoints).toBe(15);
    expect(goodFindings.length).toBe(0);
  });

  // CMP-032: Power Automate Hardcoded Connection
  it("CMP-032 flags hardcoded connection IDs and passes Connection References", () => {
    const rule = registry.getRule("CMP-032")!;
    expect(rule).toBeDefined();

    const badAst = makeWorkflow({
      nodes: [
        makeNode({
          parameters: {
            host: {
              connection: {
                name: "/subscriptions/12345-6789/resourceGroups/rg/providers/Microsoft.Web/connections/shared-sql",
              },
            },
          },
        }),
      ],
    });
    const goodAst = makeWorkflow({
      nodes: [
        makeNode({
          parameters: {
            host: {
              connectionReference: "@parameters('$connections')['shared_sql']['connectionId']",
            },
          },
        }),
      ],
    });

    expect(executeSingleRule(badAst, rule).length).toBe(1);
    expect(executeSingleRule(goodAst, rule).length).toBe(0);
  });

  // CMP-033: LangFlow Deprecated LangChain Component
  it("CMP-033 flags deprecated LangChain legacy chains", () => {
    const rule = registry.getRule("CMP-033")!;
    expect(rule).toBeDefined();

    const badAst = makeWorkflow({
      nodes: [
        makeNode({
          type: "RetrievalQAChain",
          name: "Doc QA Chain",
        }),
      ],
    });
    const goodAst = makeWorkflow({
      nodes: [
        makeNode({
          type: "langchain.agent.AgentExecutor",
          name: "Modern LCEL Agent",
        }),
      ],
    });

    expect(executeSingleRule(badAst, rule).length).toBe(1);
    expect(executeSingleRule(goodAst, rule).length).toBe(0);
  });

  // CMP-034: Dify Dangling Context Variable Reference
  it("CMP-034 flags Dify variables referencing nonexistent node IDs", () => {
    const rule = registry.getRule("CMP-034")!;
    expect(rule).toBeDefined();

    const badAst = makeWorkflow({
      platform: "DIFY",
      nodes: [
        makeNode({
          id: "node_1",
          parameters: { prompt: "Analyze output from {{#node_missing_99.text#}}" },
        }),
      ],
    });
    const goodAst = makeWorkflow({
      platform: "DIFY",
      nodes: [
        makeNode({
          id: "node_1",
          parameters: { prompt: "Analyze output from {{#node_2.text#}} and {{#sys.query#}}" },
        }),
        makeNode({
          id: "node_2",
        }),
      ],
    });

    expect(executeSingleRule(badAst, rule).length).toBe(1);
    expect(executeSingleRule(goodAst, rule).length).toBe(0);
  });

  // CMP-035: CrewAI Missing expected_output
  it("CMP-035 flags CrewAI task missing expected_output parameter", () => {
    const rule = registry.getRule("CMP-035")!;
    expect(rule).toBeDefined();

    const badAst = makeWorkflow({
      platform: "CREWAI",
      nodes: [
        makeNode({
          id: "task_research",
          type: "crewai.task",
          parameters: { description: "Conduct market research on AI agent platforms" },
        }),
      ],
    });
    const goodAst = makeWorkflow({
      platform: "CREWAI",
      nodes: [
        makeNode({
          id: "task_research",
          type: "crewai.task",
          parameters: {
            description: "Conduct market research on AI agent platforms",
            expected_output: "A structured 5-page markdown summary with financial projections.",
          },
        }),
      ],
    });

    expect(executeSingleRule(badAst, rule).length).toBe(1);
    expect(executeSingleRule(goodAst, rule).length).toBe(0);
  });

  // CMP-036: CrewAI Hierarchical Process Missing Manager
  it("CMP-036 flags hierarchical process without manager LLM/agent (marketplace blocking)", () => {
    const rule = registry.getRule("CMP-036")!;
    expect(rule).toBeDefined();
    expect(rule.marketplaceBlocking).toBe(true);

    const badAst = makeWorkflow({
      platform: "CREWAI",
      metadata: { process: "hierarchical" },
      nodes: [makeNode({ id: "agent_coder", type: "crewai.agent" })],
    });
    const goodAst = makeWorkflow({
      platform: "CREWAI",
      metadata: { process: "hierarchical", manager_llm: "gpt-4o" },
      nodes: [makeNode({ id: "agent_coder", type: "crewai.agent" })],
    });

    expect(executeSingleRule(badAst, rule).length).toBe(1);
    expect(executeSingleRule(goodAst, rule).length).toBe(0);
  });

  // CMP-037: AutoGen Legacy 0.2 Config Incompatible with 0.4+
  it("CMP-037 flags AutoGen 0.2 legacy configs", () => {
    const rule = registry.getRule("CMP-037")!;
    expect(rule).toBeDefined();

    const badAst = makeWorkflow({
      platform: "AUTOGEN",
      nodes: [
        makeNode({
          id: "user_proxy",
          type: "autogen.UserProxyAgent",
          parameters: {
            use_docker: false,
            config_list: [{ model: "gpt-4" }],
          },
        }),
      ],
    });
    const goodAst = makeWorkflow({
      platform: "AUTOGEN",
      nodes: [
        makeNode({
          id: "modern_agent",
          type: "autogen.AssistantAgent",
          parameters: {
            model_client: { model: "gpt-4o" },
          },
        }),
      ],
    });

    expect(executeSingleRule(badAst, rule).length).toBe(1);
    expect(executeSingleRule(goodAst, rule).length).toBe(0);
  });

  // CMP-038: Pipedream Legacy Step Missing defineComponent
  it("CMP-038 flags Pipedream Node.js steps lacking defineComponent()", () => {
    const rule = registry.getRule("CMP-038")!;
    expect(rule).toBeDefined();

    const badAst = makeWorkflow({
      platform: "PIPEDREAM",
      nodes: [
        makeNode({
          id: "custom_code",
          type: "pipedream.step.nodejs",
          isCode: true,
          codeMeta: {
            language: "javascript",
            codeSnippet: "async (event, steps) => { return steps.trigger.event; }",
          },
        }),
      ],
    });
    const goodAst = makeWorkflow({
      platform: "PIPEDREAM",
      nodes: [
        makeNode({
          id: "custom_code_modern",
          type: "pipedream.step.nodejs",
          isCode: true,
          codeMeta: {
            language: "javascript",
            codeSnippet: "export default defineComponent({ async run({ steps, $ }) { return 1; } });",
          },
        }),
      ],
    });

    expect(executeSingleRule(badAst, rule).length).toBe(1);
    expect(executeSingleRule(goodAst, rule).length).toBe(0);
  });

  // CMP-039: Make Legacy Integromat Domain Reference
  it("CMP-039 flags legacy integromat.com domain URLs", () => {
    const rule = registry.getRule("CMP-039")!;
    expect(rule).toBeDefined();

    const badAst = makeWorkflow({
      platform: "MAKE",
      nodes: [
        makeNode({
          parameters: { url: "https://hook.integromat.com/xyz12345" },
        }),
      ],
    });
    const goodAst = makeWorkflow({
      platform: "MAKE",
      nodes: [
        makeNode({
          parameters: { url: "https://hook.make.com/xyz12345" },
        }),
      ],
    });

    expect(executeSingleRule(badAst, rule).length).toBe(1);
    expect(executeSingleRule(goodAst, rule).length).toBe(0);
  });

  // CMP-040: Cross-Platform Deprecated AI Embedding Model
  it("CMP-040 flags deprecated AI models (text-embedding-ada-002, gemini-1.0-pro, mistral-medium)", () => {
    const rule = registry.getRule("CMP-040")!;
    expect(rule).toBeDefined();
    expect(rule.marketplaceBlocking).toBe(true);

    const badAst = makeWorkflow({
      nodes: [
        makeNode({
          aiMeta: { model: "text-embedding-ada-002", hasStructuredOutput: false },
          parameters: { model: "text-embedding-ada-002" },
        }),
      ],
    });
    const goodAst = makeWorkflow({
      nodes: [
        makeNode({
          aiMeta: { model: "text-embedding-3-small", hasStructuredOutput: false },
          parameters: { model: "text-embedding-3-small" },
        }),
      ],
    });

    expect(executeSingleRule(badAst, rule).length).toBe(1);
    expect(executeSingleRule(goodAst, rule).length).toBe(0);
  });

  // CMP-041: n8n Deprecated $items() Expression
  it("CMP-041 flags deprecated $items() expression in parameters and code", () => {
    const rule = registry.getRule("CMP-041")!;
    expect(rule).toBeDefined();

    const badAst = makeWorkflow({
      platform: "N8N",
      nodes: [
        makeNode({
          parameters: { value: "={{ $items('Webhook')[0].json.body }}" },
        }),
      ],
    });
    const goodAst = makeWorkflow({
      platform: "N8N",
      nodes: [
        makeNode({
          parameters: { value: "={{ $('Webhook').all()[0].json.body }}" },
        }),
      ],
    });

    expect(executeSingleRule(badAst, rule).length).toBe(1);
    expect(executeSingleRule(goodAst, rule).length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R9: Duplicate Rule Consolidation
// ─────────────────────────────────────────────────────────────────────────────

describe("R9: Duplicate Rule Consolidation", () => {
  const DISABLED_RULE_IDS = [
    "MNT-001",
    "MNT-002",
    "MNT-003",
    "CST-001",
    "DOC-002",
    "OBS-003",
  ];

  it("all 6 consolidated duplicate rules are disabled (enabled: false)", () => {
    for (const ruleId of DISABLED_RULE_IDS) {
      const rule = registry.getRule(ruleId);
      expect(rule).toBeDefined();
      expect(rule?.enabled).toBe(false);
    }
  });

  it("executeRules() does not produce findings for disabled duplicate rules", () => {
    // Construct a workflow that would match the legacy rules
    const ast = makeWorkflow({
      aiNodesCount: 2,
      nodes: [
        makeNode({ id: "n1", name: "Node 1", type: "n8n-nodes-base.set" }),
        makeNode({ id: "n2", name: "Node 2", type: "n8n-nodes-base.set" }),
      ],
    });

    const findings = executeRules(ast, registry);
    for (const ruleId of DISABLED_RULE_IDS) {
      const found = findings.find((f) => f.ruleId === ruleId);
      expect(found).toBeUndefined();
    }
  });
});
