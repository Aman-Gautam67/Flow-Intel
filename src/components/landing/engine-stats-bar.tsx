"use client";

// Real engine stats — keep in sync with rule-packs/index.ts
export const ENGINE_STATS = {
  rules:       402,
  categories:  10,
  gates:        5,
  platforms:    6,
  dimensions:   9,
  autoFixes:   48,   // rules that ship autoFix patches
};

const STAT_ITEMS = [
  { value: ENGINE_STATS.rules,      label: "Detection Rules",    suffix: "" },
  { value: ENGINE_STATS.categories, label: "Score Categories",   suffix: "" },
  { value: ENGINE_STATS.gates,      label: "Quality Gates",      suffix: "" },
  { value: ENGINE_STATS.platforms,  label: "Platforms Supported",suffix: "" },
  { value: ENGINE_STATS.dimensions, label: "Score Dimensions",   suffix: "" },
  { value: ENGINE_STATS.autoFixes,  label: "Auto-Fix Rules",     suffix: "+" },
];

export function EngineStatsBar() {
  return (
    <div
      className="grid border-y"
      style={{
        gridTemplateColumns: `repeat(${STAT_ITEMS.length}, 1fr)`,
        borderColor: "var(--color-fi-border)",
        background: "rgba(6,6,6,0.82)",
      }}
    >
      {STAT_ITEMS.map((s, i) => (
        <div
          key={i}
          className="flex flex-col items-center justify-center gap-1 py-6 border-r last:border-r-0 text-center"
          style={{ borderColor: "var(--color-fi-border)" }}
        >
          <span
            className="font-mono text-[clamp(22px,3vw,40px)] font-light tabular-nums"
            style={{ color: "var(--color-fi-text)", textShadow: "0 0 30px rgba(0,255,136,0.18)" }}
          >
            {s.value}{s.suffix}
          </span>
          <span
            className="font-mono text-[9px] uppercase tracking-[0.2em]"
            style={{ color: "rgba(240,240,240,0.42)" }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
