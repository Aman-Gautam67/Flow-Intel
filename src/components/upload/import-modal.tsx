"use client";

import { useState, useRef } from "react";
import { FileJson, Link, X, ArrowRight, Loader2 } from "lucide-react";

type ImportTab = "file" | "paste" | "url";

interface ImportModalProps {
  onClose: () => void;
  onJson: (json: unknown, filename: string) => void;
}

const SUPPORTED_URLS = [
  "github.com",
  "gist.github.com",
  "raw.githubusercontent.com",
  "n8n.io/workflows",
];

/** Convert a GitHub / Gist / n8n workflow URL → raw JSON URL */
function resolveRawUrl(input: string): string {
  const u = input.trim();
  // Already raw
  if (u.startsWith("https://raw.githubusercontent.com")) return u;
  // GitHub blob URL → raw
  const blobMatch = u.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)/);
  if (blobMatch) return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
  // Gist → raw (simplified: use gist raw endpoint)
  const gistMatch = u.match(/gist\.github\.com\/([^/]+)\/([a-f0-9]+)/);
  if (gistMatch) return `https://gist.githubusercontent.com/${gistMatch[1]}/${gistMatch[2]}/raw`;
  // Fallback — try to fetch as-is (handles direct raw URLs)
  return u;
}

export function ImportModal({ onClose, onJson }: ImportModalProps) {
  const [tab, setTab] = useState<ImportTab>("paste");
  const [pasteText, setPasteText] = useState("");
  const [urlInput, setUrlInput]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePasteSubmit = () => {
    setError(null);
    try {
      const parsed = JSON.parse(pasteText.trim());
      onJson(parsed, "pasted-workflow.json");
    } catch {
      setError("Invalid JSON — please paste a valid workflow export.");
    }
  };

  const handleUrlSubmit = async () => {
    setError(null);
    if (!urlInput.trim()) { setError("Please enter a URL."); return; }
    setLoading(true);
    try {
      const rawUrl = resolveRawUrl(urlInput);
      const res = await fetch(`/api/fetch-url?url=${encodeURIComponent(rawUrl)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = JSON.parse(text);
      onJson(parsed, rawUrl.split("/").pop() ?? "remote-workflow.json");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch URL.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      onJson(parsed, file.name);
    } catch {
      setError("Could not parse file as JSON.");
    }
  };

  const TABS: { key: ImportTab; label: string; icon: typeof FileJson }[] = [
    { key: "paste", label: "Paste JSON",  icon: FileJson },
    { key: "url",   label: "Import URL",  icon: Link },
    { key: "file",  label: "Browse File", icon: FileJson },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed top-[12vh] left-1/2 -translate-x-1/2 z-50 w-full max-w-xl"
        style={{ padding: "0 16px" }}
      >
        <div
          className="border"
          style={{
            borderColor: "rgba(0,255,136,0.3)",
            background: "rgba(8,8,8,0.98)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--color-fi-border)" }}>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--color-fi-accent)" }}>
              Import Workflow
            </span>
            <button onClick={onClose} style={{ color: "var(--color-fi-muted)" }} className="hover:text-[var(--color-fi-text)] transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* Tab selector */}
          <div className="flex border-b" style={{ borderColor: "var(--color-fi-border)" }}>
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setError(null); }}
                className="flex items-center gap-2 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors border-b-2 -mb-px"
                style={{
                  borderBottomColor: tab === key ? "var(--color-fi-accent)" : "transparent",
                  color: tab === key ? "var(--color-fi-text)" : "var(--color-fi-muted)",
                }}
              >
                <Icon size={11} /> {label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* PASTE TAB */}
            {tab === "paste" && (
              <>
                <p className="font-sans text-[12px]" style={{ color: "var(--color-fi-muted)" }}>
                  Paste a raw JSON export from n8n, Make, Zapier, or Flowise.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={'{\n  "nodes": [...],\n  "connections": {...}\n}'}
                  rows={9}
                  className="w-full font-mono text-[11px] p-3 border outline-none resize-none terminal-scroll"
                  style={{
                    borderColor: "rgba(255,255,255,0.14)",
                    background: "rgba(0,0,0,0.5)",
                    color: "var(--color-fi-text)",
                  }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handlePasteSubmit();
                  }}
                />
                <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.3)" }}>
                  ⌘ + Enter to submit
                </p>
              </>
            )}

            {/* URL TAB */}
            {tab === "url" && (
              <>
                <p className="font-sans text-[12px]" style={{ color: "var(--color-fi-muted)" }}>
                  Import directly from a public GitHub file, Gist, or raw JSON URL.
                </p>
                <div className="font-mono text-[9px] uppercase tracking-widest mb-2 space-y-0.5" style={{ color: "rgba(240,240,240,0.28)" }}>
                  {SUPPORTED_URLS.map((s) => <div key={s}>• {s}</div>)}
                </div>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://raw.githubusercontent.com/..."
                  className="w-full font-mono text-[11px] px-3 py-2.5 border outline-none"
                  style={{
                    borderColor: "rgba(255,255,255,0.14)",
                    background: "rgba(0,0,0,0.5)",
                    color: "var(--color-fi-text)",
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleUrlSubmit(); }}
                />
              </>
            )}

            {/* FILE TAB */}
            {tab === "file" && (
              <>
                <p className="font-sans text-[12px]" style={{ color: "var(--color-fi-muted)" }}>
                  Browse and select a .json workflow file from your device.
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full py-6 border-2 border-dashed flex flex-col items-center gap-3 transition-colors hover:border-[rgba(0,255,136,0.4)]"
                  style={{ borderColor: "rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.02)" }}
                >
                  <FileJson size={28} style={{ color: "var(--color-fi-muted)" }} />
                  <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
                    Click to browse .json
                  </span>
                </button>
                <input ref={fileRef} type="file" accept=".json" className="sr-only" onChange={handleFileChange} />
              </>
            )}

            {/* Error */}
            {error && (
              <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fi-crit)" }}>
                ✕ {error}
              </p>
            )}

            {/* Submit */}
            {(tab === "paste" || tab === "url") && (
              <button
                onClick={tab === "paste" ? handlePasteSubmit : handleUrlSubmit}
                disabled={loading || (tab === "paste" ? !pasteText.trim() : !urlInput.trim())}
                className="flex items-center gap-2 h-10 px-5 font-mono text-[11px] uppercase tracking-widest transition-all disabled:opacity-40"
                style={{ background: "var(--color-fi-accent)", color: "#090909" }}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                {loading ? "Fetching..." : tab === "paste" ? "Analyse JSON" : "Fetch & Analyse"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
