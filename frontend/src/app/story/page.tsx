"use client";

/**
 * /story — "The Farmgate case": a pinned, scroll-scrubbed story of one golden-hour emergency.
 *
 * Five beats on one sticky stage, all driven by a single rAF controller (no React re-renders
 * while scrolling):
 *   1. hero headline over the live Dhaka care map
 *   2. the camera pushes into the incident while the rule clash resolves out of blur
 *   3. a fog bank rolls in, the explanation writes in word by word, hotspots pop onto the map
 *   4. LockStep: a glass hold card (countdown + resource checks) and a feature list
 *   5. a panel slides up with tilting "try it live" cards and count-up stats
 *
 * The map is our own CareNetworkIllustration (viewBox 520×420); the camera is a transform on
 * its box, and hotspots are projected into screen space each frame so their text stays crisp.
 * Under prefers-reduced-motion the camera never moves and nothing blurs: layers only fade.
 */
import Link from "next/link";
import React, { useEffect, useRef } from "react";
import { CareNetworkIllustration } from "@/components/brand/CareNetworkIllustration";
import { useI18n } from "@/lib/i18n";

type Copy = { en: string; bn: string };
const c = (en: string, bn: string): Copy => ({ en, bn });

const VB_W = 520;
const VB_H = 420;

/** Points on the illustration (viewBox units). */
const P = {
  incident: { x: 80, y: 340 },
  ruledOut: { x: 160, y: 268 },
  icu: { x: 322, y: 150 },
  blood: { x: 420, y: 318 },
};

const SPOTS: { at: { x: number; y: number }; label: Copy; value: Copy; tone?: "danger" }[] = [
  { at: P.incident, label: c("Farmgate · patient", "ফার্মগেট · রোগী"), value: c("NEWS2 15 · critical", "NEWS2 ১৫ · সংকটাপন্ন"), tone: "danger" },
  { at: P.ruledOut, label: c("Ruled out", "বাদ পড়েছে"), value: c("0 O− units in stock", "O− রক্ত মজুত ০"), tone: "danger" },
  { at: P.icu, label: c("BMU · public ICU", "বিএমইউ · সরকারি আইসিইউ"), value: c("ICU + ventilator · 7.5 min", "আইসিইউ + ভেন্টিলেটর · ৭.৫ মিনিট") },
  { at: P.blood, label: c("DMCH blood bank", "ঢামেক ব্লাড ব্যাংক"), value: c("2× O− courier · 4.1 min", "২× O− কুরিয়ার · ৪.১ মিনিট") },
];

/** Camera keyframes: focus point (viewBox), zoom, and where that point sits on screen (fraction of stage from centre). */
type Key = { at: number; fx: number; fy: number; s: number; ox: number; oy: number };
const KEYS_WIDE: Key[] = [
  { at: 0, fx: 260, fy: 215, s: 1, ox: 0.15, oy: 0.03 },
  { at: 0.12, fx: 260, fy: 215, s: 1, ox: 0.15, oy: 0.03 },
  { at: 0.32, fx: 80, fy: 340, s: 1.6, ox: 0, oy: 0.06 },
  { at: 0.48, fx: 250, fy: 225, s: 0.95, ox: 0.13, oy: 0.03 },
  { at: 0.66, fx: 250, fy: 225, s: 0.95, ox: 0.13, oy: 0.03 },
  { at: 0.82, fx: 322, fy: 165, s: 1.45, ox: -0.1, oy: 0.12 },
  { at: 1, fx: 322, fy: 165, s: 1.55, ox: -0.1, oy: 0.12 },
];
const KEYS_NARROW: Key[] = [
  { at: 0, fx: 260, fy: 210, s: 1, ox: 0, oy: 0.12 },
  { at: 0.12, fx: 260, fy: 210, s: 1, ox: 0, oy: 0.12 },
  { at: 0.32, fx: 80, fy: 340, s: 1.7, ox: 0.08, oy: 0.05 },
  { at: 0.48, fx: 255, fy: 230, s: 1, ox: 0, oy: 0.14 },
  { at: 0.66, fx: 255, fy: 230, s: 1, ox: 0, oy: 0.14 },
  { at: 0.82, fx: 322, fy: 150, s: 1.5, ox: 0, oy: -0.02 },
  { at: 1, fx: 322, fy: 150, s: 1.6, ox: 0, oy: -0.02 },
];

