"use client";

import React, { useEffect, useId, useRef } from "react";

/**
 * Landing hero: a cinematic, looping CareMatch story on a night map of Dhaka.
 *
 * One 9 s loop, told in beats:
 *   0.0–1.2 s  the map breathes in (parallax grid, shimmering river, district glow)
 *   1.2–2.4 s  critical patient alert (heartbeat-synced at 72 bpm): radar ripples; candidate hospitals are scanned, one is ruled out
 *   2.4–4.6 s  the ambulance route draws itself to the public ICU, led by an ambulance with a flashing light bar; the ICU lights up
 *   3.2–5.4 s  a motorbike courier carries O− blood in from the blood hub
 *   5.4–6.6 s  LockStep: the badge springs in, the lock snaps shut, 24 rejected requests scatter,
 *              one green winner flies to the ICU, and the camera pushes in toward the ICU
 *   6.6–9.0 s  hold with gently flowing routes, then an invisible reset
 *
 * Only transform / opacity / stroke-dashoffset are animated (CSS), plus two SMIL motion paths
 * for the comet heads, which share the CSS timeline and easing. Under prefers-reduced-motion
 * every element rests on its final composed frame. Base styles ARE the final frame; the
 * animations only override them.
 */

const T = "9s";
const EASE_DRAW = "cubic-bezier(0.45, 0, 0.25, 1)";
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

const AMB_PATH = "M80 340 L 80 205 L 245 205 L 245 150 L 296 150";
const COURIER_PATH = "M420 318 L 420 260 L 370 260 L 370 150 L 348 150";
const RIVER_PATH = "M-20 332 C 90 300, 160 372, 262 342 S 432 290, 540 322";

/** Candidate hospitals CareMatch scans; one is visibly ruled out. */
const CANDIDATES: { x: number; y: number; ruledOut?: boolean }[] = [
  { x: 224, y: 126 },
  { x: 440, y: 56 },
  { x: 470, y: 206 },
  { x: 160, y: 268, ruledOut: true },
  { x: 292, y: 292 },
];

/** Faint city blocks; each gets a few twinkling window lights (the city is alive at night). */
const BLOCKS: [number, number][] = [
  [102, 44], [262, 44], [102, 154], [377, 154], [267, 214], [440, 150], [157, 104],
];

/** Deterministic integer hash (identical on server and client, unlike Math.sin/Math.random). */
function hash(n: number): number {
  return Math.imul(n + 1, 2654435761) >>> 0;
}

const LAMPS = BLOCKS.flatMap(([bx, by], b) =>
  Array.from({ length: 6 }, (_, w) => {
    const h = hash(b * 6 + w);
    if ((h >>> 12) % 10 < 3) return null; // leave ~30% of windows dark
    return {
      x: bx + 8 + (w % 3) * 12,
      y: by + 11 + Math.floor(w / 3) * 14,
      warm: ((h >>> 4) & 1) === 1,
      delay: ((h % 5000) / 1000).toFixed(2),
      dur: (3 + ((h >>> 8) % 3000) / 1000).toFixed(2),
    };
  }).filter((l): l is NonNullable<typeof l> => l !== null)
);

/** 24 rejected requests scatter from the LockStep badge. */
const PARTICLES = Array.from({ length: 24 }, (_, i) => {
  const angle = (i / 24) * Math.PI * 2 + (i % 2) * 0.13;
  const dist = 62 + ((i * 37) % 34);
  // Ellipse wider than the 168x54 badge so every particle clears its edge.
  const dx = Math.cos(angle) * dist * 1.55;
  const dy = Math.sin(angle) * dist * 0.85;
  // The badge sits in the top-left corner: shorten up/left flights so they stay on the card.
  return { dx: Math.round(dx < 0 ? dx * 0.42 : dx), dy: Math.round(dy < 0 ? dy * 0.38 : dy), violet: i % 3 !== 0 };
});

/** Ticker frames for "24 rejected": [value, show-from %, show-until %]. */
const TICKER: [string, number, number][] = [
  ["0", 63, 65],
  ["6", 65, 66.5],
  ["12", 66.5, 68],
  ["18", 68, 69.5],
  ["24", 69.5, 100],
];

