"use client";

/**
 * DimensionPopover
 * ──────────────────────────────────────────────────────────────────────────────
 * An animated info-popover rendered over the score ring grid cells.
 *
 * Interaction model:
 *  • Hover  → opens after a 120 ms delay (prevents flicker on fast moves)
 *  • Click  → toggles pinned-open state so mobile users can read comfortably
 *  • Click outside / Escape → dismisses
 *
 * Positioning:
 *  • The trigger `(i)` button is inline in the label row.
 *  • The popover panel is appended to document.body via a React Portal so it
 *    escapes any overflow:hidden or z-index stacking contexts in the grid.
 *  • On mount it reads the trigger's getBoundingClientRect() and positions
 *    the panel below (or above if near the bottom of the viewport).
 *
 * Animation:
 *  • Framer Motion AnimatePresence handles enter/exit.
 *  • Enter: fade-in + 6 px upward slide over 200 ms.
 *  • Exit : fade-out + 4 px downward over 140 ms.
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Info, X } from "lucide-react";
import type { DimensionMeta } from "@/config/dimensions";

// ─── Popover panel (rendered in portal) ──────────────────────────────────────

interface PanelPosition {
  top: number;
  left: number;
  placement: "below" | "above";
}

interface PopoverPanelProps {
  meta: DimensionMeta;
  position: PanelPosition;
  score: number;
  onClose: () => void;
}

function getScoreColor(score: number) {
  // All 9 dimensions now use high=green / low=red (Simplicity score is already inverted at source).
  if (score >= 80) return "#00ff88";
  if (score >= 60) return "#f7d774";
  if (score >= 40) return "#f7a35c";
  return "#ff5d5d";
}

function PopoverPanel({ meta, position, score, onClose }: PopoverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scoreColor = getScoreColor(score);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Timeout so the originating click doesn't immediately re-dismiss
    const id = setTimeout(() => window.addEventListener("mousedown", handler), 60);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const isAbove = position.placement === "above";

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-label={`${meta.label} dimension details`}
      initial={{ opacity: 0, y: isAbove ? 6 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: isAbove ? 4 : -4 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 9999,
        width: 320,
        // Clamp so it never overflows viewport right edge
        maxWidth: "calc(100vw - 32px)",
        background: "rgba(8, 8, 8, 0.97)",
        border: `1px solid ${scoreColor}44`,
        boxShadow: `0 8px 40px rgba(0,0,0,0.72), 0 0 0 1px ${scoreColor}1a`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* ── Arrow pointer ── */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          [isAbove ? "bottom" : "top"]: -6,
          left: 20,
          width: 10,
          height: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            background: "rgba(8,8,8,0.97)",
            border: `1px solid ${scoreColor}44`,
            transform: isAbove ? "rotate(45deg) translate(-3px,-3px)" : "rotate(45deg) translate(-3px,3px)",
            position: "absolute",
            top: isAbove ? 2 : -6,
            left: 0,
          }}
        />
      </div>

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: `${scoreColor}28` }}
      >
        <div className="flex items-center gap-2.5">
          {/* Score pill */}
          <span
            className="font-mono text-[11px] font-bold px-2 py-0.5"
            style={{
              color: scoreColor,
              background: `${scoreColor}18`,
              border: `1px solid ${scoreColor}44`,
            }}
          >
            {score}
          </span>
          <span
            className="font-mono text-[11px] uppercase tracking-[0.18em] font-bold"
            style={{ color: scoreColor }}
          >
            {meta.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="transition-colors hover:text-[var(--color-fi-text)]"
          style={{ color: "rgba(240,240,240,0.35)" }}
          aria-label="Close"
        >
          <X size={13} />
        </button>
      </div>

      {/* ── Description ── */}
      <div className="px-4 pt-3 pb-2">
        <p
          className="font-sans text-[12px] leading-relaxed"
          style={{ color: "rgba(240,240,240,0.72)" }}
        >
          {meta.description}
        </p>
      </div>

      {/* ── Grading parameters ── */}
      <div className="px-4 pb-4 pt-1">
        <div
          className="font-mono text-[8px] uppercase tracking-[0.2em] mb-2"
          style={{ color: "rgba(240,240,240,0.32)" }}
        >
          Grading parameters
        </div>
        <ul className="space-y-1.5">
          {meta.gradingParameters.map((p, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 font-sans text-[11px] leading-snug"
              style={{ color: "rgba(240,240,240,0.65)" }}
            >
              {/* Coloured bullet */}
              <span
                className="shrink-0 mt-[3px] w-1 h-1 rounded-full"
                style={{ background: scoreColor, boxShadow: `0 0 4px ${scoreColor}88` }}
              />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

// ─── Trigger + controller ─────────────────────────────────────────────────────

interface DimensionPopoverProps {
  meta: DimensionMeta;
  score: number;
  /** Parent ref — used to detect portal mount readiness */
  containerRef?: RefObject<HTMLElement>;
}

export function DimensionPopover({ meta, score }: DimensionPopoverProps) {
  const [open, setOpen]         = useState(false);
  const [pinned, setPinned]     = useState(false);   // click-to-pin stays open past hover-out
  const [position, setPosition] = useState<PanelPosition>({ top: 0, left: 0, placement: "below" });
  const triggerRef              = useRef<HTMLButtonElement>(null);
  const hoverTimerRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted] = useState(() => typeof document !== "undefined");

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect   = triggerRef.current.getBoundingClientRect();
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    const panelW = 320;
    const panelH = 280; // approximate
    const gap    = 10;

    let left = rect.left + rect.width / 2 - 20; // align arrow left ~20 px from panel left
    // Keep inside viewport
    if (left + panelW > vw - 12) left = vw - panelW - 12;
    if (left < 8) left = 8;

    const spaceBelow = vh - rect.bottom;
    const placement: "below" | "above" = spaceBelow >= panelH + gap ? "below" : "above";
    const top = placement === "below"
      ? rect.bottom + gap
      : rect.top - panelH - gap;

    setPosition({ top, left, placement });
  }, []);

  const openPopover = useCallback(() => {
    computePosition();
    setOpen(true);
  }, [computePosition]);

  const closePopover = useCallback(() => {
    if (pinned) return; // don't close a pinned popover on hover-out
    setOpen(false);
  }, [pinned]);

  const handleMouseEnter = () => {
    hoverTimerRef.current = setTimeout(openPopover, 120);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (!pinned) setOpen(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open && pinned) {
      // Second click — unpin and close
      setPinned(false);
      setOpen(false);
    } else {
      // First click — pin open
      computePosition();
      setPinned(true);
      setOpen(true);
    }
  };

  const handleClose = useCallback(() => {
    setPinned(false);
    setOpen(false);
  }, []);

  return (
    <>
      {/* ── Trigger (i) button ── */}
      <button
        ref={triggerRef}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-label={`${meta.label} dimension info`}
        aria-expanded={open}
        className="transition-colors focus:outline-none focus-visible:ring-1"
        style={{
          color: open || pinned ? "var(--color-fi-accent)" : "rgba(255,255,255,0.28)",
          // ring colour matches accent
          "--tw-ring-color": "var(--color-fi-accent)",
        } as React.CSSProperties}
      >
        <Info size={11} strokeWidth={2.2} />
      </button>

      {/* ── Portal panel ── */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <PopoverPanel
                key="popover"
                meta={meta}
                position={position}
                score={score}
                onClose={handleClose}
              />
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
