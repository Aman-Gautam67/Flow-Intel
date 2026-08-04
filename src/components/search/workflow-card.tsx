"use client";

import { Shield, Activity, Zap, Brain, Award } from "lucide-react";
import type { WorkflowListItem } from "@/lib/api/workflows";

function scoreColor(n: number) {
  if (n >= 80) return "#00ff88";
  if (n >= 60) return "#f7d774";
  return "#ff5d5d";
}
function grade(n: number) {
  if (n >= 95) return "A+";  if (n >= 87) return "A";  if (n >= 80) return "A-";
  if (n >= 73) return "B+";  if (n >= 67) return "B";  if (n >= 60) return "B-";
  if (n >= 53) return "C+";  if (n >= 47) return "C";  if (n >= 40) return "C-";
  return n >= 20 ? "D" : "F";
}

function FqiBadge({ fqi }: { fqi: number }) {
  const color = scoreColor(fqi);
  return (
    <div className="flex flex-col items-center justify-center px-2.5 py-2 border shrink-0"
      style={{ borderColor: `${color}30`, background: `${color}08`, minWidth: 48 }}>
      <span className="font-mono text-[17px] font-light leading-none tabular-nums" style={{ color }}>{fqi}</span>
      <span className="font-mono text-[7px] font-bold tracking-widest mt-0.5" style={{ color }}>{grade(fqi)}</span>
      <span className="font-mono text-[6px] uppercase tracking-widest mt-0.5" style={{ color: "rgba(240,240,240,0.3)" }}>FQI</span>
    </div>
  );
}

function MiniBar({ label, score, icon: Icon }: { label: string; score: number; icon: React.ElementType }) {
  const color = scoreColor(score);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Icon size={8} style={{ color: "rgba(240,240,240,0.3)" }} />
          <span className="font-mono text-[8px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.38)" }}>{label}</span>
        </div>
        <span className="font-mono text-[9px] tabular-nums" style={{ color }}>{score}</span>
      </div>
      <div className="h-[2px]" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

export function WorkflowCard({ wf }: { wf: WorkflowListItem }) {
  const s = wf.scores;
  const secGrade = s ? grade(s.security) : null;

  return (
    <a href={`/workflows/${wf.slug}`}
      className="flex gap-3 border transition-all hover:border-[rgba(0,255,136,0.28)] hover:bg-[rgba(0,255,136,0.015)] group"
      style={{ borderColor: "var(--color-fi-border)", background: "rgba(8,8,8,0.75)", padding: "14px" }}>

      {/* FQI */}
      {s?.fqi != null
        ? <FqiBadge fqi={s.fqi} />
        : <div className="flex flex-col items-center justify-center px-2.5 py-2 border shrink-0"
            style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)", minWidth: 48 }}>
            <span className="font-mono text-[10px]" style={{ color: "rgba(240,240,240,0.22)" }}>—</span>
          </div>
      }

      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="min-w-0">
            <h3 className="font-sans font-medium text-[13px] group-hover:text-[var(--color-fi-accent)] transition-colors truncate"
              style={{ color: "var(--color-fi-text)" }}>{wf.title}</h3>
            {wf.description && (
              <p className="font-sans text-[11px] line-clamp-1 mt-0.5 truncate" style={{ color: "var(--color-fi-muted)" }}>{wf.description}</p>
            )}
          </div>
          <span className="font-mono text-[7px] uppercase tracking-widest px-1.5 py-0.5 border shrink-0"
            style={{ borderColor: "rgba(0,255,136,0.22)", color: "var(--color-fi-accent)", background: "rgba(0,255,136,0.04)" }}>
            {wf.platform}
          </span>
        </div>

        {/* Score bars */}
        {s && (
          <div className="space-y-1 mb-1.5">
            <MiniBar label="Security"    score={s.security}             icon={Shield} />
            <MiniBar label="Health"      score={s.health}               icon={Activity} />
            <MiniBar label="Reliability" score={s.reliability ?? s.health} icon={Zap} />
          </div>
        )}

        {/* Chip row */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          <span className="font-mono text-[7px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.28)" }}>
            {wf.nodeCount}n
          </span>
          {wf.critFlagCount > 0
            ? <span className="font-mono text-[7px] uppercase px-1 py-px border"
                style={{ color: "var(--color-fi-crit)", borderColor: "rgba(255,93,93,0.22)", background: "rgba(255,93,93,0.05)" }}>
                {wf.critFlagCount} CRIT
              </span>
            : s && <span className="font-mono text-[7px] uppercase" style={{ color: "var(--color-fi-accent)" }}>✓ Clean</span>
          }
          {wf.hasAiNodes && (
            <span className="font-mono text-[7px] uppercase px-1 py-px border"
              style={{ color: "#c084fc", borderColor: "rgba(192,132,252,0.22)", background: "rgba(192,132,252,0.05)" }}>
              <Brain size={7} className="inline mr-0.5" />AI
            </span>
          )}
          {wf.certified && (
            <span className="font-mono text-[7px] uppercase px-1 py-px border"
              style={{ color: "#f7d774", borderColor: "rgba(247,215,116,0.28)", background: "rgba(247,215,116,0.05)" }}>
              <Award size={7} className="inline mr-0.5" />Cert
            </span>
          )}
          {secGrade && (
            <span className="font-mono text-[7px] uppercase px-1 py-px border"
              style={{ color: scoreColor(s!.security), borderColor: `${scoreColor(s!.security)}28`, background: `${scoreColor(s!.security)}06` }}>
              Sec {secGrade}
            </span>
          )}
          {s?.estimatedCostUsd != null && s.estimatedCostUsd > 0 && (
            <span className="font-mono text-[7px]" style={{ color: "rgba(240,240,240,0.26)" }}>
              ${s.estimatedCostUsd.toFixed(2)}/mo
            </span>
          )}
          {wf.views > 0 && (
            <span className="font-mono text-[7px]" style={{ color: "rgba(240,240,240,0.22)" }}>
              {wf.views >= 1000 ? `${(wf.views / 1000).toFixed(1)}k` : wf.views} views
            </span>
          )}
          {wf.downloads > 0 && (
            <span className="font-mono text-[7px]" style={{ color: "rgba(240,240,240,0.22)" }}>
              · {wf.downloads >= 1000 ? `${(wf.downloads / 1000).toFixed(1)}k` : wf.downloads} dl
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
