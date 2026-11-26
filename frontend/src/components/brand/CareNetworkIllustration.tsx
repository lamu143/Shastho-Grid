import React from "react";

/**
 * Animated hero illustration: a stylised Dhaka care grid showing a
 * CareMatch split-resource co-dispatch (ambulance to a public ICU while a
 * courier brings compatible blood from a blood hub). Pure SVG + CSS, so it
 * is crisp at any size, weighs ~3 KB and respects prefers-reduced-motion.
 */
export function CareNetworkIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 420"
      className={className}
      role="img"
      aria-labelledby="sg-illus-title sg-illus-desc"
    >
      <title id="sg-illus-title">CareMatch split-resource co-dispatch</title>
      <desc id="sg-illus-desc">
        An ambulance route from the incident to a public ICU, and a blood courier route from a
        blood hub to the same ICU, drawn on a city grid.
      </desc>
      <defs>
        <linearGradient id="sg-panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#042F2E" />
          <stop offset="1" stopColor="#0C4A6E" />
        </linearGradient>
        <radialGradient id="sg-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#2DD4BF" stopOpacity="0.45" />
          <stop offset="1" stopColor="#2DD4BF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sg-icu-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#5EEAD4" stopOpacity="0.34" />
          <stop offset="0.62" stopColor="#22D3EE" stopOpacity="0.12" />
          <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="520" height="420" rx="28" fill="url(#sg-panel)" />

      {/* city grid */}
      <g stroke="#5EEAD4" strokeOpacity="0.1">
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`v${i}`} x1={40 + i * 55} y1="20" x2={40 + i * 55} y2="400" />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`h${i}`} x1="20" y1={40 + i * 55} x2="500" y2={40 + i * 55} />
        ))}
      </g>
      {/* river */}
      <path
        d="M-10 330 C 90 300, 160 370, 260 340 S 430 290, 540 320"
        fill="none"
        stroke="#38BDF8"
        strokeOpacity="0.25"
        strokeWidth="14"
        className="sg-river-current"
      />

      {/* other facilities (unavailable) */}
      {[
        [95, 95],
        [425, 90],
        [455, 240],
        [150, 250],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="9" fill="#405663" stroke="#5C727E" strokeWidth="2" />
          <path d={`M${x - 4} ${y}h8M${x} ${y - 4}v8`} stroke="#91A2AB" strokeWidth="2" />
        </g>
      ))}

      {/* ambulance route: incident -> ICU */}
      <path
        d="M80 340 L 80 205 L 245 205 L 245 150 L 315 150"
        fill="none"
        stroke="#60A5FA"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="sg-route"
      />
      {/* courier route: blood hub -> ICU */}
      <path
        d="M420 330 L 420 260 L 370 260 L 370 150 L 330 150"
        fill="none"
        stroke="#22D3EE"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="sg-route"
      />
      {/* Soft moving signals show each response traveling toward the shared ICU. */}
      <circle r="4.5" fill="#E0F2FE" className="sg-route-signal">
        <animateMotion dur="5.8s" repeatCount="indefinite" path="M80 340 L80 205 L245 205 L245 150 L315 150" />
      </circle>
      <circle r="4" fill="#CFFAFE" className="sg-route-signal sg-route-signal--courier">
        <animateMotion dur="4.6s" repeatCount="indefinite" path="M420 330 L420 260 L370 260 L370 150 L330 150" />
      </circle>

      {/* incident */}
      <circle cx="80" cy="340" r="15" fill="none" stroke="#FDA4AF" strokeWidth="2" className="sg-incident-ring" />
      <circle cx="80" cy="340" r="10" fill="#F43F5E" className="sg-ping" />
      <circle cx="80" cy="340" r="10" fill="#F43F5E" stroke="#FFF1F2" strokeWidth="3" />

      {/* blood hub */}
      <g className="sg-float">
        <circle cx="420" cy="330" r="22" fill="url(#sg-glow)" />
        <path
          d="M420 316 C 412 327, 409 333, 409 338 a11 11 0 0 0 22 0 c0-5-3-11-11-22z"
          fill="#EF4444"
          stroke="#FEE2E2"
          strokeWidth="2.5"
        />
        <text x="420" y="342" textAnchor="middle" fontSize="9" fontWeight="800" fill="#FFF">
          O−
        </text>
      </g>

      {/* target ICU */}
      <circle cx="322" cy="150" r="58" fill="url(#sg-icu-glow)" className="sg-icu-aura" />
      <circle cx="322" cy="150" r="33" fill="none" stroke="#99F6E4" strokeWidth="2" className="sg-icu-ring" />
      <g>
        <rect x="296" y="124" width="52" height="52" rx="14" fill="#0F766E" stroke="#99F6E4" strokeWidth="3" />
        <path d="M322 136v28M308 150h28" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      </g>

      {/* labels */}
      <g fontFamily="Inter, ui-sans-serif, system-ui" fontSize="12" fontWeight="700">
        <rect x="355" y="96" width="118" height="26" rx="13" fill="#172A33" fillOpacity="0.75" />
        <text x="414" y="113" textAnchor="middle" fill="#99F6E4">Public ICU · 7.5 min</text>
        <rect x="330" y="356" width="132" height="26" rx="13" fill="#172A33" fillOpacity="0.75" />
        <text x="396" y="373" textAnchor="middle" fill="#A5F3FC">Blood courier · 4.1 min</text>
        <rect x="30" y="364" width="108" height="26" rx="13" fill="#172A33" fillOpacity="0.75" />
        <text x="84" y="381" textAnchor="middle" fill="#FECDD3">NEWS2 15 · Critical</text>
      </g>

      {/* lock badge */}
      <g className="sg-float" style={{ animationDelay: "1.2s" }}>
        <rect x="36" y="36" width="168" height="54" rx="16" fill="#FFFFFF" fillOpacity="0.95" />
        <rect x="48" y="49" width="28" height="28" rx="8" fill="#7C3AED" />
        <path d="M56 61v-3a6 6 0 0 1 12 0v3M55 61h14v9H55z" fill="none" stroke="#FFF" strokeWidth="2.2" strokeLinejoin="round" />
        <text x="86" y="60" fontFamily="Inter, ui-sans-serif" fontSize="11" fontWeight="800" fill="#172A33">
          LockStep: held
        </text>
        <text x="86" y="76" fontFamily="Inter, ui-sans-serif" fontSize="10" fill="#536975">
          1 winner · 24 rejected
        </text>
      </g>
    </svg>
  );
}
