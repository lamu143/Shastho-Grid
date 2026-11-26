import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, fontFamily } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * Shastho Sathi — the product's pearl-orb assistant, as the film's guide character.
 * Floats, blinks every few seconds, glances toward `look`, and can speak a line.
 */
export const Sathi: React.FC<{ size?: number; enter?: number; say?: string; sayFrom?: number; sayTo?: number; look?: number; bubbleSide?: "left" | "right" }> = ({
  size = 220, enter = 0, say, sayFrom = 0, sayTo = 9999, look = 0, bubbleSide = "right",
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - enter, fps, config: { damping: 12, stiffness: 120 } });
  const bob = Math.sin((f - enter) / 14) * 10;
  // blink: eyes close briefly every ~95 frames
  const cyc = (f - enter) % 95;
  const blink = cyc > 86 && cyc < 92 ? interpolate(cyc, [86, 89, 92], [1, 0.08, 1]) : 1;
  const glance = Math.sin((f - enter) / 40) * 4 + look;
  const speaking = say && f >= sayFrom && f < sayTo;
  const mouth = speaking ? 0.35 + Math.abs(Math.sin(f / 3.2)) * 0.65 : 0.25;
  const bubble = say ? spring({ frame: f - sayFrom, fps, config: { damping: 16 } }) : 0;
  const bubbleOut = say ? interpolate(f, [sayTo - 8, sayTo], [1, 0], clamp) : 0;
  const eye = size * 0.11;

  return (
    <div style={{ position: "relative", width: size, height: size, scale: String(pop), translate: `0 ${bob}px` }}>
      {/* warm/cool halo */}
      <div style={{ position: "absolute", inset: -size * 0.55, borderRadius: "50%", filter: `blur(${size * 0.12}px)`,
        background: `radial-gradient(closest-side at 32% 55%, rgba(255,150,100,0.7), transparent 70%), radial-gradient(closest-side at 70% 42%, rgba(96,128,255,0.65), transparent 70%)`,
        opacity: 0.85 + Math.sin(f / 18) * 0.1 }} />
      {/* pearl sphere */}
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden",
        background: "radial-gradient(circle at 34% 28%, #fff 0%, rgba(255,255,255,0.92) 18%, transparent 46%), radial-gradient(circle at 70% 78%, rgba(255,214,196,0.9), transparent 52%), radial-gradient(circle at 26% 74%, rgba(214,222,255,0.95), transparent 55%), linear-gradient(160deg, #FDF8F5 0%, #EDE7F3 48%, #DCE3F6 100%)",
        boxShadow: "inset 0 -14px 30px rgba(120,104,170,0.25), inset 0 8px 18px rgba(255,255,255,0.95), 0 20px 50px rgba(20,10,60,0.45)" }}>
        <div style={{ position: "absolute", inset: "-20%", rotate: `${f * 1.2}deg`, filter: "blur(8px)", opacity: 0.8,
          background: "conic-gradient(from 210deg, transparent 0deg, rgba(140,158,255,0.6) 40deg, rgba(255,255,255,0.5) 62deg, transparent 100deg, rgba(255,176,146,0.55) 168deg, transparent 236deg, rgba(196,160,255,0.5) 296deg, transparent 360deg)" }} />
        {/* face */}
        <div style={{ position: "absolute", left: "50%", top: "46%", translate: `calc(-50% + ${glance}px) -50%`, display: "flex", gap: size * 0.16 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ width: eye, height: eye * 1.35 * blink, borderRadius: eye, background: "#3B2F6B", boxShadow: "0 2px 6px rgba(59,47,107,0.35)", position: "relative" }}>
              <div style={{ position: "absolute", width: eye * 0.38, height: eye * 0.38 * blink, borderRadius: eye, background: "#fff", left: eye * 0.18, top: eye * 0.2 }} />
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", left: "50%", top: "64%", translate: `calc(-50% + ${glance}px) 0`, width: size * 0.16, height: size * 0.08 * mouth, borderRadius: `0 0 ${size}px ${size}px`, background: "#3B2F6B" }} />
        <div style={{ position: "absolute", left: "26%", top: "58%", width: size * 0.12, height: size * 0.06, borderRadius: "50%", background: "rgba(255,140,140,0.35)" }} />
        <div style={{ position: "absolute", right: "26%", top: "58%", width: size * 0.12, height: size * 0.06, borderRadius: "50%", background: "rgba(255,140,140,0.35)" }} />
      </div>
      {say && f >= sayFrom && f < sayTo && (
        <div style={{
          position: "absolute", top: -size * 0.05, [bubbleSide === "right" ? "left" : "right"]: size * 1.05,
          opacity: bubble * bubbleOut, scale: String(0.8 + 0.2 * bubble), transformOrigin: bubbleSide === "right" ? "left bottom" : "right bottom",
          width: 640, padding: "26px 32px", borderRadius: 30, background: "rgba(255,255,255,0.96)", color: "#1A1530",
          fontFamily, fontSize: 38, fontWeight: 700, lineHeight: 1.3, boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        }}>
          {say}
        </div>
      )}
    </div>
  );
};