function css(uid: string): string {
  const tickerKeyframes = TICKER.map(([, from, until], i) => {
    const last = i === TICKER.length - 1;
    return `@keyframes cni-tick-${i}-${uid} {
      0%, ${from - 0.01}% { opacity: 0; }
      ${from}% { opacity: 1; }
      ${last ? "92%" : `${until - 0.01}%`} { opacity: 1; }
      ${last ? "98%, 100%" : `${until}%, 100%`} { opacity: 0; }
    }
    .cni-${uid} .cni-tick-${i} { animation: cni-tick-${i}-${uid} ${T} infinite; }`;
  }).join("\n");

  return `
  .cni-${uid} .cni-fx { transform-box: fill-box; transform-origin: center; }

  /* Beat 1: the map breathes */
  @keyframes cni-drift-a { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-4px, -2px); } }
  @keyframes cni-drift-b { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(3px, 2px); } }
  @keyframes cni-breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
  @keyframes cni-river { from { stroke-dashoffset: 300; } to { stroke-dashoffset: 0; } }
  .cni-${uid} .cni-grid-a { animation: cni-drift-a ${T} ease-in-out infinite; }
  .cni-${uid} .cni-grid-b { animation: cni-drift-b ${T} ease-in-out infinite; }
  .cni-${uid} .cni-bloom { animation: cni-breathe 4.5s ease-in-out infinite; }
  .cni-${uid} .cni-river-light { stroke-dasharray: 26 274; animation: cni-river 7s linear infinite; }
  .cni-${uid} .cni-river-light-2 { stroke-dasharray: 14 286; animation: cni-river 11s linear infinite; animation-delay: -4s; }

  /* Beat 2: patient alert + candidate scan */
  @keyframes cni-alert {
    0%, 13% { transform: scale(0.5); opacity: 0; }
    14% { opacity: 0.9; }
    27% { transform: scale(3.1); opacity: 0; }
    100% { transform: scale(3.1); opacity: 0; }
  }
  @keyframes cni-heart { 0%, 100% { transform: scale(1); } 12% { transform: scale(1.18); } 24% { transform: scale(1); } 34% { transform: scale(1.1); } 46% { transform: scale(1); } }
  @keyframes cni-ecg { from { stroke-dashoffset: 100; } to { stroke-dashoffset: -100; } }
  @keyframes cni-scan {
    0%, 14% { transform: scale(0.6); opacity: 0; }
    15% { opacity: 0.85; }
    21%, 100% { transform: scale(2.5); opacity: 0; }
  }
  @keyframes cni-dim { 0%, 13% { opacity: 0.7; } 16% { opacity: 1; } 24%, 92% { opacity: 0.42; } 100% { opacity: 0.7; } }
  @keyframes cni-x {
    0%, 20% { opacity: 0; transform: scale(0.4); }
    23% { opacity: 1; transform: scale(1.18); animation-timing-function: ease-out; }
    25%, 92% { opacity: 1; transform: scale(1); }
    97%, 100% { opacity: 0; transform: scale(1); }
  }
  .cni-${uid} .cni-ring { opacity: 0; animation: cni-alert ${T} cubic-bezier(0.2, 0.7, 0.3, 1) infinite both; }
  .cni-${uid} .cni-core { animation: cni-heart 0.833s ease-in-out infinite; }
  .cni-${uid} .cni-ecg { stroke-dasharray: 34 66; animation: cni-ecg 0.833s linear infinite; }
  .cni-${uid} .cni-scan { opacity: 0; animation: cni-scan ${T} ease-out infinite both; }
  .cni-${uid} .cni-cand { opacity: 0.42; animation: cni-dim ${T} ease-in-out infinite both; }
  .cni-${uid} .cni-x { animation: cni-x ${T} ${SPRING} infinite both; }

  /* Beats 3-4: routes draw themselves, comets lead */
  @keyframes cni-amb-draw {
    0%, 26.7% { stroke-dashoffset: 100; opacity: 1; animation-timing-function: ${EASE_DRAW}; }
    51.1%, 92% { stroke-dashoffset: 0; opacity: 1; }
    98%, 100% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes cni-cour-draw {
    0%, 35.6% { stroke-dashoffset: 100; opacity: 1; animation-timing-function: ${EASE_DRAW}; }
    60%, 92% { stroke-dashoffset: 0; opacity: 1; }
    98%, 100% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes cni-amb-head { 0%, 26% { opacity: 0; } 28%, 50% { opacity: 1; } 54%, 100% { opacity: 0; } }
  @keyframes cni-cour-head { 0%, 35% { opacity: 0; } 37%, 59% { opacity: 1; } 63%, 100% { opacity: 0; } }
  @keyframes cni-flow-amb { 0%, 51% { opacity: 0; } 55%, 92% { opacity: 0.95; } 98%, 100% { opacity: 0; } }
  @keyframes cni-flow-cour { 0%, 60% { opacity: 0; } 64%, 92% { opacity: 0.95; } 98%, 100% { opacity: 0; } }
  @keyframes cni-dash { to { stroke-dashoffset: -24; } }
  .cni-${uid} .cni-draw { stroke-dasharray: 100; stroke-dashoffset: 0; }
  .cni-${uid} .cni-amb-draw { animation: cni-amb-draw ${T} infinite; }
  .cni-${uid} .cni-cour-draw { animation: cni-cour-draw ${T} infinite; }
  .cni-${uid} .cni-amb-head { animation: cni-amb-head ${T} infinite; }
  .cni-${uid} .cni-cour-head { animation: cni-cour-head ${T} infinite; }
  .cni-${uid} .cni-flow { stroke-dasharray: 3 9; opacity: 0.95; }
  .cni-${uid} .cni-flow-amb { animation: cni-flow-amb ${T} infinite, cni-dash 1.1s linear infinite; }
  .cni-${uid} .cni-flow-cour { animation: cni-flow-cour ${T} infinite, cni-dash 0.9s linear infinite; }

  /* ICU lights up on arrival */
  @keyframes cni-icu-halo {
    0%, 50% { opacity: 0.22; transform: scale(0.82); }
    55% { opacity: 1; transform: scale(1.1); }
    61%, 92% { opacity: 1; transform: scale(1); }
    100% { opacity: 0.22; transform: scale(0.82); }
  }
  @keyframes cni-icu-wave {
    0%, 51% { opacity: 0; transform: scale(0.7); }
    52% { opacity: 0.9; }
    64%, 100% { opacity: 0; transform: scale(2); }
  }
  @keyframes cni-icu-lit { 0%, 50% { opacity: 0; } 54%, 92% { opacity: 1; } 100% { opacity: 0; } }
  .cni-${uid} .cni-icu-halo { animation: cni-icu-halo ${T} ease-in-out infinite; }
  .cni-${uid} .cni-icu-breathe { animation: cni-breathe 3s ease-in-out infinite; }
  .cni-${uid} .cni-icu-wave { opacity: 0; animation: cni-icu-wave ${T} cubic-bezier(0.2, 0.7, 0.3, 1) infinite; }
  .cni-${uid} .cni-icu-lit { animation: cni-icu-lit ${T} ease-in-out infinite; }

  /* Blood drop: liquid wobble + sheen */
  @keyframes cni-wobble { 0%, 100% { transform: scale(1, 1); } 30% { transform: scale(1.05, 0.96); } 60% { transform: scale(0.97, 1.04); } }
  .cni-${uid} .cni-drop { transform-box: fill-box; transform-origin: 50% 100%; animation: cni-wobble 2.6s ease-in-out infinite; }
  .cni-${uid} .cni-sheen { animation: cni-breathe 2.6s ease-in-out infinite; }

  /* Beat 5: LockStep */
  @keyframes cni-badge {
    0%, 59% { opacity: 0; transform: translateY(10px) scale(0.72); animation-timing-function: ${SPRING}; }
    64% { opacity: 1; transform: translateY(0) scale(1.05); }
    67% { transform: scale(0.985); }
    70%, 92% { opacity: 1; transform: scale(1); }
    98%, 100% { opacity: 0; transform: scale(0.96); }
  }
  @keyframes cni-shackle {
    0%, 64% { transform: translateY(-4px); animation-timing-function: ${SPRING}; }
    67% { transform: translateY(0.6px); }
    69%, 100% { transform: translateY(0); }
  }
  @keyframes cni-sweep { 0%, 66% { transform: translateX(-60px); opacity: 0; } 67% { opacity: 0.8; } 73%, 100% { transform: translateX(200px); opacity: 0; } }
  @keyframes cni-burst {
    0%, 66% { opacity: 0; transform: translate(0, 0) scale(1); }
    67% { opacity: 0.9; }
    79%, 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.35); }
  }
  @keyframes cni-win {
    0%, 68% { opacity: 0; transform: translate(0, 0) scale(0.7); }
    69% { opacity: 1; transform: translate(0, 0) scale(1); animation-timing-function: cubic-bezier(0.3, 0, 0.5, 1); }
    73.5% { transform: translate(64px, -14px) scale(1.12); animation-timing-function: cubic-bezier(0.5, 0, 0.7, 1); }
    78% { opacity: 1; transform: translate(110px, 84px) scale(0.75); }
    80%, 100% { opacity: 0; transform: translate(110px, 84px) scale(0.5); }
  }
  .cni-${uid} .cni-badge { transform-box: fill-box; transform-origin: 50% 50%; animation: cni-badge ${T} infinite; }
  .cni-${uid} .cni-shackle { animation: cni-shackle ${T} infinite; }
  .cni-${uid} .cni-sweep { opacity: 0; animation: cni-sweep ${T} ease-in-out infinite; }
  .cni-${uid} .cni-burst { opacity: 0; animation: cni-burst ${T} cubic-bezier(0.15, 0.7, 0.3, 1) infinite; }
  .cni-${uid} .cni-win { opacity: 0; animation: cni-win ${T} infinite; }
  .cni-${uid} .cni-tick { opacity: 0; }
  .cni-${uid} .cni-tick-final { opacity: 1; }
  ${tickerKeyframes}

  /* Living city: window lights twinkle */
  @keyframes cni-lamp { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.6; } }
  .cni-${uid} .cni-lamp { opacity: 0.35; animation: cni-lamp 4s ease-in-out infinite both; }

  /* Heartbeat at 72 bpm (0.833 s): lub-dub rings around the critical patient */
  @keyframes cni-hb { 0% { transform: scale(1); opacity: 0.55; } 70%, 100% { transform: scale(2.4); opacity: 0; } }
  .cni-${uid} .cni-hb { opacity: 0; animation: cni-hb 0.833s cubic-bezier(0.2, 0.7, 0.3, 1) infinite; }

  /* Ambulance light bar flashes red/blue at 2 Hz */
  @keyframes cni-siren-a { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.2; } }
  @keyframes cni-siren-b { 0%, 49% { opacity: 0.2; } 50%, 100% { opacity: 1; } }
  .cni-${uid} .cni-siren-a { animation: cni-siren-a 0.5s step-end infinite; }
  .cni-${uid} .cni-siren-b { animation: cni-siren-b 0.5s step-end infinite; }
  @keyframes cni-glow-a { 0%, 49% { opacity: 0.34; } 50%, 100% { opacity: 0; } }
  @keyframes cni-glow-b { 0%, 49% { opacity: 0; } 50%, 100% { opacity: 0.34; } }
  .cni-${uid} .cni-glow-a { opacity: 0.2; animation: cni-glow-a 0.5s step-end infinite; }
  .cni-${uid} .cni-glow-b { opacity: 0.2; animation: cni-glow-b 0.5s step-end infinite; }

  /* Lock moment: the camera pushes in toward the ICU, then releases before the loop resets */
  @keyframes cni-cam {
    0%, 60% { transform: scale(1); animation-timing-function: ${EASE_DRAW}; }
    73.3%, 86% { transform: scale(1.05); animation-timing-function: ${EASE_DRAW}; }
    95%, 100% { transform: scale(1); }
  }
  .cni-${uid} .cni-camera { transform-origin: 322px 150px; animation: cni-cam ${T} infinite; }

  /* Pointer parallax depth (variables set from a rAF-throttled pointer listener) */
  .cni-${uid} .cni-l1, .cni-${uid} .cni-l2, .cni-${uid} .cni-l3 {
    transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  .cni-${uid} .cni-l1 { transform: translate(calc(var(--cni-px, 0) * -2px), calc(var(--cni-py, 0) * -2px)); }
  .cni-${uid} .cni-l2 { transform: translate(calc(var(--cni-px, 0) * 4px), calc(var(--cni-py, 0) * 4px)); }
  .cni-${uid} .cni-l3 { transform: translate(calc(var(--cni-px, 0) * 6px), calc(var(--cni-py, 0) * 6px)); }

  @media (prefers-reduced-motion: reduce) {
    .cni-${uid} *, .cni-${uid} *::before { animation: none !important; }
    .cni-${uid} .cni-motion { display: none; }
    .cni-${uid} .cni-l1, .cni-${uid} .cni-l2, .cni-${uid} .cni-l3 { transform: none !important; transition: none; }
  }`;
}

