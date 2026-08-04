"use client";

import { useEffect, useState } from "react";
import { Eye, Download, Bookmark } from "lucide-react";

interface EngagementStripProps {
  slug: string;
  /** Initial counts from server (may be stale by 1 before the view POST resolves) */
  initialViews:     number;
  initialDownloads: number;
  initialBookmarks: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function EngagementStrip({
  slug,
  initialViews,
  initialDownloads,
  initialBookmarks,
}: EngagementStripProps) {
  const [views,     setViews]     = useState(initialViews);
  const [downloads, setDownloads] = useState(initialDownloads);
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  const [bookmarked, setBookmarked] = useState(false);

  // Increment view once on mount
  useEffect(() => {
    fetch(`/api/workflows/${slug}/engage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "view" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.views !== undefined) setViews(d.views);
      })
      .catch(() => {/* ignore */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const handleDownload = async () => {
    const r = await fetch(`/api/workflows/${slug}/engage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "download" }),
    }).then((r) => r.json()).catch(() => null);
    if (r?.downloads !== undefined) setDownloads(r.downloads);
  };

  const handleBookmark = async () => {
    if (bookmarked) return; // one per session
    setBookmarked(true);
    const r = await fetch(`/api/workflows/${slug}/engage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bookmark" }),
    }).then((r) => r.json()).catch(() => null);
    if (r?.bookmarks !== undefined) setBookmarks(r.bookmarks);
  };

  const ITEMS = [
    {
      icon: Eye,
      value: views,
      label: "Views",
      color: "rgba(134,167,255,0.8)",
      onClick: undefined as (() => void) | undefined,
      active: false,
    },
    {
      icon: Download,
      value: downloads,
      label: "Downloads",
      color: "rgba(0,255,136,0.8)",
      onClick: handleDownload,
      active: false,
    },
    {
      icon: Bookmark,
      value: bookmarks,
      label: "Bookmarks",
      color: bookmarked ? "#f7d774" : "rgba(247,215,116,0.5)",
      onClick: handleBookmark,
      active: bookmarked,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-px" style={{ background: "var(--color-fi-border)" }}>
      {ITEMS.map(({ icon: Icon, value, label, color, onClick, active }) => (
        <div
          key={label}
          role={onClick ? "button" : undefined}
          tabIndex={onClick ? 0 : undefined}
          onClick={onClick}
          onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
          className={`flex items-center gap-3 px-5 py-4 ${onClick ? "cursor-pointer hover:bg-[rgba(255,255,255,0.025)] transition-colors" : ""}`}
          style={{ background: active ? "rgba(247,215,116,0.05)" : "rgba(8,8,8,0.88)" }}>
          <Icon size={14} style={{ color, flexShrink: 0 }} />
          <div>
            <span className="font-mono text-lg font-light tabular-nums" style={{ color: "var(--color-fi-text)" }}>
              {fmt(value)}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-widest ml-2" style={{ color: "rgba(240,240,240,0.38)" }}>
              {label}
            </span>
            {label === "Bookmarks" && onClick && !active && (
              <span className="font-mono text-[8px] ml-2" style={{ color: "rgba(240,240,240,0.25)" }}>click to save</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
