"use client";

import { useState, useRef } from "react";
import { ArrowRight, Upload, X, CheckCircle2, Plus, Minus } from "lucide-react";
import type { AnalysisResult, AuditFlag } from "@/types";

interface LiveDiffViewProps {
  baseline: AnalysisResult;
  baselineName: string;
  onClose: () => void;
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

function scoreColor(score: number) {
  if (score >= 80) return "#00ff88";
  if (score >= 60) return "#f7d774";
  if (score >= 40) return "#f7a35c";
  return "#ff5d5d";
}

function getGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 87) return "A";
  if (score >= 80) return "A-";
  if (score >= 73) return "B+";
  if (score >= 67) return "B";
  if (score >= 60) return "B-";
  if (score >= 53) return "C+";
  if (score >= 47) return "C";
  if (score >= 40) return "C-";
  if (score >= 33) return "D+";
  if (score >= 27) return "D";
  if (score >= 20) return "D-";
  return "F";
}

function deltaColor(delta: number) {
  if (delta > 0) return "#00ff88";
  if (delta < 0) return "#ff5d5d";
  return "#737373";
}

/**
 * LiveDiffView: side-by-side comparison of original vs. re-uploaded/patched workflow.
 * Users drop a second file; it's analysed client-side via /api/parse.
 */
