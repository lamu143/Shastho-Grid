import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, EASE_OUT, fontFamily } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(...EASE_OUT);

/** Animated night background: slow-drifting colour fields, faint grid, vignette. */
export const Backdrop: React.FC<{ hue?: "teal" | "violet" | "red" | "blue" }> = ({ hue = "teal" }) => {
  const f = useCurrentFrame();
  const accent = { teal: C.teal, violet: C.violet, red: C.red, blue: C.sky }[hue];
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${C.bg0} 0%, ${C.bg1} 55%, ${C.bg2} 100%)`, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1400, height: 1400, left: -300, top: -500, borderRadius: "50%",
        background: `radial-gradient(closest-side, ${accent}33, transparent 70%)`,
        translate: `${Math.sin(f / 90) * 60}px ${Math.cos(f / 110) * 40}px` }} />
      <div style={{ position: "absolute", width: 1200, height: 1200, right: -300, bottom: -500, borderRadius: "50%",
        background: `radial-gradient(closest-side, ${C.violet}2a, transparent 70%)`,
        translate: `${Math.cos(f / 100) * 50}px ${Math.sin(f / 120) * 50}px` }} />
      <div style={{ position: "absolute", width: 900, height: 900, right: 200, top: -300, borderRadius: "50%",
        background: `radial-gradient(closest-side, ${C.sky}22, transparent 70%)`,
        translate: `${Math.sin(f / 130) * 40}px ${Math.cos(f / 90) * 30}px` }} />
      <AbsoluteFill style={{
        backgroundImage: `linear-gradient(${C.mint}0d 1px, transparent 1px), linear-gradient(90deg, ${C.mint}0d 1px, transparent 1px)`,
        backgroundSize: "80px 80px", backgroundPosition: `${-f * 0.3}px ${-f * 0.2}px`,
        maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
      }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};

export type Cue = { from: number; to: number; text: string };

/** Burned-in caption track: one line at a time, centred near the bottom. */
export const Captions: React.FC<{ cues: Cue[] }> = ({ cues }) => {
  const f = useCurrentFrame();
  const cue = cues.find((c) => f >= c.from && f < c.to);
  if (!cue) return null;
  const local = f - cue.from;
  const dur = cue.to - cue.from;
  const opacity = interpolate(local, [0, 8, dur - 8, dur], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 56, pointerEvents: "none" }}>
      <div style={{
        opacity, translate: `0 ${interpolate(local, [0, 10], [14, 0], { ...clamp, easing: ease })}px`,
        maxWidth: 1500, padding: "18px 34px", borderRadius: 22,
        background: "rgba(2, 10, 14, 0.78)", border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
        color: C.ink, fontFamily, fontSize: 42, fontWeight: 600, lineHeight: 1.3, textAlign: "center",
        letterSpacing: "-0.01em",
      }}>
        {cue.text}
      </div>
    </AbsoluteFill>
  );
};

/** Kicker + headline + subtitle with staggered spring reveals. */
export const TitleBlock: React.FC<{ kicker?: string; title: React.ReactNode; sub?: string; delay?: number; align?: "center" | "left"; size?: number; kickerColor?: string }> = ({
  kicker, title, sub, delay = 0, align = "center", size = 104, kickerColor = C.mint,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = (d: number) => spring({ frame: f - delay - d, fps, config: { damping: 200 } });
  return (
    <div style={{ fontFamily, textAlign: align, display: "flex", flexDirection: "column", gap: 22, alignItems: align === "center" ? "center" : "flex-start" }}>
      {kicker && (
        <div style={{ opacity: s(0), translate: `0 ${(1 - s(0)) * 20}px`, color: kickerColor, fontSize: 34, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          {kicker}
        </div>
      )}
      <div style={{ opacity: s(6), translate: `0 ${(1 - s(6)) * 30}px`, color: C.ink, fontSize: size, fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.035em", maxWidth: 1600 }}>
        {title}
      </div>
      {sub && (
        <div style={{ opacity: s(14), translate: `0 ${(1 - s(14)) * 24}px`, color: C.ink2, fontSize: 44, fontWeight: 500, lineHeight: 1.35, maxWidth: 1400 }}>
          {sub}
        </div>
      )}
    </div>
  );
};

export type Callout = { at: number; x: number; y: number; w: number; h: number; label: string; color?: string; side?: "top" | "bottom" | "left" | "right" };

/** macOS-style window showing a screenshot with a slow camera move and timed highlight callouts. */
export const AppWindow: React.FC<{
  src: string; title?: string; width?: number; zoomFrom?: number; zoomTo?: number;
  focusX?: number; focusY?: number; callouts?: Callout[]; enterDelay?: number; durationInFrames: number;
}> = ({ src, title = "ShasthoGrid", width = 1500, zoomFrom = 1, zoomTo = 1.08, focusX = 50, focusY = 40, callouts = [], enterDelay = 0, durationInFrames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f - enterDelay, fps, config: { damping: 18, stiffness: 90, mass: 0.9 } });
  const h = (width * 1080) / 1920;
  const zoom = interpolate(f, [0, durationInFrames], [zoomFrom, zoomTo], { ...clamp, easing: Easing.inOut(Easing.quad) });
  return (
    <div style={{
      width, borderRadius: 22, overflow: "hidden", background: "#0B1418",
      boxShadow: "0 60px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12)",
      opacity: interpolate(enter, [0, 1], [0, 1]),
      scale: String(interpolate(enter, [0, 1], [0.92, 1])),
      translate: `0 ${interpolate(enter, [0, 1], [60, 0])}px`,
      rotate: `${interpolate(enter, [0, 1], [2, 0])}deg`,
    }}>
      <div style={{ height: 46, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: "linear-gradient(#1A2329, #121A1F)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
        <span style={{ marginLeft: 18, fontFamily, fontSize: 18, color: C.ink3, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ position: "relative", width, height: h, overflow: "hidden" }}>
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", scale: String(zoom), transformOrigin: `${focusX}% ${focusY}%` }} />
        {callouts.map((c, i) => {
          const s = spring({ frame: f - c.at, fps, config: { damping: 16, stiffness: 120 } });
          if (f < c.at) return null;
          const color = c.color ?? C.mint;
          const px = (v: number, total: number) => (v / 100) * total;
          const side = c.side ?? "bottom";
          return (
            <React.Fragment key={i}>
              <div style={{
                position: "absolute", left: px(c.x, width), top: px(c.y, h), width: px(c.w, width), height: px(c.h, h),
                borderRadius: 14, border: `4px solid ${color}`, boxShadow: `0 0 0 9999px rgba(2,8,12,${0.42 * s}), 0 0 30px ${color}`,
                opacity: s, scale: String(interpolate(s, [0, 1], [1.08, 1])),
              }} />
              <div style={{
                position: "absolute",
                left: side === "right" ? px(c.x + c.w, width) + 16 : side === "left" ? undefined : px(c.x, width),
                right: side === "left" ? width - px(c.x, width) + 16 : undefined,
                top: side === "bottom" ? px(c.y + c.h, h) + 14 : side === "top" ? px(c.y, h) - 70 : px(c.y, h),
                opacity: s, translate: `0 ${(1 - s) * 12}px`,
                padding: "10px 20px", borderRadius: 14, background: color, color: "#04131A",
                fontFamily, fontSize: 28, fontWeight: 800, whiteSpace: "nowrap", boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
              }}>
                {c.label}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

/** Rounded glass card. */
export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; accent?: string }> = ({ children, style, accent = C.mint }) => (
  <div style={{
    fontFamily, borderRadius: 28, padding: 34, background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.12)", boxShadow: `0 30px 80px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px ${accent}18`,
    backdropFilter: "blur(10px)", ...style,
  }}>
    {children}
  </div>
);

/** Counts a number up with easing; keeps prefix/suffix and decimals. */
export const CountUp: React.FC<{ to: number; decimals?: number; prefix?: string; suffix?: string; start: number; dur?: number; style?: React.CSSProperties }> = ({ to, decimals = 0, prefix = "", suffix = "", start, dur = 40, style }) => {
  const f = useCurrentFrame();
  const v = interpolate(f, [start, start + dur], [0, to], { ...clamp, easing: Easing.out(Easing.cubic) });
  return <span style={style}>{prefix}{v.toFixed(decimals)}{suffix}</span>;
};

/** Pop-in helper for staggered elements. */
export const usePop = (delay: number) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping: 14, stiffness: 110 } });
};

export const SceneFrame: React.FC<{ children: React.ReactNode; hue?: "teal" | "violet" | "red" | "blue"; cues?: Cue[] }> = ({ children, hue, cues = [] }) => (
  <AbsoluteFill style={{ fontFamily }}>
    <Backdrop hue={hue} />
    {children}
    <Captions cues={cues} />
  </AbsoluteFill>
);

/** The ShasthoGrid ECG pulse as an SVG path that draws itself. */
export const EcgLine: React.FC<{ start: number; dur?: number; width?: number; color?: string; strokeWidth?: number }> = ({ start, dur = 50, width = 1920, color = C.mint, strokeWidth = 6 }) => {
  const f = useCurrentFrame();
  const base = 60;
  let d = `M0 ${base}`;
  for (let x = 0; x < width; x += 240) {
    d += ` L${x + 60} ${base} Q${x + 80} ${base - 14} ${x + 100} ${base} L${x + 118} ${base} L${x + 124} ${base + 10} L${x + 132} ${base - 52} L${x + 140} ${base + 26} L${x + 148} ${base} L${x + 168} ${base} Q${x + 190} ${base - 22} ${x + 212} ${base} L${x + 240} ${base}`;
  }
  const p = interpolate(f, [start, start + dur], [1, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return (
    <svg width={width} height={120} viewBox={`0 0 ${width} 120`} style={{ overflow: "visible" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth + 10} strokeOpacity={0.18} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={p} />
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={p} style={{ filter: `drop-shadow(0 0 10px ${color})` }} />
    </svg>
  );
};
