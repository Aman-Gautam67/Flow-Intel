"use client";

import { useState } from "react";
import { fi } from "@/lib/toast";
import { Copy, ArrowRight, Clipboard, Sparkles } from "lucide-react";
import type { AuditFlag } from "@/types";

interface RemediationDrawerProps {
  flag: AuditFlag | null;
  currentCategoryScore?: number;
  /** Raw nodes JSON — used for "Copy Fixed JSON" button */
  rawNodes?: unknown;
  onClose: () => void;
}

// ─── Grade helpers ────────────────────────────────────────────────────────────
function scoreToGrade(score: number): { grade: string; color: string } {
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

const SEV_COLORS: Record<string, string> = {
  CRITICAL: "var(--color-fi-crit)",
  WARNING:  "var(--color-fi-warn)",
  INFO:     "var(--color-fi-info)",
  PASS:     "var(--color-fi-accent)",
};

const CATEGORY_LABEL: Record<string, string> = {
  SECURITY:      "Security",
  HEALTH:        "Health",
  COMPLEXITY:    "Simplicity",
  RELIABILITY:   "Reliability",
  DEBT:          "Debt",
  MEMORY:        "Memory",
  RESILIENCE:    "Resilience",
  PRIVACY:       "Privacy",
  AI_GUARDRAILS: "AI Guard",
};

// ─── Apply jsonPatch ops to produce "fixed" JSON ──────────────────────────────
// Supports `replace`, `add`, `remove` ops on paths with both object keys and
// array indices (e.g. /parameters/options/0/key). Numeric segments are treated
// as array indices and the cursor is narrowed to the correct array slot.
function applyPatches(
  base: unknown,
  patches: Array<{ op: string; path: string; value?: unknown }>
): unknown {
  // Deep clone so we never mutate the original
  const obj = JSON.parse(JSON.stringify(base));
  for (const patch of patches) {
    const parts = patch.path.replace(/^\//, "").split("/");
    let cursor: unknown = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      if (Array.isArray(cursor)) {
        const idx = Number(p);
        while ((cursor as unknown[]).length <= idx) (cursor as unknown[]).push(undefined);
        cursor = (cursor as unknown[])[idx];
      } else if (cursor && typeof cursor === "object") {
        const c = cursor as Record<string, unknown>;
        if (!(p in c)) {
          const nextIsNumeric = parts[i + 1] !== undefined && /^\d+$/.test(parts[i + 1]!);
          c[p] = nextIsNumeric ? [] : {};
        }
        cursor = c[p];
      } else {
        cursor = undefined;
        break;
      }
    }
    if (cursor === undefined) continue;

    const last = parts[parts.length - 1]!;
    const lastIsNumeric = /^\d+$/.test(last);

    if (patch.op === "replace" || patch.op === "add") {
      if (Array.isArray(cursor) && lastIsNumeric) {
        const idx = Number(last);
        while ((cursor as unknown[]).length <= idx) (cursor as unknown[]).push(undefined);
        (cursor as unknown[])[idx] = patch.value;
      } else if (cursor && typeof cursor === "object") {
        (cursor as Record<string, unknown>)[last] = patch.value;
      }
    } else if (patch.op === "remove") {
      if (Array.isArray(cursor) && lastIsNumeric) {
        (cursor as unknown[]).splice(Number(last), 1);
      } else if (cursor && typeof cursor === "object") {
        delete (cursor as Record<string, unknown>)[last];
      }
    }
  }
  return obj;
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ text, label, variant = "default" }: { text: string; label: string; variant?: "default" | "accent" }) {
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => fi.copied(label));
  };
  if (variant === "accent") {
    return (
      <button
        onClick={copy}
        className="flex items-center gap-2 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-all"
        style={{
          background: "rgba(0,255,136,0.1)",
          border: "1px solid rgba(0,255,136,0.4)",
          color: "var(--color-fi-accent)",
        }}
      >
        <Clipboard size={12} />
        {label}
      </button>
    );
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 px-3 py-2 border font-mono text-[10px] uppercase tracking-widest transition-all hover:border-[var(--color-fi-accent)] hover:text-[var(--color-fi-text)]"
      style={{
        borderColor: "rgba(0,255,136,0.3)",
        color: "rgba(240,240,240,0.72)",
        background: "rgba(0,255,136,0.04)",
      }}
    >
      <Copy size={11} />
      {label}
    </button>
  );
}