const SKIN = ["#F1C9A5", "#D9A77F", "#B9825C", "#8D5A3B"];

/** A simple illustrated person for user-journey scenes. Waves when `wave` is set. */
export const Person: React.FC<{ color: string; skin?: number; hair?: "short" | "long" | "hijab"; badge: string; enter?: number; wave?: boolean; size?: number }> = ({
  color, skin = 1, hair = "short", badge, enter = 0, wave = false, size = 220,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - enter, fps, config: { damping: 12, stiffness: 120 } });
  const armRot = wave ? Math.sin((f - enter) / 4) * 22 - 30 : -8;
  const bob = Math.sin((f - enter) / 16) * 4;
  const s = SKIN[skin % SKIN.length];
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 200 250" style={{ scale: String(pop), translate: `0 ${bob}px`, overflow: "visible" }}>
      <ellipse cx="100" cy="244" rx="62" ry="8" fill="rgba(0,0,0,0.3)" />
      {/* body */}
      <path d="M40 240 C40 170 60 150 100 150 C140 150 160 170 160 240 Z" fill={color} />
      <path d="M86 150 L100 175 L114 150 Z" fill="#fff" opacity="0.9" />
      {/* waving arm */}
      <g style={{ transformOrigin: "148px 170px", transformBox: "view-box" as React.CSSProperties["transformBox"] }} transform={`rotate(${armRot} 148 172)`}>
        <rect x="142" y="120" width="18" height="58" rx="9" fill={color} />
        <circle cx="151" cy="118" r="11" fill={s} />
      </g>
      <rect x="40" y="168" width="18" height="56" rx="9" fill={color} />
      {/* head */}
      {hair === "hijab" && <path d="M58 92 C58 40 142 40 142 92 L146 150 L54 150 Z" fill="#3F3A6B" />}
      <circle cx="100" cy="96" r="40" fill={s} />
      {hair === "short" && <path d="M60 92 C58 54 142 50 140 92 C130 70 76 70 60 92 Z" fill="#2A1E1A" />}
      {hair === "long" && <path d="M58 100 C52 50 148 46 142 100 L146 140 L132 140 L132 92 C120 72 80 72 68 92 L68 140 L54 140 Z" fill="#2A1E1A" />}
      <circle cx="86" cy="98" r="4.5" fill="#2A1E1A" />
      <circle cx="114" cy="98" r="4.5" fill="#2A1E1A" />
      <path d="M88 114 Q100 124 112 114" stroke="#2A1E1A" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* badge */}
      <rect x="66" y="196" width="68" height="26" rx="13" fill="#fff" />
      <text x="100" y="214" textAnchor="middle" fontFamily={fontFamily} fontSize="15" fontWeight="800" fill={C.bg1}>{badge}</text>
    </svg>
  );
};