const COPY = {
  chip: c("The Farmgate case", "ফার্মগেট কেস"),
  h1a: c("No single hospital", "কোনো একক হাসপাতাল"),
  h1b: c("could say yes.", "হ্যাঁ বলতে পারেনি।"),
  sub: c(
    "A mother bleeding after childbirth. Fifteen minutes to a public ICU with a ventilator and two units of O− blood. Scroll to watch ShasthoGrid solve it.",
    "প্রসবের পর রক্তক্ষরণে এক মা। ১৫ মিনিটের মধ্যে ভেন্টিলেটরসহ সরকারি আইসিইউ আর দুই ব্যাগ O− রক্ত দরকার। স্ক্রল করে দেখুন স্বাস্থ্যগ্রিড কীভাবে সমাধান করে।"
  ),
  caption: c("Simulated case · real solver output\nCareMatch + ConflictProof (A02)\nLockStep (A05)", "সিমুলেটেড কেস · আসল সলভার ফল\nCareMatch + ConflictProof (A02)\nLockStep (A05)"),
  hint: c("Scroll to follow the case", "কেসটি দেখতে স্ক্রল করুন"),
  visionChip: c("The rule clash", "নিয়মের সংঘর্ষ"),
  vision: [c("Bed, ventilator, blood,", "বেড, ভেন্টিলেটর, রক্ত,"), c("public, under 15 minutes —", "সরকারি, ১৫ মিনিটের মধ্যে —"), c("no hospital has all five.", "পাঁচটিই কোনো হাসপাতালে নেই।")],
  visionSub: c("CareMatch checks every rule at once with CP-SAT. When none can be met, it does not guess.", "CareMatch CP-SAT দিয়ে সব নিয়ম একসাথে যাচাই করে। কোনোটিই মেলানো না গেলে সে অনুমান করে না।"),
  acct: c(
    "ConflictProof names the exact rules that clash — then proposes a safe repair: an ICU bed at BMU and O− blood couriered from DMCH. Clinical rules are never relaxed.",
    "ConflictProof ঠিক কোন নিয়মগুলো সংঘর্ষে আছে তা দেখায় — তারপর নিরাপদ সমাধান দেয়: বিএমইউতে আইসিইউ বেড আর ঢামেক থেকে কুরিয়ারে O− রক্ত। ক্লিনিক্যাল নিয়ম কখনো শিথিল হয় না।"
  ),
  stLabel: c("✕ LockStep · A05", "✕ LockStep · A05"),
  stHead: c("Held together — or not at all.", "একসাথে ধরে রাখা — নয়তো কিছুই না।"),
  cardTitle: c("Hold for this patient", "এই রোগীর জন্য হোল্ড"),
  cardNote: c("BMU ICU · DMCH blood", "বিএমইউ আইসিইউ · ঢামেক রক্ত"),
  left: c("left", "বাকি"),
  held: c("3/3 held", "৩/৩ হোল্ড"),
  res: [c("ICU bed", "আইসিইউ বেড"), c("Ventilator", "ভেন্টিলেটর"), c("2× O− blood", "২× O− রক্ত")],
  rows: [
    c("Locks taken in one global order", "সব লক একটি নির্দিষ্ট ক্রমে"),
    c("10-minute hold, auto-expiry", "১০ মিনিটের হোল্ড, নিজে থেকে শেষ"),
    c("Idempotency-Key safe retries", "Idempotency-Key দিয়ে নিরাপদ রিট্রাই"),
    c("Hospital confirms in one tap", "হাসপাতাল এক ট্যাপে নিশ্চিত করে"),
    c("Every step audited with a trace ID", "প্রতিটি ধাপ ট্রেস আইডিসহ অডিটেড"),
  ],
  solChip: c("Try it live", "নিজে চালিয়ে দেখুন"),
  solHead: c("Run the same case yourself", "একই কেস নিজেই চালান"),
  solBody: c(
    "Every screen in this story is the real app. Open the dispatch console, fire 25 bookings at one bed, or confirm the hold as the hospital.",
    "এই গল্পের প্রতিটি স্ক্রিন আসল অ্যাপের। ডিসপ্যাচ কনসোল খুলুন, একটি বেডে ২৫টি বুকিং পাঠান, বা হাসপাতাল হিসেবে হোল্ড নিশ্চিত করুন।"
  ),
};

