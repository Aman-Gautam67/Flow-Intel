"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { DriftResult } from "@/lib/engine/drift-database";

interface DriftPanelProps {
  drift: DriftResult[];
}

const SEV_STYLES: Record<string, { color: string; bg: string; border: string; label: string }> = {
  BREAKING:   { color: "#ff5d5d", bg: "rgba(255,93,93,0.07)",   border: "rgba(255,93,93,0.3)",   label: "BREAKING" },
  DEPRECATED: { color: "#f7a35c", bg: "rgba(247,163,92,0.07)",  border: "rgba(247,163,92,0.3)",  label: "DEPRECATED" },
  WARNING:    { color: "#f7d774", bg: "rgba(247,215,116,0.07)", border: "rgba(247,215,116,0.3)", label: "WARN" },
  INFO:       { color: "#86a7ff", bg: "rgba(134,167,255,0.07)", border: "rgba(134,167,255,0.3)", label: "INFO" },
};

/** Inline badge used on workflow cards / upload result */
export function DriftBadge({ drift }: { drift: DriftResult[] }) {
  if (drift.length === 0) return null;
  const breaking   = drift.filter((d) => d.record.severity === "BREAKING").length;
  const deprecated = drift.filter((d) => d.record.severity === "DEPRECATED").length;
  const warnings   = drift.filter((d) => d.record.severity === "WARNING").length;

  if (breaking > 0) {
    return (
      <span className="font-mono text-[7px] uppercase px-1 py-px border"
        style={{ color: "#ff5d5d", borderColor: "rgba(255,93,93,0.3)", background: "rgba(255,93,93,0.07)" }}>
        {breaking} BREAKING
      </span>
    );
  }
  if (deprecated > 0) {
    return (
      <span className="font-mono text-[7px] uppercase px-1 py-px border"
        style={{ color: "#f7a35c", borderColor: "rgba(247,163,92,0.3)", background: "rgba(247,163,92,0.07)" }}>
        {deprecated} DEPRECATED
      </span>
    );
  }
  return (
    <span className="font-mono text-[7px] uppercase px-1 py-px border"
      style={{ color: "#f7d774", borderColor: "rgba(247,215,116,0.3)", background: "rgba(247,215,116,0.07)" }}>
      {warnings} DRIFT WARN
    </span>
  );
}

/** Full panel used inside the dashboard Gates & Cert tab */
export function DriftPanel({ drift }: DriftPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (drift.length === 0) {
    return (
      <div className="flex items-center gap-3 p-5">
        <CheckCircle2 size={16} style={{ color: "var(--color-fi-accent)" }} />
        <div>
          <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--color-fi-accent)" }}>
            No compatibility drift detected
          </span>
          <p className="font-sans text-[11px] mt-0.5" style={{ color: "var(--color-fi-muted)" }}>
            All nodes and expressions are current against documented platform versions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      {drift.map(({ record, affectedNodes }) => {
        const sty = SEV_STYLES[record.severity] ?? SEV_STYLES["INFO"];
        const isOpen = expanded === record.id;
        return (
          <div key={record.id}>
            <button
              className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[rgba(255,255,255,0.02)] transition-colors"
              onClick={() => setExpanded(isOpen ? null : record.id)}>
              <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border shrink-0"
                style={{ color: sty.color, borderColor: sty.border, background: sty.bg }}>
                {sty.label}
              </span>
              <span className="flex-1 font-sans text-[12px]" style={{ color: "var(--color-fi-text)" }}>
                {record.summary}
              </span>
              {affectedNodes.length > 0 && (
                <span className="font-mono text-[9px]" style={{ color: "rgba(240,240,240,0.38)" }}>
                  {affectedNodes.length} node{affectedNodes.length > 1 ? "s" : ""}
                </span>
              )}
              {isOpen ? <ChevronUp size={12} style={{ color: "var(--color-fi-muted)", flexShrink: 0 }} />
                      : <ChevronDown size={12} style={{ color: "var(--color-fi-muted)", flexShrink: 0 }} />}
            </button>

            {isOpen && (
              <div className="px-5 pb-4 space-y-3" style={{ background: "rgba(255,255,255,0.01)" }}>
                <p className="font-sans text-[12px] leading-relaxed" style={{ color: "rgba(240,240,240,0.65)" }}>
                  {record.detail}
                </p>
                {(record.old || record.suggested) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {record.old && (
                      <div className="px-3 py-2 border" style={{ borderColor: "rgba(255,93,93,0.2)", background: "rgba(255,93,93,0.04)" }}>
                        <span className="font-mono text-[8px] uppercase tracking-widest block mb-1" style={{ color: "rgba(255,93,93,0.7)" }}>Current (old)</span>
                        <code className="font-mono text-[11px]" style={{ color: "#ff5d5d" }}>{record.old}</code>
                      </div>
                    )}
                    {record.suggested && (
                      <div className="px-3 py-2 border" style={{ borderColor: "rgba(0,255,136,0.2)", background: "rgba(0,255,136,0.04)" }}>
                        <span className="font-mono text-[8px] uppercase tracking-widest block mb-1" style={{ color: "rgba(0,255,136,0.7)" }}>Suggested</span>
                        <code className="font-mono text-[11px]" style={{ color: "var(--color-fi-accent)" }}>{record.suggested}</code>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-4 flex-wrap">
                  {affectedNodes.length > 0 && (
                    <div>
                      <span className="font-mono text-[8px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.35)" }}>Affected nodes: </span>
                      <span className="font-mono text-[9px]" style={{ color: "rgba(240,240,240,0.55)" }}>
                        {affectedNodes.join(", ")}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[8px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.35)" }}>Since: </span>
                    <span className="font-mono text-[9px]" style={{ color: "rgba(240,240,240,0.55)" }}>{record.since}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[8px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.35)" }}>Confidence: </span>
                    {[1,2,3].map((i) => (
                      <span key={i} className="w-2 h-2 rounded-full inline-block"
                        style={{ background: i <= record.confidence ? "var(--color-fi-accent)" : "rgba(255,255,255,0.12)" }} />
                    ))}
                  </div>
                  <a href={record.docUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest hover:text-[var(--color-fi-text)] transition-colors"
                    style={{ color: "var(--color-fi-accent)" }}>
                    Official docs <ExternalLink size={9} />
                  </a>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
