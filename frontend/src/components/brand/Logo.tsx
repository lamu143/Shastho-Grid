import React, { useId } from "react";

/** ShasthoGrid mark: a health pulse running across a care grid. */
export function LogoMark({
  className = "h-9 w-9",
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  const gradientId = useId();
  const clipId = useId();
  const pulseGlowId = useId();
  return (
    <svg viewBox="0 0 64 64" className={`${className}${animated ? " sg-logo-mark" : ""}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0F766E" />
          <stop offset="0.48" stopColor="#087F8C" />
          <stop offset="1" stopColor="#0891B2" />
        </linearGradient>
        <clipPath id={clipId}><rect width="64" height="64" rx="16" /></clipPath>
        <filter id={pulseGlowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.2" result="pulseBlur" />
          <feMerge><feMergeNode in="pulseBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} className={animated ? "sg-logo-backplate" : undefined} />
      <g fill="#FFFFFF" fillOpacity="0.34">
        {[16, 32, 48].map((x) => (
          <React.Fragment key={x}>
            <circle cx={x} cy="16" r="2.6" className={animated ? "sg-logo-node" : undefined} style={animated ? { animationDelay: `${(x - 16) / 100}s` } : undefined} />
            <circle cx={x} cy="48" r="2.6" className={animated ? "sg-logo-node" : undefined} style={animated ? { animationDelay: `${0.25 + (x - 16) / 100}s` } : undefined} />
          </React.Fragment>
        ))}
      </g>
      <g className={animated ? "sg-logo-wave" : undefined}>
        <path
          d="M6 33h9c2.5 0 3-3.2 5.3-3.2s2.9 3.2 5.4 3.2H28l3-13 5.2 26 5.2-18 3.6 5H48c2.4 0 3-2.5 5.2-2.5s2.8 2.5 5.2 2.5h1"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {animated && <path d="M6 33h9c2.5 0 3-3.2 5.3-3.2s2.9 3.2 5.4 3.2H28l3-13 5.2 26 5.2-18 3.6 5H48c2.4 0 3-2.5 5.2-2.5s2.8 2.5 5.2 2.5h1" pathLength="100" fill="none" stroke="#A8FFF3" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="15 85" filter={`url(#${pulseGlowId})`} className="sg-logo-trace" />}
      </g>
      {animated && <circle cx="58" cy="33" r="5.2" fill="none" stroke="#A8FFF3" strokeWidth="1.5" className="sg-logo-heart-ring" />}
      <circle cx="58" cy="33" r="3.1" fill="#FFFFFF" className={animated ? "sg-logo-heart" : undefined} />
      {animated && <g clipPath={`url(#${clipId})`}><path d="M-22 0h12l34 64H12z" fill="#FFFFFF" className="sg-logo-glint" /></g>}
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
        <span className="text-lg font-extrabold tracking-tight text-[#172A33]">
          Shastho<span className="text-[#0F766E]">Grid</span>
        </span>
      )}
    </span>
  );
}
