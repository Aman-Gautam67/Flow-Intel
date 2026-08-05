"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, FileJson, GitBranch, Download, AlertTriangle } from "lucide-react";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon: typeof Search;
  action: () => void;
}

interface CommandPaletteProps {
  onExportAudit?: () => void;
  onJumpToCrit?:  () => void;
}

export function CommandPalette({ onExportAudit, onJumpToCrit }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    {
      id: "search", label: "Search workflows", shortcut: "/",
      icon: Search, action: () => { router.push("/search"); setOpen(false); },
    },
    {
      id: "upload", label: "Analyze new workflow", shortcut: "U",
      icon: FileJson, action: () => { router.push("/upload"); setOpen(false); },
    },
    {
      id: "catalog", label: "Browse catalog",
      icon: GitBranch, action: () => { router.push("/search"); setOpen(false); },
    },
    ...(onExportAudit ? [{
      id: "export", label: "Export security audit (Markdown / CSV)", shortcut: "E",
      icon: Download, action: () => { onExportAudit(); setOpen(false); },
    }] : []),
    ...(onJumpToCrit ? [{
      id: "crit", label: "Jump to highest-severity issue", shortcut: "⇧F",
      icon: AlertTriangle, action: () => { onJumpToCrit(); setOpen(false); },
    }] : []),
  ];

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  const open_ = useCallback(() => { setOpen(true); setQuery(""); }, []);
  const close  = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // ⌘/Ctrl+K — open palette
      if (mod && e.key === "k")  { e.preventDefault(); open_(); return; }
      // ⌘/Ctrl+U — go to upload
      if (mod && e.key === "u")  { e.preventDefault(); router.push("/upload"); return; }
      // ⌘/Ctrl+E — export audit
      if (mod && e.key === "e" && onExportAudit) { e.preventDefault(); onExportAudit(); return; }
      // ⌘/Ctrl+Shift+F — jump to CRIT
      if (mod && e.shiftKey && e.key.toLowerCase() === "f" && onJumpToCrit) {
        e.preventDefault(); onJumpToCrit(); return;
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open_, close, onExportAudit, onJumpToCrit, router]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={close} />
      <div className="fixed top-[20vh] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg" style={{ padding: "0 16px" }}>
        <div className="border tooltip-in" style={{ borderColor: "rgba(0,255,136,0.3)", background: "rgba(10,10,10,0.98)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--color-fi-border)" }}>
            <Search size={16} style={{ color: "var(--color-fi-accent)", flexShrink: 0 }} />
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent font-mono text-sm outline-none"
              style={{ color: "var(--color-fi-text)" }} />
            <kbd className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border"
              style={{ borderColor: "rgba(255,255,255,0.18)", color: "var(--color-fi-muted)" }}>ESC</kbd>
          </div>

          {/* Commands */}
          <div className="py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--color-fi-muted)" }}>
                No commands found
              </p>
            ) : (
              filtered.map((cmd) => (
                <button key={cmd.id} onClick={cmd.action}
                  className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[rgba(0,255,136,0.06)] text-left"
                  style={{ color: "var(--color-fi-text)" }}>
                  <cmd.icon size={14} style={{ color: "var(--color-fi-muted)", flexShrink: 0 }} />
                  <span className="flex-1 font-sans text-sm">{cmd.label}</span>
                  {cmd.shortcut && (
                    <kbd className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border"
                      style={{ borderColor: "rgba(255,255,255,0.12)", color: "var(--color-fi-muted)", background: "rgba(255,255,255,0.03)" }}>
                      ⌘{cmd.shortcut}
                    </kbd>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-4 px-4 py-2 border-t flex-wrap" style={{ borderColor: "var(--color-fi-border)" }}>
            {[["⌘K", "Open"], ["⌘U", "Upload"], ["⌘E", "Export"], ["⌘⇧F", "Jump CRIT"]].map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <kbd className="font-mono text-[9px] px-1 border" style={{ borderColor: "rgba(255,255,255,0.12)", color: "var(--color-fi-muted)" }}>{key}</kbd>
                <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(240,240,240,0.28)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// Provider: mounts palette globally (no context needed for export/crit — page wires those directly)
export function GlobalCommandPalette() {
  return <CommandPalette />;
}
