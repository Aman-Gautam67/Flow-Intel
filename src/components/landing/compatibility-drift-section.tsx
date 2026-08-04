"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, GitBranch, Layers, Search, Shield } from "lucide-react";

const DRIFT_PHASES = [
  {
    phase: "01",
    title: "Research & Verify",
    desc: "FlowIntel consults official platform documentation before writing any detection rule. We never guess undocumented behavior.",
    items: ["Node versioning models", "Schema evolution docs", "Credential model changes", "API versioning history", "Official changelogs"],
    color: "#86a7ff",
  },
  {
    phase: "02",
    title: "Compatibility DB",
    desc: "A versioned internal database stores every known drift record with full evidence trails, documentation references, and confidence levels.",
    items: ["Platform + version indexed", "Node schema history", "Expression engine changes", "Credential model versions", "Breaking release markers"],
    color: "#c084fc",
  },
  {
    phase: "03",
    title: "Drift Detection",
    desc: "The analysis pipeline walks every node in your workflow AST against the compatibility database to surface confirmed issues vs. warnings.",
    items: ["Deprecated node types", "typeVersion mismatches", "Removed parameters", "API sunset warnings", "Expression syntax changes"],
    color: "#f7a35c",
  },
  {
    phase: "04",
    title: "Migration Intelligence",
    desc: "Where official documentation provides a migration path, FlowIntel shows exactly what needs to change. We never invent migrations.",
    items: ["Old → Suggested display", "Official doc references", "Confidence scoring (1-3)", "Affected node list", "Manual-only flag for uncertain changes"],
    color: "#00ff88",
  },
];

const DRIFT_EXAMPLES = [
  {
    severity: "BREAKING",
    color: "#ff5d5d",
    border: "rgba(255,93,93,0.25)",
    bg: "rgba(255,93,93,0.06)",
    component: "n8n-nodes-base.httpRequest",
    summary: "HTTP Request v2 removed in n8n v1.0",
    old: "typeVersion: 2",
    suggested: "typeVersion: 4",
    doc: "n8n Release Notes",
    confidence: 3,
  },
  {
    severity: "DEPRECATED",
    color: "#f7a35c",
    border: "rgba(247,163,92,0.25)",
    bg: "rgba(247,163,92,0.06)",
    component: "n8n-nodes-base.function",
    summary: "Function node replaced by Code node (since v0.198)",
    old: "n8n-nodes-base.function",
    suggested: "n8n-nodes-base.code",
    doc: "n8n Code Node Docs",
    confidence: 3,
  },
  {
    severity: "WARNING",
    color: "#f7d774",
    border: "rgba(247,215,116,0.25)",
    bg: "rgba(247,215,116,0.06)",
    component: "n8n-nodes-base.webhook",
    summary: "Unauthenticated webhook — stricter policy in n8n v1.x",
    old: "authentication: none",
    suggested: "authentication: headerAuth or jwtAuth",
    doc: "n8n Webhook Security Docs",
    confidence: 2,
  },
];

const PRINCIPLES = [
  { icon: CheckCircle2, color: "#00ff88", label: "Never guess",         desc: "Every rule is derived from official platform documentation." },
  { icon: AlertTriangle, color: "#f7d774", label: "Never invent",       desc: "Migrations only appear when the platform documents them." },
  { icon: Search, color: "#86a7ff",        label: "Never silently rewrite", desc: "We show what changed — you decide how to fix it." },
  { icon: Shield, color: "#c084fc",        label: "Confidence scored",  desc: "1 = partial, 2 = documented partial, 3 = fully documented." },
];

