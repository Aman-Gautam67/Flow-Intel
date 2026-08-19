"use client";

import { useState } from "react";
import { Activity, Shield, CheckCircle2, XCircle, Copy, Check, ExternalLink } from "lucide-react";
import type { AnalysisResult } from "@/types";

interface InlineReportPanelProps {
  result: AnalysisResult;
  slug: string | null;
  filename: string | null;
  onAnalyzeAnother: () => void;
  onToggleDiff: () => void;
}

function scoreColor(n: number) {
  if (n >= 80) return "#00ff88";
  if (n >= 60) return "#f7d774";
  if (n >= 40) return "#f7a35c";
  return "#ff5d5d";
}

function gradeFromScore(n: number) {
  if (n >= 95) return "A+";
  if (n >= 87) return "A";
  if (n >= 80) return "A-";
  if (n >= 73) return "B+";
  if (n >= 67) return "B";
  if (n >= 60) return "B-";
  if (n >= 53) return "C+";
  if (n >= 47) return "C";
  if (n >= 40) return "C-";
  if (n >= 33) return "D+";
  if (n >= 20) return "D";
  return "F";
}

function MiniRing({ score, label }: { score: number | null; label: string }) {
  if (score === null) {
    return (
      <div className="flex flex-col items-center gap-1">
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r={22} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" strokeDasharray="4 4" />
          <text x="28" y="32" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)" fontFamily="var(--font-mono)">N/A</text>
        </svg>
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>{label}</span>
      </div>
    );
  }
  const r = 22; const circ = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circ} ${circ - (score / 100) * circ}`}
          strokeDashoffset={circ / 4}
          style={{ filter: `drop-shadow(0 0 4px ${color}55)` }} />
        <text x="28" y="32" textAnchor="middle" fontSize="12" fontWeight="600"
          fill="var(--color-fi-text)" fontFamily="var(--font-mono)">{score}</text>
      </svg>
      <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>{label}</span>
    </div>
  );
}

function FqiRing({ fqi }: { fqi: number }) {
  const r = 32; const circ = 2 * Math.PI * r;
  const color = scoreColor(fqi);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${(fqi / 100) * circ} ${circ - (fqi / 100) * circ}`}
          strokeDashoffset={circ / 4}
          style={{ filter: `drop-shadow(0 0 8px ${color}66)` }} />
        <text x="40" y="35" textAnchor="middle" fontSize="17" fontWeight="300"
          fill="var(--color-fi-text)" fontFamily="var(--font-mono)">{fqi}</text>
        <text x="40" y="50" textAnchor="middle" fontSize="8" fontWeight="700"
          fill={color} fontFamily="var(--font-mono)">{gradeFromScore(fqi)}</text>
      </svg>
      <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.4)" }}>FQI</span>
    </div>
  );
}

const SCORE_DIMS = [
  { key: "healthScore",       label: "Health" },
  { key: "securityScore",     label: "Security" },
  { key: "complexityScore",   label: "Simplicity" },
  { key: "reliabilityScore",  label: "Reliability" },
  { key: "debtScore",         label: "Debt" },
  { key: "memoryScore",       label: "Memory" },
  { key: "resilienceScore",   label: "Resilience" },
  { key: "privacyScore",      label: "Privacy" },
  { key: "aiGuardrailsScore", label: "AI Guard" },
];

const GATE_LABELS: Record<string, string> = {
  SECURITY_GATE:    "Security",
  RELIABILITY_GATE: "Reliability",
  MARKETPLACE_GATE: "Marketplace",
  PRODUCTION_GATE:  "Production",
  ENTERPRISE_GATE:  "Enterprise",
};