export function LiveDiffView({ baseline, baselineName, onClose }: LiveDiffViewProps) {
  const [patched, setPatched]       = useState<AnalysisResult | null>(null);
  const [patchedName, setPatchedName] = useState<string>("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runAnalysis = async (file: File) => {
    if (!file.name.endsWith(".json")) { setError("Only .json files supported."); return; }
    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res  = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json, save: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setPatched(data.result);
      setPatchedName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const baseFlags = (baseline.scores.flags ?? []) as AuditFlag[];
  const patchFlags = (patched?.scores.flags ?? []) as AuditFlag[];

  const newFlags      = patchFlags.filter((f) => !baseFlags.some((b) => b.rule === f.rule && b.nodeName === f.nodeName));
  const resolvedFlags = baseFlags.filter((f) => !patchFlags.some((p) => p.rule === f.rule && p.nodeName === f.nodeName));

  const bs = baseline.scores as unknown as Record<string, number>;
  const ps = (patched?.scores ?? {}) as unknown as Record<string, number>;

  return (
    <div
      className="border"
      style={{
        borderColor: "rgba(0,255,136,0.25)",
        background: "rgba(4,10,6,0.92)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "var(--color-fi-border)" }}>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--color-fi-accent)" }}>
          Live Score Diff
        </span>
        <button onClick={onClose} style={{ color: "var(--color-fi-muted)" }} className="hover:text-[var(--color-fi-text)] transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Upload zone for second file */}
      {!patched && (
        <div className="p-5 space-y-4">
          <p className="font-sans text-[12px]" style={{ color: "var(--color-fi-muted)" }}>
            Upload a revised or patched workflow to compare it against{" "}
            <span style={{ color: "var(--color-fi-text)" }}>{baselineName}</span>.
          </p>
          <div
            className="border-2 border-dashed flex flex-col items-center gap-3 cursor-pointer transition-all"
            style={{ borderColor: "rgba(255,255,255,0.18)", padding: "28px 16px" }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) runAnalysis(f); }}
          >
            {loading
              ? <div className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--color-fi-accent)" }}>Analysing…</div>
              : <>
                  <Upload size={22} style={{ color: "var(--color-fi-muted)" }} />
                  <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
                    Drop patched workflow JSON
                  </span>
                </>
            }
          </div>
          <input ref={inputRef} type="file" accept=".json" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) runAnalysis(f); }} />
          {error && (
            <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-crit)" }}>✕ {error}</p>
          )}
        </div>
      )}

      {/* Diff results */}
      {patched && (
        <div className="p-5 space-y-5">
          {/* Column headers */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Original", name: baselineName, result: baseline, accent: "#ff5d5d" },
              { label: "Patched", name: patchedName, result: patched, accent: "#00ff88" },
            ].map(({ label, name, result, accent }) => {
              const overall = SCORE_DIMS.reduce((sum, { key }) => sum + ((result.scores as unknown as Record<string, number>)[key] ?? 0), 0);
              const avg = Math.round(overall / SCORE_DIMS.length);
              const grade = getGrade(avg);
              return (
                <div key={label} className="border p-4 space-y-2"
                  style={{ borderColor: accent + "44", background: accent + "08" }}>
                  <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: accent }}>{label}</div>
                  <div className="font-sans text-[11px] truncate" style={{ color: "var(--color-fi-muted)" }}>{name}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-light" style={{ color: scoreColor(avg) }}>{avg}</span>
                    <span className="font-mono text-base font-bold px-2 py-0.5"
                      style={{ color: scoreColor(avg), background: scoreColor(avg) + "18", border: `1px solid ${scoreColor(avg)}44` }}>
                      {grade}
                    </span>
                  </div>
                  <div className="font-mono text-[9px]" style={{ color: "var(--color-fi-muted)" }}>
                    {result.scores.flags.filter((f) => f.severity === "CRITICAL").length} CRIT ·{" "}
                    {result.scores.flags.filter((f) => f.severity === "WARNING").length} WARN
                  </div>
                </div>
              );
            })}
          </div>

          {/* Score-by-score delta rows */}
          <div className="border" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
            {SCORE_DIMS.map(({ key, label }) => {
              const before  = bs[key] ?? 0;
              const after   = ps[key] ?? 0;
              const delta   = after - before;
              return (
                <div key={key}
                  className="flex items-center justify-between px-4 py-2.5 border-b font-mono text-[11px]"
                  style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <span className="w-24 uppercase tracking-widest text-[9px]" style={{ color: "var(--color-fi-muted)" }}>{label}</span>
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-right" style={{ color: scoreColor(before) }}>{before}</span>
                    <ArrowRight size={10} style={{ color: "var(--color-fi-muted)" }} />
                    <span className="w-6 text-right" style={{ color: scoreColor(after) }}>{after}</span>
                    <span className="w-10 text-right font-bold" style={{ color: deltaColor(delta) }}>
                      {delta > 0 ? "+" : ""}{delta}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Flag changes */}
          {(newFlags.length + resolvedFlags.length) > 0 && (
            <div className="space-y-1">
              <div className="font-mono text-[9px] uppercase tracking-widest mb-2" style={{ color: "var(--color-fi-muted)" }}>
                Flag Changes ({resolvedFlags.length} fixed · {newFlags.length} introduced)
              </div>
              {resolvedFlags.map((f, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 font-mono text-[10px]"
                  style={{ background: "rgba(0,255,136,0.04)", borderLeft: "2px solid var(--color-fi-accent)" }}>
                  <CheckCircle2 size={11} style={{ color: "var(--color-fi-accent)" }} />
                  <Minus size={9} style={{ color: "var(--color-fi-accent)" }} />
                  <span style={{ color: "var(--color-fi-accent)" }}>FIXED</span>
                  <span className="flex-1 truncate" style={{ color: "rgba(240,240,240,0.7)" }}>{f.title}</span>
                </div>
              ))}
              {newFlags.map((f, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 font-mono text-[10px]"
                  style={{ background: "rgba(255,93,93,0.04)", borderLeft: "2px solid var(--color-fi-crit)" }}>
                  <Plus size={11} style={{ color: "var(--color-fi-crit)" }} />
                  <span style={{ color: "var(--color-fi-crit)" }}>NEW</span>
                  <span className="flex-1 truncate" style={{ color: "rgba(240,240,240,0.7)" }}>{f.title}</span>
                </div>
              ))}
            </div>
          )}
          {newFlags.length === 0 && resolvedFlags.length === 0 && (
            <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
              No flag changes detected between versions.
            </p>
          )}

          {/* Reset */}
          <button
            onClick={() => { setPatched(null); setPatchedName(""); }}
            className="font-mono text-[10px] uppercase tracking-widest transition-colors hover:text-[var(--color-fi-text)]"
            style={{ color: "var(--color-fi-muted)" }}
          >
            ← Upload a different file
          </button>
        </div>
      )}
    </div>
  );
}