const CARDS: { href: string; img: string; label: Copy; title: Copy; body: Copy }[] = [
  {
    href: "/dispatch",
    img: "/story/dispatch.jpg",
    label: c("[Emergency dispatch]", "[জরুরি ডিসপ্যাচ]"),
    title: c("CareMatch &\nConflictProof", "CareMatch ও\nConflictProof"),
    body: c("Enter vitals or a Bangla note, see the exact rule clash and the safe repairs.", "ভাইটাল বা বাংলা নোট দিন, নিয়মের সংঘর্ষ আর নিরাপদ সমাধান দেখুন।"),
  },
  {
    href: "/race-lab",
    img: "/story/racelab.jpg",
    label: c("[Concurrency proof]", "[কনকারেন্সি প্রমাণ]"),
    title: c("RaceLab: 25 bookings,\none winner", "RaceLab: ২৫ বুকিং,\nএকজন বিজয়ী"),
    body: c("Fire simultaneous requests at the last ICU bed and watch the database refuse every double booking.", "শেষ আইসিইউ বেডে একসাথে অনুরোধ পাঠান, দেখুন ডাটাবেস প্রতিটি দ্বৈত বুকিং ফিরিয়ে দেয়।"),
  },
  {
    href: "/facility",
    img: "/story/facility.jpg",
    label: c("[Hospital desk]", "[হাসপাতাল ডেস্ক]"),
    title: c("FacilityDesk\nconfirms the hold", "FacilityDesk\nহোল্ড নিশ্চিত করে"),
    body: c("Hospitals keep beds and blood live and confirm incoming patients in one tap.", "হাসপাতাল বেড ও রক্ত লাইভ রাখে, আগত রোগী এক ট্যাপে নিশ্চিত করে।"),
  },
];

const STATS: { to: number; dec: number; label: Copy }[] = [
  { to: 171, dec: 0, label: c("Backend tests passing", "পাস করা ব্যাকএন্ড টেস্ট") },
  { to: 25, dec: 0, label: c("Simultaneous bookings fired", "একসাথে পাঠানো বুকিং") },
  { to: 24, dec: 0, label: c("Safely rejected · 0 double", "নিরাপদে প্রত্যাখ্যাত · ০ দ্বৈত") },
  { to: 46.2, dec: 1, label: c("ms CP-SAT solve, this case", "মি.সে. CP-SAT সমাধান, এই কেসে") },
];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function cameraAt(keys: Key[], p: number) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].at) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = ease(seg(p, a.at, b.at));
  const mix = (x: number, y: number) => x + (y - x) * t;
  return { fx: mix(a.fx, b.fx), fy: mix(a.fy, b.fy), s: mix(a.s, b.s), ox: mix(a.ox, b.ox), oy: mix(a.oy, b.oy) };
}

