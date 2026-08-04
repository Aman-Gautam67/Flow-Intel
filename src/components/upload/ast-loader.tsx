"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Deserialising JSON structure",
  "Detecting workflow platform",
  "Normalising node graph",
  "Traversing Graph AST",
  "Running security rules",
  "Evaluating reliability rules",
  "Scanning for PII fields",
  "Calculating Blast Radius",
  "Running AI guardrail checks",
  "Calculating Reliability Score",
  "Generating remediation steps",
  "Finalising report",
];

/** Immersive animated loading state shown while the /api/parse request is in flight. */
export function AstLoader({ stage }: { stage: "parsing" | "saving" }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [dot, setDot] = useState(0);

  // Cycle through STEPS every 900 ms
  useEffect(() => {
    const t = setInterval(() => {
      setStepIdx((i) => (i + 1) % STEPS.length);
    }, 900);
    return () => clearInterval(t);
  }, []);

  // Animate ellipsis dot
  useEffect(() => {
    const t = setInterval(() => setDot((d) => (d + 1) % 4), 300);
    return () => clearInterval(t);
  }, []);

  const dotStr = ".".repeat(dot);
  const currentStep = STEPS[stepIdx] ?? STEPS[0];

  // Pseudo-progress: parsing = 0→55%, saving = 56→92%
  const progressPct = stage === "parsing" ? 45 : 88;

  return (
    <div
      className="border relative overflow-hidden"
      style={{
        borderColor: "rgba(0,255,136,0.25)",
        background: "rgba(4,12,8,0.82)",
        padding: "36px 28px",
      }}
    >
      {/* Horizontal scan line */}
      <div className="absolute inset-x-0" style={{ top: "50%", overflow: "hidden", height: "2px" }}>
        <div className="ast-scan" />
      </div>

      {/* Central node with pulsing rings */}
      <div className="flex flex-col items-center gap-6">
        <div className="relative w-20 h-20 flex items-center justify-center">
          {/* Expanding rings */}
          <div className="node-expand" style={{ width: "100%", height: "100%" }} />
          <div className="node-expand node-expand-delay-1" style={{ width: "100%", height: "100%" }} />
          <div className="node-expand node-expand-delay-2" style={{ width: "100%", height: "100%" }} />
          {/* Core node */}
          <div
            className="relative z-10 w-10 h-10 border-2 flex items-center justify-center font-mono text-xs font-bold"
            style={{ borderColor: "var(--color-fi-accent)", color: "var(--color-fi-accent)", background: "rgba(0,255,136,0.08)" }}
          >
            AST
          </div>
        </div>

        {/* Step label */}
        <div className="text-center space-y-1">
          <p
            key={stepIdx}
            className="step-fade font-mono text-[12px] tracking-widest uppercase"
            style={{ color: "var(--color-fi-accent)" }}
          >
            {currentStep}{dotStr}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.32)" }}>
            {stage === "parsing" ? "Parsing workflow graph" : "Running analysis engine"}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs">
          <div className="h-1 w-full" style={{ background: "rgba(255,255,255,0.07)" }}>
            <div
              className="shimmer h-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.3)" }}>
            <span>0%</span>
            <span>{progressPct}%</span>
          </div>
        </div>

        {/* Pseudo mini-graph */}
        <div className="flex items-center gap-1.5 opacity-40">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 border"
                style={{
                  borderColor: i % 3 === 0 ? "var(--color-fi-crit)" : i % 2 === 0 ? "var(--color-fi-warn)" : "var(--color-fi-accent)",
                  background: i === stepIdx % 7 ? "rgba(0,255,136,0.2)" : "transparent",
                  transition: "background 0.3s",
                }}
              />
              {i < 6 && <div style={{ width: "10px", height: "1px", background: "rgba(255,255,255,0.2)" }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Corner decorations */}
      <span className="corner corner-tl" /><span className="corner corner-tr" />
      <span className="corner corner-bl" /><span className="corner corner-br" />
    </div>
  );
}