export function InlineReportPanel({ result, slug, filename, onAnalyzeAnother, onToggleDiff }: InlineReportPanelProps) {
  const { scores, parsed } = result;
  const [copied, setCopied] = useState(false);
  const allFlags = scores.flags;
  const critCount = allFlags.filter((f) => f.severity === "CRITICAL").length;
  const warnCount = allFlags.filter((f) => f.severity === "WARNING").length;
  const infoCount = allFlags.filter ((f) => f.severity === "INFO").length;
  const fqi = scores.overallScore;

  const gateResults = (scores as unknown as { gateResults?: Array<{ gate: string; passed: boolean }> }).gateResults ?? [];

  const handleCopyFlags = async () => {
    const lines = allFlags.map(
      (f) => `[${f.severity}] ${f.rule} — ${f.title}${f.nodeName ? ` (${f.nodeName})` : ""}`
    ).join("\n");
    await navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="mt-10 space-y-5">

      {/* Title row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-sans font-light text-xl tracking-tight mb-1">{parsed.name}</h2>
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
            <span>{parsed.platform}</span>
            <span>·</span>
            <span>{parsed.nodeCount} nodes</span>
            {parsed.aiNodesCount > 0 && <><span>·</span><span style={{ color: "#c084fc" }}>{parsed.aiNodesCount} AI</span></>}
            {filename && <><span>·</span><span>{filename}</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {critCount > 0 && <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 border" style={{ color: "var(--color-fi-crit)", borderColor: "rgba(255,93,93,0.3)", background: "rgba(255,93,93,0.07)" }}>{critCount} CRIT</span>}
          {warnCount > 0 && <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 border" style={{ color: "var(--color-fi-warn)", borderColor: "rgba(247,215,116,0.3)", background: "rgba(247,215,116,0.07)" }}>{warnCount} WARN</span>}
          {infoCount > 0 && <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 border" style={{ color: "var(--color-fi-info)", borderColor: "rgba(134,167,255,0.3)", background: "rgba(134,167,255,0.07)" }}>{infoCount} INFO</span>}
          {allFlags.length === 0 && <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 border" style={{ color: "var(--color-fi-accent)", borderColor: "rgba(0,255,136,0.3)", background: "rgba(0,255,136,0.06)" }}>✓ CLEAN</span>}
        </div>
      </div>

      {/* Deep Context Chips */}
      {(() => {
        const deepCtx = parsed.__deepContext;
        const graph = parsed.__graph;
        const splittersCount = graph ? Object.values(graph).filter((n: any) => n.isFanOutSplitter).length : 0;
        const hasRootReadme = deepCtx?.root?.hasReadme;

        return (
          <div className="flex items-center gap-3 px-4 py-2 border font-mono text-[10px] uppercase tracking-widest flex-wrap"
            style={{ borderColor: "var(--color-fi-border)", background: "rgba(10,10,10,0.6)" }}>
            <span className="text-[var(--color-fi-muted)]">Context Layer:</span>
            {splittersCount > 0 ? (
              <span className="px-2 py-0.5 rounded bg-[rgba(247,215,116,0.1)] text-[var(--color-fi-warn)] border border-[rgba(247,215,116,0.2)]">
                ⚡ {splittersCount} Fan-out Splitter{splittersCount > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-[rgba(255,255,255,0.04)] text-[var(--color-fi-muted)]">
                Topology Linear
              </span>
            )}
            {hasRootReadme ? (
              <span className="px-2 py-0.5 rounded bg-[rgba(0,255,136,0.1)] text-[var(--color-fi-accent)] border border-[rgba(0,255,136,0.2)]">
                ✓ Root README Detected
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-[rgba(255,93,93,0.1)] text-[var(--color-fi-crit)] border border-[rgba(255,93,93,0.2)]">
                ! No Root README
              </span>
            )}
            <span className="px-2 py-0.5 rounded bg-[rgba(134,167,255,0.1)] text-[var(--color-fi-info)] border border-[rgba(134,167,255,0.2)]">
              Deep Options Scan Active
            </span>
          </div>
        );
      })()}

      {/* Score rings + FQI */}
      <div className="border" style={{ borderColor: "var(--color-fi-border)", background: "rgba(8,8,8,0.72)" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>Score Breakdown</span>
        </div>
        <div className="flex flex-wrap items-center gap-6 px-6 py-5">
          <FqiRing fqi={fqi} />
          <div className="w-px self-stretch" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="flex flex-wrap gap-5">
            {SCORE_DIMS.map(({ key, label }) => {
              const raw = (scores as unknown as Record<string, number | null>)[key];
              const score: number | null =
                key === "aiGuardrailsScore" && !scores.aiApplicable ? null : raw ?? 0;
              return <MiniRing key={key} score={score} label={label} />;
            })}
          </div>
        </div>
      </div>

      {/* Quality gates — if available */}
      {gateResults.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px" style={{ background: "var(--color-fi-border)" }}>
          {gateResults.map((g) => (
            <div key={g.gate} className="flex items-center gap-2 px-4 py-3"
              style={{ background: "rgba(8,8,8,0.88)" }}>
              {g.passed
                ? <CheckCircle2 size={12} style={{ color: "var(--color-fi-accent)", flexShrink: 0 }} />
                : <XCircle size={12} style={{ color: "var(--color-fi-crit)", flexShrink: 0 }} />}
              <span className="font-mono text-[10px] uppercase tracking-widest"
                style={{ color: g.passed ? "var(--color-fi-accent)" : "var(--color-fi-crit)" }}>
                {GATE_LABELS[g.gate] ?? g.gate.replace("_GATE", "")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Metadata strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: "var(--color-fi-border)" }}>
        {[
          { label: "Nodes",          value: parsed.nodeCount },
          { label: "Connections",    value: parsed.connectionCount },
          { label: "Est. Cost / mo", value: `$${scores.estimatedCostUsd.toFixed(2)}` },
          { label: "Flags",          value: `${allFlags.length} (${critCount} crit)` },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1 p-4" style={{ background: "rgba(8,8,8,0.88)" }}>
            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>{s.label}</span>
            <span className="font-mono text-base font-light" style={{ color: "var(--color-fi-text)" }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Audit flags */}
      <div className="border" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
            Audit Flags ({allFlags.length})
          </span>
          <button onClick={handleCopyFlags}
            className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest transition-colors hover:text-[var(--color-fi-text)]"
            style={{ color: "var(--color-fi-muted)" }}>
            {copied ? <><Check size={10} style={{ color: "var(--color-fi-accent)" }} /> Copied</> : <><Copy size={10} /> Copy all</>}
          </button>
        </div>
        {allFlags.length === 0 ? (
          <div className="flex items-center gap-3 p-5">
            <CheckCircle2 size={16} style={{ color: "var(--color-fi-accent)" }} />
            <span className="font-mono text-sm" style={{ color: "var(--color-fi-muted)" }}>No flags — workflow passed all checks.</span>
          </div>
        ) : (
          <>
            {allFlags.slice(0, 10).map((f, i) => (
              <div key={i} className="flex items-center gap-4 px-5 border-b font-mono text-[11px] hover:bg-[rgba(255,255,255,0.015)] transition-colors"
                style={{ minHeight: "42px", borderColor: "rgba(255,255,255,0.05)", color: "rgba(240,240,240,0.72)" }}>
                <span className={`font-bold tracking-widest w-10 shrink-0 ${f.severity === "CRITICAL" ? "text-[var(--color-fi-crit)]" : f.severity === "WARNING" ? "text-[var(--color-fi-warn)]" : "text-[var(--color-fi-info)]"}`}>
                  {f.severity.slice(0, 4)}
                </span>
                <span className="flex-1 truncate">{f.title}</span>
                {f.nodeName && (
                  <span className="shrink-0 text-[9px] uppercase tracking-widest hidden sm:block" style={{ color: "rgba(240,240,240,0.32)" }}>
                    {f.nodeName}
                  </span>
                )}
                {f.ptsDeducted ? (
                  <span className="shrink-0 font-mono text-[9px] tabular-nums" style={{ color: "rgba(255,93,93,0.7)" }}>
                    −{f.ptsDeducted}
                  </span>
                ) : null}
              </div>
            ))}
            {allFlags.length > 10 && (
              <div className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-center" style={{ color: "var(--color-fi-muted)" }}>
                +{allFlags.length - 10} more flags — view full report ↓
              </div>
            )}
          </>
        )}
      </div>

      {/* CTA row */}
      <div className="flex gap-3 flex-wrap">
        {slug && (
          <a href={`/workflows/${slug}`}
            className="h-11 px-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] transition-all hover:scale-[1.02]"
            style={{ background: "var(--color-fi-accent)", color: "#090909" }}>
            <Activity size={13} /> Full Intelligence Report
          </a>
        )}
        {slug && (
          <a href={`/workflows/${slug}`} target="_blank" rel="noreferrer"
            className="h-11 px-4 flex items-center gap-2 border font-mono text-[11px] uppercase tracking-[0.1em] transition-colors hover:border-[rgba(0,255,136,0.4)]"
            style={{ borderColor: "rgba(255,255,255,0.18)", color: "var(--color-fi-muted)" }}>
            <ExternalLink size={12} />
          </a>
        )}
        <button onClick={onToggleDiff}
          className="h-11 px-5 flex items-center gap-2 border font-mono text-[11px] uppercase tracking-[0.1em] transition-colors hover:border-[rgba(0,255,136,0.4)] hover:text-[var(--color-fi-text)]"
          style={{ borderColor: "rgba(255,255,255,0.18)", color: "var(--color-fi-muted)" }}>
          <Shield size={12} /> Compare / Diff
        </button>
        <button onClick={onAnalyzeAnother}
          className="h-11 px-6 border font-mono text-[11px] uppercase tracking-[0.1em] transition-colors hover:border-[rgba(255,255,255,0.4)]"
          style={{ borderColor: "rgba(255,255,255,0.18)", color: "var(--color-fi-muted)" }}>
          Analyze another
        </button>
      </div>

    </div>
  );
}
