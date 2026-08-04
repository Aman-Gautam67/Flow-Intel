"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Terminal, Upload, FileJson, AlertCircle, CheckCircle2, Shield, Activity, Plus } from "lucide-react";
import type { AnalysisResult } from "@/types";
import { AstLoader } from "./ast-loader";
import { ImportModal } from "./import-modal";
import { BulkWorkspace, type BulkEntry } from "./bulk-workspace";
import { LiveDiffView } from "../workflow/live-diff-view";

type UploadState = "idle" | "dragging" | "parsing" | "saving" | "done" | "error";

interface InlineReport {
  result: AnalysisResult;
  slug: string | null;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#00ff88";
  if (score >= 60) return "#f7d774";
  if (score >= 40) return "#f7a35c";
  return "#ff5d5d";
}

function MiniRing({ score, label }: { score: number; label: string }) {
  const r = 22; const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = scoreColor(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4}
          style={{ filter: `drop-shadow(0 0 5px ${color}66)` }} />
        <text x="28" y="32" textAnchor="middle" fontSize="12" fontWeight="600"
          fill="var(--color-fi-text)" fontFamily="var(--font-mono)">{score}</text>
      </svg>
      <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>{label}</span>
    </div>
  );
}

async function runAnalysis(json: unknown, save: boolean, isPublic: boolean) {
  const res = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json, save, isPublic }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Analysis failed");
  return data as { result: AnalysisResult; slug: string | null; dbError?: string };
}

