"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Shield, Zap, GitBranch, Search, ChevronRight, Terminal, Lock, Activity, BarChart3, Eye, Brain } from "lucide-react";

const STAT_TARGETS = { workflows: 0, vulnerabilities: 0, integrations: 0 };

const FEATURES = [
  {
    icon: Shield,
    title: "Security Audit",
    desc: "Detects hardcoded credentials, unauthenticated webhooks, unsafe eval() patterns, and unencrypted HTTP endpoints with severity-graded flags.",
    accent: "#ff5d5d",
  },
  {
    icon: Activity,
    title: "9-Dimension Scoring",
    desc: "Health · Security · Simplicity · Reliability · Debt · Memory · Resilience · Privacy · AI Guardrails — each a deterministic 0–100 score.",
    accent: "#00ff88",
  },
  {
    icon: Eye,
    title: "PII Tracing",
    desc: "Regex-scans parameter fields for sensitive data (email, SSN, credit card) and traces them to outbound HTTP/webhook payloads.",
    accent: "#86a7ff",
  },
  {
    icon: GitBranch,
    title: "Dependency Map",
    desc: "Identifies every external service, API, and database your workflow touches — categorised and indexed for search.",
    accent: "#f7d774",
  },
  {
    icon: Brain,
    title: "AI Guardrails",
    desc: "Flags unbounded agent loops, unvalidated LLM outputs, and destructive tools attached to autonomous agents without approval gates.",
    accent: "#c084fc",
  },
  {
    icon: Zap,
    title: "Auto-Fix Remediation",
    desc: "Every flag ships with an exact n8n UI instruction and a 1-click patched JSON download — fix issues without reading docs.",
    accent: "#f7a35c",
  },
  {
    icon: BarChart3,
    title: "CI/CD Audit Mode",
    desc: "POST /api/v1/audit returns a pass/fail payload and violation array — drop it directly into GitHub Actions or any CI pipeline.",
    accent: "#00ff88",
  },
  {
    icon: Terminal,
    title: "Embeddable Badges",
    desc: "Dynamic SVG shields for GitHub READMEs: /api/badge/[slug]/security.svg → Security: A+",
    accent: "#86a7ff",
  },
];

const SAMPLE_FLAGS = [
  { severity: "CRIT", label: "Hardcoded OpenAI API key in parameters", node: "OpenAI Node" },
  { severity: "CRIT", label: "Unauthenticated webhook — any actor can trigger", node: "Webhook Trigger" },
  { severity: "WARN", label: "AI Agent loop: maxIterations undefined (∞)", node: "AI Agent" },
  { severity: "WARN", label: "POST request with auto-retry — non-idempotent risk", node: "HTTP Request" },
  { severity: "INFO", label: "3 disabled nodes detected — dead weight", node: "Set Node ×3" },
];

function useCountUp(target: number, duration = 1800): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    const steps = 40;
    const step = target / steps;
    let current = 0;
    const interval = setInterval(() => {
      current = Math.min(current + step, target);
      setCount(Math.floor(current));
      if (current >= target) clearInterval(interval);
    }, duration / steps);
    return () => clearInterval(interval);
  }, [target, duration]);
  return count;
}

function ScoreRingMini({ score, color, label }: { score: number; color: string; label: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
        <text x="36" y="40" textAnchor="middle" fontSize="14" fontWeight="600"
          fill="var(--color-fi-text)" fontFamily="var(--font-mono)">{score}</text>
      </svg>
      <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-fi-muted)]">{label}</span>
    </div>
  );
}

