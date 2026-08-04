/**
 * FlowIntel Workflow Fingerprinting
 * ─────────────────────────────────────────────────────────────────────────────
 * Produces a deterministic SHA-256 fingerprint for any parsed workflow.
 *
 * Algorithm:
 *   1. Extract canonical representation (sorted nodes, sorted connections)
 *   2. Strip non-structural fields (timestamps, execution IDs, display positions)
 *   3. JSON.stringify with sorted keys
 *   4. SHA-256 via Web Crypto API (available in Node 18+ and all modern browsers)
 *
 * Usage:
 *   const fp = await fingerprintWorkflow(parsed);
 *   fp.hash  // "a3f9b2..."
 *
 * The fingerprint is used for:
 *   - Duplicate detection (same logic, different names)
 *   - Fork detection (shared structural ancestry)
 *   - Version tracking (hash changes when logic changes)
 *   - Certificate binding (cert is tied to exact fingerprint)
 */

import type { ParsedWorkflow } from "@/types";
import type { FingerprintResult } from "./types";

// ─── Canonical Node Shape ─────────────────────────────────────────────────────
// We include type + sorted parameters but strip display positions, IDs, and
// names (which are user-defined and may differ between equivalent workflows).
// We include the TYPE as structural signal and parameter keys as shape signal.
interface CanonicalNode {
  type: string;
  paramKeys: string[];          // sorted keys of parameters (not values — values can contain secrets)
  isAi: boolean;
  isTrigger: boolean;
  isHttp: boolean;
  isCode: boolean;
  isLoop: boolean;
  isDisabled: boolean;
}

interface CanonicalEdge {
  from: string;  // source node TYPE (position-independent)
  to: string;    // target node TYPE
}

interface CanonicalWorkflow {
  platform: string;
  nodeCount: number;
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  nodeTypeSignature: string[];
}

function canonicalizeWorkflow(parsed: ParsedWorkflow): CanonicalWorkflow {
  const nodes: CanonicalNode[] = parsed.nodes
    .map((n) => ({
      type: n.type,
      paramKeys: Object.keys(
        (n.parameters as Record<string, unknown>) ?? {}
      ).sort(),
      isAi: !!n.isAi,
      isTrigger: !!n.isTrigger,
      isHttp: !!n.isHttp,
      isCode: !!n.isCode,
      isLoop: !!n.isLoop,
      isDisabled: n.disabled ?? false,
    }))
    .sort((a, b) => a.type.localeCompare(b.type));

  // Use edges array — platform-independent, already normalised by parser
  const edges: CanonicalEdge[] = parsed.edges
    .map((e) => {
      const fromNode = parsed.nodes.find((n) => n.name === e.source);
      const toNode   = parsed.nodes.find((n) => n.name === e.target);
      return {
        from: fromNode?.type ?? e.source,
        to:   toNode?.type   ?? e.target,
      };
    })
    .sort((a, b) => `${a.from}→${a.to}`.localeCompare(`${b.from}→${b.to}`));

  const nodeTypeSignature = [...new Set(nodes.map((n) => n.type))].sort();

  return {
    platform: parsed.platform,
    nodeCount: parsed.nodes.length,
    nodes,
    edges,
    nodeTypeSignature,
  };
}

/** Stable JSON serialiser with sorted keys at every level */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map(
    (k) => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`
  );
  return `{${pairs.join(",")}}`;
}

/** SHA-256 hash of a UTF-8 string. Returns lowercase hex string. */
export async function sha256(input: string): Promise<string> {
  // Node 18+ / browser: Web Crypto
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Fallback: Node.js built-in crypto (for older Node or environments without Web Crypto)
  // Dynamic import to avoid bundler issues in browser contexts
  try {
    const { createHash } = await import("crypto");
    return createHash("sha256").update(input, "utf8").digest("hex");
  } catch {
    // Last resort: deterministic but weaker hash (only for environments with no crypto at all)
    // This should never happen in production — flag it.
    console.warn("[fingerprint] No crypto available — using fallback hash");
    return fallbackHash(input);
  }
}

/** djb2-based fallback hash (non-cryptographic, only if all else fails) */
function fallbackHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16).padStart(8, "0") + "-fallback";
}

/**
 * Generate a deterministic fingerprint for a parsed workflow.
 *
 * @param parsed - The normalized AST from any supported parser
 * @returns FingerprintResult with SHA-256 hash and structural metadata
 */
export async function fingerprintWorkflow(
  parsed: ParsedWorkflow
): Promise<FingerprintResult> {
  const canonical = canonicalizeWorkflow(parsed);
  const serialized = stableStringify(canonical);
  const hash = await sha256(serialized);

  return {
    hash,
    nodeCount: parsed.nodes.length,
    connectionCount: parsed.edges.length,
    nodeTypeSignature: canonical.nodeTypeSignature,
    fingerprintedAt: new Date().toISOString(),
  };
}

/**
 * Synchronous fingerprint (uses fallback hash — suitable for tests or
 * environments where async is not available).
 * Prefer `fingerprintWorkflow` in production code.
 */
export function fingerprintWorkflowSync(parsed: ParsedWorkflow): FingerprintResult {
  const canonical = canonicalizeWorkflow(parsed);
  const serialized = stableStringify(canonical);
  const hash = fallbackHash(serialized);

  return {
    hash,
    nodeCount: parsed.nodes.length,
    connectionCount: parsed.edges.length,
    nodeTypeSignature: canonical.nodeTypeSignature,
    fingerprintedAt: new Date().toISOString(),
  };
}

/**
 * Verify a certificate's fingerprint against a workflow.
 * Returns true if the workflow matches the certificate's fingerprint.
 */
export async function verifyFingerprint(
  parsed: ParsedWorkflow,
  expectedHash: string
): Promise<boolean> {
  const fp = await fingerprintWorkflow(parsed);
  return fp.hash === expectedHash;
}
