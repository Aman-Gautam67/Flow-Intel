"use client";

import { Activity, Shield, FileText, GitBranch, Lock, Cpu, CheckCircle2, AlertTriangle } from "lucide-react";
import type { N8nNode } from "@/types";
import { DeepContextResolver } from "@/lib/engine/deep-context";
import { buildConnectionGraph } from "@/lib/engine/graph";

interface ContextIntelligencePanelProps {
  rawNodes: N8nNode[];
  rawConnections: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  rawJson?: unknown;
}

export function ContextIntelligencePanel({
  rawNodes,
  rawConnections,
  metadata,
  rawJson,
}: ContextIntelligencePanelProps) {
  const ctx = DeepContextResolver.resolve(rawJson || { nodes: rawNodes, metadata });
  const graph = buildConnectionGraph(rawConnections, rawNodes as any);

  const graphNodes = Object.values(graph);
  const splitters = graphNodes.filter((n) => n.isFanOutSplitter);
  const maxOutDegree = graphNodes.length > 0 ? Math.max(...graphNodes.map((n) => n.outDegree)) : 0;

  const authNodes = rawNodes.filter((n) => {
    const nodeCtx = ctx.getNodeContext(n.id || n.name);
    return nodeCtx?.hasAuth;
  });

  // Calculate variable vs literal count
  let totalVars = 0;
  let totalLiterals = 0;
  for (const node of rawNodes) {
    const nodeCtx = ctx.getNodeContext(node.id || node.name);
    if (nodeCtx) {
      totalVars += nodeCtx.variables.length;
      totalLiterals += nodeCtx.literals.length;
    }
  }
  const totalParams = totalVars + totalLiterals;
  const varRatio = totalParams > 0 ? Math.round((totalVars / totalParams) * 100) : 0;

  return (
    <div className="w-full mb-6 p-4 rounded-lg border bg-[rgba(8,8,8,0.88)] border-[var(--color-fi-border)] backdrop-blur">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--color-fi-border)]">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[var(--color-fi-accent)]" />
          <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-white">
            Context Intelligence Engine (Pre-Processing Layer)
          </h3>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[rgba(0,255,136,0.1)] text-[var(--color-fi-accent)] border border-[rgba(0,255,136,0.2)]">
          DEEP CONTEXT ACTIVE
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Topology & Fan-Out Card */}
        <div className="p-3 rounded bg-[rgba(15,15,15,0.7)] border border-[var(--color-fi-border)]">
          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-mono text-[var(--color-fi-info)]">
            <GitBranch className="w-3.5 h-3.5" /> GRAPH TOPOLOGY
          </div>
          <div className="text-lg font-mono font-bold tabular-nums text-white flex items-baseline gap-2">
            <span>{splitters.length} Splitters</span>
            <span className="text-xs font-normal text-[var(--color-fi-muted)]">Max {maxOutDegree}x out</span>
          </div>
          <p className="text-[10px] font-sans text-[var(--color-fi-muted)] mt-1">
            {graphNodes.length} nodes indexed with degree metrics
          </p>
        </div>

        {/* Deep Auth Resolution Card */}
        <div className="p-3 rounded bg-[rgba(15,15,15,0.7)] border border-[var(--color-fi-border)]">
          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-mono text-[var(--color-fi-accent)]">
            <Lock className="w-3.5 h-3.5" /> RESOLVED AUTHENTICATION
          </div>
          <div className="text-lg font-mono font-bold tabular-nums text-white flex items-baseline gap-2">
            <span>{authNodes.length} Protected</span>
            <span className="text-xs font-normal text-[var(--color-fi-muted)]">Endpoints</span>
          </div>
          <p className="text-[10px] font-sans text-[var(--color-fi-muted)] mt-1">
            Deep resolution (parameters.options.* scanned)
          </p>
        </div>

        {/* Static Metadata Card */}
        <div className="p-3 rounded bg-[rgba(15,15,15,0.7)] border border-[var(--color-fi-border)]">
          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-mono text-[var(--color-fi-warn)]">
            <FileText className="w-3.5 h-3.5" /> ROOT STATIC METADATA
          </div>
          <div className="text-lg font-mono font-bold tabular-nums text-white flex items-baseline gap-2">
            {ctx.root.hasReadme ? (
              <span className="text-[var(--color-fi-accent)] flex items-center gap-1 text-sm">
                <CheckCircle2 className="w-4 h-4" /> Root README
              </span>
            ) : (
              <span className="text-[var(--color-fi-warn)] flex items-center gap-1 text-sm">
                <AlertTriangle className="w-4 h-4" /> No Root README
              </span>
            )}
          </div>
          <p className="text-[10px] font-sans text-[var(--color-fi-muted)] mt-1 truncate">
            {ctx.root.errorWorkflow ? `Error WF: ${ctx.root.errorWorkflow}` : "No error workflow configured"}
          </p>
        </div>

        {/* Variable vs Literal Expression Ratio */}
        <div className="p-3 rounded bg-[rgba(15,15,15,0.7)] border border-[var(--color-fi-border)]">
          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-mono text-[#c084fc]">
            <Activity className="w-3.5 h-3.5" /> VARIABLE EXPRESSIONS
          </div>
          <div className="text-lg font-mono font-bold tabular-nums text-white flex items-baseline gap-2">
            <span>{varRatio}% Dynamic</span>
            <span className="text-xs font-normal text-[var(--color-fi-muted)]">({totalVars} $env)</span>
          </div>
          <p className="text-[10px] font-sans text-[var(--color-fi-muted)] mt-1">
            vs {totalLiterals} hardcoded string parameters
          </p>
        </div>
      </div>
    </div>
  );
}
