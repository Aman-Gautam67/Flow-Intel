"use client";

import { useState } from "react";
import type { WorkflowVersion, WorkflowScore } from "@/lib/db/schema";
import type { AuditFlag, N8nNode } from "@/types";
import { GitBranch, Plus, Minus, ArrowRight } from "lucide-react";

interface DiffPageProps {
  slug: string;
  title: string;
  v1: { version: WorkflowVersion; scores: WorkflowScore };
  v2: { version: WorkflowVersion; scores: WorkflowScore };
}

const SCORE_KEYS = [
  "healthScore", "securityScore", "complexityScore", "reliabilityScore",
  "debtScore", "memoryScore", "resilienceScore", "privacyScore", "aiGuardrailsScore",
] as const;

const SCORE_LABELS: Record<string, string> = {
  healthScore: "Health", securityScore: "Security", complexityScore: "Simplicity",
  reliabilityScore: "Reliability", debtScore: "Debt", memoryScore: "Memory",
  resilienceScore: "Resilience", privacyScore: "Privacy", aiGuardrailsScore: "AI Guard",
};

function deltaColor(delta: number): string {
  if (delta > 0) return "var(--color-fi-accent)";
  if (delta < 0) return "var(--color-fi-crit)";
  return "var(--color-fi-muted)";
}

function ScoreDelta({ v1Score, v2Score, label }: { v1Score: number; v2Score: number; label: string }) {
  const delta = v2Score - v1Score;
  const color = deltaColor(delta);
  return (
    <div className="flex items-center justify-between border-b py-3 px-4 font-mono text-sm"
      style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <span style={{ color: "var(--color-fi-muted)" }} className="text-[11px] uppercase tracking-widest w-28">{label}</span>
      <div className="flex items-center gap-4">
        <span className="w-8 text-right" style={{ color: "rgba(240,240,240,0.56)" }}>{v1Score}</span>
        <ArrowRight size={12} style={{ color: "var(--color-fi-muted)" }} />
        <span className="w-8 text-right" style={{ color: "var(--color-fi-text)" }}>{v2Score}</span>
        <span className="w-12 text-right font-semibold" style={{ color }}>
          {delta > 0 ? "+" : ""}{delta}
        </span>
      </div>
    </div>
  );
}

function NodeDiff({ v1Nodes, v2Nodes }: { v1Nodes: N8nNode[]; v2Nodes: N8nNode[] }) {
  const v1Names = new Set(v1Nodes.map((n) => n.name));
  const v2Names = new Set(v2Nodes.map((n) => n.name));

  const added = v2Nodes.filter((n) => !v1Names.has(n.name));
  const removed = v1Nodes.filter((n) => !v2Names.has(n.name));
  const changed = v2Nodes.filter((n) => {
    if (!v1Names.has(n.name)) return false;
    const prev = v1Nodes.find((p) => p.name === n.name);
    return prev && JSON.stringify(prev.parameters) !== JSON.stringify(n.parameters);
  });

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    return (
      <p className="font-mono text-sm p-4" style={{ color: "var(--color-fi-muted)" }}>
        No node changes detected between versions.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {added.map((n) => (
        <div key={n.id} className="flex items-center gap-3 px-4 py-2.5 font-mono text-[11px]"
          style={{ background: "rgba(0,255,136,0.05)", borderLeft: "2px solid var(--color-fi-accent)" }}>
          <Plus size={12} style={{ color: "var(--color-fi-accent)", flexShrink: 0 }} />
          <span style={{ color: "var(--color-fi-accent)" }}>{n.name}</span>
          <span style={{ color: "rgba(240,240,240,0.4)" }}>{n.type}</span>
        </div>
      ))}
      {removed.map((n) => (
        <div key={n.id} className="flex items-center gap-3 px-4 py-2.5 font-mono text-[11px]"
          style={{ background: "rgba(255,93,93,0.05)", borderLeft: "2px solid var(--color-fi-crit)" }}>
          <Minus size={12} style={{ color: "var(--color-fi-crit)", flexShrink: 0 }} />
          <span style={{ color: "var(--color-fi-crit)" }}>{n.name}</span>
          <span style={{ color: "rgba(240,240,240,0.4)" }}>{n.type}</span>
        </div>
      ))}
      {changed.map((n) => (
        <div key={n.id} className="flex items-center gap-3 px-4 py-2.5 font-mono text-[11px]"
          style={{ background: "rgba(247,215,116,0.05)", borderLeft: "2px solid var(--color-fi-warn)" }}>
          <span style={{ color: "var(--color-fi-warn)" }}>~</span>
          <span style={{ color: "var(--color-fi-warn)" }}>{n.name}</span>
          <span style={{ color: "rgba(240,240,240,0.4)" }}>parameters changed</span>
        </div>
      ))}
    </div>
  );
}

