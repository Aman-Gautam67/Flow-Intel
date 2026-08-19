/**
 * Microsoft Power Automate & Azure Logic Apps Workflow Parser
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses Power Automate cloud flow definitions and Logic Apps workflow JSONs:
 *   - Schema: Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json
 *   - Triggers: Request, Recurrence, ApiConnectionWebhook, OpenApiConnection, Manual
 *   - Actions: Http, If, Scope, Foreach, Switch, ParseJson, Compose, ApiConnection
 *   - Graph Edges: Built from `runAfter` dependency maps with condition status handles
 */

import type {
  ExtractedParam,
  IWorkflowParser,
  NormalEdge,
  NormalNode,
  ParsedWorkflow,
} from "@/types";
import { flattenParams } from "./normalise";

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/,
  /eyJ[A-Za-z0-9+/]{20,}/,
  /sk-[A-Za-z0-9_\-]{16,}/,
  /sk-proj-[A-Za-z0-9\-_]{16,}/,
  /AIza[A-Za-z0-9\-_]{35}/,
  /[Aa][Pp][Ii][_-]?[Kk][Ee][Yy]\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/,
  /[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]\s*[:=]\s*["'][^"']{6,}/,
  /[Ss][Ee][Cc][Rr][Ee][Tt]\s*[:=]\s*["'][^"']{8,}/,
  /xox[baprs]-[A-Za-z0-9\-]{10,}/,
  /ghp_[A-Za-z0-9]{36}/,
  /AKIA[0-9A-Z]{16}/,
  /pd_live_[A-Za-z0-9_\-]{16,}/,
];

// Integration classification for Power Automate / Logic Apps
const KNOWN_PA_CONNECTORS: Record<string, { category: string; isAi: boolean; vendorType: "saas" | "community" | "selfhosted" | "core" }> = {
  shared_openai: { category: "AI", isAi: true, vendorType: "saas" },
  shared_azureopenai: { category: "AI", isAi: true, vendorType: "saas" },
  shared_cognitiveservices: { category: "AI", isAi: true, vendorType: "saas" },
  shared_sharepointonline: { category: "Storage", isAi: false, vendorType: "saas" },
  shared_office365: { category: "Productivity", isAi: false, vendorType: "saas" },
  shared_teams: { category: "Communication", isAi: false, vendorType: "saas" },
  shared_commondataserviceforapps: { category: "Database", isAi: false, vendorType: "saas" },
  shared_sql: { category: "Database", isAi: false, vendorType: "saas" },
  shared_salesforce: { category: "CRM", isAi: false, vendorType: "saas" },
  shared_slack: { category: "Communication", isAi: false, vendorType: "saas" },
  http: { category: "Core", isAi: false, vendorType: "core" },
};

interface PaAction {
  type?: string;
  kind?: string;
  inputs?: Record<string, unknown>;
  runAfter?: Record<string, string[]>;
  actions?: Record<string, PaAction>;
  else?: { actions?: Record<string, PaAction> };
  cases?: Record<string, { actions?: Record<string, PaAction> }>;
  default?: { actions?: Record<string, PaAction> };
  description?: string;
  [key: string]: unknown;
}

interface PaTrigger {
  type?: string;
  kind?: string;
  inputs?: Record<string, unknown>;
  description?: string;
  [key: string]: unknown;
}

interface PaDefinition {
  $schema?: string;
  contentVersion?: string;
  description?: string;
  triggers?: Record<string, PaTrigger>;
  actions?: Record<string, PaAction>;
  [key: string]: unknown;
}

export class PowerAutomateParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;

    if (obj.platform === "POWER_AUTOMATE" || obj.platform === "power_automate" || obj.platform === "logic_apps") {
      return true;
    }

    const schema = typeof obj.$schema === "string" ? obj.$schema : "";
    if (schema.includes("Microsoft.Logic/schemas/2016-06-01/workflowdefinition")) {
      return true;
    }

    const def = (obj.definition ?? (obj.properties as Record<string, unknown> | undefined)?.definition) as PaDefinition | undefined;
    if (def && typeof def === "object") {
      if (def.$schema && typeof def.$schema === "string" && def.$schema.includes("Microsoft.Logic")) {
        return true;
      }
      if (def.triggers !== undefined && def.actions !== undefined) {
        return true;
      }
    }

    if (obj.triggers !== undefined && obj.actions !== undefined && !Array.isArray(obj.triggers) && !Array.isArray(obj.actions)) {
      return true;
    }

    return false;
  }

  parse(json: unknown): ParsedWorkflow {
    const raw = json as Record<string, unknown>;
    const def: PaDefinition = (raw.definition ??
      (raw.properties as Record<string, unknown> | undefined)?.definition ??
      raw) as PaDefinition;

    const nodes: NormalNode[] = [];
    const edges: NormalEdge[] = [];
    const extractedParameters: ExtractedParam[] = [];
    const triggerNodes: ParsedWorkflow["triggerNodes"] = [];
    const integrationsMap = new Map<string, { name: string; category: string; isAi: boolean; vendorType: "saas" | "community" | "selfhosted" | "core" }>();

    let httpNodesCount = 0;
    let codeNodesCount = 0;
    let aiNodesCount = 0;

    const rawTriggers = (def.triggers && typeof def.triggers === "object") ? def.triggers : {};
    const rawActions = (def.actions && typeof def.actions === "object") ? def.actions : {};

    // ── 1. Parse Triggers ───────────────────────────────────────────────────
    const triggerKeys = Object.keys(rawTriggers);
    for (const trigKey of triggerKeys) {
      const trig = (rawTriggers[trigKey] ?? {}) as PaTrigger;
      const trigType = String(trig.type ?? "Request");
      const trigKind = String(trig.kind ?? "");
      const inputs = (trig.inputs && typeof trig.inputs === "object") ? trig.inputs : {};

      const isHttp = trigType.toLowerCase().includes("request") || trigType.toLowerCase().includes("http") || trigKind.toLowerCase().includes("http");
      const isSchedule = trigType.toLowerCase().includes("recurrence");

      const auth = (inputs.authentication ?? (inputs.headers as Record<string, unknown> | undefined)?.Authorization) !== undefined;

      const node: NormalNode = {
        id: trigKey,
        name: trigKey.replace(/_/g, " "),
        type: `powerautomate.trigger.${trigType.toLowerCase()}`,
        parameters: inputs,
        credentials: {},
        isTrigger: true,
        isHttp,
        isCode: false,
        isAi: false,
        isLoop: false,
        isBranch: false,
        isDelay: false,
        isAuthenticated: auth,
        httpMeta: isHttp ? {
          method: String(inputs.method ?? "POST").toUpperCase(),
          url: String(inputs.schema ?? ""),
        } : undefined,
      };

      nodes.push(node);
      triggerNodes.push({
        id: node.id,
        name: node.name,
        type: node.type,
        isAuthenticated: auth,
      });

      if (isHttp) httpNodesCount++;

      extractedParameters.push(...flattenParams(node.id, inputs));
    }

    // ── 2. Parse Actions Recursively ────────────────────────────────────────
    const processAction = (actionKey: string, actionObj: PaAction, parentScope?: string) => {
      if (!actionObj || typeof actionObj !== "object") return;

      const actType = String(actionObj.type ?? "ApiConnection");
      const actKind = String(actionObj.kind ?? "");
      const inputs = (actionObj.inputs && typeof actionObj.inputs === "object") ? actionObj.inputs : {};

      const typeLower = actType.toLowerCase();
      const kindLower = actKind.toLowerCase();

      // Connector resolution
      const host = (inputs.host && typeof inputs.host === "object") ? inputs.host as Record<string, unknown> : {};
      const conn = (host.connection && typeof host.connection === "object") ? host.connection as Record<string, unknown> : {};
      const connName = String(conn.name ?? "").toLowerCase();

      let isAi = typeLower.includes("openai") || typeLower.includes("cognitiveservice") || connName.includes("openai");
      let isHttp = typeLower === "http" || typeLower.includes("httprequest") || typeLower === "httpwebhook";
      let isCode = typeLower === "javascriptcode" || typeLower === "executejavascriptcode" || typeLower === "csharpcode";
      let isLoop = typeLower === "foreach" || typeLower === "until";
      let isBranch = typeLower === "if" || typeLower === "switch" || typeLower === "condition";
      let isDelay = typeLower === "delay" || typeLower === "delayuntil";

      if (isAi) aiNodesCount++;
      if (isHttp) httpNodesCount++;
      if (isCode) codeNodesCount++;

      // Track integration
      if (connName) {
        const match = Object.keys(KNOWN_PA_CONNECTORS).find((k) => connName.includes(k));
        if (match) {
          const info = KNOWN_PA_CONNECTORS[match]!;
          integrationsMap.set(match, { name: match.replace("shared_", ""), category: info.category, isAi: info.isAi, vendorType: info.vendorType });
          if (info.isAi) isAi = true;
        } else {
          integrationsMap.set(connName, { name: connName.replace("shared_", ""), category: "SaaS", isAi: false, vendorType: "saas" });
        }
      }

      const httpMeta = isHttp ? {
        url: String(inputs.uri ?? inputs.url ?? ""),
        method: String(inputs.method ?? "POST").toUpperCase(),
      } : undefined;

      const codeSnippet = isCode ? String(inputs.code ?? inputs.script ?? "") : undefined;

      const normalNode: NormalNode = {
        id: actionKey,
        name: actionKey.replace(/_/g, " "),
        type: `powerautomate.action.${typeLower}`,
        parameters: inputs,
        credentials: {},
        isTrigger: false,
        isHttp,
        isCode,
        isAi,
        isLoop,
        isBranch,
        isDelay,
        httpMeta,
        codeMeta: isCode ? { codeSnippet, language: "javascript" } : undefined,
      };

      nodes.push(normalNode);
      extractedParameters.push(...flattenParams(normalNode.id, inputs));

      // Build edges from runAfter
      if (actionObj.runAfter && typeof actionObj.runAfter === "object") {
        for (const [depKey, statuses] of Object.entries(actionObj.runAfter)) {
          const statusList = Array.isArray(statuses) ? statuses : ["Succeeded"];
          const isErrorPath = statusList.some((s) => s === "Failed" || s === "TimedOut");
          edges.push({
            source: depKey,
            target: actionKey,
            type: isErrorPath ? "error" : "main",
            sourceHandle: statusList.join(","),
          });
        }
      } else if (parentScope) {
        edges.push({
          source: parentScope,
          target: actionKey,
          type: "main",
          sourceHandle: "scope",
        });
      }

      // Recurse into child containers
      if (actionObj.actions && typeof actionObj.actions === "object") {
        for (const [childKey, childObj] of Object.entries(actionObj.actions)) {
          processAction(childKey, childObj, actionKey);
        }
      }
      if (actionObj.else?.actions && typeof actionObj.else.actions === "object") {
        for (const [elseKey, elseObj] of Object.entries(actionObj.else.actions)) {
          processAction(elseKey, elseObj, actionKey);
        }
      }
      if (actionObj.cases && typeof actionObj.cases === "object") {
        for (const caseObj of Object.values(actionObj.cases)) {
          if (caseObj?.actions) {
            for (const [caseKey, caseAct] of Object.entries(caseObj.actions)) {
              processAction(caseKey, caseAct, actionKey);
            }
          }
        }
      }
      if (actionObj.default?.actions && typeof actionObj.default.actions === "object") {
        for (const [defKey, defObj] of Object.entries(actionObj.default.actions)) {
          processAction(defKey, defObj, actionKey);
        }
      }
    };

    for (const [actionKey, actionObj] of Object.entries(rawActions)) {
      processAction(actionKey, actionObj);
    }

    // If no runAfter edges were created for an action and triggers exist, connect first actions to triggers
    if (edges.length === 0 && triggerKeys.length > 0 && nodes.length > triggerKeys.length) {
      const firstTrigger = triggerKeys[0]!;
      for (const node of nodes) {
        if (!node.isTrigger) {
          edges.push({ source: firstTrigger, target: node.id, type: "main" });
          break;
        }
      }
    }

    // Secret scanning
    const extractedSecretsCount = nodes.reduce((acc, node) => {
      const s = JSON.stringify(node.parameters);
      return acc + SECRET_PATTERNS.filter((p) => p.test(s)).length;
    }, 0);

    const title = String(
      def.description ??
      (raw.properties as Record<string, unknown> | undefined)?.displayName ??
      raw.name ??
      "Power Automate Flow"
    );

    return {
      name: title,
      description: typeof def.description === "string" ? def.description : undefined,
      platform: "POWER_AUTOMATE",
      rawWorkflowName: title,
      nodeCount: nodes.length,
      connectionCount: edges.length,
      nodes,
      edges,
      extractedParameters,
      triggerNodes,
      integrations: Array.from(integrationsMap.values()),
      httpNodesCount,
      codeNodesCount,
      aiNodesCount,
      hasWebhooks: triggerNodes.some((t) => t.type.includes("request") || t.type.includes("webhook")),
      hasSchedules: triggerNodes.some((t) => t.type.includes("recurrence")),
      hasBranches: nodes.some((n) => n.isBranch),
      hasLoops: nodes.some((n) => n.isLoop),
      branchCount: nodes.filter((n) => n.isBranch).length,
      loopCount: nodes.filter((n) => n.isLoop).length,
      extractedSecretsCount,
      rawNodes: Object.values(rawActions),
      rawConnections: {},
      rawJson: json,
    };
  }
}
