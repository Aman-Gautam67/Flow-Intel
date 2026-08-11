"use client";

import { Shield, Zap, GitBranch, Brain, BarChart3, Lock, Eye, RefreshCw, Wrench, DollarSign } from "lucide-react";

// The 10 v2 engine categories with real rule counts
const CATEGORIES = [
  { icon: Shield,     name: "Security",        rules: 38, desc: "Secrets, webhooks, SQL injection, eval(), HTTP egress, PII egress", color: "#ff5d5d" },
  { icon: Zap,        name: "Reliability",     rules: 34, desc: "Error handling coverage, retry safety, timeout guards, loop bounds", color: "#f7a35c" },
  { icon: RefreshCw,  name: "Idempotency",     rules: 22, desc: "Double-write protection, payment key guards, retry de-duplication", color: "#f7d774" },
  { icon: Eye,        name: "Observability",   rules: 28, desc: "Execution tracking, structured logs, alerting, correlation IDs", color: "#86a7ff" },
  { icon: Wrench,     name: "Maintainability", rules: 31, desc: "Dead code, orphan nodes, magic strings, TODO markers, complexity", color: "#a3e8ab" },
  { icon: BarChart3,  name: "Performance",     rules: 26, desc: "Nested loops, N+1 AI calls, payload size, batch efficiency", color: "#00ff88" },
  { icon: GitBranch,  name: "Compatibility",   rules: 24, desc: "Deprecated models, version mismatches, LangChain API drift", color: "#66ff99" },
  { icon: Lock,       name: "Privacy",         rules: 30, desc: "PII classification, GDPR egress, AI prompt leakage, retention", color: "#c084fc" },
  { icon: Brain,      name: "AI Guardrails",   rules: 17, desc: "Prompt injection, maxTokens, system-message guards, model governance", color: "#c084fc" },
  { icon: DollarSign, name: "Cost Optimization",rules: 22, desc: "AI call caching, loop-in-AI, model selection, payload trimming", color: "#f7d774" },
];

// 5 Quality Gates
const GATES = [
  { name: "Security Gate",    color: "#ff5d5d", desc: "Zero CRITICAL security findings" },
  { name: "Reliability Gate", color: "#f7a35c", desc: "Error-handling coverage ≥ 60%" },
  { name: "Marketplace Gate", color: "#f7d774", desc: "Sec + Rel pass + no blocking rules" },
  { name: "Production Gate",  color: "#66ff99", desc: "All CRITICAL resolved" },
  { name: "Enterprise Gate",  color: "#00ff88", desc: "Observability + docs + compliance" },
];

export function EngineDetailsSection() {
  return (
    <section className="max-w-6xl mx-auto px-6 pb-20 space-y-16">

      {/* ── Categories ── */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm font-semibold tracking-wider text-[#FF6B00] uppercase mb-3">
          10 Scoring Categories • 402 Rules Total
        </p>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase px-2 py-1 border"
            style={{ borderColor: "rgba(0,255,136,0.25)", color: "var(--color-fi-accent)", background: "rgba(0,255,136,0.05)" }}>
            v2 Engine
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-px" style={{ background: "var(--color-fi-border)" }}>
          {CATEGORIES.map((c) => (
            <div key={c.name} className="p-5 flex flex-col gap-2.5 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
              style={{ background: "rgba(8,8,8,0.9)" }}>
              <div className="flex items-center justify-between">
                <c.icon size={14} style={{ color: c.color }} />
                <span className="font-mono text-[9px] px-1.5 py-0.5 border"
                  style={{ color: c.color, borderColor: `${c.color}33`, background: `${c.color}0d` }}>
                  {c.rules} rules
                </span>
              </div>
              <div className="font-mono text-[11px] font-medium" style={{ color: "var(--color-fi-text)" }}>{c.name}</div>
              <div className="font-sans text-[11px] leading-relaxed" style={{ color: "rgba(240,240,240,0.45)" }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quality Gates pipeline ── */}
      <div>
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase mb-6 block" style={{ color: "rgba(240,240,240,0.45)" }}>
          5-Gate Quality Pipeline
        </span>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-0">
          {GATES.map((g, i) => (
            <div key={g.name} className="flex items-center flex-1">
              <div className="flex-1 p-4 border transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                style={{ borderColor: `${g.color}30`, background: `${g.color}08` }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.color }} />
                  <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: g.color }}>{g.name}</span>
                </div>
                <p className="font-sans text-[11px]" style={{ color: "rgba(240,240,240,0.5)" }}>{g.desc}</p>
              </div>
              {i < GATES.length - 1 && (
                <span className="hidden sm:block px-2 font-mono text-[18px] shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>→</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 font-sans text-[12px]" style={{ color: "rgba(240,240,240,0.4)" }}>
          Gates are binary pass/fail and chain: a workflow must pass Security + Reliability before it can reach Marketplace, and so on.
          Certification is only issued when Marketplace + Production both pass.
        </p>
      </div>

    </section>
  );
}
