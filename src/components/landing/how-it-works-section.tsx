"use client";

import { FileJson, Cpu, Flag, Award } from "lucide-react";

const STEPS = [
  {
    n: "01",
    icon: FileJson,
    title: "Parse",
    detail: "JSON export from n8n, Make, Zapier, or Flowise is normalised into a platform-agnostic WorkflowAST — nodes, edges, parameters, credentials.",
    color: "#86a7ff",
  },
  {
    n: "02",
    icon: Cpu,
    title: "Analyse",
    detail: "402 rules execute in parallel across 10 categories. Each rule is a pure function: same AST always produces same findings. Zero LLM calls.",
    color: "#00ff88",
  },
  {
    n: "03",
    icon: Flag,
    title: "Score",
    detail: "Findings are aggregated per category with severity-scaled caps. A weighted FQI (0-100) is computed. N/A categories are excluded from the average.",
    color: "#f7d774",
  },
  {
    n: "04",
    icon: Award,
    title: "Certify",
    detail: "5 quality gates evaluate in dependency order. If Marketplace + Production gates pass, a SHA-256 certificate is issued with a tamper-evident hash.",
    color: "#c084fc",
  },
];

export function HowItWorksSection() {
  return (
    <section className="max-w-6xl mx-auto px-6 pb-20">
      <span className="font-mono text-[10px] tracking-[0.22em] uppercase mb-8 block"
        style={{ color: "rgba(240,240,240,0.45)" }}>
        How It Works
      </span>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: "var(--color-fi-border)" }}>
        {STEPS.map((s) => (
          <div key={s.n} className="p-6 flex flex-col gap-4 hover:bg-[rgba(255,255,255,0.015)] transition-colors"
            style={{ background: "rgba(8,8,8,0.9)" }}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[32px] font-light leading-none tabular-nums"
                style={{ color: "rgba(255,255,255,0.08)" }}>{s.n}</span>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <div>
              <div className="font-mono text-[13px] font-medium mb-2" style={{ color: s.color }}>{s.title}</div>
              <p className="font-sans text-[12px] leading-relaxed" style={{ color: "rgba(240,240,240,0.48)" }}>{s.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
