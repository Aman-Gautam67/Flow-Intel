"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Loader2, X, SlidersHorizontal } from "lucide-react";
import type { WorkflowListItem } from "@/lib/api/workflows";
import { WorkflowCard } from "./workflow-card";
import { SearchSidebar } from "./search-sidebar";
import {
  QUICK_CHIPS, SORT_OPTIONS,
  defaultFilters, filtersToParams,
  type SearchFilters, type QuickChip,
} from "./search-types";

// ─── URL state helpers ────────────────────────────────────────────────────────
function readFiltersFromURL(): Partial<SearchFilters> {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  return {
    query:   sp.get("q")        ?? "",
    platform: sp.get("platform") ?? "",
  };
}

function pushURL(f: SearchFilters) {
  const sp = filtersToParams(f);
  const qs = sp.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", url);
}

export function SearchPage() {
  const [filters,     setFilters]     = useState<SearchFilters>(() => ({ ...defaultFilters(), ...readFiltersFromURL() }));
  const [results,     setResults]     = useState<WorkflowListItem[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [total,       setTotal]       = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Debounce ref so we cancel in-flight requests
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateFilters = useCallback((patch: Partial<SearchFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      // If qualityTags comes in as a Set, keep it; otherwise keep prev
      if (!(patch.qualityTags instanceof Set)) {
        next.qualityTags = patch.qualityTags ?? prev.qualityTags;
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => setFilters(defaultFilters()), []);

  const fetchResults = useCallback(async (f: SearchFilters) => {
    setLoading(true);
    try {
      const sp = filtersToParams(f);
      sp.set("limit", "40");
      const res = await fetch(`/api/workflows?${sp.toString()}`);

      // Always parse JSON safely — avoid "Unexpected end of JSON input" if the
      // server returns an empty 500 body (e.g. DATABASE_URL not configured locally)
      let data: { workflows?: WorkflowListItem[]; error?: string } = { workflows: [] };
      const text = await res.text();
      if (text) {
        try { data = JSON.parse(text); } catch { /* malformed JSON — keep empty */ }
      }

      if (!res.ok) {
        console.error("[search] API error:", res.status, data.error ?? text.slice(0, 120));
        setResults([]);
        setTotal(0);
        return;
      }

      const wfs: WorkflowListItem[] = data.workflows ?? [];

      // Client-side sort
      if (f.sort === "fqi")           wfs.sort((a, b) => (b.scores?.fqi ?? 0) - (a.scores?.fqi ?? 0));
      else if (f.sort === "security") wfs.sort((a, b) => (b.scores?.security ?? 0) - (a.scores?.security ?? 0));
      else if (f.sort === "health")   wfs.sort((a, b) => (b.scores?.health ?? 0) - (a.scores?.health ?? 0));
      else if (f.sort === "cost_asc") wfs.sort((a, b) => (a.scores?.estimatedCostUsd ?? 0) - (b.scores?.estimatedCostUsd ?? 0));
      // "newest" = API default order

      setResults(wfs);
      setTotal(wfs.length);
    } catch (err) {
      console.error("[search] fetch error:", err);
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced re-fetch whenever filters change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults(filters);
      pushURL(filters);
    }, 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filters, fetchResults]);

  const hasActive = !!(
    filters.query || filters.platform || filters.qualityTags.size > 0 ||
    filters.fqiMin > 0 || filters.securityMin > 0 || filters.healthMin > 0 ||
    filters.nodeRange || filters.quickChip || filters.sort !== "newest"
  );

  const toggleChip = (chip: QuickChip) =>
    updateFilters({ quickChip: filters.quickChip === chip ? "" : chip });

  return (
    <div className="min-h-svh">
      {/* Nav */}
      <nav className="flex items-center px-5 py-2.5"
        style={{ borderBottom: "1px solid var(--color-fi-border)", background: "rgba(10,10,10,0.96)" }}>
        <a href="/" className="flex items-center gap-3 w-48">
          <div className="w-6 h-6 border flex items-center justify-center font-mono font-bold text-s"
            style={{ borderColor: "rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.04)", color: "var(--color-fi-accent)" }}>FI</div>
          <span className="font-mono text-sm tracking-[0.3em] uppercase hidden sm:block">FlowIntel</span>
        </a>
        <div className="flex-1 flex items-center justify-center gap-8 font-mono text-[11px] tracking-widest uppercase" style={{ color: "var(--color-fi-muted)" }}>
          <a href="/search" className="text-[var(--color-fi-accent)]">Catalog</a>
          <a href="/upload" className="hover:text-[var(--color-fi-text)] transition-colors">Analyze</a>
        </div>
        <div className="w-40 flex justify-end">
          {/* Mobile sidebar toggle */}
          <button className="lg:hidden p-1.5 border" onClick={() => setSidebarOpen((p) => !p)}
            style={{ borderColor: "rgba(255,255,255,0.14)", color: "var(--color-fi-muted)" }}>
            <SlidersHorizontal size={14} />
          </button>
        </div>
      </nav>

      <div className="flex flex-col lg:flex-row min-h-svh">

        {/* Sidebar — hidden on mobile unless toggled */}
        <div className={`${sidebarOpen ? "block" : "hidden"} lg:block`}>
          <SearchSidebar
            filters={filters}
            onChange={updateFilters}
            onReset={resetFilters}
            hasActive={hasActive}
          />
        </div>

        {/* Main column */}
        <main className="flex-1 flex flex-col min-w-0">

          {/* Search bar */}
          <div className="border-b px-4 py-2.5 flex items-center gap-3"
            style={{ borderColor: "var(--color-fi-border)", background: "rgba(10,10,10,0.96)" }}>
            <Search size={14} style={{ color: "var(--color-fi-muted)", flexShrink: 0 }} />
            <input
              type="text"
              value={filters.query}
              onChange={(e) => updateFilters({ query: e.target.value })}
              placeholder="Search by name, platform, integration, use-case…"
              className="flex-1 bg-transparent font-sans text-sm outline-none"
              style={{ color: "var(--color-fi-text)" }}
            />
            {filters.query && (
              <button onClick={() => updateFilters({ query: "" })}>
                <X size={13} style={{ color: "var(--color-fi-muted)" }} />
              </button>
            )}
            {loading && <Loader2 size={13} className="animate-spin shrink-0" style={{ color: "var(--color-fi-muted)" }} />}
          </div>

          {/* Quick-filter chip strip */}
          <div className="flex gap-1.5 px-4 py-2.5 overflow-x-auto border-b scrollbar-hide"
            style={{ borderColor: "var(--color-fi-border)", background: "rgba(6,6,6,0.72)" }}>
            {QUICK_CHIPS.map((chip) => {
              const active = filters.quickChip === chip;
              return (
                <button
                  key={chip}
                  onClick={() => toggleChip(chip)}
                  className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 border whitespace-nowrap shrink-0 transition-all"
                  style={{
                    borderColor: active ? "var(--color-fi-accent)" : "rgba(255,255,255,0.1)",
                    color:       active ? "#090909" : "rgba(240,240,240,0.45)",
                    background:  active ? "var(--color-fi-accent)" : "transparent",
                  }}>
                  {chip}
                </button>
              );
            })}
          </div>

          {/* Result strip */}
          <div className="flex items-center justify-between px-4 py-2 border-b"
            style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
              {total !== null ? `${total} workflow${total !== 1 ? "s" : ""}` : "…"}
              {hasActive && " · filtered"}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.28)" }}>Sort:</span>
              <select
                value={filters.sort}
                onChange={(e) => updateFilters({ sort: e.target.value as SearchFilters["sort"] })}
                className="font-mono text-[9px] uppercase tracking-widest border px-2 py-0.5 appearance-none outline-none cursor-pointer"
                style={{ borderColor: "rgba(255,255,255,0.12)", color: "var(--color-fi-text)", background: "#0f0f0f", colorScheme: "dark" }}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} style={{ background: "#0f0f0f" }}>{o.label}</option>
                ))}
              </select>
              {hasActive && (
                <button
                  onClick={resetFilters}
                  className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border transition-colors hover:border-[rgba(0,255,136,0.3)] hover:text-[var(--color-fi-text)]"
                  style={{ borderColor: "rgba(255,255,255,0.1)", color: "var(--color-fi-muted)" }}>
                  <X size={9} /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Active chip summary */}
          {(filters.qualityTags.size > 0 || filters.quickChip) && (
            <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b"
              style={{ borderColor: "rgba(255,255,255,0.05)" }}>
              {filters.quickChip && (
                <button onClick={() => updateFilters({ quickChip: "" })}
                  className="flex items-center gap-1 px-2 py-0.5 border font-mono text-[9px] uppercase tracking-widest"
                  style={{ borderColor: "rgba(0,255,136,0.3)", background: "rgba(0,255,136,0.07)", color: "var(--color-fi-accent)" }}>
                  {filters.quickChip} <X size={8} />
                </button>
              )}
              {[...filters.qualityTags].map((id) => (
                <button key={id}
                  onClick={() => {
                    const next = new Set(filters.qualityTags);
                    next.delete(id);
                    updateFilters({ qualityTags: next });
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 border font-mono text-[9px] uppercase tracking-widest"
                  style={{ borderColor: "rgba(0,255,136,0.3)", background: "rgba(0,255,136,0.07)", color: "var(--color-fi-accent)" }}>
                  {id} <X size={8} />
                </button>
              ))}
            </div>
          )}

          {/* Results grid */}
          <div className="flex-1 p-4">
            {results.length === 0 && !loading ? (
              <div className="border p-16 text-center" style={{ borderColor: "var(--color-fi-border)", background: "rgba(8,8,8,0.6)" }}>
                <p className="font-mono text-sm mb-4" style={{ color: "var(--color-fi-muted)" }}>No workflows match your filters.</p>
                <button onClick={resetFilters}
                  className="font-mono text-[11px] uppercase tracking-widest transition-colors hover:text-[var(--color-fi-text)]"
                  style={{ color: "var(--color-fi-accent)" }}>
                  Clear filters
                </button>
                <span className="mx-3 font-mono text-[11px]" style={{ color: "rgba(240,240,240,0.28)" }}>or</span>
                <a href="/upload"
                  className="font-mono text-[11px] uppercase tracking-widest transition-colors hover:text-[var(--color-fi-text)]"
                  style={{ color: "rgba(240,240,240,0.5)" }}>
                  analyze a workflow →
                </a>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {results.map((wf) => <WorkflowCard key={wf.id} wf={wf} />)}
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
