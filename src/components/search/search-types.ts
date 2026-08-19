/**
 * Search page — shared filter state types
 * Kept in a separate file so components can import without pulling in React.
 */

export const PLATFORMS = [
  { value: "",            label: "All Platforms" },
  { value: "N8N",         label: "n8n" },
  { value: "MAKE",        label: "Make" },
  { value: "ZAPIER",      label: "Zapier" },
  { value: "FLOWISE",     label: "Flowise" },
  { value: "LANGFLOW",    label: "LangFlow" },
  { value: "DIFY",        label: "Dify" },
  { value: "CREWAI",      label: "CrewAI" },
  { value: "AUTOGEN",     label: "AutoGen" },
  { value: "PIPEDREAM",   label: "Pipedream" },
  { value: "OPENAI_AGENTS", label: "OpenAI Agents" },
  { value: "NODE_RED",    label: "Node-RED" },
  { value: "ACTIVEPIECES", label: "Activepieces" },
  { value: "AIRFLOW",     label: "Airflow" },
  { value: "PREFECT",     label: "Prefect" },
] as const;

// Quick-filter chips shown horizontally above results
export const QUICK_CHIPS = [
  "AI Agents", "RAG", "Discord", "Telegram", "Slack", "Email",
  "CRM", "Database", "Finance", "Marketing", "Sales", "Customer Support",
  "DevOps", "Security", "Monitoring", "ETL", "Analytics", "Webhooks",
  "Scheduling", "LLM", "MCP", "API", "Vision", "Coding",
] as const;
export type QuickChip = typeof QUICK_CHIPS[number];

// Quality / certification tags
export const QUALITY_TAGS = [
  { id: "noCritFlags",     label: "No CRIT Flags",       color: "#00ff88", border: "rgba(0,255,136,0.3)",    bg: "rgba(0,255,136,0.08)" },
  { id: "productionReady", label: "Production Ready",    color: "#66ff99", border: "rgba(102,255,153,0.3)",  bg: "rgba(102,255,153,0.08)" },
  { id: "certifiedOnly",   label: "✦ Certified",         color: "#f7d774", border: "rgba(247,215,116,0.3)",  bg: "rgba(247,215,116,0.08)" },
  { id: "hasAi",           label: "AI Nodes",            color: "#c084fc", border: "rgba(192,132,252,0.3)",  bg: "rgba(192,132,252,0.08)" },
] as const;
export type QualityTagId = typeof QUALITY_TAGS[number]["id"];

// Sort options
export const SORT_OPTIONS = [
  { value: "newest",    label: "Newest" },
  { value: "fqi",       label: "Highest FQI" },
  { value: "security",  label: "Highest Security" },
  { value: "health",    label: "Highest Health" },
  { value: "cost_asc",  label: "Lowest Cost" },
] as const;
export type SortOption = typeof SORT_OPTIONS[number]["value"];

// Node count ranges
export const NODE_RANGES = [
  { label: "1–10",   min: 1,   max: 10  },
  { label: "10–25",  min: 10,  max: 25  },
  { label: "25–50",  min: 25,  max: 50  },
  { label: "50–100", min: 50,  max: 100 },
  { label: "100+",   min: 100, max: 9999 },
] as const;
export type NodeRange = typeof NODE_RANGES[number]["label"] | "";

export interface SearchFilters {
  query:       string;
  platform:    string;
  sort:        SortOption;
  qualityTags: Set<QualityTagId>;
  quickChip:   QuickChip | "";
  fqiMin:      number;
  securityMin: number;
  healthMin:   number;
  nodeRange:   NodeRange;
}

export function defaultFilters(): SearchFilters {
  return {
    query:       "",
    platform:    "",
    sort:        "newest",
    qualityTags: new Set(),
    quickChip:   "",
    fqiMin:      0,
    securityMin: 0,
    healthMin:   0,
    nodeRange:   "",
  };
}

/** Build URLSearchParams from filter state */
export function filtersToParams(f: SearchFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.query)       sp.set("q",           f.query);
  if (f.platform)    sp.set("platform",    f.platform);
  if (f.sort !== "newest") sp.set("sort",  f.sort);
  if (f.fqiMin > 0)  sp.set("fqiMin",      String(f.fqiMin));
  if (f.securityMin > 0) sp.set("securityMin", String(f.securityMin));
  if (f.healthMin > 0)   sp.set("healthMin",   String(f.healthMin));
  if (f.quickChip)   sp.set("q", [f.query, f.quickChip].filter(Boolean).join(" "));
  if (f.qualityTags.has("noCritFlags"))     sp.set("noCritFlags",     "true");
  if (f.qualityTags.has("productionReady")) sp.set("productionReady", "true");
  if (f.qualityTags.has("certifiedOnly"))   sp.set("certifiedOnly",   "true");
  if (f.qualityTags.has("hasAi"))           sp.set("hasAi",           "true");
  if (f.nodeRange) {
    const r = NODE_RANGES.find(r => r.label === f.nodeRange);
    if (r) { sp.set("nodeCountMin", String(r.min)); sp.set("nodeCountMax", String(r.max)); }
  }
  return sp;
}
