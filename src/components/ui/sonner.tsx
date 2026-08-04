"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// ── Slide-in-from-right keyframe injected once ─────────────────────────────
// Sonner's default animation is vertical; we override it here so toasts
// slide in from the right edge and slide back out to the right on dismiss.
const SLIDE_STYLE = `
@keyframes fi-toast-in {
  from { opacity: 0; transform: translateX(110%); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes fi-toast-out {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(110%); }
}
[data-sonner-toast] {
  animation: fi-toast-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards !important;
}
[data-sonner-toast][data-removed="true"],
[data-sonner-toast][data-swiped="true"] {
  animation: fi-toast-out 0.22s ease-in forwards !important;
}
`;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <>
      {/* Inline style tag — keeps the animation co-located with the Toaster */}
      <style dangerouslySetInnerHTML={{ __html: SLIDE_STYLE }} />

      <Sonner
        theme={theme as ToasterProps["theme"]}
        position="top-right"
        duration={3000}
        className="toaster group"
        icons={{
          success: <CircleCheckIcon className="size-4" />,
          info:    <InfoIcon        className="size-4" />,
          warning: <TriangleAlertIcon className="size-4" />,
          error:   <OctagonXIcon    className="size-4" />,
          loading: <Loader2Icon     className="size-4 animate-spin" />,
        }}
        style={
          {
            "--normal-bg":     "var(--popover)",
            "--normal-text":   "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--border-radius": "var(--radius)",
          } as React.CSSProperties
        }
        toastOptions={{
          classNames: {
            toast: "cn-toast",
          },
        }}
        {...props}
      />
    </>
  )
}

export { Toaster }
