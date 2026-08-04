/**
 * Shared normalisation utilities used by all platform parsers.
 * Converts flat parameter objects into ExtractedParam[] for secret/PII scanning.
 */
import type { ExtractedParam } from "@/types";

/**
 * Recursively walk a parameters object and emit every (key, stringValue) pair.
 * Non-string leafs are JSON-serialised so regex scanners have a single string surface.
 */
export function flattenParams(
  nodeId: string,
  params: unknown,
  prefix = "",
  depth = 0
): ExtractedParam[] {
  if (depth > 8) return [];
  if (!params || typeof params !== "object") return [];
  const result: ExtractedParam[] = [];

  if (Array.isArray(params)) {
    params.forEach((item, i) => {
      result.push(...flattenParams(nodeId, item, `${prefix}[${i}]`, depth + 1));
    });
    return result;
  }

  for (const [key, val] of Object.entries(params as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "string") {
      result.push({ nodeId, key: path, value: val });
    } else if (typeof val === "number" || typeof val === "boolean") {
      result.push({ nodeId, key: path, value: String(val) });
    } else if (val && typeof val === "object") {
      result.push(...flattenParams(nodeId, val, path, depth + 1));
    }
  }
  return result;
}

/** Build a simple adjacency map: sourceName/id → targetName/id[] */
export function buildAdjacency(edges: Array<{ source: string; target: string }>): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const existing = adj.get(e.source) ?? [];
    existing.push(e.target);
    adj.set(e.source, existing);
  }
  return adj;
}

/** Build a reverse adjacency: targetName/id → sourceName/id[] */
export function buildReverseAdjacency(edges: Array<{ source: string; target: string }>): Map<string, string[]> {
  const rev = new Map<string, string[]>();
  for (const e of edges) {
    const existing = rev.get(e.target) ?? [];
    existing.push(e.source);
    rev.set(e.target, existing);
  }
  return rev;
}

/**
 * Rebuild a connection map compatible with n8n-style rules from NormalEdge[].
 * Shape: { [sourceName]: { main: [[{node:target},...]], error: [[...]] }, [connType]: [...] } }
 * Used by rules that need the raw n8n connection traversal pattern.
 */
export function edgesToConnectionMap(
  edges: Array<{ source: string; target: string; type?: string }>
): Record<string, unknown> {
  const map: Record<string, Record<string, Array<Array<{ node: string }>>>> = {};
  for (const e of edges) {
    if (!map[e.source]) map[e.source] = {};
    const connType = e.type ?? "main";
    // main/error → main[0]/main[1]; ai_tool → ai_tool[0]; etc.
    if (connType === "main" || connType === "error") {
      if (!map[e.source]!.main) map[e.source]!.main = [[], []];
      const idx = connType === "error" ? 1 : 0;
      map[e.source]!.main[idx]!.push({ node: e.target });
    } else {
      if (!map[e.source]![connType]) map[e.source]![connType] = [[]];
      map[e.source]![connType]![0]!.push({ node: e.target });
    }
  }
  return map as Record<string, unknown>;
}

/** Extract URL strings from a parameters object (any key containing "url", "endpoint", "webhook") */
export function extractUrlsFromParams(params: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const URL_KEYS = /url|endpoint|webhook|baseUrl|apiUrl/i;
  function walk(obj: unknown) {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (URL_KEYS.test(k) && typeof v === "string") {
        urls.push(v);
      } else if (typeof v === "object") {
        walk(v);
      }
    }
  }
  walk(params);
  return urls;
}
