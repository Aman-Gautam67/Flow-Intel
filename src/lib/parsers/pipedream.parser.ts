/**
 * Pipedream Workflow AST Parser.
 *
 * Supports Pipedream serverless workflow definitions:
 * - Envelope: { id?, name?, description?, settings?, triggers?: [...], steps?: [...] }
 * - Triggers: [{ id, name, type: "event_source" | "http" | "cron", component_id?, props?, configured_props? }]
 * - Steps: [{ id, name, namespace?, type: "custom_code" | "action" | "nodejs" | "python" | "http", app?, code?, props?, configured_props? }]
 */
import type {
  IWorkflowParser,
  ParsedWorkflow,
  NormalNode,
  NormalEdge,
  ExtractedParam,
} from "@/types";
import { flattenParams, edgesToConnectionMap } from "./normalise";

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]{10,}/,
  /eyJ[A-Za-z0-9+/]{20,}/,
  /sk-[A-Za-z0-9_\-]{16,}/,
  /sk-proj-[A-Za-z0-9\-_]{16,}/,
  /AIza[A-Za-z0-9\-_]{35}/,
  /[Aa][Pp][Ii][_-]?[Kk][Ee][Yy]\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/,
  /[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]\s*[:=]\s*["'][^"']{6,}/,
  /[Ss][Ee][Cc][Rr][Ee][Tt]\s*[:=]\s*["'][^"']{8,}/,
  /[Tt][Oo][Kk][Ee][Nn]\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}/,
  /xox[baprs]-[A-Za-z0-9\-]{10,}/,
  /ghp_[A-Za-z0-9]{36}/,
  /AKIA[0-9A-Z]{16}/,
  /sk_live_[A-Za-z0-9_\-]{16,}/,
  /pd_live_[A-Za-z0-9_\-]{16,}/,
];

