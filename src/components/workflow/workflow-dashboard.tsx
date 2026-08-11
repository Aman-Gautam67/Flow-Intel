"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import { fi } from "@/lib/toast";
import type { WorkflowScore, WorkflowAnalysisV2 } from "@/lib/db/schema";
import type { AuditFlag, N8nNode, ScoreBreakdown } from "@/types";
import type { QualityGateResult, CategoryScore, Finding } from "@/lib/engine/types";
import { ScoreRing, getGrade } from "./score-ring";
import { RemediationDrawer } from "./remediation-drawer";
import { WorkflowGraph } from "./workflow-graph";
import { CommandPalette } from "@/components/shared/command-palette";
import { FlagTooltip } from "./flag-tooltip";
import { PdfExportButton } from "./pdf-export-button";
import { DimensionPopover } from "./dimension-popover";
import { getDimensionMeta } from "@/config/dimensions";
import {
  Shield, Activity, BarChart3, Zap, Code2, Brain, Database, Eye, Server,
  Download, GitBranch, CheckCircle2, Copy, X, Award, Lock, ShieldAlert,
  RefreshCw, Layers, Search, Wrench, TrendingUp, Package, FileText, DollarSign,
  CheckCheck, XCircle, AlertTriangle,
} from "lucide-react";
import { EngagementStrip } from "./engagement-strip";
import { DriftPanel } from "./drift-panel";
import { detectDrift, sortDrift } from "@/lib/engine/drift-database";

interface DashboardProps {
  slug: string;
  title: string;
  platform: string;
  description: string | null;
  nodeCount: number;
  triggerType: string | null;
  scores: WorkflowScore;
  /** v2 analysis data — present only for workflows analyzed with the v2 engine */
  analysisV2?: WorkflowAnalysisV2 | null;
  rawNodes: N8nNode[];
  rawConnections: Record<string, unknown>;
  deps: Array<{ serviceName: string; category: string; isAi: boolean; vendorType?: string }>;
  versions: Array<{ id: string; versionNum: number; createdAt: Date }>;
  authorName?: string | null;
  /** Engagement counters */
  views?: number;
  downloads?: number;
  bookmarks?: number;
}

const SCORE_DIMS = [
  { key: "healthScore",       label: "Health",       icon: Activity },
  { key: "securityScore",     label: "Security",     icon: Shield },
  { key: "complexityScore",   label: "Simplicity",   icon: BarChart3 },
  { key: "reliabilityScore",  label: "Reliability",  icon: Zap },
  { key: "debtScore",         label: "Debt",         icon: Code2 },
  { key: "memoryScore",       label: "Memory",       icon: Database },
  { key: "resilienceScore",   label: "Resilience",   icon: Server },
  { key: "privacyScore",      label: "Privacy",      icon: Eye },
  { key: "aiGuardrailsScore", label: "AI Guard",     icon: Brain },
];

const SEV_COLORS: Record<string, string> = {
  CRITICAL: "var(--color-fi-crit)",
  WARNING: "var(--color-fi-warn)",
  INFO: "var(--color-fi-info)",
  PASS: "var(--color-fi-accent)",
};

const CATEGORY_COLORS: Record<string, string> = {
  AI: "#c084fc", Database: "#00cc66", Communication: "#86a7ff",
  Payments: "#f7d774", Development: "#f7a35c", API: "#86a7ff",
  Triggers: "#00ff88", Email: "#86a7ff", "Project Management": "#f7a35c",
  Productivity: "#86a7ff",
};

type TabKey = "audit" | "graph" | "deps" | "badge" | "gates";

// ─── V2 category display config ───────────────────────────────────────────────
const V2_CATEGORIES = [
  { key: "scoreSecurity",        label: "Security",        icon: Shield },
  { key: "scoreReliability",     label: "Reliability",     icon: RefreshCw },
  { key: "scoreIdempotency",     label: "Idempotency",     icon: CheckCheck },
  { key: "scoreObservability",   label: "Observability",   icon: Search },
  { key: "scoreMaintainability", label: "Maintainability", icon: Wrench },
  { key: "scorePerformance",     label: "Performance",     icon: TrendingUp },
  { key: "scoreCompatibility",   label: "Compatibility",   icon: Package },
  { key: "scorePrivacy",         label: "Privacy",         icon: Lock },
  { key: "scoreDocumentation",   label: "Documentation",   icon: FileText },
  { key: "scoreCostOptimization", label: "Cost",           icon: DollarSign },
] as const;

