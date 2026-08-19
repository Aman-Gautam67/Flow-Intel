/**
 * FlowIntel Pre-Processing Context Layer — DeepContextResolver
 * ─────────────────────────────────────────────────────────────────────────────
 * Additive module that deep-parses workflow JSON without modifying existing rule logic.
 * Extracts nested parameters (e.g. parameters.options.authentication), scans root-level
 * static metadata (e.g. staticData.README), and identifies variable references vs literals.
 */

import type { ParsedWorkflow, NormalNode } from "@/types";

export interface NodeContext {
  id: string;
  name: string;
  type: string;
  resolvedAuth?: string;
  hasAuth: boolean;
  resolvedTimeout?: unknown;
  resolvedRetryOnFail?: unknown;
  resolvedMaxRetries?: unknown;
  variables: Array<{ path: string; value: string }>;
  literals: Array<{ path: string; value: string }>;
}

export interface RootContext {
  hasReadme: boolean;
  readmeContent: string;
  errorWorkflow: string | null;
  executionOrder: string;
  staticData: Record<string, unknown>;
  settings: Record<string, unknown>;
  pinData: Record<string, unknown>;
}

export interface DeepContext {
  root: RootContext;
  getNodeContext(nodeIdOrName: string): NodeContext | null;
  deepGet(nodeIdOrName: string, path: string, defaultValue?: unknown): unknown;
  isVariable(val: unknown): boolean;
}

export function deepGet(obj: unknown, path: string | string[], defaultValue: unknown = undefined): unknown {
  if (!obj || typeof obj !== "object") return defaultValue;
  const parts = Array.isArray(path) ? path : path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current: any = obj;
  for (const part of parts) {
    if (!part) continue;
    if (current === null || current === undefined || typeof current !== "object") {
      return defaultValue;
    }
    current = current[part];
  }
  return current !== undefined ? current : defaultValue;
}

export function isVariableReference(val: unknown): boolean {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  return (
    /\{\{.*\}\}/.test(trimmed) ||
    /^\$env\./i.test(trimmed) ||
    /^\$node\[/i.test(trimmed) ||
    /^\$json/i.test(trimmed) ||
    /^\$vars\./i.test(trimmed)
  );
}

export class DeepContextResolver {
  static resolve(rawJson: unknown, ast?: ParsedWorkflow): DeepContext {
    const root = (rawJson && typeof rawJson === "object" ? rawJson : {}) as Record<string, any>;

    // 1. Root-Object Static Metadata Resolution
    const rootStaticData = (root.staticData && typeof root.staticData === "object" ? root.staticData : {}) as Record<string, unknown>;
    const rootSettings = (root.settings && typeof root.settings === "object" ? root.settings : {}) as Record<string, unknown>;
    const rootPinData = (root.pinData && typeof root.pinData === "object" ? root.pinData : {}) as Record<string, unknown>;

    const staticDataReadme =
      rootStaticData.README ||
      rootStaticData.readme ||
      rootStaticData.documentation ||
      root.readme ||
      root.description ||
      "";

    const readmeStr = String(staticDataReadme);
    const hasRootReadme = readmeStr.trim().length > 50;

    // 2. Node-Level Deep Property Resolution
    const nodeMap = new Map<string, NodeContext>();

    const rawNodesList = Array.isArray(root.nodes) ? root.nodes : (ast?.nodes || []);
    const rawNodes = (rawNodesList ?? []).filter((n: any) => Boolean(n && typeof n === "object"));
    for (const node of rawNodes) {
      if (!node || typeof node !== "object") continue;
      const nodeId = String(node.id || node.name || "");
      const nodeName = String(node.name || node.id || "");
      const params = (node.parameters && typeof node.parameters === "object" ? node.parameters : {}) as Record<string, unknown>;

      // Webhook & Endpoint Auth Resolution
      const shallowAuth = params.authentication || params.auth || params.authType;
      const nestedAuth = deepGet(params, "options.authentication") ||
                         deepGet(params, "options.auth") ||
                         deepGet(params, "options.authType") ||
                         deepGet(params, "httpHeaderAuth.authentication");
      const creds = (node.credentials && typeof node.credentials === "object") ? node.credentials : {};
      const resolvedAuth = String(nestedAuth || shallowAuth || (Object.keys(creds).length > 0 ? "credential" : "none"));
      const hasAuth = resolvedAuth !== "none" && resolvedAuth !== "undefined" && resolvedAuth !== "";

      // Execution Options
      const resolvedTimeout = deepGet(params, "options.timeout") ?? params.timeout;
      const resolvedRetryOnFail = deepGet(params, "options.retryOnFail") ?? params.retryOnFail;
      const resolvedMaxRetries = deepGet(params, "options.maxTries") ?? deepGet(params, "options.maxRetries") ?? params.maxRetries;

      // Variable vs Literal Scanning
      const variables: Array<{ path: string; value: string }> = [];
      const literals: Array<{ path: string; value: string }> = [];

      const scanParams = (obj: Record<string, any>, prefix = "") => {
        if (!obj || typeof obj !== "object") return;
        for (const [k, v] of Object.entries(obj)) {
          const keyPath = prefix ? `${prefix}.${k}` : k;
          if (typeof v === "string") {
            if (isVariableReference(v)) {
              variables.push({ path: keyPath, value: v });
            } else if (v.length > 0) {
              literals.push({ path: keyPath, value: v });
            }
          } else if (typeof v === "object" && v !== null) {
            scanParams(v, keyPath);
          }
        }
      };
      scanParams(params);

      const nodeCtx: NodeContext = {
        id: nodeId,
        name: nodeName,
        type: String(node.type || ""),
        resolvedAuth,
        hasAuth,
        resolvedTimeout,
        resolvedRetryOnFail,
        resolvedMaxRetries,
        variables,
        literals,
      };

      if (nodeId) nodeMap.set(nodeId, nodeCtx);
      if (nodeName && nodeName !== nodeId) nodeMap.set(nodeName, nodeCtx);
    }

    return {
      root: {
        hasReadme: hasRootReadme,
        readmeContent: readmeStr,
        errorWorkflow: rootSettings.errorWorkflow ? String(rootSettings.errorWorkflow) : null,
        executionOrder: rootSettings.executionOrder ? String(rootSettings.executionOrder) : "v1",
        staticData: rootStaticData,
        settings: rootSettings,
        pinData: rootPinData,
      },
      getNodeContext(key: string): NodeContext | null {
        return nodeMap.get(key) || null;
      },
      deepGet(key: string, path: string, defaultValue?: unknown): unknown {
        const ctx = nodeMap.get(key);
        if (!ctx) return defaultValue;
        return deepGet(ctx, path, defaultValue);
      },
      isVariable(val: unknown): boolean {
        return isVariableReference(val);
      },
    };
  }
}