export function UploadPage() {
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dbWarning, setDbWarning] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [report, setReport] = useState<InlineReport | null>(null);
  const [savePublic, setSavePublic] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  // Bulk mode
  const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([]);
  const [bulkMode, setBulkMode] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const _router = useRouter();

  // ── Single-file processor ────────────────────────────────────────────────
  const processJson = useCallback(async (json: unknown, fname: string) => {
    setFilename(fname);
    setState("parsing");
    setError(null);
    setReport(null);

    try {
      await new Promise((r) => setTimeout(r, 320)); // let AST loader render
      setState("saving");
      const data = await runAnalysis(json, true, savePublic);
      if (data.dbError) setDbWarning(data.dbError);
      setReport({ result: data.result, slug: data.slug });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setState("error");
    }
  }, [savePublic]);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".json")) {
      setError("Only .json files are supported.");
      setState("error");
      return;
    }
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await processJson(json, file.name);
    } catch {
      setError("Could not parse file as JSON.");
      setState("error");
    }
  }, [processJson]);

  // ── Multi-file bulk processor ────────────────────────────────────────────
  const processMultipleFiles = useCallback(async (files: File[]) => {
    const jsonFiles = files.filter((f) => f.name.endsWith(".json"));
    if (jsonFiles.length === 0) { setError("No .json files found in drop."); setState("error"); return; }
    if (jsonFiles.length === 1) { await processFile(jsonFiles[0]!); return; }

    setBulkMode(true);
    const initial: BulkEntry[] = jsonFiles.map((f) => ({ filename: f.name, status: "pending" }));
    setBulkEntries(initial);

    for (let i = 0; i < jsonFiles.length; i++) {
      const file = jsonFiles[i]!;
      setBulkEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: "processing" } : e));
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const data = await runAnalysis(json, true, savePublic);
        setBulkEntries((prev) => prev.map((e, idx) => idx === i
          ? { ...e, status: "done", result: data.result, slug: data.slug }
          : e
        ));
      } catch (e) {
        setBulkEntries((prev) => prev.map((e2, idx) => idx === i
          ? { ...e2, status: "error", error: e instanceof Error ? e.message : "Failed" }
          : e2
        ));
      }
    }
  }, [processFile, savePublic]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState("idle");
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 1) {
      processMultipleFiles(files);
    } else if (files[0]) {
      processFile(files[0]);
    }
  }, [processFile, processMultipleFiles]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 1) {
      processMultipleFiles(files);
    } else if (files[0]) {
      processFile(files[0]);
    }
  }, [processFile, processMultipleFiles]);

  const handleImportJson = useCallback((json: unknown, fname: string) => {
    setShowImportModal(false);
    processJson(json, fname);
  }, [processJson]);

  const severityCounts = report ? {
    CRITICAL: report.result.scores.flags.filter((f) => f.severity === "CRITICAL").length,
    WARNING:  report.result.scores.flags.filter((f) => f.severity === "WARNING").length,
    INFO:     report.result.scores.flags.filter((f) => f.severity === "INFO").length,
  } : null;

  const isLoading = state === "parsing" || state === "saving";

  return (
    <div className="min-h-svh">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center px-5 py-2.5"
        style={{ borderBottom: "1px solid var(--color-fi-border)", background: "rgba(10,10,10,0.82)", backdropFilter: "blur(12px)" }}>
        <a href="/" className="flex items-center gap-3 w-48">
          <div className="w-7 h-7 border flex items-center justify-center text-[var(--color-fi-accent)] font-mono font-bold text-xs"
            style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }}>FI</div>
          <span className="font-mono text-sm tracking-[0.18em] uppercase">FlowIntel</span>
        </a>
        <div className="flex-1 flex items-center justify-center gap-8 font-mono text-[11px] tracking-widest uppercase" style={{ color: "var(--color-fi-muted)" }}>
          <a href="/search" className="hover:text-[var(--color-fi-text)] transition-colors">Catalog</a>
          <a href="/upload" className="text-[var(--color-fi-accent)]">Analyze</a>
        </div>
        <div className="w-48" />
      </nav>

      <div className="max-w-4xl mx-auto px-6 pt-20 pb-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2.5 font-mono text-[10px] tracking-[0.22em] uppercase mb-4"
            style={{ color: "rgba(240,240,240,0.48)" }}>
            <Terminal size={12} /> Upload & Analyze
          </div>
          <h1 className="font-sans font-light text-[clamp(28px,5vw,48px)] tracking-[-0.04em]">
            Drop your workflow JSON
          </h1>
          <p className="mt-3 text-sm" style={{ color: "var(--color-fi-muted)" }}>
            Upload a <code className="font-mono text-[var(--color-fi-accent)] text-xs">.json</code> export from{" "}
            <span style={{ color: "var(--color-fi-text)" }}>n8n</span>,{" "}
            <span style={{ color: "var(--color-fi-text)" }}>Make</span>,{" "}
            <span style={{ color: "var(--color-fi-text)" }}>Zapier</span>, or{" "}
            <span style={{ color: "var(--color-fi-text)" }}>Flowise / LangFlow</span>{" "}
            for an instant 9-dimension intelligence report.
          </p>
        </div>

        {/* ── Upload zone / AST loader / done state ── */}
        {(state === "idle" || state === "dragging" || state === "error") && !bulkMode && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setState("dragging"); }}
              onDragLeave={() => setState(state === "error" ? "error" : "idle")}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer border-2 border-dashed rounded-none transition-all relative"
              style={{
                borderColor: state === "dragging" ? "var(--color-fi-accent)" : state === "error" ? "var(--color-fi-crit)" : "rgba(255,255,255,0.18)",
                background: state === "dragging" ? "rgba(0,255,136,0.04)" : "rgba(8,8,8,0.58)",
                padding: "clamp(40px,8vw,72px) 24px",
              }}>
              <input ref={inputRef} type="file" accept=".json" multiple className="sr-only" onChange={onFileChange} />
              <div className="flex flex-col items-center gap-4 text-center">
                {state === "error"
                  ? <AlertCircle size={36} style={{ color: "var(--color-fi-crit)" }} />
                  : <FileJson size={36} style={{ color: state === "dragging" ? "var(--color-fi-accent)" : "var(--color-fi-muted)" }} />
                }
                <div>
                  <p className="font-sans text-base font-medium mb-1" style={{ color: "var(--color-fi-text)" }}>
                    {state === "error" ? error : state === "dragging" ? "Release to analyze" : "Drag & drop workflow JSON"}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
                    {state === "error" ? "Click to try again" : "Single or multiple .json files · or click to browse"}
                  </p>
                </div>
              </div>
              <span className="corner corner-tl" /><span className="corner corner-tr" />
              <span className="corner corner-bl" /><span className="corner corner-br" />
            </div>

            {/* Import via paste / URL */}
            <button
              onClick={() => setShowImportModal(true)}
              className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest transition-colors hover:text-[var(--color-fi-text)]"
              style={{ color: "var(--color-fi-muted)" }}
            >
              <Plus size={11} /> Paste JSON or import from URL
            </button>
          </>
        )}

        {/* AST Immersive Loader */}
        {isLoading && <AstLoader stage={state as "parsing" | "saving"} />}

        {/* Bulk workspace */}
        {bulkMode && bulkEntries.length > 0 && (
          <div className="space-y-4">
            <BulkWorkspace
              entries={bulkEntries}
              onClear={() => { setBulkMode(false); setBulkEntries([]); setState("idle"); }}
            />
          </div>
        )}

        {/* Options row */}
        {!bulkMode && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => setSavePublic((p) => !p)}
              className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest transition-colors"
              style={{ color: savePublic ? "var(--color-fi-accent)" : "var(--color-fi-muted)" }}>
              <span className="w-3 h-3 border flex items-center justify-center" style={{ borderColor: savePublic ? "var(--color-fi-accent)" : "rgba(255,255,255,0.18)" }}>
                {savePublic && <span className="w-1.5 h-1.5 bg-[var(--color-fi-accent)]" />}
              </span>
              Save to public catalog
            </button>
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.28)" }}>·</span>
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.4)" }}>
              Zero LLM calls · deterministic
            </span>
          </div>
        )}

        {/* ── Inline single-file report preview ── */}
        {state === "done" && report && !bulkMode && (
          <div className="mt-10 space-y-6">
            {dbWarning && (
              <div className="flex items-start gap-3 px-4 py-3 border"
                style={{ borderColor: "rgba(247,215,116,0.35)", background: "rgba(247,215,116,0.06)" }}>
                <span className="font-mono text-[9px] uppercase tracking-widest mt-0.5 px-1.5 py-0.5 border shrink-0"
                  style={{ color: "var(--color-fi-warn)", borderColor: "rgba(247,215,116,0.4)" }}>WARN</span>
                <p className="font-sans text-[12px] flex-1 leading-relaxed" style={{ color: "rgba(240,240,240,0.72)" }}>
                  Analysis complete — but the workflow could not be saved to the catalog.
                  <span className="block mt-1 font-mono text-[10px]" style={{ color: "var(--color-fi-muted)" }}>{dbWarning}</span>
                </p>
                <button onClick={() => setDbWarning(null)}
                  className="shrink-0 font-mono text-[10px] uppercase tracking-widest transition-colors hover:text-[var(--color-fi-text)]"
                  style={{ color: "var(--color-fi-muted)" }}>✕</button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <h2 className="font-sans font-light text-xl tracking-tight">{report.result.parsed.name}</h2>
              {report.slug && (
                <a href={`/workflows/${report.slug}`}
                  className="h-9 px-5 flex items-center gap-2 border font-mono text-[10px] uppercase tracking-[0.1em] transition-all hover:bg-[var(--color-fi-accent)] hover:border-[var(--color-fi-accent)] hover:text-black"
                  style={{ borderColor: "rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.04)", color: "var(--color-fi-text)" }}>
                  <Activity size={12} /> Full Report →
                </a>
              )}
            </div>
            {/* Score rings */}
            <div className="flex flex-wrap gap-6 p-6 border" style={{ borderColor: "var(--color-fi-border)", background: "rgba(8,8,8,0.72)" }}>
              {[
                { key: "healthScore",       label: "Health" },
                { key: "securityScore",     label: "Security" },
                { key: "complexityScore",   label: "Simplicity" },
                { key: "reliabilityScore",  label: "Reliability" },
                { key: "debtScore",         label: "Debt" },
                { key: "memoryScore",       label: "Memory" },
                { key: "resilienceScore",   label: "Resilience" },
                { key: "privacyScore",      label: "Privacy" },
                { key: "aiGuardrailsScore", label: "AI Guard" },
              ].map(({ key, label }) => (
                <MiniRing key={key} score={(report.result.scores as unknown as Record<string, number>)[key]} label={label} />
              ))}
            </div>
            {/* Flag summary */}
            <div className="border" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
              <div className="flex items-center justify-between px-5 py-3 border-b font-mono text-[10px] tracking-[0.16em] uppercase"
                style={{ borderColor: "var(--color-fi-border)", color: "rgba(240,240,240,0.56)" }}>
                <span>Audit Flags ({report.result.scores.flags.length})</span>
                <div className="flex gap-4">
                  {severityCounts?.CRITICAL ? <span style={{ color: "var(--color-fi-crit)" }}>{severityCounts.CRITICAL} CRIT</span> : null}
                  {severityCounts?.WARNING  ? <span style={{ color: "var(--color-fi-warn)" }}>{severityCounts.WARNING} WARN</span> : null}
                  {severityCounts?.INFO     ? <span style={{ color: "var(--color-fi-info)" }}>{severityCounts.INFO} INFO</span> : null}
                </div>
              </div>
              {report.result.scores.flags.slice(0, 8).map((f, i) => (
                <div key={i} className="flex items-center gap-4 px-5 border-b font-mono text-[11px]"
                  style={{ minHeight: "42px", borderColor: "rgba(255,255,255,0.06)", color: "rgba(240,240,240,0.7)" }}>
                  <span className={`font-bold tracking-widest w-14 shrink-0 ${f.severity === "CRITICAL" ? "text-[var(--color-fi-crit)]" : f.severity === "WARNING" ? "text-[var(--color-fi-warn)]" : "text-[var(--color-fi-info)]"}`}>
                    {f.severity.slice(0, 4)}
                  </span>
                  <span className="flex-1 truncate">{f.title}</span>
                  <span className="shrink-0 text-[9px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.36)" }}>{f.category}</span>
                </div>
              ))}
              {report.result.scores.flags.length > 8 && (
                <div className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-center" style={{ color: "var(--color-fi-muted)" }}>
                  +{report.result.scores.flags.length - 8} more flags — view full report
                </div>
              )}
            </div>
            {/* Cost + metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: "var(--color-fi-border)" }}>
              {[
                { label: "Nodes", value: report.result.parsed.nodeCount },
                { label: "Est. Cost / mo", value: `$${report.result.scores.estimatedCostUsd.toFixed(2)}` },
                { label: "AI Nodes", value: report.result.parsed.aiNodesCount },
                { label: "Platform", value: report.result.parsed.platform },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-1 p-5" style={{ background: "rgba(8,8,8,0.88)" }}>
                  <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>{s.label}</span>
                  <span className="font-mono text-lg font-light" style={{ color: "var(--color-fi-text)" }}>{s.value}</span>
                </div>
              ))}
            </div>
            {/* CTA */}
            <div className="flex gap-3 flex-wrap">
              {report.slug && (
                <a href={`/workflows/${report.slug}`}
                  className="h-11 px-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] transition-all hover:scale-[1.02]"
                  style={{ background: "var(--color-fi-accent)", color: "#090909", border: "1px solid var(--color-fi-accent)" }}>
                  <Shield size={13} /> Full Intelligence Report
                </a>
              )}
              <button
                onClick={() => setShowDiff((p) => !p)}
                className="h-11 px-5 flex items-center gap-2 border font-mono text-[11px] uppercase tracking-[0.1em] transition-colors hover:border-[rgba(0,255,136,0.4)] hover:text-[var(--color-fi-text)]"
                style={{ borderColor: "rgba(255,255,255,0.18)", color: "var(--color-fi-muted)" }}>
                ⇄ Compare / Diff
              </button>
              <button onClick={() => { setState("idle"); setReport(null); setFilename(null); setDbWarning(null); setShowDiff(false); }}
                className="h-11 px-6 border font-mono text-[11px] uppercase tracking-[0.1em] transition-colors hover:border-[rgba(255,255,255,0.4)]"
                style={{ borderColor: "rgba(255,255,255,0.18)", color: "var(--color-fi-muted)" }}>
                Analyze another
              </button>
            </div>

            {/* Live Diff View */}
            {showDiff && (
              <LiveDiffView
                baseline={report.result}
                baselineName={filename ?? "original.json"}
                onClose={() => setShowDiff(false)}
              />
            )}
          </div>
        )}

        {/* Suppress unused import warning */}
        <span className="sr-only">{filename}{_router ? "" : ""}<Upload size={0} /></span>
      </div>

      {/* Import modal */}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onJson={handleImportJson}
        />
      )}
    </div>
  );
}