export function CareNetworkIllustration({ className = "" }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `cni-${name}-${uid}`;
  const svgRef = useRef<SVGSVGElement>(null);

  // The route comets run on the SVG (SMIL) clock while the route lines draw on the CSS clock.
  // They start at slightly different moments, so restart both together once mounted.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const frame = requestAnimationFrame(() => {
      svg.setCurrentTime?.(0);
      svg.getAnimations?.({ subtree: true }).forEach((a) => {
        a.currentTime = 0;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Pointer parallax: background moves least, routes more, labels most (±6px). Variables are
  // written straight to the SVG in a rAF, so there is no React re-render per pointer move.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const flush = () => {
      raf = 0;
      svg.style.setProperty("--cni-px", px.toFixed(3));
      svg.style.setProperty("--cni-py", py.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onLeave = () => {
      px = 0;
      py = 0;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <svg ref={svgRef} viewBox="0 0 520 420" className={`cni-${uid} ${className}`} aria-hidden="true" focusable="false">
      <style>{css(uid)}</style>
      <defs>
        <linearGradient id={id("panel")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#06202A" />
          <stop offset="0.55" stopColor="#082838" />
          <stop offset="1" stopColor="#0B2E44" />
        </linearGradient>
        <radialGradient id={id("bloom")} cx="0.5" cy="0" r="0.75">
          <stop offset="0" stopColor="#CCFBF1" stopOpacity="0.2" />
          <stop offset="0.5" stopColor="#5EEAD4" stopOpacity="0.05" />
          <stop offset="1" stopColor="#5EEAD4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("vignette")} cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.62" stopColor="#020B10" stopOpacity="0" />
          <stop offset="1" stopColor="#020B10" stopOpacity="0.55" />
        </radialGradient>
        <radialGradient id={id("district")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#38BDF8" stopOpacity="0.16" />
          <stop offset="1" stopColor="#38BDF8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("district2")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#2DD4BF" stopOpacity="0.14" />
          <stop offset="1" stopColor="#2DD4BF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("icu")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#5EEAD4" stopOpacity="0.5" />
          <stop offset="0.55" stopColor="#22D3EE" stopOpacity="0.14" />
          <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("hub")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F43F5E" stopOpacity="0.38" />
          <stop offset="1" stopColor="#F43F5E" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("amb")} gradientUnits="userSpaceOnUse" x1="80" y1="340" x2="296" y2="150">
          <stop offset="0" stopColor="#60A5FA" />
          <stop offset="1" stopColor="#93C5FD" />
        </linearGradient>
        <linearGradient id={id("drop")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FB7185" />
          <stop offset="1" stopColor="#BE123C" />
        </linearGradient>
        <linearGradient id={id("icubox")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14B8A6" />
          <stop offset="1" stopColor="#0F766E" />
        </linearGradient>
        <linearGradient id={id("lock")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id={id("sweep")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#EDE9FE" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <pattern id={id("gridfine")} width="27.5" height="27.5" patternUnits="userSpaceOnUse">
          <path d="M27.5 0H0V27.5" fill="none" stroke="#5EEAD4" strokeOpacity="0.045" strokeWidth="1" />
        </pattern>
        <pattern id={id("grid")} width="55" height="55" patternUnits="userSpaceOnUse" x="40" y="40">
          <path d="M55 0H0V55" fill="none" stroke="#5EEAD4" strokeOpacity="0.11" strokeWidth="1" />
        </pattern>
        <filter id={id("soft")} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <clipPath id={id("card")}>
          <rect width="520" height="420" rx="28" />
        </clipPath>
        <clipPath id={id("badgeclip")}>
          <rect x="36" y="36" width="168" height="54" rx="16" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${id("card")})`}>
        <g className="cni-camera">
        <g className="cni-l1">
        {/* ---- Beat 1: night map ---- */}
        <rect width="520" height="420" fill={`url(#${id("panel")})`} />
        <ellipse cx="150" cy="140" rx="170" ry="120" fill={`url(#${id("district2")})`} />
        <ellipse cx="400" cy="250" rx="180" ry="140" fill={`url(#${id("district")})`} />
        <rect className="cni-grid-a" x="-20" y="-20" width="560" height="460" fill={`url(#${id("gridfine")})`} />
        <rect className="cni-grid-b" x="-20" y="-20" width="560" height="460" fill={`url(#${id("grid")})`} />
        {/* city blocks */}
        <g fill="#5EEAD4" fillOpacity="0.035">
          {BLOCKS.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="46" height="42" rx="6" />
          ))}
        </g>
        {LAMPS.map((l, i) => (
          <rect
            key={i}
            x={l.x}
            y={l.y}
            width="6"
            height="4"
            rx="1"
            fill={l.warm ? "#FDE68A" : "#A5F3FC"}
            className="cni-lamp"
            style={{ animationDelay: `-${l.delay}s`, animationDuration: `${l.dur}s` }}
          />
        ))}
        {/* river with flowing light */}
        <path d={RIVER_PATH} fill="none" stroke="#38BDF8" strokeOpacity="0.2" strokeWidth="16" strokeLinecap="round" />
        <path d={RIVER_PATH} fill="none" stroke="#0EA5E9" strokeOpacity="0.18" strokeWidth="6" />
        <path d={RIVER_PATH} pathLength={300} fill="none" stroke="#BAE6FD" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" className="cni-river-light" />
        <path d={RIVER_PATH} pathLength={300} fill="none" stroke="#E0F2FE" strokeOpacity="0.4" strokeWidth="1.6" strokeLinecap="round" className="cni-river-light-2" />
        <rect width="520" height="420" fill={`url(#${id("bloom")})`} className="cni-bloom" />
        </g>
        <g className="cni-l2">

        {/* ---- Beat 2: candidates scanned ---- */}
        {CANDIDATES.map(({ x, y, ruledOut }, i) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="10" fill="none" stroke="#99F6E4" strokeWidth="1.5" className="cni-fx cni-scan cni-motion" style={{ animationDelay: `${i * 0.22}s` }} />
            <g className="cni-cand" style={{ animationDelay: `${i * 0.22}s` }}>
              <circle cx={x} cy={y} r="9" fill="#1E3A47" stroke="#5C7A88" strokeWidth="1.5" />
              <path d={`M${x - 4} ${y}h8M${x} ${y - 4}v8`} stroke="#A3B8C2" strokeWidth="2" strokeLinecap="round" />
            </g>
            {ruledOut && (
              <g className="cni-fx cni-x">
                <circle cx={x + 9} cy={y - 9} r="6.5" fill="#F43F5E" stroke="#082838" strokeWidth="1.5" />
                <path d={`M${x + 6.6} ${y - 11.4}l4.8 4.8M${x + 11.4} ${y - 11.4}l-4.8 4.8`} stroke="#FFF1F2" strokeWidth="1.6" strokeLinecap="round" />
              </g>
            )}
          </g>
        ))}

        {/* ---- Beats 3-4: routes ---- */}
        <path d={AMB_PATH} fill="none" stroke="#60A5FA" strokeOpacity="0.16" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" pathLength={100} className="cni-draw cni-amb-draw" />
        <path d={AMB_PATH} fill="none" stroke={`url(#${id("amb")})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" pathLength={100} className="cni-draw cni-amb-draw" />
        <path d={AMB_PATH} fill="none" stroke="#E0F2FE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cni-flow cni-flow-amb" />

        <path d={COURIER_PATH} fill="none" stroke="#22D3EE" strokeOpacity="0.16" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" pathLength={100} className="cni-draw cni-cour-draw" />
        <path d={COURIER_PATH} fill="none" stroke="#22D3EE" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" pathLength={100} className="cni-draw cni-cour-draw" />
        <path d={COURIER_PATH} fill="none" stroke="#CFFAFE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cni-flow cni-flow-cour" />

        {/* comets (SMIL motion, CSS opacity, same 9 s timeline and easing as the draw) */}
        <g className="cni-amb-head cni-motion">
          <animateMotion dur={T} repeatCount="indefinite" rotate="auto" path={AMB_PATH} keyPoints="0;0;1;1" keyTimes="0;0.267;0.511;1" calcMode="spline" keySplines="0 0 1 1;0.45 0 0.25 1;0 0 1 1" />
          {/* ambulance, top-down, nose toward +x so rotate="auto" faces the direction of travel */}
          <g transform="scale(1.4)">
          <ellipse cx="-13" rx="13" ry="5" fill="#93C5FD" opacity="0.5" filter={`url(#${id("soft")})`} />
          <rect x="-9" y="-5.5" width="18" height="11" rx="3" fill="#F8FAFC" stroke="#93C5FD" strokeWidth="0.8" />
          <rect x="4.6" y="-4.2" width="3" height="8.4" rx="1.2" fill="#1E3A5F" />
          <path d="M-3.5 -2.8v5.6M-6.3 0h5.6" stroke="#EF4444" strokeWidth="1.9" strokeLinecap="round" />
          <rect x="1" y="-3.4" width="2.6" height="3.2" rx="0.8" fill="#EF4444" className="cni-siren-a" />
          <rect x="1" y="0.2" width="2.6" height="3.2" rx="0.8" fill="#3B82F6" className="cni-siren-b" />
          <circle cx="2.3" cy="-2" r="4.6" fill="#F43F5E" className="cni-glow-a" />
          <circle cx="2.3" cy="2" r="4.6" fill="#3B82F6" className="cni-glow-b" />
          </g>
        </g>
        <g className="cni-cour-head cni-motion">
          <animateMotion dur={T} repeatCount="indefinite" rotate="auto" path={COURIER_PATH} keyPoints="0;0;1;1" keyTimes="0;0.356;0.6;1" calcMode="spline" keySplines="0 0 1 1;0.45 0 0.25 1;0 0 1 1" />
          {/* blood courier motorbike, top-down: cool box with a red drop, rider, handlebar */}
          <g transform="scale(1.4)">
          <ellipse cx="-12" rx="12" ry="4.5" fill="#67E8F9" opacity="0.5" filter={`url(#${id("soft")})`} />
          <rect x="-7" y="-1.8" width="14" height="3.6" rx="1.8" fill="#CFFAFE" />
          <path d="M6 -4v8" stroke="#CFFAFE" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="0" cy="0" r="2.7" fill="#0E7490" stroke="#ECFEFF" strokeWidth="1" />
          <rect x="-11" y="-3.8" width="6" height="7.6" rx="1.4" fill="#FFFFFF" />
          <path d="M-8 -2.3c-1.1 1.4-1.5 2.2-1.5 2.9a1.5 1.5 0 0 0 3 0c0-0.7-0.4-1.5-1.5-2.9z" fill="#E11D48" />
          </g>
        </g>

        {/* ---- Patient (critical) ---- */}
        {[0, 0.3, 0.6].map((d) => (
          <circle key={d} cx="80" cy="340" r="12" fill="none" stroke="#FB7185" strokeWidth="2" className="cni-fx cni-ring cni-motion" style={{ animationDelay: `${d}s` }} />
        ))}
        {[0, 0.18].map((d) => (
          <circle key={`hb${d}`} cx="80" cy="340" r="11" fill="none" stroke="#F43F5E" strokeWidth="1.6" className="cni-fx cni-hb cni-motion" style={{ animationDelay: `${d}s` }} />
        ))}
        <circle cx="80" cy="340" r="17" fill="#F43F5E" fillOpacity="0.16" />
        <g className="cni-fx cni-core">
          <circle cx="80" cy="340" r="10" fill="#F43F5E" stroke="#FFF1F2" strokeWidth="3" />
        </g>

        {/* ---- ICU ---- */}
        <circle cx="322" cy="150" r="62" fill={`url(#${id("icu")})`} className="cni-fx cni-icu-halo" />
        <circle cx="322" cy="150" r="36" fill="none" stroke="#5EEAD4" strokeOpacity="0.35" strokeWidth="1.5" className="cni-icu-breathe" />
        <circle cx="322" cy="150" r="30" fill="none" stroke="#99F6E4" strokeWidth="2" className="cni-fx cni-icu-wave cni-motion" />
        <rect x="296" y="124" width="52" height="52" rx="14" fill="#0D3B3E" stroke="#5EEAD4" strokeOpacity="0.5" strokeWidth="2" />
        <g className="cni-icu-lit">
          <rect x="296" y="124" width="52" height="52" rx="14" fill={`url(#${id("icubox")})`} stroke="#99F6E4" strokeWidth="2.5" />
          <rect x="300" y="127" width="44" height="14" rx="7" fill="#FFFFFF" fillOpacity="0.14" />
        </g>
        <path d="M322 137v26M309 150h26" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />

        {/* ---- Blood hub ---- */}
        <circle cx="420" cy="328" r="26" fill={`url(#${id("hub")})`} className="cni-icu-breathe" />
        <g className="cni-drop">
          <path d="M420 312 C 411 324, 408 331, 408 336 a12 12 0 0 0 24 0 c0-5-3-12-12-24z" fill={`url(#${id("drop")})`} stroke="#FFE4E6" strokeWidth="2.2" />
          <ellipse cx="414" cy="331" rx="2.6" ry="5" fill="#FFFFFF" fillOpacity="0.55" className="cni-sheen" />
          <text x="420" y="341" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#FFFFFF">O−</text>
        </g>

        </g>
        <g className="cni-l3">
        {/* ---- Labels (dark translucent pills, text >= 4.5:1) ---- */}
        <g fontSize="11.5" fontWeight="700">
          <rect x="350" y="94" width="150" height="26" rx="13" fill="#04141C" fillOpacity="0.82" stroke="#5EEAD4" strokeOpacity="0.25" />
          <circle cx="363" cy="107" r="3" fill="#5EEAD4" />
          <text x="371" y="111" fill="#CCFBF1">Public ICU · 7.5 min</text>

          <rect x="322" y="356" width="178" height="26" rx="13" fill="#04141C" fillOpacity="0.82" stroke="#22D3EE" strokeOpacity="0.25" />
          <circle cx="335" cy="369" r="3" fill="#22D3EE" />
          <text x="343" y="373" fill="#CFFAFE">Blood courier · 4.1 min</text>

          <rect x="20" y="364" width="166" height="26" rx="13" fill="#04141C" fillOpacity="0.82" stroke="#F43F5E" strokeOpacity="0.35" />
          <path d="M32 377h4l2-4.5 2.4 9 2.2-7 1.6 2.5h4" fill="none" stroke="#FB7185" strokeOpacity="0.35" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M32 377h4l2-4.5 2.4 9 2.2-7 1.6 2.5h4" pathLength={100} fill="none" stroke="#FFE4E6" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" className="cni-ecg cni-motion" />
          <text x="54" y="381" fill="#FECDD3">NEWS2 15 · Critical</text>
        </g>

        {/* ---- Beat 5: LockStep ---- */}
        {PARTICLES.map(({ dx, dy, violet }, i) => (
          <circle
            key={i}
            cx="120"
            cy="63"
            r={violet ? 2.4 : 1.9}
            fill={violet ? "#C4B5FD" : "#CBD5E1"}
            className="cni-burst cni-motion"
            style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as React.CSSProperties}
          />
        ))}
        <g className="cni-win cni-motion">
          <circle cx="206" cy="64" r="7" fill="#22C55E" stroke="#DCFCE7" strokeWidth="1.5" />
          <path d="M202.8 64.2l2.2 2.2 4.2-4.6" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g className="cni-badge">
          <rect x="36" y="38" width="168" height="54" rx="16" fill="#020B10" fillOpacity="0.35" filter={`url(#${id("soft")})`} />
          <rect x="36" y="36" width="168" height="54" rx="16" fill="#FFFFFF" fillOpacity="0.96" />
          <g clipPath={`url(#${id("badgeclip")})`}>
            <rect x="36" y="36" width="40" height="54" fill={`url(#${id("sweep")})`} className="cni-sweep cni-motion" />
          </g>
          <rect x="48" y="49" width="28" height="28" rx="8" fill={`url(#${id("lock")})`} />
          <path className="cni-shackle" d="M56.5 61v-3.2a5.5 5.5 0 0 1 11 0V61" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="54.5" y="60.5" width="15" height="10" rx="2.5" fill="#FFFFFF" />
          <circle cx="62" cy="65.5" r="1.6" fill="#7C3AED" />
          <text x="86" y="60" fontSize="11" fontWeight="800" fill="#0E1E25">LockStep: held</text>
          <text x="86" y="77" fontSize="10" fill="#3A505B">1 winner ·</text>
          {TICKER.map(([value], i) => (
            <text
              key={value}
              x="146"
              y="77"
              textAnchor="end"
              fontSize="10"
              fontWeight="700"
              fill="#6D28D9"
              className={`cni-tick cni-tick-${i}${i === TICKER.length - 1 ? " cni-tick-final" : ""}`}
            >
              {value}
            </text>
          ))}
          <text x="149" y="77" fontSize="10" fill="#3A505B">rejected</text>
        </g>
        </g>
        </g>

        <rect width="520" height="420" fill={`url(#${id("vignette")})`} pointerEvents="none" />
      </g>
      <rect x="0.5" y="0.5" width="519" height="419" rx="27.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.08" />
    </svg>
  );
}
