"use client";

import { X } from "lucide-react";
import {
  PLATFORMS, QUALITY_TAGS, SORT_OPTIONS, NODE_RANGES,
  type SearchFilters, type QualityTagId, type SortOption, type NodeRange,
} from "./search-types";

interface SidebarProps {
  filters: SearchFilters;
  onChange: (next: Partial<SearchFilters>) => void;
  onReset: () => void;
  hasActive: boolean;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] uppercase tracking-widest mb-2"
      style={{ color: "rgba(240,240,240,0.38)" }}>
      {children}
    </p>
  );
}

export function SearchSidebar({ filters, onChange, onReset, hasActive }: SidebarProps) {
  const toggleQuality = (id: QualityTagId) => {
    const next = new Set(filters.qualityTags);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ qualityTags: next });
  };

  return (
    <aside className="w-full lg:w-60 shrink-0 border-b lg:border-b-0 lg:border-r"
      style={{ borderColor: "var(--color-fi-border)", background: "rgba(6,6,6,0.8)" }}>
      <div className="sticky top-[45px] p-4 space-y-5 overflow-y-auto max-h-[calc(100svh-45px)]">

        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
            Filters
          </span>
          {hasActive && (
            <button onClick={onReset}
              className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest transition-colors hover:text-[var(--color-fi-text)]"
              style={{ color: "var(--color-fi-muted)" }}>
              <X size={9} /> Reset
            </button>
          )}
        </div>

        {/* Sort */}
        <div>
          <SectionLabel>Sort By</SectionLabel>
          <select value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value as SortOption })}
            className="w-full border px-2.5 py-1.5 font-mono text-[10px] appearance-none outline-none cursor-pointer"
            style={{ borderColor: "var(--color-fi-border)", color: "var(--color-fi-text)", background: "#0f0f0f", colorScheme: "dark" }}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} style={{ background: "#0f0f0f", color: "#f0f0f0" }}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Quality tags */}
        <div>
          <SectionLabel>Quality</SectionLabel>
          <div className="flex flex-col gap-1">
            {QUALITY_TAGS.map(({ id, label, color, bg, border }) => {
              const active = filters.qualityTags.has(id as QualityTagId);
              return (
                <button key={id} onClick={() => toggleQuality(id as QualityTagId)}
                  className="flex items-center gap-2 px-2.5 py-1.5 border text-left font-mono text-[9px] uppercase tracking-widest transition-all"
                  style={{
                    borderColor: active ? border : "rgba(255,255,255,0.07)",
                    background: active ? bg : "transparent",
                    color: active ? color : "rgba(240,240,240,0.42)",
                  }}>
                  {label}
                  {active && <span className="ml-auto" style={{ color }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Platform */}
        <div>
          <SectionLabel>Platform</SectionLabel>
          <div className="flex flex-col gap-1">
            {PLATFORMS.map(({ value, label }) => {
              const active = filters.platform === value;
              return (
                <button key={value} onClick={() => onChange({ platform: value })}
                  className="flex items-center gap-2 px-2.5 py-1.5 border text-left font-mono text-[9px] uppercase tracking-widest transition-all"
                  style={{
                    borderColor: active ? "rgba(0,255,136,0.35)" : "rgba(255,255,255,0.07)",
                    background: active ? "rgba(0,255,136,0.07)" : "transparent",
                    color: active ? "var(--color-fi-accent)" : "rgba(240,240,240,0.42)",
                  }}>
                  {label}
                  {active && <span className="ml-auto text-[var(--color-fi-accent)]">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* FQI minimum */}
        <div>
          <SectionLabel>
            Min FQI: <span style={{ color: "var(--color-fi-accent)" }}>{filters.fqiMin || "any"}</span>
          </SectionLabel>
          {[0, 70, 80, 90, 95].map((v) => (
            <button key={v} onClick={() => onChange({ fqiMin: v })}
              className="inline-block font-mono text-[9px] px-2 py-1 border mr-1 mb-1 transition-all"
              style={{
                borderColor: filters.fqiMin === v ? "rgba(0,255,136,0.4)" : "rgba(255,255,255,0.08)",
                color: filters.fqiMin === v ? "var(--color-fi-accent)" : "rgba(240,240,240,0.42)",
                background: filters.fqiMin === v ? "rgba(0,255,136,0.07)" : "transparent",
              }}>
              {v === 0 ? "Any" : `${v}+`}
            </button>
          ))}
        </div>

        {/* Security minimum */}
        <div>
          <SectionLabel>
            Min Security: <span style={{ color: "var(--color-fi-accent)" }}>{filters.securityMin || "any"}</span>
          </SectionLabel>
          {[0, 60, 70, 80, 90].map((v) => (
            <button key={v} onClick={() => onChange({ securityMin: v })}
              className="inline-block font-mono text-[9px] px-2 py-1 border mr-1 mb-1 transition-all"
              style={{
                borderColor: filters.securityMin === v ? "rgba(0,255,136,0.4)" : "rgba(255,255,255,0.08)",
                color: filters.securityMin === v ? "var(--color-fi-accent)" : "rgba(240,240,240,0.42)",
                background: filters.securityMin === v ? "rgba(0,255,136,0.07)" : "transparent",
              }}>
              {v === 0 ? "Any" : `${v}+`}
            </button>
          ))}
        </div>

        {/* Health minimum */}
        <div>
          <SectionLabel>
            Min Health: <span style={{ color: "var(--color-fi-accent)" }}>{filters.healthMin || "any"}</span>
          </SectionLabel>
          <input type="range" min={0} max={100} step={5} value={filters.healthMin}
            onChange={(e) => onChange({ healthMin: Number(e.target.value) })}
            className="w-full" />
        </div>

        {/* Node count */}
        <div>
          <SectionLabel>Node Count</SectionLabel>
          <div className="flex flex-col gap-1">
            <button onClick={() => onChange({ nodeRange: "" })}
              className="flex items-center gap-2 px-2.5 py-1.5 border text-left font-mono text-[9px] uppercase tracking-widest transition-all"
              style={{
                borderColor: filters.nodeRange === "" ? "rgba(0,255,136,0.35)" : "rgba(255,255,255,0.07)",
                background: filters.nodeRange === "" ? "rgba(0,255,136,0.07)" : "transparent",
                color: filters.nodeRange === "" ? "var(--color-fi-accent)" : "rgba(240,240,240,0.42)",
              }}>
              Any
            </button>
            {NODE_RANGES.map(({ label }) => {
              const active = filters.nodeRange === label;
              return (
                <button key={label} onClick={() => onChange({ nodeRange: label as NodeRange })}
                  className="flex items-center gap-2 px-2.5 py-1.5 border text-left font-mono text-[9px] uppercase tracking-widest transition-all"
                  style={{
                    borderColor: active ? "rgba(0,255,136,0.35)" : "rgba(255,255,255,0.07)",
                    background: active ? "rgba(0,255,136,0.07)" : "transparent",
                    color: active ? "var(--color-fi-accent)" : "rgba(240,240,240,0.42)",
                  }}>
                  {label} nodes
                  {active && <span className="ml-auto text-[var(--color-fi-accent)]">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* FQI legend */}
        <div className="border-t pt-3 space-y-1" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <p className="font-mono text-[7px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(240,240,240,0.22)" }}>
            FQI = Flow Quality Index (0–100)
          </p>
          {[["≥80", "#00ff88", "Good"], ["60–79", "#f7d774", "Fair"], ["<60", "#ff5d5d", "At-Risk"]].map(([r, c, l]) => (
            <div key={r as string} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: c as string }} />
              <span className="font-mono text-[7px]" style={{ color: "rgba(240,240,240,0.3)" }}>{r} — {l}</span>
            </div>
          ))}
        </div>

      </div>
    </aside>
  );
}
