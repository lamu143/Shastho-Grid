import React from "react";
import type { VoiceState } from "@/lib/sathiVoice";

/** Shastho Sathi's pearl orb. The voice engine writes --sathi-level on it for live glow. */
export const AssistantOrb = React.forwardRef<
  HTMLSpanElement,
  { size?: "launcher" | "hero"; state?: VoiceState }
>(function AssistantOrb({ size = "launcher", state = "idle" }, ref) {
  return (
    <span ref={ref} className={`sathi-orb sathi-orb--${size}`} data-state={state} aria-hidden="true">
      <span className="sathi-orb__halo" />
      <span className="sathi-orb__ring" />
      <span className="sathi-orb__ring" />
      <span className="sathi-orb__ring" />
      <span className="sathi-orb__sphere">
        <span className="sathi-orb__sheen" />
        <span className="sathi-orb__spec" />
        <span className="sathi-orb__glint" />
      </span>
    </span>
  );
});