export default function StoryPage() {
  const { locale } = useI18n();
  const L = (copy: Copy) => copy[locale as "en" | "bn"] ?? copy.en;
  const storyRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLDivElement>(null);
  const solRef = useRef<HTMLElement>(null);

  // One rAF loop drives the whole story.
  useEffect(() => {
    const story = storyRef.current;
    const stage = stageRef.current;
    const cam = camRef.current;
    if (!story || !stage || !cam) return;
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const q = (s: string) => Array.from(stage.querySelectorAll<HTMLElement>(s));
    const one = (s: string) => stage.querySelector<HTMLElement>(s);
    const layer = (n: number) => one(`[data-layer="${n}"]`);
    const heroBlock = one("[data-hero]");
    const hud = one("[data-hud]");
    const early = q("[data-early]");
    const vWords = q("[data-vw]");
    const vSide = q("[data-vside]");
    const aWords = q("[data-aw]");
    const spots = q("[data-spot]");
    const fog = one("[data-fog]");
    const stHead = one("[data-st-head]");
    const stCard = one("[data-st-card]");
    const timer = one("[data-timer]");
    const checks = q("[data-check]");
    const holdBar = one("[data-holdbar]");
    const rows = q("[data-row]");
    const prog = one("[data-prog]");
    const header = document.querySelector<HTMLElement>("body header");
    let hb = -1;

    const vis = (el: HTMLElement | null, on: boolean) => {
      if (el) el.style.visibility = on ? "visible" : "hidden";
    };
    const blur = (px: number) => (rm || px < 0.05 ? "none" : `blur(${px.toFixed(2)}px)`);

    let sp = 0;
    let sx = 0;
    let sy = 0;
    let mx = 0;
    let my = 0;
    let last = performance.now();
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const frame = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      // Sit the stage just below the (sticky, translucent) site header, whose height changes on scroll.
      const nhb = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
      if (nhb !== hb) {
        hb = nhb;
        stage.style.top = `${hb}px`;
        stage.style.height = `calc(100svh - ${hb}px)`;
      }
      const r = story.getBoundingClientRect();
      const p = clamp((hb - r.top) / Math.max(1, story.offsetHeight - stage.clientHeight));
      if (rm) sp = p;
      else {
        sp += (p - sp) * (1 - Math.pow(0.86, dt / 16.7));
        if (Math.abs(p - sp) < 0.0002) sp = p;
      }
      if (rm) {
        sx = 0;
        sy = 0;
      } else {
        sx += (mx - sx) * 0.06;
        sy += (my - sy) * 0.06;
      }

      // ---- camera
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      const narrow = W < 821;
      const bw = narrow ? W * 1.15 : Math.max(W * 0.9, ((H * VB_W) / VB_H) * 0.95);
      const bh = (bw * VB_H) / VB_W;
      const k = cameraAt(narrow ? KEYS_NARROW : KEYS_WIDE, rm ? 0.5 : sp);
      const dx = (k.fx / VB_W - 0.5) * bw;
      const dy = (k.fy / VB_H - 0.5) * bh;
      const tx = k.ox * W - k.s * dx - sx * 18;
      const ty = k.oy * H - k.s * dy - sy * 12;
      cam.style.width = `${bw}px`;
      cam.style.height = `${bh}px`;
      cam.style.left = `${(W - bw) / 2}px`;
      cam.style.top = `${(H - bh) / 2}px`;
      cam.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) scale(${k.s.toFixed(4)})`;
      const project = (x: number, y: number) => [W / 2 + tx + k.s * (x / VB_W - 0.5) * bw, H / 2 + ty + k.s * (y / VB_H - 0.5) * bh];

      // ---- beat 1: hero
      const h = seg(sp, 0.02, 0.1);
      if (heroBlock) {
        heroBlock.style.transform = rm ? "none" : `translate3d(${-sx * 10}px,${-h * 80 - sy * 6}px,0) scale(${1 + h * 0.12})`;
        heroBlock.style.filter = blur(h * 14);
        heroBlock.style.opacity = String(1 - h);
      }
      if (hud) {
        const [hx, hy] = project(P.incident.x, P.incident.y);
        hud.style.transform = `translate3d(${(hx + 30 + sx * 26).toFixed(1)}px,${(hy - 96 + sy * 18 - h * 40).toFixed(1)}px,0)`;
        hud.style.opacity = String(1 - seg(sp, 0.02, 0.08));
      }
      early.forEach((el) => (el.style.opacity = String(1 - seg(sp, 0.01, 0.05))));
      vis(layer(0), h < 1);
      vis(layer(1), h < 1);

      // ---- beat 2: vision
      const vIn = seg(sp, 0.16, 0.27);
      const vOut = seg(sp, 0.34, 0.42);
      vWords.forEach((w, i) => {
        const kk = clamp(vIn * 1.6 - i * 0.08);
        w.style.transform = rm ? "none" : `translate3d(0,${(1 - kk) * 30 - vOut * 60}px,0)`;
        w.style.filter = blur((1 - kk) * 12 + vOut * 14);
        w.style.opacity = String(kk * (1 - vOut));
      });
      vSide.forEach((el) => {
        el.style.opacity = String(clamp(vIn * 2 - 0.6) * (1 - vOut));
        el.style.transform = rm ? "none" : `translateY(${-vOut * 50}px)`;
      });
      vis(layer(2), vIn > 0 && vOut < 1);

      // ---- fog bank
      const fg = ease(seg(sp, 0.38, 0.47)) * (1 - seg(sp, 0.66, 0.74));
      if (fog) {
        vis(fog, fg > 0);
        fog.style.opacity = String(fg);
        fog.style.transform = rm ? "none" : `translate3d(calc(${((ease(seg(sp, 0.38, 0.47)) - 1) * 18 - sx * 10).toFixed(2)}vw),${(-sy * 6).toFixed(1)}px,0)`;
      }

      // ---- beat 3: explanation + hotspots
      const aIn = seg(sp, 0.45, 0.55);
      const aOut = seg(sp, 0.63, 0.68);
      aWords.forEach((w, i) => {
        const kk = clamp(aIn * 2.2 - (i / aWords.length) * 1.2);
        w.style.opacity = String((0.15 + 0.85 * kk) * (1 - aOut));
        w.style.filter = blur((1 - kk) * 6 + aOut * 10);
      });
      spots.forEach((el, i) => {
        const kk = seg(sp, 0.49 + i * 0.02, 0.53 + i * 0.02) * (1 - aOut);
        const pt = SPOTS[i].at;
        const [px, py] = project(pt.x, pt.y);
        el.style.transform = `translate3d(${(px - 11 - sx * 30).toFixed(1)}px,${(py - 11 - sy * 20).toFixed(1)}px,0) scale(${kk.toFixed(3)})`;
        el.style.visibility = kk > 0.01 ? "visible" : "hidden";
      });
      vis(layer(3), aIn > 0 && aOut < 1);

      // ---- beat 4: LockStep
      const sIn = seg(sp, 0.72, 0.82);
      const cIn = ease(seg(sp, 0.74, 0.86));
      if (stHead) {
        stHead.style.opacity = String(sIn);
        stHead.style.transform = rm ? "none" : `translateY(${(1 - sIn) * 30}px)`;
        stHead.style.filter = blur((1 - sIn) * 8);
      }
      if (stCard) {
        stCard.style.opacity = String(cIn);
        stCard.style.transform = rm
          ? "none"
          : `translate3d(${-sx * 14}px,${(1 - cIn) * 60 - sy * 10}px,0) rotateY(${sx * 8}deg) rotateX(${-sy * 8}deg)`;
      }
      if (timer) {
        const secs = 600 - Math.round(19 * seg(sp, 0.78, 0.98));
        timer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      }
      checks.forEach((el, i) => {
        const kk = seg(sp, 0.77 + i * 0.03, 0.8 + i * 0.03);
        el.style.opacity = String(0.25 + 0.75 * kk);
        el.dataset.done = kk >= 1 ? "true" : "false";
      });
      if (holdBar) holdBar.style.transform = `scaleX(${seg(sp, 0.77, 0.86).toFixed(3)})`;
      rows.forEach((el, i) => {
        const kk = ease(seg(sp, 0.76 + i * 0.025, 0.82 + i * 0.025));
        el.style.opacity = String(kk);
        el.style.transform = rm ? "none" : `translateX(${(1 - kk) * 40}px)`;
      });
      vis(layer(4), sIn > 0);

      // focus pull: the map steps back (dims, softens) while copy sits on top of it
      const pull = Math.max(vIn * (1 - vOut) * 0.4, sIn * 0.55);
      cam.style.opacity = String(1 - pull);
      cam.style.filter = blur(pull * 3);

      if (prog) prog.style.transform = `scaleX(${sp.toFixed(4)})`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  // Count-up stats the first time the panel's top passes 60% of the viewport.
  useEffect(() => {
    const sol = solRef.current;
    if (!sol) return;
    const els = Array.from(sol.querySelectorAll<HTMLElement>("[data-stat]"));
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let done = false;
    const fmt = (n: number, dec: number) => n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const run = () => {
      if (done || sol.getBoundingClientRect().top > window.innerHeight * 0.6) return;
      done = true;
      window.removeEventListener("scroll", run);
      if (rm) return;
      const t0 = performance.now();
      const tick = (t: number) => {
        const e = ease(clamp((t - t0) / 1600));
        els.forEach((el, i) => (el.textContent = fmt(STATS[i].to * e, STATS[i].dec)));
        if (e < 1) raf = requestAnimationFrame(tick);
      };
      els.forEach((el) => (el.textContent = "0"));
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", run, { passive: true });
    run();
    return () => {
      window.removeEventListener("scroll", run);
      cancelAnimationFrame(raf);
    };
  }, []);

  const tilt = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1000px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
  };
  const untilt = (e: React.PointerEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.transform = "";
  };

  const words = (text: string, attr: "data-vw" | "data-aw") =>
    text.split(" ").map((w, i) => (
      <span key={i} {...{ [attr]: "" }} className="inline-block will-change-[transform,opacity,filter]">
        {w}&nbsp;
      </span>
    ));

  return (
    <div style={{ marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)" }} className="-mt-6">
      <h1 className="sr-only">{`${L(COPY.chip)}: ${L(COPY.h1a)} ${L(COPY.h1b)}`}</h1>
      <section ref={storyRef} aria-label={L(COPY.chip)} className="relative" style={{ height: "640vh" }}>
        <div ref={stageRef} className="st-stage">
          {/* camera box with the live map */}
          <div ref={camRef} className="st-cam" aria-hidden="true">
            <CareNetworkIllustration />
          </div>
          {/* left readability scrim */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[55vw] bg-gradient-to-r from-[#041319]/85 via-[#041319]/40 to-transparent max-[820px]:hidden" />

          <div data-fog="" className="st-fog" aria-hidden="true">
            <i className="f0" />
            <i className="f1" />
            <i className="f2" />
          </div>

          {/* L0 — hero headline */}
          <div data-layer="0" className="st-layer">
            <div data-hero="" className="absolute top-[22vh] left-[34px] max-w-[min(620px,88vw)] will-change-transform max-[820px]:top-[16vh] max-[820px]:left-[18px]">
              <span className="st-chip">{L(COPY.chip)}</span>
              <p aria-hidden="true" lang={locale} className="st-shadow mt-4 text-[clamp(40px,5.4vw,84px)] leading-[0.95] font-semibold tracking-[-0.045em] text-white">
                <span className="st-line"><span>{L(COPY.h1a)}</span></span>
                <span className="st-line"><span className="text-[#5EEAD4]">{L(COPY.h1b)}</span></span>
              </p>
              <p lang={locale} className="st-shadow mt-5 max-w-md text-[15px] leading-relaxed text-[#cfe9e6]">{L(COPY.sub)}</p>
            </div>
          </div>

          {/* L1 — HUD on the incident, caption, scroll hint */}
          <div data-layer="1" className="st-layer">
            <div data-hud="" className="absolute top-0 left-0 will-change-transform max-[820px]:hidden">
              <span aria-hidden="true" className="absolute top-[4px] -left-[44px] h-[22px] w-[22px] before:absolute before:top-1/2 before:left-0 before:h-px before:w-full before:bg-white after:absolute after:top-0 after:left-1/2 after:h-full after:w-px after:bg-white" />
              <span className="st-chip !bg-[#FB7185] !text-[#3b0a14]">NEWS2 15</span>
              <pre className="st-mono relative mt-3 text-[11px] leading-[1.65] tracking-[0.12em] text-white [text-shadow:0_1px_6px_rgba(0,0,0,.5)]">
                <span aria-hidden="true" className="st-hud-frame" />
                {"FARMGATE · DHAKA\nLAT  23.76° N\nLON  90.39° E"}
              </pre>
            </div>
            <p data-early="" className="st-mono absolute bottom-[34px] left-[34px] border-l-2 border-[#5EEAD4] pl-4 text-[11px] leading-[1.75] tracking-[0.13em] whitespace-pre-line text-[#b9d6d2] max-[820px]:right-[18px] max-[820px]:bottom-[70px] max-[820px]:left-[18px]">
              {L(COPY.caption)}
            </p>
            <div data-early="" className="st-mono absolute right-[34px] bottom-[36px] flex items-center gap-3 text-[11px] tracking-[0.16em] text-[#b9d6d2] max-[820px]:right-[18px] max-[820px]:bottom-[24px]">
              <span className="st-hint-ico" aria-hidden="true" />
              {L(COPY.hint)}
            </div>
          </div>

          {/* L2 — the rule clash */}
          <div data-layer="2" className="st-layer" style={{ visibility: "hidden" }}>
            <div className="absolute top-1/2 left-1/2 w-[min(860px,90vw)] -translate-x-1/2 -translate-y-1/2 text-center">
              <span data-vside="" className="st-chip">{L(COPY.visionChip)}</span>
              <h2 lang={locale} className="st-shadow mt-[18px] mb-5 text-[clamp(30px,4.4vw,66px)] leading-[1.02] font-semibold tracking-[-0.04em] text-white">
                {COPY.vision.map((line, li) => (
                  <React.Fragment key={li}>
                    {words(L(line), "data-vw")}
                    <br />
                  </React.Fragment>
                ))}
              </h2>
              <p data-vside="" lang={locale} className="st-shadow mx-auto max-w-xl text-base leading-[1.45] text-[#d7efec]">{L(COPY.visionSub)}</p>
            </div>
          </div>

          {/* L3 — explanation + hotspots */}
          <div data-layer="3" className="st-layer" style={{ visibility: "hidden" }}>
            <p lang={locale} className="st-shadow absolute top-[18vh] left-[34px] w-[min(540px,86vw)] text-[clamp(20px,1.9vw,29px)] leading-[1.2] tracking-[-0.02em] text-white max-[820px]:top-[12vh] max-[820px]:left-[18px]">
              {words(L(COPY.acct), "data-aw")}
            </p>
            {SPOTS.map((s, i) => (
              <button
                key={i}
                type="button"
                data-spot=""
                data-tone={s.tone}
                data-on="false"
                aria-label={`${L(s.label)}: ${L(s.value)}`}
                onClick={(e) => {
                  const me = e.currentTarget;
                  const on = me.dataset.on !== "true";
                  me.parentElement?.querySelectorAll<HTMLElement>("[data-spot]").forEach((x) => (x.dataset.on = "false"));
                  me.dataset.on = on ? "true" : "false";
                }}
                className="st-spot"
                style={{ visibility: "hidden" }}
              >
                <span className="st-spot-dot" aria-hidden="true" />
                <span className="st-spot-label st-mono text-left" aria-hidden="true">
                  {L(s.label)}
                  <em className="st-mono">{L(s.value)}</em>
                </span>
              </button>
            ))}
          </div>

          {/* L4 — LockStep */}
          <div data-layer="4" className="st-layer" style={{ visibility: "hidden" }}>
            <div data-st-head="" className="absolute top-[18vh] left-[34px] max-w-[400px] max-[820px]:top-[12vh] max-[820px]:left-[18px] max-[820px]:max-w-[80vw]">
              <span className="st-chip flex w-max">{L(COPY.stLabel)}</span>
              <h2 lang={locale} className="st-shadow mt-3 text-[clamp(24px,2.3vw,34px)] leading-[1.08] font-semibold tracking-[-0.025em] text-white">{L(COPY.stHead)}</h2>
            </div>

            <div
              data-st-card=""
              className="absolute top-[40vh] left-[36%] w-[260px] rounded-[12px] border border-white/20 bg-[#0b2f3a]/45 p-[18px] text-white backdrop-blur-[16px] backdrop-saturate-[1.2] max-[820px]:top-auto max-[820px]:bottom-[6vh] max-[820px]:left-[18px] max-[820px]:w-[210px]"
            >
              <h3 className="text-[15px] leading-tight font-medium">{L(COPY.cardTitle)}</h3>
              <p className="st-mono mt-1 text-[9.5px] opacity-70">{L(COPY.cardNote)}</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span data-timer="" className="text-[44px] leading-none font-medium tracking-[-0.04em] tabular-nums">10:00</span>
                <span className="st-mono text-[10px] opacity-80">{L(COPY.left)}</span>
              </div>
              <span className="st-chip absolute top-[18px] right-[16px]">{L(COPY.held)}</span>
              <div className="mt-3 h-[3px] overflow-hidden rounded bg-white/15">
                <div data-holdbar="" className="h-full origin-left bg-[#5EEAD4]" style={{ transform: "scaleX(0)" }} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {COPY.res.map((r, i) => (
                  <li key={i} data-check="" className="group flex items-center gap-2 text-[13px]">
                    <span aria-hidden="true" className="grid h-4 w-4 place-items-center rounded-full border border-[#5EEAD4] text-[10px] text-[#04211f] group-data-[done=true]:bg-[#5EEAD4]">✓</span>
                    {L(r)}
                  </li>
                ))}
              </ul>
            </div>

            <ol className="absolute top-[34vh] right-[34px] w-[min(400px,36vw)] rounded-[12px] border border-white/12 bg-[#041a22]/55 px-4 py-1.5 text-[#e6fffa] backdrop-blur-[14px] max-[820px]:top-auto max-[820px]:right-[18px] max-[820px]:bottom-[6vh] max-[820px]:w-[45vw]">
              {COPY.rows.map((row, i) => (
                <li key={i} data-row="" className="st-row st-mono max-[820px]:!grid-cols-[22px_1fr] max-[820px]:text-[9.5px]">
                  <span className="opacity-60">{String(i + 1).padStart(2, "0")}</span>
                  <span>{L(row)}</span>
                  <b aria-hidden="true" className="max-[820px]:hidden">→</b>
                </li>
              ))}
            </ol>
          </div>

          <div aria-hidden="true" className="absolute bottom-[22px] left-1/2 h-[2px] w-[120px] -translate-x-1/2 overflow-hidden rounded-sm bg-white/20">
            <div data-prog="" className="h-full origin-left bg-[#5EEAD4]" style={{ transform: "scaleX(0)" }} />
          </div>
        </div>
      </section>

      {/* beat 5 — try it live */}
      <section
        ref={solRef}
        aria-labelledby="story-sol-title"
        className="relative z-[5] rounded-t-[22px] bg-surface px-[34px] pt-[70px] pb-[90px] text-ink shadow-[0_-30px_60px_rgba(4,19,25,.25)] max-[820px]:px-[18px] max-[820px]:pt-[50px] max-[820px]:pb-[70px]"
        style={{ marginTop: "-30vh" }}
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-10">
            <div>
              <span className="st-chip">{L(COPY.solChip)}</span>
              <h2 id="story-sol-title" lang={locale} className="mt-5 max-w-[640px] text-[clamp(32px,3.9vw,56px)] leading-none font-semibold tracking-[-0.04em]">
                {L(COPY.solHead)}
              </h2>
            </div>
            <p lang={locale} className="max-w-[380px] text-[15px] leading-relaxed text-ink-2">{L(COPY.solBody)}</p>
          </div>

          <div className="mt-[54px] grid grid-cols-1 gap-[14px] md:grid-cols-3">
            {CARDS.map((card) => (
              <Link key={card.href} href={card.href} onPointerMove={tilt} onPointerLeave={untilt} className="st-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand max-[820px]:h-[340px]">
                <span aria-hidden="true" className="st-card-bg" style={{ backgroundImage: `url(${card.img})` }} />
                <span aria-hidden="true" className="st-card-ov" />
                <span className="absolute inset-x-[18px] top-[18px] flex items-center justify-between">
                  <span className="st-mono text-[11px] text-white/85">{L(card.label)}</span>
                  <span className="st-card-go" aria-hidden="true">→</span>
                </span>
                <span className="absolute inset-x-[18px] bottom-[18px] block">
                  <span lang={locale} className="block text-[25px] leading-[1.05] font-medium tracking-[-0.03em] whitespace-pre-line">{L(card.title)}</span>
                  <span lang={locale} className="st-card-body mt-2 block text-[13.5px] leading-snug text-white/85">{L(card.body)}</span>
                </span>
              </Link>
            ))}
          </div>

          <dl className="mt-[60px] grid grid-cols-2 border-t border-line md:grid-cols-4">
            {STATS.map((s, i) => (
              <div key={i} className="pt-[22px] pr-4">
                <dt className="st-mono order-2 mt-1 text-[10.5px] text-ink-3">{L(s.label)}</dt>
                <dd data-stat="" className="text-[44px] leading-none font-medium tracking-[-0.04em] tabular-nums">
                  {s.to.toLocaleString("en-US", { minimumFractionDigits: s.dec, maximumFractionDigits: s.dec })}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
