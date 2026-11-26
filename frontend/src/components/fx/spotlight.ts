import type { PointerEvent } from "react";

/**
 * Writes the pointer position into --mx / --my on the hovered element so `.sg-spotlight`,
 * `.sg-dotgrid-lit` and friends can follow it in pure CSS — no state, no re-render.
 * Mouse/pen only: on touch there is no hover, so the glow simply stays off.
 */
export function trackSpotlight(e: PointerEvent<HTMLElement>) {
  if (e.pointerType === "touch") return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}