// ─── Pipedream Types ─────────────────────────────────────────────────────────
interface PipedreamTrigger {
  id?: string;
  name?: string;
  type?: string;
  component_id?: string;
  props?: Record<string, unknown>;
  configured_props?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PipedreamStep {
  id?: string;
  name?: string;
  namespace?: string;
  type?: string;
  app?: string;
  action?: string;
  code?: string;
  language?: "nodejs" | "python" | "bash" | "go" | string;
  props?: Record<string, unknown>;
  configured_props?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PipedreamWorkflowExport {
  id?: string;
  name?: string;
  description?: string;
  settings?: {
    auto_retry?: boolean;
    error_notification?: boolean;
    [key: string]: unknown;
  };
  triggers?: PipedreamTrigger[];
  trigger?: PipedreamTrigger;
  steps?: PipedreamStep[];
  [key: string]: unknown;
}

function classifyPipedreamStep(step: PipedreamStep): {
  name: string;
  category: string;
  isAi: boolean;
  vendorType: "saas" | "community" | "selfhosted" | "core";
} {
  const app = (step.app ?? "").toLowerCase();
  const type = (step.type ?? "").toLowerCase();
  const name = step.name ?? step.app ?? "Step";

  if (app.includes("openai") || app.includes("anthropic") || app.includes("cohere")) {
    return { name: step.app ?? "OpenAI", category: "AI", isAi: true, vendorType: "saas" };
  }
  if (type === "custom_code" || type === "nodejs" || type === "python") {
    return { name: "Custom Code", category: "Core", isAi: false, vendorType: "core" };
  }
  if (type === "http" || app.includes("http")) {
    return { name: "HTTP / Webhook", category: "API", isAi: false, vendorType: "core" };
  }
  if (app) {
    return { name: step.app!, category: "Integration", isAi: false, vendorType: "saas" };
  }
  return { name, category: "Core", isAi: false, vendorType: "core" };
}

export class PipedreamParser implements IWorkflowParser {
  supports(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const obj = json as Record<string, unknown>;

    // Explicit tag
    if (obj.platform === "PIPEDREAM" || obj.platform === "pipedream") return true;

    // Reject other platforms
    if (obj.connections && typeof obj.connections === "object") return false; // n8n
    if (Array.isArray(obj.flow)) return false; // Make
    if (obj.app && obj.workflow) return false; // Dify
    if (Array.isArray(obj.agents) && Array.isArray(obj.tasks)) return false; // CrewAI

    // Pipedream signatures: triggers array or steps array with Pipedream properties
    const hasTriggers = Array.isArray(obj.triggers) || (obj.trigger !== undefined && typeof obj.trigger === "object");
    const hasSteps = Array.isArray(obj.steps);

    if (hasTriggers || hasSteps) {
      const steps = ((Array.isArray(obj.steps) ? obj.steps : []) as unknown[]).filter(
        (s): s is PipedreamStep => Boolean(s && typeof s === "object")
      );
      const triggers = (
        Array.isArray(obj.triggers)
          ? obj.triggers
          : obj.trigger && typeof obj.trigger === "object"
          ? [obj.trigger]
          : []
      ).filter((t): t is PipedreamTrigger => Boolean(t && typeof t === "object"));

      // Check triggers for component_id or configured_props
      if (triggers.some((t) => t.component_id !== undefined || t.configured_props !== undefined || t.type === "event_source")) {
        return true;
      }

      // Check steps for Pipedream specific markers
      if (
        steps.some((s) => {
          if (s.namespace !== undefined) return true;
          if (s.configured_props !== undefined) return true;
          if (s.app === "pipedream") return true;
          if (s.type === "custom_code" || s.type === "nodejs" || s.type === "python") return true;
          if (typeof s.code === "string" && (s.code.includes("defineComponent") || s.code.includes("$.flow") || s.code.includes("steps.trigger"))) return true;
          // Check props for authProvisionId
          if (s.props && typeof s.props === "object") {
            const propsStr = JSON.stringify(s.props);
            if (propsStr.includes("authProvisionId")) return true;
          }
          return false;
        })
      ) {
        return true;
      }
    }

    return false;
  }

  parse(json: unknown): ParsedWorkflow {
    const doc = (json && typeof json === "object") ? (json as PipedreamWorkflowExport) : {};
    const rawTriggers: PipedreamTrigger[] = (Array.isArray(doc.triggers)
      ? doc.triggers
      : doc.trigger && typeof doc.trigger === "object"
      ? [doc.trigger]
      : []).filter((t): t is PipedreamTrigger => Boolean(t && typeof t === "object"));
    const rawSteps: PipedreamStep[] = (Array.isArray(doc.steps) ? doc.steps : []).filter(
      (s): s is PipedreamStep => Boolean(s && typeof s === "object")
    );

    const nodes: NormalNode[] = [];
    const edges: NormalEdge[] = [];
    const nodeIds: string[] = [];

    // 1. Process Triggers
    rawTriggers.forEach((trigger, index) => {
      const triggerId = String(trigger.id ?? `trigger_${index + 1}`);
      const triggerName = String(
        trigger.name ?? trigger.component_id ?? `Trigger ${index + 1}`
      );
      nodeIds.push(triggerId);

      const params: Record<string, unknown> = {
        ...(trigger.props ?? {}),
        ...(trigger.configured_props ?? {}),
        ...(trigger.settings ?? {}),
        component_id: trigger.component_id,
        type: trigger.type,
      };

      const credentials: Record<string, unknown> = {};
      const paramsStr = JSON.stringify(params);
      if (
        paramsStr.includes("authProvisionId") ||
        paramsStr.includes("apiKey") ||
        paramsStr.includes("api_key") ||
        paramsStr.includes("Authorization") ||
        paramsStr.includes("authorization") ||
        paramsStr.includes("Bearer") ||
        paramsStr.includes("token") ||
        paramsStr.includes("secret")
      ) {
        credentials.auth = { id: "configured" };
      }

      nodes.push({
        id: triggerId,
        name: triggerName,
        type: `pipedream.trigger`,
        disabled: false,
        position: [100, 100 + index * 140],
        parameters: params,
        credentials,
        isTrigger: true,
        isHttp: trigger.type === "http" || String(trigger.component_id ?? "").includes("webhook"),
        isCode: false,
        isAi: false,
        isLoop: false,
        isBranch: false,
        isDelay: false,
        isAuthenticated: Object.keys(credentials).length > 0,
      });
    });

    // 2. Process Steps
    rawSteps.forEach((step, index) => {
      const stepId = String(
        step.id ?? step.name ?? step.namespace ?? `step_${index + 1}`
      );
      const stepName = String(step.name ?? step.namespace ?? `Step ${index + 1}`);
      nodeIds.push(stepId);

      const stepType = String(step.type ?? "action").toLowerCase();
      const appName = String(step.app ?? "").toLowerCase();
      const stepCode = String(step.code ?? "");

      const isAi =
        appName.includes("openai") ||
        appName.includes("anthropic") ||
        appName.includes("cohere") ||
        appName.includes("ai") ||
        stepName.toLowerCase().includes("llm") ||
        stepName.toLowerCase().includes("openai");

      const isCode =
        stepType === "custom_code" ||
        stepType === "nodejs" ||
        stepType === "python" ||
        stepType === "code" ||
        (stepCode.length > 0 && stepType !== "action");

      const isHttp = Boolean(
        !isCode &&
        !isAi &&
        (
          stepType === "http" ||
          appName.includes("http") ||
          stepName.toLowerCase().includes("http") ||
          (step.props && step.props.url !== undefined) ||
          (step.configured_props && step.configured_props.url !== undefined)
        )
      );

      const isBranch =
        stepCode.includes("$.flow.exit") ||
        stepCode.includes("$.flow.rerun") ||
        stepType === "filter" ||
        stepType === "router";

      const isLoop = stepType === "loop" || stepName.toLowerCase().includes("loop");
      const isDelay = stepType === "delay" || stepType === "sleep";

      const params: Record<string, unknown> = {
        ...(step.props ?? {}),
        ...(step.configured_props ?? {}),
        code: step.code,
        app: step.app,
        action: step.action,
        type: step.type,
      };

      // HTTP metadata
      let httpMeta: NormalNode["httpMeta"];
      if (isHttp) {
        httpMeta = {
          url: String(step.props?.url ?? step.configured_props?.url ?? ""),
          method: String(
            step.props?.method ?? step.configured_props?.method ?? "POST"
          ).toUpperCase(),
          headers:
            typeof step.props?.headers === "object" && step.props.headers !== null
              ? (step.props.headers as Record<string, string>)
              : undefined,
        };
      }

      // Code metadata
      let codeMeta: NormalNode["codeMeta"];
      if (isCode) {
        const lang = String(step.language ?? stepType).toLowerCase();
        codeMeta = {
          codeSnippet: stepCode,
          language: lang.includes("python") ? "python" : "javascript",
        };
      }

      // AI metadata
      let aiMeta: NormalNode["aiMeta"];
      if (isAi) {
        aiMeta = {
          model: String(step.props?.model ?? "gpt-4o"),
          hasStructuredOutput: false,
        };
      }

      // Credentials extraction
      const credentials: Record<string, unknown> = {};
      const paramsStr = JSON.stringify(params);
      if (
        paramsStr.includes("authProvisionId") ||
        paramsStr.includes("apiKey") ||
        paramsStr.includes("api_key") ||
        paramsStr.includes("Authorization") ||
        paramsStr.includes("authorization") ||
        paramsStr.includes("Bearer") ||
        paramsStr.includes("token") ||
        paramsStr.includes("secret")
      ) {
        credentials.auth = { id: "configured" };
      }

      nodes.push({
        id: stepId,
        name: stepName,
        type: `pipedream.${step.type ?? step.app ?? "action"}`,
        disabled: false,
        position: [400 + index * 220, 100],
        parameters: params,
        credentials,
        isTrigger: false,
        isHttp,
        isCode,
        isAi,
        isLoop,
        isBranch,
        isDelay,
        isAuthenticated: Object.keys(credentials).length > 0,
        httpMeta,
        codeMeta,
        aiMeta,
      });
    });

    // 3. Connect Sequential Pipeline Edges
    if (rawTriggers.length > 0 && rawSteps.length > 0) {
      // Connect each trigger to the first step
      const firstStepId = nodes[rawTriggers.length]?.id;
      if (firstStepId) {
        for (let i = 0; i < rawTriggers.length; i++) {
          edges.push({
            source: nodes[i]!.id,
            target: firstStepId,
            type: "main",
            sourceHandle: "event",
          });
        }
      }
    }

    // Connect sequential steps
    const stepStartIndex = rawTriggers.length;
    for (let i = stepStartIndex; i < nodes.length - 1; i++) {
      edges.push({
        source: nodes[i]!.id,
        target: nodes[i + 1]!.id,
        type: "main",
        sourceHandle: "next",
      });
    }

    const extractedParameters: ExtractedParam[] = nodes.flatMap((n) =>
      flattenParams(n.id, n.parameters)
    );

    const triggerNodes = nodes
      .filter((n) => n.isTrigger)
      .map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        isAuthenticated: n.isAuthenticated ?? false,
      }));

