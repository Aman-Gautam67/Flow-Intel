"use client";

import { CheckCircle2, AlertCircle, Loader2, Activity, ExternalLink } from "lucide-react";
import type { AnalysisResult } from "@/types";

export interface BulkEntry {
  filename: string;
  status: "pending" | "processing" | "done" | "error";
  error?: string;
  result?: AnalysisResult;
  slug?: string | null;
}

function getGrade(score: number): { grade: string; color: string } {
  if (score >= 95) return { grade: "A+", color: "#00ff88" };
  if (score >= 87) return { grade: "A",  color: "#00ff88" };
  if (score >= 80) return { grade: "A-", color: "#00ee77" };
  if (score >= 73) return { grade: "B+", color: "#66ff99" };
  if (score >= 67) return { grade: "B",  color: "#66ff99" };
  if (score >= 60) return { grade: "B-", color: "#a3e8ab" };
  if (score >= 53) return { grade: "C+", color: "#f7d774" };
  if (score >= 47) return { grade: "C",  color: "#f7d774" };
  if (score >= 40) return { grade: "C-", color: "#f7b96e" };
  if (score >= 33) return { grade: "D+", color: "#ff8c5a" };
  if (score >= 27) return { grade: "D",  color: "#ff7042" };
  if (score >= 20) return { grade: "D-", color: "#ff5d5d" };
  return { grade: "F", color: "#ff3b3b" };
}

function overallScore(r: AnalysisResult): number {
  const s = r.scores;
  return s.overallScore ?? Math.round(
    (s.healthScore + (s.securityScore ?? 100) + s.complexityScore + s.reliabilityScore +
     s.debtScore + s.memoryScore + s.resilienceScore + s.privacyScore + (s.aiGuardrailsScore ?? 100)) / 9
  );
}

interface BulkWorkspaceProps {
  entries: BulkEntry[];
  onClear: () => void;
}

export function BulkWorkspace({ entries, onClear }: BulkWorkspaceProps) {
  const done  = entries.filter((e) => e.status === "done").length;
  const total = entries.length;

  return (
    <div className="border" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b font-mono text-[10px] uppercase tracking-widest"
        style={{ borderColor: "rgba(255,255,255,0.06)", color: "var(--color-fi-muted)" }}>
        <span>Bulk Analysis — {done}/{total} complete</span>
        <button
          onClick={onClear}
          className="transition-colors hover:text-[var(--color-fi-crit)]"
          style={{ color: "var(--color-fi-muted)" }}
        >
          Clear all
        </button>
      </div>

      {/* Rows */}
      {entries.map((entry, i) => {
        const score = entry.result ? overallScore(entry.result) : null;
        const grade = score !== null ? getGrade(score) : null;
        const critCount = entry.result
          ? entry.result.scores.flags.filter((f) => f.severity === "CRITICAL").length
          : 0;
        const nodeCount = entry.result?.parsed.nodeCount ?? 0;

        return (
          <div
            key={i}
            className="row-slide flex items-center gap-4 px-5 border-b font-mono text-[11px]"
            style={{
              minHeight: "50px",
              borderColor: "rgba(255,255,255,0.06)",
              animationDelay: `${i * 60}ms`,
            }}
          >
            {/* Status icon */}
            <div className="shrink-0">
              {entry.status === "done"       && <CheckCircle2 size={14} style={{ color: "var(--color-fi-accent)" }} />}
              {entry.status === "error"      && <AlertCircle  size={14} style={{ color: "var(--color-fi-crit)"   }} />}
              {entry.status === "processing" && <Loader2      size={14} className="animate-spin" style={{ color: "var(--color-fi-accent)" }} />}
              {entry.status === "pending"    && <div className="w-3.5 h-3.5 border" style={{ borderColor: "rgba(255,255,255,0.2)" }} />}
            </div>

            {/* Filename */}
            <span className="flex-1 truncate" style={{ color: entry.status === "error" ? "var(--color-fi-crit)" : "rgba(240,240,240,0.8)" }}>
              {entry.filename}
              {entry.error && (
                <span className="ml-2 text-[9px]" style={{ color: "var(--color-fi-muted)" }}>
                  — {entry.error}
                </span>
              )}
            </span>

            {/* Grade badge */}
            {grade && (
              <span
                className="shrink-0 font-bold px-2 py-0.5 text-[11px]"
                style={{ color: grade.color, background: `${grade.color}18`, border: `1px solid ${grade.color}44` }}
              >
                {grade.grade}
              </span>
            )}

            {/* Score */}
            {score !== null && (
              <span className="shrink-0 text-[12px] w-8 text-right" style={{ color: grade?.color ?? "inherit" }}>
                {score}
              </span>
            )}

            {/* Node count */}
            {nodeCount > 0 && (
              <span className="shrink-0 text-[9px] uppercase tracking-widest hidden sm:block" style={{ color: "rgba(240,240,240,0.38)" }}>
                {nodeCount} nodes
              </span>
            )}

            {/* CRIT count */}
            {critCount > 0 && (
              <span className="shrink-0 text-[9px]" style={{ color: "var(--color-fi-crit)" }}>
                {critCount} CRIT
              </span>
            )}

            {/* Full report link */}
            {entry.slug && (
              <a
                href={`/workflows/${entry.slug}`}
                className="shrink-0 transition-colors hover:text-[var(--color-fi-accent)]"
                style={{ color: "var(--color-fi-muted)" }}
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        );
      })}

      {/* Progress bar */}
      {done < total && (
        <div className="h-1" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${(done / total) * 100}%`, background: "var(--color-fi-accent)" }}
          />
        </div>
      )}
    </div>
  );
}
