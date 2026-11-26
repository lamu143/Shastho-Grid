import React, { useId } from "react";

/*
 * ShasthoGrid mark: a miniature ICU monitor.
 *
 * The trace is two clinically shaped PQRST complexes (P bump, sharp Q-R-S spike, rounded
 * T wave) at 72 bpm: one sweep = two beats = 1.66 s. Like a bedside monitor, a beam moves
 * left-to-right at constant speed, the new trace appears behind it with a phosphor fade,
 * and the previous sweep stays faintly visible ahead of a small erase gap. The faint
 * graticule behind it is the "grid". All motion is CSS and stops under reduced motion.
 */

const BASE = 36;
const X0 = 6;
const W = 52;

function beat(x: number): string {
  return [
    `L${x + 3} ${BASE}`,
    `Q${x + 5} ${BASE - 3.6} ${x + 7} ${BASE}`, // P wave
    `L${x + 9} ${BASE}`,
    `L${x + 10} ${BASE + 2.2}`, // Q
    `L${x + 11.2} ${BASE - 17}`, // R
    `L${x + 12.6} ${BASE + 7.5}`, // S
    `L${x + 14} ${BASE}`,
    `L${x + 16} ${BASE}`, // ST segment
    `Q${x + 18.6} ${BASE - 6.2} ${x + 21.2} ${BASE}`, // T wave
    `L${x + 26} ${BASE}`,
  ].join(" ");
}

export const ECG_PATH = `M${X0} ${BASE} ${beat(X0)} ${beat(X0 + 26)}`;

export function LogoMark({
  className = "h-9 w-9",
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const bg = `${uid}-bg`;
  const sheen = `${uid}-sheen`;
  const glow = `${uid}-glow`;
  const trail = `${uid}-trail`;
  const newMask = `${uid}-new`;
  const oldMask = `${uid}-old`;
  const headMask = `${uid}-head`;
  const clip = `${uid}-clip`;

  return (
    <svg viewBox="0 0 64 64" className={`${className}${animated ? " sg-logo-mark" : ""}`} aria-hidden="true">
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0D9488" />
          <stop offset="0.5" stopColor="#0B6E73" />
          <stop offset="1" stopColor="#0C4A6E" />
        </linearGradient>
        <radialGradient id={sheen} cx="0.28" cy="0.08" r="0.9">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.32" />
          <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.06" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter id={glow} x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={clip}>
          <rect width="64" height="64" rx="15" />
        </clipPath>
        {animated && (
          <>
            {/* Phosphor persistence: older parts of the new sweep fade toward the left. */}
            <linearGradient id={trail} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
              <stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0.8" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
            </linearGradient>
            <mask id={newMask} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
              <rect x={X0 - 1} y="0" width={W + 2} height="64" fill={`url(#${trail})`} className="sg-ecg-new" />
            </mask>
            <mask id={oldMask} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
              <rect x={X0 - 1} y="0" width={W + 2} height="64" fill="#FFFFFF" className="sg-ecg-old" />
            </mask>
            <mask id={headMask} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
              <rect x={X0 - 6} y="0" width="6" height="64" fill="#FFFFFF" className="sg-ecg-head" />
            </mask>
          </>
        )}
      </defs>

      <g clipPath={`url(#${clip})`}>
        <rect width="64" height="64" fill={`url(#${bg})`} />
        {/* Monitor graticule (the "grid") */}
        <g stroke="#FFFFFF" strokeOpacity="0.07" strokeWidth="0.6">
          {[16, 26, 46, 56].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="64" y2={y} />
          ))}
          {[8, 18, 28, 38, 48, 58].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="64" />
          ))}
        </g>
        <rect width="64" height="64" fill={`url(#${sheen})`} />

        {animated ? (
          <>
            {/* Previous sweep, still on screen ahead of the erase gap */}
            <path d={ECG_PATH} fill="none" stroke="#A7F3D0" strokeOpacity="0.4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" mask={`url(#${oldMask})`} className="sg-ecg-layer" />
            {/* New sweep drawn by the beam */}
            <path d={ECG_PATH} fill="none" stroke="#ECFEFF" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" mask={`url(#${newMask})`} className="sg-ecg-layer" />
            {/* Bright beam head riding the trace */}
            <path d={ECG_PATH} fill="none" stroke="#5EF2C9" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${glow})`} mask={`url(#${headMask})`} className="sg-ecg-layer" />
            {/* Static fallback shown only under reduced motion */}
            <path d={ECG_PATH} fill="none" stroke="#ECFEFF" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" className="sg-ecg-static" />
          </>
        ) : (
          <path d={ECG_PATH} fill="none" stroke="#ECFEFF" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${glow})`} />
        )}
      </g>
      <rect x="0.5" y="0.5" width="63" height="63" rx="14.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.16" />
    </svg>
  );
}

export function Logo({
  className = "",
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      {showWordmark && (
        <span className="text-lg font-extrabold tracking-tight text-ink">
          Shastho<span className="text-brand-ink">Grid</span>
        </span>
      )}
    </span>
  );
}