// ─── Before / After score panel ───────────────────────────────────────────────
function ScoreImpactPreview({
  category, currentScore, ptsDeducted, onGradeUp,
}: {
  category: string;
  currentScore: number;
  ptsDeducted: number;
  onGradeUp?: () => void;
}) {
  const patched  = Math.min(100, currentScore + ptsDeducted);
  const before   = scoreToGrade(currentScore);
  const after    = scoreToGrade(patched);
  const dimLabel = CATEGORY_LABEL[category] ?? category;
  const improved = patched > currentScore;
  const gradeUp  = before.grade !== after.grade && improved;

  // Fire glow callback once on mount when grade improves
  useState(() => { if (gradeUp && onGradeUp) onGradeUp(); });

  return (
    <div
      className="border p-4 space-y-3"
      style={{ borderColor: "rgba(0,255,136,0.22)", background: "rgba(0,255,136,0.03)" }}
    >
      <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-fi-accent)" }}>
        Blast Radius Preview — {dimLabel} Score
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>Before</span>
          <div className="flex items-end gap-1.5">
            <span className="font-mono text-2xl font-light" style={{ color: before.color }}>{currentScore}</span>
            <span className="font-mono text-sm font-bold mb-0.5 px-1.5 py-0.5"
              style={{ color: before.color, background: `${before.color}18`, border: `1px solid ${before.color}44` }}>
              {before.grade}
            </span>
          </div>
        </div>
        <ArrowRight size={16} style={{ color: improved ? "var(--color-fi-accent)" : "var(--color-fi-muted)" }} />
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>After Fix</span>
          <div className={`flex items-end gap-1.5 ${gradeUp ? "grade-glow" : ""}`}>
            <span className="font-mono text-2xl font-light" style={{ color: after.color }}>{patched}</span>
            <span className={`font-mono text-sm font-bold mb-0.5 px-1.5 py-0.5 ${gradeUp ? "ring-pulse" : ""}`}
              style={{ color: after.color, background: `${after.color}18`, border: `1px solid ${after.color}44` }}>
              {after.grade}
            </span>
          </div>
        </div>
        {improved && (
          <div className="ml-auto font-mono text-xs" style={{ color: "var(--color-fi-accent)" }}>
            +{patched - currentScore} pts
            {gradeUp && (
              <span className="ml-2 flex items-center gap-1" style={{ color: "var(--color-fi-accent)" }}>
                <Sparkles size={11} /> {before.grade} → {after.grade}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="h-1.5 w-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full transition-all duration-500" style={{ width: `${currentScore}%`, background: before.color }} />
        </div>
        <div className="h-1.5 w-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className={`h-full transition-all duration-500 ${gradeUp ? "ring-pulse" : ""}`}
            style={{ width: `${patched}%`, background: after.color }} />
        </div>
        <div className="flex justify-between font-mono text-[9px]" style={{ color: "var(--color-fi-muted)" }}>
          <span>Current</span><span>Patched</span>
        </div>
      </div>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
export function RemediationDrawer({ flag, currentCategoryScore, rawNodes, onClose }: RemediationDrawerProps) {
  const [glowing, setGlowing] = useState(false);

  if (!flag) return null;

  const sevColor = SEV_COLORS[flag.severity] ?? "var(--color-fi-muted)";

  const handleDownloadPatch = () => {
    if (!flag.remediation?.jsonPatch) return;
    const blob = new Blob(
      [JSON.stringify({ nodeId: flag.id, nodeName: flag.nodeName, patches: flag.remediation.jsonPatch }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patch-${flag.rule.toLowerCase().replace(/_/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    fi.downloaded(`patch-${flag.rule.toLowerCase().replace(/_/g, "-")}.json`);
  };

  // Build "fixed JSON" by applying the patch to rawNodes (or full raw JSON)
  const fixedJsonStr = (() => {
    if (!flag.remediation?.jsonPatch?.length || !rawNodes) return null;
    try {
      const fixed = applyPatches(rawNodes, flag.remediation.jsonPatch);
      return JSON.stringify(fixed, null, 2);
    } catch {
      return null;
    }
  })();

  const showScorePreview =
    currentCategoryScore !== undefined &&
    flag.ptsDeducted != null &&
    flag.ptsDeducted > 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 border-t ${glowing ? "grade-glow" : ""}`}
        style={{
          background: "rgba(10,10,10,0.98)",
          borderColor: sevColor,
          maxHeight: "78vh",
          overflowY: "auto",
          paddingBottom: "var(--safe-bottom)",
        }}>

        {/* Handle bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0"
          style={{ borderColor: "var(--color-fi-border)", background: "rgba(10,10,10,0.98)" }}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] font-bold tracking-widest uppercase" style={{ color: sevColor }}>
              {flag.severity}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
              {flag.rule}
            </span>
          </div>
          <button onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-widest hover:text-[var(--color-fi-text)] transition-colors"
            style={{ color: "var(--color-fi-muted)" }}>
            [ESC] Close
          </button>
        </div>

        <div className="px-6 py-6 space-y-6 max-w-3xl">

          {/* Title + detail */}
          <div>
            <h3 className="font-sans font-medium text-base mb-2">{flag.title}</h3>
            <p className="font-sans text-sm leading-relaxed" style={{ color: "var(--color-fi-muted)" }}>{flag.detail}</p>
          </div>

          {/* Node info row */}
          {flag.nodeName && (
            <div className="flex gap-6 flex-wrap">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--color-fi-muted)" }}>Node</div>
                <div className="font-mono text-[12px]" style={{ color: "var(--color-fi-text)" }}>{flag.nodeName}</div>
              </div>
              {flag.nodeType && (
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--color-fi-muted)" }}>Type</div>
                  <div className="font-mono text-[12px]" style={{ color: "var(--color-fi-accent)" }}>{flag.nodeType}</div>
                </div>
              )}
              {flag.ptsDeducted != null && flag.ptsDeducted > 0 && (
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--color-fi-muted)" }}>Score Impact</div>
                  <div className="font-mono text-[12px]" style={{ color: "var(--color-fi-crit)" }}>−{flag.ptsDeducted} pts</div>
                </div>
              )}
            </div>
          )}

          {/* Before / After score preview + glow trigger */}
          {showScorePreview && (
            <ScoreImpactPreview
              category={flag.category}
              currentScore={currentCategoryScore!}
              ptsDeducted={flag.ptsDeducted!}
              onGradeUp={() => setGlowing(true)}
            />
          )}

          {/* Env-var copy snippet */}
          {flag.envVarExpression && (
            <div className="border p-4 space-y-3"
              style={{ borderColor: "rgba(255,90,90,0.28)", background: "rgba(255,90,90,0.04)" }}>
              <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-fi-crit)" }}>
                Quick Fix — Copy n8n Env Var Expression
              </div>
              <p className="font-sans text-[12px] leading-relaxed" style={{ color: "rgba(240,240,240,0.65)" }}>
                Paste this expression into the field that contained the hardcoded secret.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <code className="font-mono text-[12px] px-3 py-2 border flex-1 min-w-0 truncate"
                  style={{ borderColor: "rgba(255,90,90,0.28)", background: "rgba(0,0,0,0.4)", color: "var(--color-fi-accent)" }}>
                  {flag.envVarExpression}
                </code>
                <CopyButton text={flag.envVarExpression} label="Copy expression" />
              </div>
            </div>
          )}

          {/* Remediation steps */}
          {flag.remediation && (
            <div className="space-y-4">
              {flag.remediation.n8nUiInstruction && (
                <div className="border p-4" style={{ borderColor: "rgba(0,255,136,0.22)", background: "rgba(0,255,136,0.03)" }}>
                  <div className="font-mono text-[9px] uppercase tracking-widest mb-2" style={{ color: "var(--color-fi-accent)" }}>
                    n8n UI Fix
                  </div>
                  <p className="font-sans text-sm leading-relaxed" style={{ color: "var(--color-fi-text)" }}>
                    {flag.remediation.n8nUiInstruction}
                  </p>
                </div>
              )}

              {flag.remediation.description && (
                <div className="border p-4" style={{ borderColor: "var(--color-fi-border)", background: "rgba(255,255,255,0.02)" }}>
                  <div className="font-mono text-[9px] uppercase tracking-widest mb-2" style={{ color: "var(--color-fi-muted)" }}>
                    Recommended Action
                  </div>
                  <p className="font-sans text-sm leading-relaxed" style={{ color: "rgba(240,240,240,0.72)" }}>
                    {flag.remediation.description}
                  </p>
                </div>
              )}

              {flag.remediation.jsonPatch && flag.remediation.jsonPatch.length > 0 && (
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest mb-2" style={{ color: "var(--color-fi-muted)" }}>
                    JSON Patch Preview
                  </div>
                  <pre className="font-mono text-[11px] p-4 border overflow-auto terminal-scroll"
                    style={{ borderColor: "var(--color-fi-border)", background: "rgba(0,0,0,0.4)", color: "var(--color-fi-accent)" }}>
                    {JSON.stringify(flag.remediation.jsonPatch, null, 2)}
                  </pre>

                  {/* Action buttons row */}
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <button onClick={handleDownloadPatch}
                      className="h-9 px-5 flex items-center gap-2 border font-mono text-[10px] uppercase tracking-[0.1em] transition-all hover:bg-[var(--color-fi-accent)] hover:border-[var(--color-fi-accent)] hover:text-black"
                      style={{ borderColor: "rgba(255,255,255,0.18)", color: "var(--color-fi-text)", background: "rgba(255,255,255,0.04)" }}>
                      Download Patch JSON
                    </button>

                    {/* ── Copy Fixed JSON — applies patch to rawNodes inline ── */}
                    {fixedJsonStr && (
                      <CopyButton
                        text={fixedJsonStr}
                        label="Copy fixed JSON"
                        variant="accent"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