export function DiffPage({ slug, title, v1, v2 }: DiffPageProps) {
  const v1Nodes = ((v1.version.rawJson as Record<string, unknown>).nodes ?? []) as N8nNode[];
  const v2Nodes = ((v2.version.rawJson as Record<string, unknown>).nodes ?? []) as N8nNode[];

  const v1Flags = (v1.scores.allFlags ?? []) as unknown as AuditFlag[];
  const v2Flags = (v2.scores.allFlags ?? []) as unknown as AuditFlag[];
  const newFlags = v2Flags.filter((f) => !v1Flags.some((f1) => f1.rule === f.rule && f1.nodeName === f.nodeName));
  const resolvedFlags = v1Flags.filter((f) => !v2Flags.some((f2) => f2.rule === f.rule && f2.nodeName === f.nodeName));

  const costDelta = v2.scores.estimatedCostUsd - v1.scores.estimatedCostUsd;

  return (
    <div className="min-h-svh" style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--color-fi-border)", background: "rgba(10,10,10,0.82)", backdropFilter: "blur(12px)" }}>
        <a href={`/workflows/${slug}`} className="flex items-center gap-3">
          <div className="w-7 h-7 border flex items-center justify-center text-[var(--color-fi-accent)] font-mono font-bold text-xs"
            style={{ borderColor: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.04)" }}>FI</div>
          <span className="font-mono text-xs tracking-[0.18em] uppercase">{title}</span>
        </a>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
          <GitBranch size={11} /> Version Diff
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Version selector header */}
        <div className="flex items-center gap-6 p-5 border" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
          <div className="text-center">
            <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--color-fi-muted)" }}>Version</div>
            <div className="font-mono text-2xl" style={{ color: "var(--color-fi-text)" }}>v{v1.version.versionNum}</div>
            <div className="font-mono text-[9px] mt-1" style={{ color: "rgba(240,240,240,0.36)" }}>
              {new Date(v1.version.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center gap-2">
            <div className="h-px flex-1" style={{ background: "var(--color-fi-border)" }} />
            <ArrowRight size={16} style={{ color: "var(--color-fi-muted)" }} />
            <div className="h-px flex-1" style={{ background: "var(--color-fi-border)" }} />
          </div>
          <div className="text-center">
            <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--color-fi-accent)" }}>Version</div>
            <div className="font-mono text-2xl" style={{ color: "var(--color-fi-accent)" }}>v{v2.version.versionNum}</div>
            <div className="font-mono text-[9px] mt-1" style={{ color: "rgba(240,240,240,0.36)" }}>
              {new Date(v2.version.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Score drift */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--color-fi-muted)" }}>
              Score Drift
            </div>
            <div className="border" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
              {SCORE_KEYS.map((key) => (
                <ScoreDelta
                  key={key}
                  label={SCORE_LABELS[key]}
                  v1Score={(v1.scores as unknown as Record<string, number>)[key] ?? 0}
                  v2Score={(v2.scores as unknown as Record<string, number>)[key] ?? 0}
                />
              ))}
              <div className="flex items-center justify-between px-4 py-3 font-mono text-sm">
                <span className="text-[11px] uppercase tracking-widest w-28" style={{ color: "var(--color-fi-muted)" }}>Cost/mo</span>
                <div className="flex items-center gap-4">
                  <span className="w-16 text-right" style={{ color: "rgba(240,240,240,0.56)" }}>
                    ${v1.scores.estimatedCostUsd.toFixed(2)}
                  </span>
                  <ArrowRight size={12} style={{ color: "var(--color-fi-muted)" }} />
                  <span className="w-16 text-right" style={{ color: "var(--color-fi-text)" }}>
                    ${v2.scores.estimatedCostUsd.toFixed(2)}
                  </span>
                  <span className="w-12 text-right font-semibold" style={{ color: deltaColor(-costDelta) }}>
                    {costDelta > 0 ? "+" : ""}{costDelta.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Flag changes */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--color-fi-muted)" }}>
              Flag Changes
            </div>
            <div className="border" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
              {newFlags.length === 0 && resolvedFlags.length === 0 ? (
                <p className="p-4 font-mono text-sm" style={{ color: "var(--color-fi-muted)" }}>No flag changes between versions.</p>
              ) : (
                <>
                  {newFlags.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b font-mono text-[11px]"
                      style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,93,93,0.04)" }}>
                      <Plus size={11} style={{ color: "var(--color-fi-crit)" }} />
                      <span style={{ color: "var(--color-fi-crit)" }}>NEW</span>
                      <span className="flex-1 truncate" style={{ color: "rgba(240,240,240,0.72)" }}>{f.title}</span>
                    </div>
                  ))}
                  {resolvedFlags.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b font-mono text-[11px]"
                      style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(0,255,136,0.03)" }}>
                      <Minus size={11} style={{ color: "var(--color-fi-accent)" }} />
                      <span style={{ color: "var(--color-fi-accent)" }}>FIXED</span>
                      <span className="flex-1 truncate" style={{ color: "rgba(240,240,240,0.72)" }}>{f.title}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Node diff */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--color-fi-muted)" }}>
            Node Changes
          </div>
          <div className="border overflow-hidden" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
            <NodeDiff v1Nodes={v1Nodes} v2Nodes={v2Nodes} />
          </div>
        </div>
      </div>
    </div>
  );
}
