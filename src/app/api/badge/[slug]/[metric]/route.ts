import { NextRequest, NextResponse } from "next/server";
import { getWorkflowBySlug } from "@/lib/db/queries/workflows";

type Params = { params: Promise<{ slug: string; metric: string }> };
type BadgeStyle = "flat" | "for-the-badge" | "plastic";
type BadgeTheme = "dark" | "light";

const GRADE_THRESHOLDS = [
  { min: 90, grade: "A+" },
  { min: 80, grade: "A" },
  { min: 70, grade: "B" },
  { min: 60, grade: "C" },
  { min: 50, grade: "D" },
  { min: 0,  grade: "F" },
];

const COLOR_MAP: Record<string, string> = {
  "A+": "#00ff88", "A": "#00cc66", "B": "#f7d774",
  "C": "#f7a35c",  "D": "#ff7c5c", "F": "#ff5d5d",
};

function getGrade(score: number): string {
  for (const { min, grade } of GRADE_THRESHOLDS) {
    if (score >= min) return grade;
  }
  return "F";
}

// ─── SVG builders per style ───────────────────────────────────────────────────

function buildFlat(label: string, value: string, color: string, theme: BadgeTheme): string {
  const labelBg  = theme === "light" ? "#e0e0e0" : "#555";
  const labelFg  = theme === "light" ? "#333333" : "#ffffff";
  const valueFg  = theme === "light" ? "#111111" : "#ffffff";
  const lw = label.length * 6.5 + 12;
  const vw = value.length * 7.5 + 12;
  const tw = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="20">
  <clipPath id="r"><rect width="${tw}" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="${labelBg}"/>
    <rect x="${lw}" width="${vw}" height="20" fill="${color}"/>
  </g>
  <g fill="${labelFg}" text-anchor="middle" font-family="DejaVu Sans,Verdana,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14">${label}</text>
  </g>
  <g fill="${valueFg}" text-anchor="middle" font-family="DejaVu Sans,Verdana,sans-serif" font-size="11">
    <text x="${lw + vw / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

function buildForTheBadge(label: string, value: string, color: string, theme: BadgeTheme): string {
  const labelBg  = theme === "light" ? "#cccccc" : "#404040";
  const labelFg  = theme === "light" ? "#222222" : "#ffffff";
  const valueFg  = theme === "light" ? "#111111" : "#ffffff";
  const lw = label.toUpperCase().length * 8 + 20;
  const vw = value.toUpperCase().length * 8 + 20;
  const tw = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="28">
  <rect width="${lw}" height="28" fill="${labelBg}"/>
  <rect x="${lw}" width="${vw}" height="28" fill="${color}"/>
  <g font-family="Verdana,Geneva,sans-serif" font-size="11" font-weight="bold" letter-spacing="1" text-anchor="middle">
    <text x="${lw / 2}" y="18" fill="${labelFg}">${label.toUpperCase()}</text>
    <text x="${lw + vw / 2}" y="18" fill="${valueFg}">${value.toUpperCase()}</text>
  </g>
</svg>`;
}

function buildPlastic(label: string, value: string, color: string, theme: BadgeTheme): string {
  const labelBg = theme === "light" ? "#d6d6d6" : "#555";
  const labelFg = theme === "light" ? "#333"    : "#fff";
  const valueFg = theme === "light" ? "#111"    : "#fff";
  const lw = label.length * 6.5 + 12;
  const vw = value.length * 7.5 + 12;
  const tw = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="20">
  <linearGradient id="pl" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".2"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${tw}" height="20" rx="4"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="${labelBg}"/>
    <rect x="${lw}" width="${vw}" height="20" fill="${color}"/>
    <rect width="${tw}" height="20" fill="url(#pl)"/>
  </g>
  <g fill="${labelFg}" text-anchor="middle" font-family="DejaVu Sans,Verdana,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14">${label}</text>
  </g>
  <g fill="${valueFg}" text-anchor="middle" font-family="DejaVu Sans,Verdana,sans-serif" font-size="11">
    <text x="${lw + vw / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

function buildSvg(label: string, value: string, color: string, style: BadgeStyle, theme: BadgeTheme): string {
  switch (style) {
    case "for-the-badge": return buildForTheBadge(label, value, color, theme);
    case "plastic":       return buildPlastic(label, value, color, theme);
    default:              return buildFlat(label, value, color, theme);
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const { slug, metric } = await params;
  const sp    = request.nextUrl.searchParams;
  const style = (sp.get("style") ?? "flat") as BadgeStyle;
  const theme = (sp.get("theme") ?? "dark") as BadgeTheme;

  const data = await getWorkflowBySlug(slug);
  if (!data?.scores) {
    const svg = buildSvg(metric, "N/A", "#aaa", style, theme);
    return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache" } });
  }

  const cleanMetric = metric.replace(/\.svg$/, "").toLowerCase();

  // ── Special: certified badge ──────────────────────────────────────────────
  if (cleanMetric === "certified") {
    const v2 = data.analysisV2;
    const isCert = !!(v2?.gateMarketplacePassed && v2?.gateProductionPassed);
    const label = "FlowIntel";
    const value = isCert ? "CERTIFIED" : "NOT CERTIFIED";
    const color = isCert ? "#00ff88" : "#ff5d5d";
    const svg = buildSvg(label, value, color, style, theme);
    return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=3600, s-maxage=3600" } });
  }

  // ── Special: FQI badge ────────────────────────────────────────────────────
  if (cleanMetric === "fqi") {
    const fqi = data.analysisV2?.fqiScore ?? null;
    if (fqi === null) {
      const svg = buildSvg("FQI", "N/A", "#aaa", style, theme);
      return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache" } });
    }
    const grade = getGrade(fqi);
    const color = COLOR_MAP[grade] ?? "#aaa";
    const svg = buildSvg("FQI", `${grade} (${fqi})`, color, style, theme);
    return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=3600, s-maxage=3600" } });
  }

  // ── Legacy + v2 category score map ───────────────────────────────────────
  const v2 = data.analysisV2;
  const scoreMap: Record<string, number | null | undefined> = {
    // Legacy 9 dimensions (always present)
    health:           data.scores.healthScore,
    security:         data.scores.securityScore,
    simplicity:       data.scores.complexityScore,
    complexity:       data.scores.complexityScore,   // alias
    reliability:      data.scores.reliabilityScore,
    debt:             data.scores.debtScore,
    memory:           data.scores.memoryScore,
    resilience:       data.scores.resilienceScore,
    privacy:          data.scores.privacyScore,
    "ai-guardrails":  data.scores.aiGuardrailsScore,
    // v2 category scores (present only if v2 analysis exists)
    idempotency:      v2?.scoreIdempotency,
    observability:    v2?.scoreObservability,
    maintainability:  v2?.scoreMaintainability,
    performance:      v2?.scorePerformance,
    compatibility:    v2?.scoreCompatibility,
    documentation:    v2?.scoreDocumentation,
    "cost-optimization": v2?.scoreCostOptimization,
    cost:             v2?.scoreCostOptimization,
  };

  const score = scoreMap[cleanMetric];

  if (score === undefined) {
    return new NextResponse("Unknown metric", { status: 404 });
  }
  if (score === null) {
    const svg = buildSvg(cleanMetric, "N/A", "#aaa", style, theme);
    return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache" } });
  }

  const grade = getGrade(score);
  const color = COLOR_MAP[grade] ?? "#aaa";
  const label = cleanMetric.charAt(0).toUpperCase() + cleanMetric.slice(1);
  const value = `${grade} (${score})`;

  const svg = buildSvg(label, value, color, style, theme);

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "max-age=3600, s-maxage=3600",
    },
  });
}
