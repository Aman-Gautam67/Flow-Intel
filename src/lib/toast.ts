/**
 * FlowIntel toast helpers
 * ───────────────────────────────────────────────────────────────────────────
 * Thin wrapper around sonner so every call site gets consistent:
 *   • position   – top-right (set on the <Toaster> in layout)
 *   • duration   – 3 000 ms
 *   • animation  – slide-in-from-right (CSS defined in sonner.tsx / globals)
 *
 * Usage:
 *   import { fi } from "@/lib/toast";
 *   fi.copied("Badge Markdown");
 *   fi.downloaded("flowintel-report-…-2025-01-01.md");
 *   fi.success("Patch applied");
 *   fi.error("PDF export failed");
 */

import { toast } from "sonner";

const DURATION = 3_000;

function success(message: string, description?: string) {
  toast.success(message, { description, duration: DURATION });
}

function error(message: string, description?: string) {
  toast.error(message, { description, duration: DURATION });
}

function info(message: string, description?: string) {
  toast.info(message, { description, duration: DURATION });
}

/** Fired after writing text to the clipboard. */
function copied(what = "Markdown") {
  toast.success(`${what} copied to clipboard`, { duration: DURATION });
}

/** Fired after triggering a file download. */
function downloaded(filename: string) {
  toast.success("File downloaded", {
    description: filename,
    duration: DURATION,
  });
}

export const fi = { success, error, info, copied, downloaded };