// Gate display order + labels
const GATE_DISPLAY = [
  { key: "gateSecurityPassed",    label: "Security Gate",    desc: "No critical security findings" },
  { key: "gateReliabilityPassed", label: "Reliability Gate", desc: "Error handling coverage" },
  { key: "gateMarketplacePassed", label: "Marketplace Gate", desc: "Safe to publish publicly" },
  { key: "gateProductionPassed",  label: "Production Gate",  desc: "Safe for production use" },
  { key: "gateEnterprisePassed",  label: "Enterprise Gate",  desc: "Meets enterprise standards" },
] as const;

export function WorkflowDashboard({
  slug, title, platform, description, nodeCount, triggerType,
  scores, analysisV2, rawNodes, rawConnections, deps, versions, authorName,
  views = 0, downloads = 0, bookmarks = 0,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("audit");
  const [activeFlag, setActiveFlag] = useState<AuditFlag | null>(null);
  const [selectedNode, setSelectedNode] = useState<N8nNode | null>(null);

  // Compatibility drift detection — runs synchronously on AST (no API call)
  // Guard: rawNodes must be a real array (Flowise/Make/Zapier pages can pass [])
  const safeNodes = Array.isArray(rawNodes) ? rawNodes : [];
  const drift = sortDrift(detectDrift(
    { nodes: safeNodes.map((n) => ({ id: n.id, name: n.name, type: n.type, typeVersion: n.typeVersion, parameters: n.parameters as Record<string, unknown> | undefined })) },
    platform
  ));

  // Ref for the audit log section — used by jump-to-CRIT hotkey
  const auditLogRef = useRef<HTMLDivElement>(null);

  // ── Jump to highest-severity flag (⌘+Shift+F) ───────────────────────────
  const jumpToCrit = useCallback(() => {
    const critFlag = (scores.allFlags as unknown as AuditFlag[] ?? [])
      .find((f) => f.severity === "CRITICAL") ??
      (scores.allFlags as unknown as AuditFlag[] ?? [])[0];
    if (!critFlag) return;
    setActiveTab("audit");
    setActiveFlag(critFlag);
    // Scroll audit log into view after tab switch
    setTimeout(() => auditLogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }, [scores.allFlags]);

  // Map a flag's category to its current score for the Before/After preview
  const categoryScoreForFlag = (flag: AuditFlag | null): number | undefined => {
    if (!flag) return undefined;
    const s = scores as unknown as Record<string, number>;
    const map: Record<string, string> = {
      SECURITY:      "securityScore",
      HEALTH:        "healthScore",
      COMPLEXITY:    "complexityScore",  // category key stays COMPLEXITY; label is now Simplicity
      RELIABILITY:   "reliabilityScore",
      DEBT:          "debtScore",
      MEMORY:        "memoryScore",
      RESILIENCE:    "resilienceScore",
      PRIVACY:       "privacyScore",
      AI_GUARDRAILS: "aiGuardrailsScore",
    };
    const key = map[flag.category];
    return key ? (s[key] ?? undefined) : undefined;
  };

  const allFlags = (scores.allFlags ?? []) as unknown as AuditFlag[];
  const critCount = allFlags.filter((f) => f.severity === "CRITICAL").length;
  const warnCount = allFlags.filter((f) => f.severity === "WARNING").length;
  const infoCount = allFlags.filter((f) => f.severity === "INFO").length;

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://flowintel.app";
  const badgeUrl = `${baseUrl}/api/badge/${slug}`;

  // ── Markdown / CSV export ────────────────────────────────────────────────
  const exportReport = (format: "md" | "csv") => {
    const s = scores as unknown as Record<string, number>;
    const date = new Date().toISOString().slice(0, 10);

    if (format === "md") {
      const scoreTable = SCORE_DIMS.map(
        ({ key, label }) => `| ${label} | ${s[key] ?? 0} | ${getGrade(s[key] ?? 0, label).grade} |`
      ).join("\n");

      const flagRows = allFlags
        .map((f) => `| ${f.severity} | ${f.category} | ${f.title.replace(/\|/g, "—")} | ${f.nodeName ?? "—"} | ${f.ptsDeducted ? `−${f.ptsDeducted}` : "—"} |`)
        .join("\n");

      const md = [
        `# FlowIntel Security Report — ${title}`,
        `\n**Generated:** ${date}  |  **Platform:** ${platform}  |  **Nodes:** ${nodeCount}  |  **Est. Cost/mo:** $${scores.estimatedCostUsd.toFixed(2)}`,
        `\n## Score Summary\n`,
        `| Dimension | Score | Grade |`,
        `|-----------|-------|-------|`,
        scoreTable,
        `\n## Audit Flags (${allFlags.length} total)\n`,
        `| Severity | Category | Issue | Node | Impact |`,
        `|----------|----------|-------|------|--------|`,
        flagRows || "| — | — | No flags detected | — | — |",
        `\n---\n*Report generated by FlowIntel static analysis engine.*`,
      ].join("\n");

      const blob = new Blob([md], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `flowintel-report-${slug}-${date}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
      fi.downloaded(`flowintel-report-${slug}-${date}.md`);
    } else {
      const header = "Severity,Category,Rule,Title,Node,Score Impact\n";
      const rows = allFlags
        .map((f) => [f.severity, f.category, f.rule, `"${f.title.replace(/"/g, "'")}"`, f.nodeName ?? "", f.ptsDeducted ? `-${f.ptsDeducted}` : ""].join(","))
        .join("\n");
      const blob = new Blob([header + rows], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `flowintel-flags-${slug}-${date}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      fi.downloaded(`flowintel-flags-${slug}-${date}.csv`);
    }
  };

  const copyBadge = (metric: string) => {
    const md = `![${metric}](${badgeUrl}/${metric}.svg)`;
    navigator.clipboard.writeText(md).then(() => fi.copied("Badge Markdown"));
  };

  const TABS: { key: TabKey; label: string }[] = [
    { key: "audit", label: "Audit Log" },
    { key: "gates", label: analysisV2 ? "Gates & Cert ✦" : drift.length > 0 ? `Gates & Drift (${drift.length})` : "Gates & Cert" },
    { key: "graph", label: "Node Graph" },
    { key: "deps", label: "Dependencies" },
    { key: "badge", label: "Badge API" },
  ];

  return (
    <div className="min-h-svh">
      {/* Nav */}
      <nav className="flex items-center px-5 py-2.5"
        style={{ borderBottom: "1px solid var(--color-fi-border)", background: "rgba(10,10,10,0.96)" }}>
        <Link href="/" className="flex items-center gap-3 w-48">
          <div className="w-7 h-7 border flex items-center justify-center text-[var(--color-fi-accent)] font-mono font-bold text-xs"
            style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }}>FI</div>
          <span className="font-mono text-sm tracking-[0.18em] uppercase">FlowIntel</span>
        </Link>
        <div className="flex-1 flex items-center justify-center gap-8 font-mono text-[11px] tracking-widest uppercase" style={{ color: "var(--color-fi-muted)" }}>
          <Link href="/search" className="hover:text-[var(--color-fi-text)] transition-colors">Catalog</Link>
          <Link href="/upload" className="hover:text-[var(--color-fi-text)] transition-colors">Analyze</Link>
        </div>
        <div className="w-48" />
      </nav>



      {/* Header */}
      <div className="border-b" style={{ borderColor: "var(--color-fi-border)" }}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 border"
                  style={{ borderColor: "var(--color-fi-accent)", color: "var(--color-fi-accent)", background: "rgba(0,255,136,0.06)" }}>
                  {platform}
                </span>
                {triggerType && (
                  <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
                    {triggerType.split(".").pop()}
                  </span>
                )}
                {authorName && (
                  <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
                    by {authorName}
                  </span>
                )}
              </div>
              <h1 className="font-sans font-light text-[clamp(20px,4vw,36px)] tracking-[-0.03em] mb-2">{title}</h1>
              {description && (
                <p className="text-sm max-w-xl" style={{ color: "var(--color-fi-muted)" }}>{description}</p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex gap-3 px-4 py-2 border font-mono text-[11px]"
                style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
                {critCount > 0 && <span style={{ color: "var(--color-fi-crit)" }}>{critCount} CRIT</span>}
                {warnCount > 0 && <span style={{ color: "var(--color-fi-warn)" }}>{warnCount} WARN</span>}
                {infoCount > 0 && <span style={{ color: "var(--color-fi-info)" }}>{infoCount} INFO</span>}
                {allFlags.length === 0 && <span style={{ color: "var(--color-fi-accent)" }}>CLEAN</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Score rings grid */}
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-px"
          style={{ background: "var(--color-fi-border)" }}>
          {SCORE_DIMS.map(({ key, label, icon: Icon }) => {
            const rawVal = (scores as unknown as Record<string, number | null>)[key];

            const hasAiNodes = deps.some((d) => d.isAi);
            const isAiGuardDim = key === "aiGuardrailsScore";

            let dimScore: number | null = rawVal === undefined ? 0 : rawVal;

            // AI guardrails: null from DB = not applicable
            if (isAiGuardDim && rawVal === null) {
              dimScore = null;
            }

            const dimMeta  = getDimensionMeta(label);
            return (
              <div key={key} className="flex flex-col items-center gap-3 py-6 px-3"
                style={{ background: "rgba(8,8,8,0.88)" }}>
                <ScoreRing
                  score={dimScore}
                  label={label}
                  size={72}
                  strokeWidth={6}
                  showLabel={false}
                />
                {/* Label row — icon · name · (i) info trigger */}
                <div className="flex items-center gap-1.5">
                  <Icon size={11} style={{ color: "rgba(240,240,240,0.55)" }} />
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: "rgba(240,240,240,0.65)" }}>
                    {label}
                  </span>
                  {dimMeta && (
                    <DimensionPopover meta={dimMeta} score={dimScore ?? 0} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cost + metadata strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: "var(--color-fi-border)" }}>
          {[
            { label: "Node Count", value: nodeCount },
            { label: "Est. Cost / mo", value: `$${scores.estimatedCostUsd.toFixed(2)}` },
            { label: "Versions", value: versions.length },
            { label: "Dependencies", value: deps.length },
          ].map((s) => (
            <div key={s.label} className="flex flex-col gap-1.5 p-5" style={{ background: "rgba(8,8,8,0.88)" }}>
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>{s.label}</span>
              <span className="font-mono text-2xl font-light" style={{ color: "var(--color-fi-text)" }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Engagement strip — views, downloads, bookmarks */}
        <EngagementStrip
          slug={slug}
          initialViews={views}
          initialDownloads={downloads}
          initialBookmarks={bookmarks}
        />

        {/* Tabs */}
        <div>
          <div className="flex gap-0 border-b" style={{ borderColor: "var(--color-fi-border)" }}>
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className="px-5 py-3 font-mono text-[11px] uppercase tracking-widest transition-colors border-b-2 -mb-px"
                style={{
                  borderBottomColor: activeTab === t.key ? "var(--color-fi-accent)" : "transparent",
                  color: activeTab === t.key ? "var(--color-fi-text)" : "var(--color-fi-muted)",
                  background: "transparent",
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Audit Log */}
          {activeTab === "audit" && (
            <div ref={auditLogRef} className="border border-t-0" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
              {/* Export toolbar */}
              <div className="flex items-center justify-between px-5 py-3 border-b"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
                  {allFlags.length} flag{allFlags.length !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportReport("md")}
                    className="flex items-center gap-1.5 px-3 py-1.5 border font-mono text-[10px] uppercase tracking-widest transition-all hover:border-[rgba(0,255,136,0.4)] hover:text-[var(--color-fi-text)]"
                    style={{ borderColor: "rgba(255,255,255,0.14)", color: "var(--color-fi-muted)", background: "rgba(255,255,255,0.02)" }}>
                    <Download size={11} /> Export .md
                  </button>
                  <button
                    onClick={() => exportReport("csv")}
                    className="flex items-center gap-1.5 px-3 py-1.5 border font-mono text-[10px] uppercase tracking-widest transition-all hover:border-[rgba(0,255,136,0.4)] hover:text-[var(--color-fi-text)]"
                    style={{ borderColor: "rgba(255,255,255,0.14)", color: "var(--color-fi-muted)", background: "rgba(255,255,255,0.02)" }}>
                    <Download size={11} /> Export .csv
                  </button>
                  <PdfExportButton
                    slug={slug}
                    title={title}
                    platform={platform}
                    nodeCount={nodeCount}
                    scores={scores}
                  />
                </div>
              </div>
              {allFlags.length === 0 ? (
                <div className="flex items-center gap-3 p-6">
                  <CheckCircle2 size={20} style={{ color: "var(--color-fi-accent)" }} />
                  <span className="font-mono text-sm" style={{ color: "var(--color-fi-muted)" }}>No flags detected — workflow passed all checks.</span>
                </div>
              ) : (
                allFlags.map((f, i) => (
                  // Outer wrapper is a plain div — the only interactive children are:
                  //   1. The main <button> spanning the whole row content
                  //   2. The <FlagTooltip> (i) button — a sibling, not nested inside #1
                  // This avoids invalid nested-button HTML.
                  <div
                    key={i}
                    className={`flex items-center border-b font-mono text-[11px] transition-colors hover:bg-[rgba(0,255,136,0.04)] ${f.severity === "CRITICAL" ? "crit-pulse" : ""}`}
                    style={{ minHeight: "48px", borderColor: "rgba(255,255,255,0.06)" }}>

                    {/* Main clickable area — single button, no nested buttons */}
                    <button
                      onClick={() => setActiveFlag(f)}
                      className="flex-1 flex items-center gap-5 px-5 min-w-0 text-left h-full"
                      style={{ color: "rgba(240,240,240,0.72)", background: "transparent" }}
                    >
                      <span className="font-bold tracking-widest w-16 shrink-0 pr-2 border-r" style={{ color: SEV_COLORS[f.severity] ?? "inherit", borderColor: "rgba(255,255,255,0.08)" }}>
                        {f.severity.slice(0, 4)}
                      </span>
                      <span className="flex-1 text-left truncate">{f.title}</span>
                      <span className="shrink-0 text-[9px] uppercase tracking-widest hidden sm:block" style={{ color: "rgba(240,240,240,0.36)" }}>
                        {f.category}
                      </span>
                      {f.nodeName && (
                        <span className="shrink-0 text-[9px] hidden md:block" style={{ color: "rgba(240,240,240,0.3)" }}>
                          {f.nodeName}
                        </span>
                      )}
                      {f.ptsDeducted != null && f.ptsDeducted > 0 && (
                        <span className="shrink-0 text-[10px]" style={{ color: "var(--color-fi-crit)" }}>−{f.ptsDeducted}</span>
                      )}
                    </button>

                    {/* Educational tooltip — sibling of the main button, not nested */}
                    <div className="shrink-0 flex items-center pr-4">
                      <FlagTooltip ruleName={f.rule} severity={f.severity} />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Node Graph */}
          {activeTab === "graph" && (
            <div className="border border-t-0" style={{ borderColor: "var(--color-fi-border)" }}>
              <div className="flex flex-col lg:flex-row">
                {/* Graph canvas */}
                <div className="flex-1 overflow-hidden">
                  <WorkflowGraph
                    nodes={safeNodes}
                    connections={rawConnections}
                    onNodeClick={setSelectedNode}
                    selectedNodeName={selectedNode?.name}
                  />
                  <div className="px-5 py-3 font-mono text-[10px] tracking-widest uppercase border-t"
                    style={{ color: "var(--color-fi-muted)", borderColor: "var(--color-fi-border)" }}>
                    {safeNodes.length} nodes · {safeNodes.filter((n) => n.disabled).length} disabled
                    {selectedNode && (
                      <span style={{ color: "var(--color-fi-accent)" }}> · click a node to inspect</span>
                    )}
                    {!selectedNode && " · click a node to inspect"}
                  </div>
                </div>

                {/* Node Inspector panel */}
                <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l shrink-0"
                  style={{ borderColor: "var(--color-fi-border)", background: "rgba(6,6,6,0.9)", minHeight: "200px" }}>
                  {!selectedNode ? (
                    <div className="flex flex-col items-center justify-center h-full p-6 gap-3" style={{ minHeight: "200px" }}>
                      <div className="w-8 h-8 border flex items-center justify-center opacity-30"
                        style={{ borderColor: "var(--color-fi-border)" }}>
                        <GitBranch size={14} style={{ color: "var(--color-fi-muted)" }} />
                      </div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-center" style={{ color: "var(--color-fi-muted)" }}>
                        Click any node<br />to inspect
                      </p>
                    </div>
                  ) : (() => {
                    // Compute per-node flags
                    const nodeFlags = allFlags.filter(
                      (f) => f.nodeName === selectedNode.name
                    );
                    const nodeCrit = nodeFlags.filter((f) => f.severity === "CRITICAL").length;
                    const nodeWarn = nodeFlags.filter((f) => f.severity === "WARNING").length;
                    const totalPtsLost = nodeFlags.reduce((sum, f) => sum + (f.ptsDeducted ?? 0), 0);
                    const nodeColor = (() => {
                      if (nodeCrit > 0) return "var(--color-fi-crit)";
                      if (nodeWarn > 0) return "var(--color-fi-warn)";
                      return "var(--color-fi-accent)";
                    })();

                    return (
                      <div className="p-5 space-y-4">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--color-fi-muted)" }}>
                              Node Inspector
                            </div>
                            <div className="font-sans font-medium text-sm truncate" style={{ color: "var(--color-fi-text)" }}>
                              {selectedNode.name}
                            </div>
                          </div>
                          <button onClick={() => setSelectedNode(null)}
                            className="shrink-0 p-1 transition-colors hover:text-[var(--color-fi-text)]"
                            style={{ color: "var(--color-fi-muted)" }}>
                            <X size={13} />
                          </button>
                        </div>

                        {/* Type + version */}
                        <div className="space-y-1.5">
                          <div>
                            <div className="font-mono text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "var(--color-fi-muted)" }}>Type</div>
                            <div className="font-mono text-[10px] break-all" style={{ color: "var(--color-fi-accent)" }}>
                              {selectedNode.type}
                            </div>
                          </div>
                          {selectedNode.typeVersion != null && (
                            <div className="flex items-center gap-3">
                              <div>
                                <div className="font-mono text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "var(--color-fi-muted)" }}>Version</div>
                                <div className="font-mono text-[11px]" style={{ color: "var(--color-fi-text)" }}>v{selectedNode.typeVersion}</div>
                              </div>
                              {selectedNode.disabled && (
                                <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border"
                                  style={{ borderColor: "var(--color-fi-warn)", color: "var(--color-fi-warn)", background: "rgba(247,215,116,0.06)" }}>
                                  Disabled
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Score impact */}
                        <div className="border p-3 space-y-2"
                          style={{ borderColor: `${nodeColor}33`, background: `${nodeColor}08` }}>
                          <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: nodeColor }}>
                            Score Impact
                          </div>
                          <div className="flex items-center gap-4 font-mono text-sm">
                            {nodeCrit > 0 && <span style={{ color: "var(--color-fi-crit)" }}>{nodeCrit} crit</span>}
                            {nodeWarn > 0 && <span style={{ color: "var(--color-fi-warn)" }}>{nodeWarn} warn</span>}
                            {nodeFlags.length === 0 && <span style={{ color: "var(--color-fi-accent)" }}>Clean ✓</span>}
                          </div>
                          {totalPtsLost > 0 && (
                            <div className="font-mono text-[11px]" style={{ color: "var(--color-fi-crit)" }}>
                              Total deduction: −{totalPtsLost} pts
                            </div>
                          )}
                        </div>

                        {/* Per-node flags */}
                        {nodeFlags.length > 0 && (
                          <div className="space-y-1">
                            <div className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "var(--color-fi-muted)" }}>
                              Flags on this node
                            </div>
                            {nodeFlags.map((f, i) => (
                              <button key={i}
                                onClick={() => setActiveFlag(f)}
                                className="w-full text-left flex items-start gap-2 p-2 border transition-colors hover:bg-[rgba(0,255,136,0.04)]"
                                style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}>
                                <span className="font-mono text-[9px] font-bold tracking-widest shrink-0 mt-px"
                                  style={{ color: SEV_COLORS[f.severity] ?? "inherit" }}>
                                  {f.severity.slice(0, 4)}
                                </span>
                                <span className="font-mono text-[10px] leading-snug" style={{ color: "rgba(240,240,240,0.7)" }}>
                                  {f.title}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Dependencies */}
          {activeTab === "deps" && (() => {
            // Bucket by vendorType
            const buckets: Record<string, typeof deps> = {
              community: [],
              saas: [],
              selfhosted: [],
              core: [],
            };
            for (const d of deps) {
              const vt = d.vendorType ?? "saas";
              (buckets[vt] ?? buckets.saas).push(d);
            }
            const communityNodes = buckets.community ?? [];
            const hasCommunity = communityNodes.length > 0;

            const VENDOR_META = {
              community:  { label: "Community Nodes",       color: "#ff5d5d",  desc: "Third-party npm packages — unverified supply chain" },
              saas:       { label: "SaaS API Integrations", color: "#86a7ff",  desc: "Known third-party cloud services" },
              selfhosted: { label: "Self-Hosted Systems",   color: "#00cc66",  desc: "Databases and infrastructure you operate" },
              core:       { label: "Built-in n8n Nodes",    color: "rgba(240,240,240,0.4)", desc: "Native n8n utilities, no external vendor" },
            } as const;

            return (
              <div className="border border-t-0" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
                {deps.length === 0 ? (
                  <div className="p-6">
                    <p className="font-mono text-sm" style={{ color: "var(--color-fi-muted)" }}>No external dependencies detected.</p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: "var(--color-fi-border)" }}>
                    {/* Summary strip */}
                    <div className="flex flex-wrap gap-4 px-6 py-4">
                      {(["community","saas","selfhosted","core"] as const).filter((vt) => (buckets[vt]?.length ?? 0) > 0).map((vt) => {
                        const meta = VENDOR_META[vt];
                        return (
                          <div key={vt} className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: meta.color }}>
                              {buckets[vt]!.length} {meta.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Community node risk banner */}
                    {hasCommunity && (
                      <div className="px-6 py-4 flex items-start gap-3"
                        style={{ background: "rgba(255,93,93,0.06)", borderTop: "1px solid rgba(255,93,93,0.22)" }}>
                        <span className="font-mono text-[9px] uppercase tracking-widest mt-0.5 px-1.5 py-0.5 border shrink-0"
                          style={{ color: "var(--color-fi-crit)", borderColor: "rgba(255,93,93,0.4)" }}>
                          RISK
                        </span>
                        <div>
                          <p className="font-sans text-[13px] font-medium mb-1" style={{ color: "var(--color-fi-text)" }}>
                            {communityNodes.length} unverified community node{communityNodes.length > 1 ? "s" : ""} detected
                          </p>
                          <p className="font-sans text-[12px] leading-relaxed" style={{ color: "var(--color-fi-muted)" }}>
                            Community nodes are third-party npm packages with no official n8n verification.
                            Review each package&apos;s source code and npm page before sharing with production teams.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Bucket sections */}
                    {(["community","saas","selfhosted","core"] as const).map((vt) => {
                      const group = buckets[vt] ?? [];
                      if (group.length === 0) return null;
                      const meta = VENDOR_META[vt];
                      return (
                        <div key={vt} className="px-6 py-5">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                            <span className="font-mono text-[9px] uppercase tracking-widest font-bold" style={{ color: meta.color }}>
                              {meta.label}
                            </span>
                          </div>
                          <p className="font-mono text-[9px] mb-4" style={{ color: "rgba(240,240,240,0.36)" }}>{meta.desc}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                            {group.map((d, i) => {
                              const catColor = CATEGORY_COLORS[d.category] ?? meta.color;
                              const isCommunity = vt === "community";
                              return (
                                <div key={i}
                                  className="flex items-center gap-2.5 p-3 border"
                                  style={{
                                    borderColor: isCommunity ? "rgba(255,93,93,0.28)" : `${catColor}33`,
                                    background: isCommunity ? "rgba(255,93,93,0.06)" : `${catColor}08`,
                                  }}>
                                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isCommunity ? "#ff5d5d" : catColor }} />
                                  <div className="min-w-0">
                                    <div className="font-sans text-[12px] font-medium truncate" style={{ color: "var(--color-fi-text)" }}>
                                      {d.serviceName}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                      <span className="font-mono text-[8px] uppercase tracking-widest" style={{ color: catColor }}>
                                        {d.category}
                                      </span>
                                      {d.isAi && (
                                        <span className="font-mono text-[8px] uppercase tracking-widest px-1 border"
                                          style={{ borderColor: "rgba(192,132,252,0.4)", color: "#c084fc", background: "rgba(192,132,252,0.08)" }}>
                                          AI
                                        </span>
                                      )}
                                      {isCommunity && (
                                        <span className="font-mono text-[8px] uppercase tracking-widest px-1 border"
                                          style={{ borderColor: "rgba(255,93,93,0.4)", color: "#ff5d5d", background: "rgba(255,93,93,0.08)" }}>
                                          Unverified
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Gates & Certification Tab ─────────────────────────── */}
          {activeTab === "gates" && (
            <div className="border border-t-0" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
              {!analysisV2 ? (
                <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  <div className="p-5 flex flex-col items-center gap-3 text-center">
                    <Layers size={28} style={{ color: "var(--color-fi-muted)", opacity: 0.35 }} />
                    <p className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
                      No v2 gate data — re-upload to generate Quality Gates &amp; Certificate
                    </p>
                  </div>
                  {/* Still show drift even without v2 data */}
                  <div>
                    <div className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
                      Compatibility Drift · {drift.length === 0 ? "Clean" : `${drift.length} issue${drift.length > 1 ? "s" : ""}`}
                    </div>
                    <DriftPanel drift={drift} />
                  </div>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--color-fi-border)" }}>

                  {/* Certificate banner */}
                  <div className="p-5">
                    {(() => {
                      const mktPass = analysisV2.gateMarketplacePassed;
                      const prdPass = analysisV2.gateProductionPassed;
                      const certified = mktPass && prdPass;
                      return certified ? (
                        <div className="flex items-center gap-4 p-4 border"
                          style={{ borderColor: "rgba(0,255,136,0.3)", background: "rgba(0,255,136,0.05)" }}>
                          <Award size={28} style={{ color: "var(--color-fi-accent)", flexShrink: 0 }} />
                          <div>
                            <div className="font-mono text-[11px] uppercase tracking-widest mb-1"
                              style={{ color: "var(--color-fi-accent)" }}>
                              FlowIntel Certified™
                            </div>
                            <div className="font-sans text-xs" style={{ color: "var(--color-fi-muted)" }}>
                              Marketplace Gate + Production Gate passed · FQI {analysisV2.fqiScore ?? "—"}/100
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4 p-4 border"
                          style={{ borderColor: "rgba(255,93,93,0.2)", background: "rgba(255,93,93,0.04)" }}>
                          <ShieldAlert size={28} style={{ color: "var(--color-fi-crit)", flexShrink: 0 }} />
                          <div>
                            <div className="font-mono text-[11px] uppercase tracking-widest mb-1"
                              style={{ color: "var(--color-fi-crit)" }}>
                              Not Certified
                            </div>
                            <div className="font-sans text-xs" style={{ color: "var(--color-fi-muted)" }}>
                              Resolve gate failures to earn FlowIntel Certified™ status · FQI {analysisV2.fqiScore ?? "—"}/100
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Quality Gates */}
                  <div className="p-5">
                    <div className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: "var(--color-fi-muted)" }}>
                      Quality Gates
                    </div>
                    <div className="space-y-2">
                      {GATE_DISPLAY.map(({ key, label, desc }) => {
                        const val = (analysisV2 as Record<string, unknown>)[key] as boolean | null;
                        const isPassing = val === true;
                        const isFailing = val === false;
                        return (
                          <div key={key} className="flex items-center gap-4 p-3 border"
                            style={{
                              borderColor: isPassing ? "rgba(0,255,136,0.2)" : isFailing ? "rgba(255,93,93,0.2)" : "var(--color-fi-border)",
                              background: isPassing ? "rgba(0,255,136,0.04)" : isFailing ? "rgba(255,93,93,0.04)" : "transparent",
                            }}>
                            {isPassing ? (
                              <CheckCircle2 size={16} style={{ color: "var(--color-fi-accent)", flexShrink: 0 }} />
                            ) : isFailing ? (
                              <XCircle size={16} style={{ color: "var(--color-fi-crit)", flexShrink: 0 }} />
                            ) : (
                              <AlertTriangle size={16} style={{ color: "var(--color-fi-muted)", flexShrink: 0 }} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-[11px] uppercase tracking-widest"
                                style={{ color: isPassing ? "var(--color-fi-accent)" : isFailing ? "var(--color-fi-crit)" : "var(--color-fi-muted)" }}>
                                {label}
                              </div>
                              <div className="font-sans text-[11px] mt-0.5" style={{ color: "var(--color-fi-muted)" }}>
                                {desc}
                              </div>
                            </div>
                            <span className="font-mono text-[10px] uppercase tracking-widest shrink-0"
                              style={{ color: isPassing ? "var(--color-fi-accent)" : isFailing ? "var(--color-fi-crit)" : "var(--color-fi-muted)" }}>
                              {val === null ? "N/A" : isPassing ? "PASS" : "FAIL"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* V2 Category Scores */}
                  <div className="p-5">
                    <div className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: "var(--color-fi-muted)" }}>
                      Category Scores (v2 Engine · 10 categories)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-px" style={{ background: "var(--color-fi-border)" }}>
                      {V2_CATEGORIES.map(({ key, label, icon: Icon }) => {
                        const rawVal = (analysisV2 as Record<string, unknown>)[key] as number | null;
                        return (
                          <div key={key} className="flex flex-col items-center gap-2 py-4 px-2"
                            style={{ background: "rgba(8,8,8,0.88)" }}>
                            <ScoreRing score={rawVal} label={label} size={64} strokeWidth={5} showLabel={false} />
                            <div className="flex items-center gap-1">
                              <Icon size={9} style={{ color: "rgba(240,240,240,0.45)" }} />
                              <span className="font-mono text-[8px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.6)" }}>
                                {label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Compatibility Drift */}
                  <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
                      Compatibility Drift · {drift.length === 0 ? "Clean" : `${drift.length} issue${drift.length > 1 ? "s" : ""}`}
                    </div>
                    <DriftPanel drift={drift} />
                  </div>

                </div>
              )}
            </div>
          )}

          {/* Badge API */}
          {activeTab === "badge" && (
            <div className="border border-t-0 p-6 space-y-6" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
              <p className="font-sans text-sm" style={{ color: "var(--color-fi-muted)" }}>
                Embed dynamic score badges in GitHub READMEs or internal wikis. Click any badge to copy the Markdown.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {["health", "security", "simplicity", "reliability", "debt", "memory", "resilience", "privacy", "ai-guardrails"].map((metric) => (
                  <button key={metric} onClick={() => copyBadge(metric)}
                    className="flex items-center justify-between gap-3 p-3 border text-left transition-colors hover:border-[rgba(0,255,136,0.3)]"
                    style={{ borderColor: "var(--color-fi-border)", background: "rgba(255,255,255,0.02)" }}>
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--color-fi-muted)" }}>
                        /api/badge/{slug}/{metric}.svg
                      </div>
                      <code className="font-mono text-[11px]" style={{ color: "var(--color-fi-accent)" }}>
                        ![{metric}]({badgeUrl}/{metric}.svg)
                      </code>
                    </div>
                    <Copy size={13} style={{ color: "var(--color-fi-muted)", flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Remediation drawer */}
      <RemediationDrawer
        flag={activeFlag}
        currentCategoryScore={categoryScoreForFlag(activeFlag)}
        onClose={() => setActiveFlag(null)}
      />

      {/* Global command palette — wired with export + jump-to-CRIT */}
      <CommandPalette
        onExportAudit={() => exportReport("md")}
        onJumpToCrit={jumpToCrit}
      />
    </div>
  );
}
