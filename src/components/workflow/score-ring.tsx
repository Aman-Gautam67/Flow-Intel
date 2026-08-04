"use client";

interface ScoreRingProps {
  score: number | null;   // null = N/A pillar
  label: string;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

const GRADE_MAP = [
  { min: 95, grade: "A+", color: "#00ff88" },
  { min: 87, grade: "A",  color: "#00ff88" },
  { min: 80, grade: "A-", color: "#00ee77" },
  { min: 73, grade: "B+", color: "#66ff99" },
  { min: 67, grade: "B",  color: "#66ff99" },
  { min: 60, grade: "B-", color: "#a3e8ab" },
  { min: 53, grade: "C+", color: "#f7d774" },
  { min: 47, grade: "C",  color: "#f7d774" },
  { min: 40, grade: "C-", color: "#f7b96e" },
  { min: 33, grade: "D+", color: "#ff8c5a" },
  { min: 27, grade: "D",  color: "#ff7042" },
  { min: 20, grade: "D-", color: "#ff5d5d" },
  { min: 0,  grade: "F",  color: "#ff3b3b" },
];

export function getGrade(score: number, _label = "") {
  return GRADE_MAP.find((g) => score >= g.min) ?? GRADE_MAP[GRADE_MAP.length - 1]!;
}

export function ScoreRing({ score, label, size = 96, strokeWidth = 8, showLabel = true }: ScoreRingProps) {
  const cx   = size / 2;
  const r    = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;

  // N/A state — grey dashed ring, "N/A" text
  if (score === null) {
    const NA_COLOR = "rgba(255,255,255,0.22)";
    return (
      <div className="flex flex-col items-center gap-2">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: N/A`}>
          <circle cx={cx} cy={cx} r={r} fill="none"
            stroke={NA_COLOR} strokeWidth={strokeWidth}
            strokeDasharray="4 6" strokeLinecap="round" />
          <text x={cx} y={cx + 4} textAnchor="middle" fontSize={size * 0.18} fontWeight="400"
            fill={NA_COLOR} fontFamily="var(--font-mono)">N/A</text>
        </svg>
        {showLabel && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "rgba(240,240,240,0.35)" }}>
            {label}
          </span>
        )}
      </div>
    );
  }

  const dash = (score / 100) * circ;
  const { color, grade } = getGrade(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${score}/100`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          style={{ filter: `drop-shadow(0 0 8px ${color}55)`, transition: "stroke-dasharray 0.6s ease" }}
        />
        <text x={cx} y={cx - 6} textAnchor="middle" fontSize={size * 0.22} fontWeight="400"
          fill="var(--color-fi-text)" fontFamily="var(--font-mono)">{score}</text>
        <text x={cx} y={cx + size * 0.14} textAnchor="middle" fontSize={size * 0.14} fontWeight="600"
          fill={color} fontFamily="var(--font-mono)">{grade}</text>
      </svg>
      {showLabel && (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "rgba(240,240,240,0.65)" }}>
          {label}
        </span>
      )}
    </div>
  );
}

export function ScoreBadge({ score, label }: { score: number | null; label: string }) {
  if (score === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 border font-mono text-[11px]"
        style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)" }}>
        <span style={{ color: "var(--color-fi-muted)" }}>{label}</span>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>N/A</span>
      </div>
    );
  }
  const { color, grade } = getGrade(score);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border font-mono text-[11px]"
      style={{ borderColor: `${color}44`, background: `${color}0a` }}>
      <span style={{ color: "var(--color-fi-muted)" }}>{label}</span>
      <span style={{ color }} className="font-semibold">{grade}</span>
      <span style={{ color: "rgba(240,240,240,0.56)" }}>{score}</span>
    </div>
  );
}
