"use client";

import { useEffect, useRef } from "react";

/**
 * Counts a stat like "92.4%", "~50%" or "≥60%" up from zero the first time it scrolls into view.
 * Server HTML and screen readers always get the final value; the count-up only runs for
 * numbers that start below the fold, and never under prefers-reduced-motion.
 */
export function NumberTicker({ value, className, durationMs = 1200 }: { value: string; className?: string; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    const m = value.match(/^([^\d]*)(\d+(?:\.\d+)?)(.*)$/);
    if (!el || !m) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already visible: never flash to 0

    const [, prefix, num, suffix] = m;
    const target = Number(num);
    const decimals = num.includes(".") ? num.split(".")[1].length : 0;
    const render = (n: number) => { el.textContent = `${prefix}${n.toFixed(decimals)}${suffix}`; };
    render(0);

    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / durationMs);
        render(target * (1 - Math.pow(1 - p, 3))); // ease-out cubic
        if (p < 1) raf = requestAnimationFrame(tick);
        else el.textContent = value;
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.25 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); el.textContent = value; };
  }, [value, durationMs]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true">{value}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
