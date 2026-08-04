import { request } from "@/lib/api/request";
import type { AnalysisResult } from "@/types";

export interface ParseResponse {
  success: boolean;
  result: AnalysisResult;
  slug: string | null;
}

export async function parseWorkflowJson(
  json: unknown,
  options: { save?: boolean; isPublic?: boolean } = {}
): Promise<ParseResponse> {
  const res = await request("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json, save: options.save ?? false, isPublic: options.isPublic ?? true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Parse failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface WorkflowListItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  platform: string;
  createdAt: string;
  nodeCount: number;
  triggerType: string | null;
  hasAiNodes: boolean;
  critFlagCount: number;
  certified: boolean;
  views: number;
  downloads: number;
  bookmarks: number;
  scores: {
    health: number; security: number; complexity: number;
    reliability: number; debt: number; memory: number;
    resilience: number; privacy: number; aiGuardrails: number;
    estimatedCostUsd: number;
    fqi?: number | null;
  } | null;
}

export async function listWorkflows(params: Record<string, string | number | undefined> = {}): Promise<{ workflows: WorkflowListItem[] }> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) sp.set(k, String(v));
  }
  const res = await fetch(`/api/workflows?${sp.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