export function LandingPage() {
  const wfCount = useCountUp(0);
  const vulnCount = useCountUp(0);
  const intCount = useCountUp(0);

  // Hide nav once user scrolls past the hero viewport
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      // Show only when within the first viewport height
      setNavVisible(y < window.innerHeight * 0.85);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-svh">
      {/* Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center px-5 py-2.5 transition-transform duration-300 ease-in-out"
        style={{
          borderBottom: "1px solid var(--color-fi-border)",
          background: "rgba(10,10,10,0.72)",
          backdropFilter: "blur(12px)",
          transform: navVisible ? "translateY(0)" : "translateY(-110%)",
        }}>
        {/* Logo — left */}
        <div className="flex items-center gap-3 w-48">
          <div className="w-7 h-7 border flex items-center justify-center text-[var(--color-fi-accent)] font-mono font-bold text-xs"
            style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }}>FI</div>
          <span className="font-mono text-sm tracking-[0.18em] uppercase text-[var(--color-fi-text)]">FlowIntel</span>
        </div>
        {/* Links — center */}
        <div className="flex-1 flex items-center justify-center gap-8 font-mono text-[11px] tracking-widest uppercase" style={{ color: "var(--color-fi-muted)" }}>
          <Link href="/search" className="hover:text-[var(--color-fi-text)] transition-colors">Catalog</Link>
          <Link href="/upload" className="hover:text-[var(--color-fi-text)] transition-colors">Analyze</Link>
        </div>
        {/* CTA — right, no box */}
        <div className="flex items-center justify-end w-48">
          <Link href="/upload"
            className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors hover:text-[var(--color-fi-accent)]"
            style={{ color: "rgba(240,240,240,0.6)" }}>
            Get Started <ChevronRight size={11} />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative w-full max-w-6xl mx-auto px-6 pt-32 pb-20">
        <div className="inline-flex items-center gap-2.5 font-mono text-[10px] tracking-[0.22em] uppercase mb-8"
          style={{ color: "rgba(240,240,240,0.56)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-fi-accent)] pulse-dot accent-glow" />
          Static Analysis Engine · Zero LLMs · 100% Deterministic
        </div>

        <h1 className="font-sans font-light text-[clamp(44px,9vw,96px)] leading-[0.92] tracking-[-0.05em] max-w-[780px] mb-8">
          Intelligence Engine<br />
          <span style={{ color: "rgba(240,240,240,0.32)" }}>for Automation<br />Workflows</span>
        </h1>

        <p className="text-base text-[var(--color-fi-muted)] max-w-[540px] leading-relaxed mb-10 font-light">
          Drop your n8n, Make, Zapier, Flowise, LangFlow, Dify, CrewAI, AutoGen, Pipedream, or OpenAI Agents workflow export and get an instant 9-dimensional security and quality report —
          hardcoded credentials, PII leaks, unbounded agent loops, and more. No AI, no cloud.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/upload"
            className="h-12 px-7 flex items-center gap-2.5 border font-mono text-[11px] tracking-[0.1em] uppercase transition-all hover:bg-[var(--color-fi-accent)] hover:border-[var(--color-fi-accent)] hover:text-black"
            style={{ borderColor: "rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.04)", color: "var(--color-fi-text)" }}>
            <Terminal size={14} /> Analyze Workflow
          </Link>
          <Link href="/search"
            className="h-12 px-7 flex items-center gap-2.5 font-mono text-[11px] tracking-[0.1em] uppercase transition-colors"
            style={{ color: "rgba(240,240,240,0.62)" }}>
            <Search size={14} /> Browse Catalog
          </Link>
        </div>

        {/* Sample flags preview */}
        <div className="mt-16 border" style={{ borderColor: "var(--color-fi-border)", background: "var(--color-fi-panel)" }}>
          <div className="flex items-center justify-between px-5 py-3 border-b font-mono text-[10px] tracking-[0.16em] uppercase"
            style={{ borderColor: "var(--color-fi-border)", color: "rgba(240,240,240,0.56)" }}>
            <span>AUDIT_LOG // sample-workflow.json</span>
            <span className="text-[var(--color-fi-accent)]">SCANNING...</span>
          </div>
          {SAMPLE_FLAGS.map((f, i) => (
            <div key={i} className="flex items-center gap-4 px-5 border-b font-mono text-[11px] transition-colors hover:bg-[rgba(0,255,136,0.04)]"
              style={{ minHeight: "44px", borderColor: "rgba(255,255,255,0.06)", color: "rgba(240,240,240,0.72)" }}>
              <span className={`font-bold tracking-widest ${f.severity === "CRIT" ? "text-[var(--color-fi-crit)]" : f.severity === "WARN" ? "text-[var(--color-fi-warn)]" : "text-[var(--color-fi-info)]"}`}>
                {f.severity}
              </span>
              <span className="flex-1">{f.label}</span>
              <span style={{ color: "rgba(240,240,240,0.4)" }}>{f.node}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="border-y py-12" style={{ borderColor: "var(--color-fi-border)" }}>
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-3 gap-8">
          {[
            { value: wfCount, label: "Workflows Analyzed", suffix: "+" },
            { value: vulnCount, label: "Vulnerabilities Detected", suffix: "" },
            { value: intCount, label: "Integrations Indexed", suffix: "+" },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="font-mono text-[clamp(32px,5vw,56px)] font-light tracking-[-0.04em] text-[var(--color-fi-text)]"
                style={{ textShadow: "0 0 40px rgba(0,255,136,0.2)" }}>
                {s.value.toLocaleString()}{s.suffix}
              </div>
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase mt-2" style={{ color: "rgba(240,240,240,0.48)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Score rings demo */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.22em] uppercase mb-10"
          style={{ color: "rgba(240,240,240,0.48)" }}>
          <Lock size={12} /> 9 Intelligence Dimensions
        </div>
        <div className="flex flex-wrap gap-8 justify-center">
          {[
            { score: 62, color: "#f7d774", label: "Health" },
            { score: 45, color: "#ff5d5d", label: "Security" },
            { score: 91, color: "#00ff88", label: "Simplicity" },
            { score: 55, color: "#f7a35c", label: "Reliability" },
            { score: 85, color: "#00ff88", label: "Debt" },
            { score: 90, color: "#00ff88", label: "Memory" },
            { score: 38, color: "#ff5d5d", label: "Resilience" },
            { score: 70, color: "#f7d774", label: "Privacy" },
            { score: 25, color: "#ff5d5d", label: "AI Guard" },
          ].map((s) => (
            <ScoreRingMini key={s.label} {...s} />
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase mb-10"
          style={{ color: "rgba(240,240,240,0.48)" }}>
          Capabilities
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px"
          style={{ background: "var(--color-fi-border)" }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="p-6 flex flex-col gap-3 transition-colors hover:bg-[rgba(0,255,136,0.03)]"
              style={{ background: "rgba(8,8,8,0.88)" }}>
              <f.icon size={18} style={{ color: f.accent }} />
              <div className="font-sans font-medium text-[13px]" style={{ color: "var(--color-fi-text)" }}>{f.title}</div>
              <div className="font-sans text-[12px] leading-relaxed" style={{ color: "rgba(240,240,240,0.48)" }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="border p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8"
          style={{ borderColor: "rgba(0,255,136,0.22)", background: "rgba(0,255,136,0.03)" }}>
          <div>
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase mb-3" style={{ color: "rgba(0,255,136,0.7)" }}>
              GET_STARTED
            </div>
            <h2 className="font-sans font-light text-[clamp(24px,4vw,40px)] tracking-tight">
              Analyze your first workflow in seconds.
            </h2>
          </div>
          <Link href="/upload"
            className="shrink-0 h-12 px-8 flex items-center gap-2.5 font-mono text-[11px] tracking-[0.1em] uppercase transition-all hover:scale-[1.02]"
            style={{ background: "var(--color-fi-accent)", color: "#090909", border: "1px solid var(--color-fi-accent)" }}>
            <Terminal size={14} /> Drop JSON File
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-6" style={{ borderColor: "var(--color-fi-border)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-center font-mono text-[10px] tracking-[0.14em] uppercase"
          style={{ color: "rgba(240,240,240,0.32)" }}>
          <span>FlowIntel · Workflow Intelligence Platform</span>
        </div>
      </footer>
    </div>
  );
}
