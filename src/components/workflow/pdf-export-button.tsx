"use client";

import { useState, createElement } from "react";
import { fi } from "@/lib/toast";
import { FileText, Loader2 } from "lucide-react";
import type { WorkflowScore } from "@/lib/db/schema";
import type { AuditFlag } from "@/types";

interface PdfExportButtonProps {
  slug: string;
  title: string;
  platform: string;
  nodeCount: number;
  scores: WorkflowScore;
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

// Colour helpers for the light theme
function scoreColor(score: number): string {
  if (score >= 80) return "#16a34a"; // green-700
  if (score >= 60) return "#d97706"; // amber-600
  if (score >= 40) return "#ea580c"; // orange-600
  return "#dc2626";                   // red-600
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

/**
 * Light-theme PDF report using @react-pdf/renderer.
 * White page, dark text, colour-coded score cells and severity chips.
 */
export function PdfExportButton({ slug, title, platform, nodeCount, scores }: PdfExportButtonProps) {
  const [loading, setLoading]   = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const renderer = await import("@react-pdf/renderer");
      const { Document, Page, Text, View, StyleSheet, pdf } = renderer;

      const allFlags = (scores.allFlags ?? []) as unknown as AuditFlag[];
      const s        = scores as unknown as Record<string, number>;
      const date     = new Date().toISOString().slice(0, 10);

      // ── Severity accent colours (readable on white) ──────────────────────────
      const SEV_COLOR: Record<string, string> = {
        CRITICAL: "#dc2626",  // red-600
        WARNING:  "#d97706",  // amber-600
        INFO:     "#2563eb",  // blue-600
      };
      const SEV_BG: Record<string, string> = {
        CRITICAL: "#fef2f2",
        WARNING:  "#fffbeb",
        INFO:     "#eff6ff",
      };

      const styles = StyleSheet.create({
        // ── Page ────────────────────────────────────────────────────────────────
        page: {
          backgroundColor: "#ffffff",
          fontFamily: "Helvetica",
          padding: 44,
          fontSize: 9,
        },

        // ── Header ──────────────────────────────────────────────────────────────
        header: {
          marginBottom: 22,
          paddingBottom: 14,
          borderBottomWidth: 2,
          borderBottomColor: "#e2e8f0",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
        },
        headerLeft: { flex: 1 },
        logo: {
          fontSize: 7,
          fontFamily: "Helvetica-Bold",
          color: "#16a34a",
          letterSpacing: 3,
          marginBottom: 5,
        },
        titleText: {
          fontSize: 20,
          fontFamily: "Helvetica-Bold",
          color: "#0f172a",
          marginBottom: 3,
        },
        meta: { color: "#64748b", fontSize: 7.5, marginBottom: 1.5 },
        headerRight: { alignItems: "flex-end" },
        overallLabel:  { fontSize: 7, color: "#94a3b8", marginBottom: 2 },
        overallScore:  { fontSize: 28, fontFamily: "Helvetica-Bold", color: "#0f172a" },
        overallGrade:  { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },

        // ── Section ─────────────────────────────────────────────────────────────
        section: { marginBottom: 20 },
        sectionTitle: {
          fontFamily: "Helvetica-Bold",
          fontSize: 8,
          color: "#64748b",
          letterSpacing: 1.8,
          marginBottom: 8,
          paddingBottom: 4,
          borderBottomWidth: 1,
          borderBottomColor: "#e2e8f0",
        },

        // ── Score grid ──────────────────────────────────────────────────────────
        scoreGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 6,
        },
        scoreCell: {
          width: "22%",
          backgroundColor: "#f8fafc",
          borderWidth: 1,
          borderColor: "#e2e8f0",
          borderRadius: 4,
          padding: 8,
          marginBottom: 4,
        },
        scoreLabel: {
          color: "#64748b",
          fontSize: 6.5,
          letterSpacing: 0.8,
          marginBottom: 3,
          fontFamily: "Helvetica-Bold",
        },
        scoreValue: { fontFamily: "Helvetica-Bold", fontSize: 16 },
        scoreGrade: { fontSize: 7.5, marginTop: 1 },

        // ── Summary chips ────────────────────────────────────────────────────────
        summaryRow: { flexDirection: "row", gap: 6, marginBottom: 0 },
        summaryChipWrap: {
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderWidth: 1,
          borderRadius: 3,
          marginRight: 4,
        },
        summaryChipText: { fontSize: 8, fontFamily: "Helvetica-Bold" },

        // ── Flag table ───────────────────────────────────────────────────────────
        flagHeader: {
          flexDirection: "row",
          backgroundColor: "#f1f5f9",
          paddingVertical: 5,
          paddingHorizontal: 5,
          borderBottomWidth: 1,
          borderBottomColor: "#cbd5e1",
        },
        flagRow: {
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomColor: "#f1f5f9",
          paddingVertical: 5,
          paddingHorizontal: 5,
          alignItems: "flex-start",
        },
        flagRowCritBg: { backgroundColor: "#fef2f2" },
        flagRowWarnBg: { backgroundColor: "#fffbeb" },
        flagSev:   { width: 44, fontFamily: "Helvetica-Bold", fontSize: 7.5 },
        flagCat:   { width: 72, color: "#475569", fontSize: 7.5 },
        flagTitle: { flex: 1, color: "#1e293b", fontSize: 7.5 },
        flagNode:  { width: 82, color: "#94a3b8", fontSize: 7 },
        flagPts:   { width: 28, fontSize: 7.5, textAlign: "right" },

        // ── Footer ───────────────────────────────────────────────────────────────
        footer: {
          position: "absolute",
          bottom: 22,
          left: 44,
          right: 44,
          borderTopWidth: 1,
          borderTopColor: "#e2e8f0",
          paddingTop: 5,
          flexDirection: "row",
          justifyContent: "space-between",
        },
        footerText: { color: "#94a3b8", fontSize: 6.5 },
      });

      const critCount = allFlags.filter((f) => f.severity === "CRITICAL").length;
      const warnCount = allFlags.filter((f) => f.severity === "WARNING").length;
      const infoCount = allFlags.filter((f) => f.severity === "INFO").length;

      const overallScore = Math.round(
        SCORE_DIMS.reduce((sum, { key }) => sum + (s[key] ?? 0), 0) / SCORE_DIMS.length
      );
      const overallGrade = getGrade(overallScore);
      const overallCol   = scoreColor(overallScore);

      const C = createElement;

      const doc = C(Document, { title: `FlowIntel Report — ${title}`, author: "FlowIntel" },
        C(Page, { size: "A4", style: styles.page },

          // ── Header ────────────────────────────────────────────────────────────
          C(View, { style: styles.header },
            C(View, { style: styles.headerLeft },
              C(Text, { style: styles.logo }, "FLOWINTEL · SECURITY AUDIT REPORT"),
              C(Text, { style: styles.titleText }, title),
              C(Text, { style: styles.meta }, `Platform: ${platform}  ·  Nodes: ${nodeCount}  ·  Generated: ${date}`),
              C(Text, { style: styles.meta }, `Est. monthly cost: $${scores.estimatedCostUsd.toFixed(2)}  ·  Workflow: ${slug}`),
            ),
            C(View, { style: styles.headerRight },
              C(Text, { style: styles.overallLabel }, "OVERALL SCORE"),
              C(Text, { style: { ...styles.overallScore, color: overallCol } }, String(overallScore)),
              C(Text, { style: { ...styles.overallGrade, color: overallCol } }, overallGrade),
            ),
          ),

          // ── Flag summary ──────────────────────────────────────────────────────
          C(View, { style: styles.section },
            C(Text, { style: styles.sectionTitle }, "FLAG SUMMARY"),
            C(View, { style: styles.summaryRow },
              ...[
                critCount > 0
                  ? C(View, { key: "crit", style: { ...styles.summaryChipWrap, borderColor: "#dc2626", backgroundColor: "#fef2f2" } },
                      C(Text, { style: { ...styles.summaryChipText, color: "#dc2626" } }, `${critCount} CRITICAL`))
                  : null,
                warnCount > 0
                  ? C(View, { key: "warn", style: { ...styles.summaryChipWrap, borderColor: "#d97706", backgroundColor: "#fffbeb" } },
                      C(Text, { style: { ...styles.summaryChipText, color: "#d97706" } }, `${warnCount} WARNING`))
                  : null,
                infoCount > 0
                  ? C(View, { key: "info", style: { ...styles.summaryChipWrap, borderColor: "#2563eb", backgroundColor: "#eff6ff" } },
                      C(Text, { style: { ...styles.summaryChipText, color: "#2563eb" } }, `${infoCount} INFO`))
                  : null,
                allFlags.length === 0
                  ? C(View, { key: "clear", style: { ...styles.summaryChipWrap, borderColor: "#16a34a", backgroundColor: "#f0fdf4" } },
                      C(Text, { style: { ...styles.summaryChipText, color: "#16a34a" } }, "✓  ALL CLEAR — No flags"))
                  : null,
              ].filter(Boolean),
            ),
          ),

          // ── Score breakdown ───────────────────────────────────────────────────
          C(View, { style: styles.section },
            C(Text, { style: styles.sectionTitle }, "SCORE BREAKDOWN"),
            C(View, { style: styles.scoreGrid },
              ...SCORE_DIMS.map(({ key, label }) => {
                const val   = s[key] ?? 0;
                const grade = getGrade(val);
                const col   = scoreColor(val);
                const cellBg = val >= 80 ? "#f0fdf4" : val >= 60 ? "#fffbeb" : val >= 40 ? "#fff7ed" : "#fef2f2";
                const cellBorder = val >= 80 ? "#bbf7d0" : val >= 60 ? "#fde68a" : val >= 40 ? "#fed7aa" : "#fecaca";
                return C(View, { key, style: { ...styles.scoreCell, backgroundColor: cellBg, borderColor: cellBorder } },
                  C(Text, { style: styles.scoreLabel }, label.toUpperCase()),
                  C(Text, { style: { ...styles.scoreValue, color: col } }, String(val)),
                  C(Text, { style: { ...styles.scoreGrade, color: col } }, grade),
                );
              }),
            ),
          ),

          // ── Audit flags table ─────────────────────────────────────────────────
          ...(allFlags.length > 0 ? [
            C(View, { style: styles.section },
              C(Text, { style: styles.sectionTitle }, `AUDIT FLAGS  (${allFlags.length})`),
              // Header row
              C(View, { style: styles.flagHeader },
                C(Text, { style: { ...styles.flagSev,   color: "#475569" } }, "SEV"),
                C(Text, { style: { ...styles.flagCat,   color: "#475569" } }, "CATEGORY"),
                C(Text, { style: { ...styles.flagTitle, color: "#475569" } }, "ISSUE"),
                C(Text, { style: { ...styles.flagNode,  color: "#475569" } }, "NODE"),
                C(Text, { style: { ...styles.flagPts,   color: "#475569" } }, "PTS"),
              ),
              // Data rows
              ...allFlags.slice(0, 60).map((f, i) => {
                const rowBg = f.severity === "CRITICAL"
                  ? styles.flagRowCritBg
                  : f.severity === "WARNING"
                    ? styles.flagRowWarnBg
                    : {};
                return C(View, { key: i, style: { ...styles.flagRow, ...rowBg } },
                  C(Text, { style: { ...styles.flagSev, color: SEV_COLOR[f.severity] ?? "#475569" } }, f.severity.slice(0, 4)),
                  C(Text, { style: { ...styles.flagCat, backgroundColor: SEV_BG[f.severity] ?? "transparent" } }, f.category),
                  C(Text, { style: styles.flagTitle }, f.title),
                  C(Text, { style: styles.flagNode }, f.nodeName ?? "—"),
                  C(Text, { style: { ...styles.flagPts, color: f.ptsDeducted ? "#dc2626" : "#94a3b8" } },
                    f.ptsDeducted ? `−${f.ptsDeducted}` : "—"),
                );
              }),
              allFlags.length > 60
                ? C(Text, { style: { color: "#94a3b8", fontSize: 7, marginTop: 5 } },
                    `+${allFlags.length - 60} additional flags — view full report at /workflows/${slug}`)
                : null,
            ),
          ] : []),

          // ── Footer ─────────────────────────────────────────────────────────────
          C(View, { style: styles.footer, fixed: true },
            C(Text, { style: styles.footerText }, `FlowIntel Static Analysis Engine  ·  ${date}`),
            C(Text, {
              style: styles.footerText,
              render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
                `Page ${pageNumber} / ${totalPages}`,
            }),
          ),
        ),
      );

      const blob = await pdf(doc as Parameters<typeof pdf>[0]).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `flowintel-report-${slug}-${date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      fi.downloaded(`flowintel-report-${slug}-${date}.pdf`);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[PDF export]", msg);
      setErrorMsg(`PDF failed: ${msg.slice(0, 120)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleExport}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 border font-mono text-[10px] uppercase tracking-widest transition-all hover:border-[rgba(0,255,136,0.4)] hover:text-[var(--color-fi-text)] disabled:opacity-50"
        style={{ borderColor: "rgba(255,255,255,0.14)", color: "var(--color-fi-muted)", background: "rgba(255,255,255,0.02)" }}
      >
        {loading ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
        {loading ? "Building PDF..." : "Export PDF"}
      </button>
      {errorMsg && (
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-fi-crit)" }}>
          {errorMsg}
        </span>
      )}
    </div>
  );
}