    const seenApps = new Set<string>();
    const integrations: ParsedWorkflow["integrations"] = [];
    for (const step of rawSteps) {
      const app = step.app ?? step.type ?? "custom_code";
      if (seenApps.has(app)) continue;
      seenApps.add(app);
      integrations.push(classifyPipedreamStep(step));
    }

    const branchNodes = nodes.filter((n) => n.isBranch);
    const loopNodes = nodes.filter((n) => n.isLoop);
    const aiNodes = nodes.filter((n) => n.isAi);

    const secretCount = nodes.reduce((count, n) => {
      const paramStr = JSON.stringify(n.parameters);
      const credStr = JSON.stringify(n.credentials);
      return (
        count +
        SECRET_PATTERNS.filter((p) => p.test(paramStr) || p.test(credStr)).length
      );
    }, 0);

    const rawConnections = edgesToConnectionMap(edges);
    const workflowName = doc.name ?? "Pipedream Workflow";

    return {
      name: workflowName,
      rawWorkflowName: workflowName,
      description: doc.description,
      platformVersion: "1.0.0",
      metadata: {
        id: doc.id ?? null,
        description: doc.description ?? null,
        settings: doc.settings ?? {},
      },
      platform: "PIPEDREAM",
      nodeCount: nodes.length,
      connectionCount: edges.length,
      nodes,
      edges,
      extractedParameters,
      triggerNodes,
      integrations,
      httpNodesCount: nodes.filter((n) => n.isHttp).length,
      codeNodesCount: nodes.filter((n) => n.isCode).length,
      aiNodesCount: aiNodes.length,
      hasWebhooks: nodes.some(
        (n) => n.isTrigger || n.type.toLowerCase().includes("webhook")
      ),
      hasSchedules: rawTriggers.some((t) => t.type === "cron" || String(t.component_id ?? "").includes("cron")),
      hasBranches: branchNodes.length > 0,
      hasLoops: loopNodes.length > 0,
      branchCount: branchNodes.length,
      loopCount: loopNodes.length,
      extractedSecretsCount: secretCount,
      rawNodes: [...rawTriggers, ...rawSteps],
      rawConnections,
    };
  }
}