export function CompatibilityDriftSection() {
  return (
    <section className="border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
      <div className="max-w-7xl mx-auto px-8 py-20">

        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-block font-mono text-[9px] uppercase tracking-[0.22em] px-3 py-1.5 border mb-4"
            style={{ borderColor: "rgba(247,163,92,0.3)", color: "#f7a35c", background: "rgba(247,163,92,0.06)" }}>
            Compatibility Drift Engine
          </div>
          <h2 className="font-sans text-3xl sm:text-4xl font-light mb-4" style={{ color: "var(--color-fi-text)" }}>
            Detect Breaking Changes<br />
            <span style={{ color: "#f7a35c" }}>Before They Break You</span>
          </h2>
          <p className="font-sans text-[15px] max-w-2xl mx-auto" style={{ color: "var(--color-fi-muted)" }}>
            Platform APIs change. Nodes get deprecated. Credentials are restructured. FlowIntel runs every workflow
            through a deterministic, documentation-backed compatibility engine so you know exactly what will break
            on upgrade — and how to fix it.
          </p>
        </div>

        {/* 4 principles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px mb-px" style={{ background: "rgba(255,255,255,0.07)" }}>
          {PRINCIPLES.map(({ icon: Icon, color, label, desc }) => (
            <div key={label} className="p-5" style={{ background: "rgba(8,8,8,0.88)" }}>
              <Icon size={18} className="mb-3" style={{ color }} />
              <div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color }}>{label}</div>
              <p className="font-sans text-[11px] leading-relaxed" style={{ color: "rgba(240,240,240,0.5)" }}>{desc}</p>
            </div>
          ))}
        </div>

        {/* Phase pipeline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px mb-14" style={{ background: "rgba(255,255,255,0.07)" }}>
          {DRIFT_PHASES.map(({ phase, title, desc, items, color }) => (
            <div key={phase} className="p-6" style={{ background: "rgba(8,8,8,0.92)" }}>
              <div className="font-mono text-[32px] font-light mb-2 tabular-nums" style={{ color: "rgba(255,255,255,0.08)" }}>
                {phase}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color }}>
                {title}
              </div>
              <p className="font-sans text-[11px] leading-relaxed mb-4" style={{ color: "rgba(240,240,240,0.45)" }}>
                {desc}
              </p>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ background: color }} />
                    <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.38)" }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Live example cards */}
        <div className="mb-6">
          <div className="font-mono text-[10px] uppercase tracking-widest mb-5" style={{ color: "rgba(240,240,240,0.3)" }}>
            Example Drift Findings
          </div>
          <div className="space-y-2">
            {DRIFT_EXAMPLES.map((ex) => (
              <div key={ex.component} className="border"
                style={{ borderColor: ex.border, background: ex.bg }}>
                <div className="flex items-center gap-3 px-5 py-3">
                  <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border shrink-0"
                    style={{ color: ex.color, borderColor: ex.border }}>
                    {ex.severity}
                  </span>
                  <span className="font-sans text-[12px] flex-1" style={{ color: "var(--color-fi-text)" }}>
                    {ex.summary}
                  </span>
                  <span className="font-mono text-[9px]" style={{ color: "rgba(240,240,240,0.32)" }}>
                    conf {ex.confidence}/3
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-px border-t" style={{ borderColor: ex.border, background: "rgba(0,0,0,0.3)" }}>
                  <div className="px-4 py-2.5" style={{ background: ex.bg }}>
                    <div className="font-mono text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "rgba(240,240,240,0.3)" }}>Component</div>
                    <code className="font-mono text-[10px]" style={{ color: ex.color }}>{ex.component}</code>
                  </div>
                  <div className="px-4 py-2.5" style={{ background: ex.bg }}>
                    <div className="font-mono text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "rgba(255,93,93,0.6)" }}>Before</div>
                    <code className="font-mono text-[10px]" style={{ color: "#ff5d5d" }}>{ex.old}</code>
                  </div>
                  <div className="px-4 py-2.5" style={{ background: ex.bg }}>
                    <div className="font-mono text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "rgba(0,255,136,0.6)" }}>Suggested</div>
                    <code className="font-mono text-[10px]" style={{ color: "var(--color-fi-accent)" }}>{ex.suggested}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <a href="/upload"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest px-6 py-3 border transition-all hover:bg-[rgba(0,255,136,0.08)]"
            style={{ borderColor: "rgba(0,255,136,0.4)", color: "var(--color-fi-accent)" }}>
            <Layers size={13} />
            Run Drift Analysis On Your Workflow →
          </a>
        </div>

      </div>
    </section>
  );
}
