import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Card, CountUp, EcgLine, SceneFrame, TitleBlock, usePop } from "./components";
import { Sathi } from "./characters";
import { C } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/* ------------------------------------------------------------ 1. Intro ---- */
export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: f - 34, fps, config: { damping: 14 } });
  return (
    <SceneFrame cues={[{ from: 60, to: 180, text: "Safe care, proven at every step — from the pharmacy counter to the ICU bed." }]}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ position: "absolute", top: 300, opacity: interpolate(f, [0, 10, 150, 180], [0, 1, 1, 0.4], clamp) }}>
          <EcgLine start={0} dur={60} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 36, scale: String(logo), marginTop: 120 }}>
          <div style={{ width: 150, height: 150, borderRadius: 36, background: "linear-gradient(135deg,#0D9488,#0B6E73 50%,#0C4A6E)", boxShadow: "0 30px 80px rgba(13,148,136,0.45), inset 0 1px 0 rgba(255,255,255,0.3)", display: "grid", placeItems: "center", overflow: "hidden" }}>
            <svg width="120" height="80" viewBox="0 0 120 80"><path d="M4 44 H34 Q40 34 46 44 H52 L56 50 L62 8 L68 66 L74 44 H86 Q94 30 102 44 H116" fill="none" stroke="#ECFEFF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 8px #5EF2C9)" }} /></svg>
          </div>
          <div style={{ fontSize: 150, fontWeight: 900, letterSpacing: "-0.05em", color: C.ink }}>
            Shastho<span style={{ color: C.mint }}>Grid</span>
          </div>
        </div>
        <div style={{ marginTop: 34, fontSize: 46, fontWeight: 600, color: C.ink2, opacity: interpolate(f, [60, 85], [0, 1], clamp) }}>
          স্বাস্থ্যগ্রিড · Antibiotic safety + critical-care dispatch, in one grid
        </div>
        <div style={{ position: "absolute", right: 150, bottom: 170 }}>
          <Sathi size={150} enter={90} say="Hi! I'm Sathi. Let me show you around." sayFrom={100} sayTo={178} bubbleSide="left" />
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

/* ---------------------------------------------------------- 2. Problem ---- */
const STATS = [
  { to: 92.4, dec: 1, suffix: "%", label: "of surveyed pharmacy staff in Bangladesh dispense antibiotics without a prescription", src: "PMC12778233", color: C.amber },
  { to: 50, dec: 0, prefix: "~", suffix: "%", label: "of public ICU beds in Bangladesh sit idle for lack of staff", src: "New Age, Apr 2026", color: C.red },
  { to: 74.5, dec: 1, suffix: "%", label: "of maternal & perinatal deaths in an LMIC cohort involved 2+ referrals", src: "J Glob Health 2026", color: C.lilac },
  { to: 60, dec: 0, prefix: "≥", suffix: "%", label: "WHO target: share of antibiotic use from the Access group", src: "WHO AWaRe", color: C.mint },
];
export const Problem: React.FC = () => (
  <SceneFrame hue="red" cues={[
    { from: 10, to: 120, text: "Two crises meet in Bangladesh's frontline care." },
    { from: 120, to: 230, text: "Antibiotics are sold without prescriptions — fuelling resistance." },
    { from: 230, to: 330, text: "And critically ill patients are bounced between hospitals while beds sit idle." },
  ]}>
    <AbsoluteFill style={{ padding: "120px 140px", gap: 60 }}>
      <TitleBlock kicker="The problem" title="Why this matters" align="left" size={96} kickerColor={C.red} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 30 }}>
        {STATS.map((s, i) => <Stat key={s.src} s={s} delay={20 + i * 14} />)}
      </div>
    </AbsoluteFill>
  </SceneFrame>
);
const Stat: React.FC<{ s: (typeof STATS)[number]; delay: number }> = ({ s, delay }) => {
  const p = usePop(delay);
  return (
    <Card accent={s.color} style={{ opacity: p, translate: `0 ${(1 - p) * 40}px`, minHeight: 360, display: "flex", flexDirection: "column", gap: 18 }}>
      <CountUp to={s.to} decimals={s.dec} prefix={s.prefix} suffix={s.suffix} start={delay} dur={45} style={{ fontSize: 100, fontWeight: 900, color: s.color, letterSpacing: "-0.04em" }} />
      <div style={{ fontSize: 31, lineHeight: 1.35, color: C.ink, fontWeight: 600 }}>{s.label}</div>
      <div style={{ marginTop: "auto", fontSize: 22, color: C.ink3, fontWeight: 700, letterSpacing: "0.06em" }}>{s.src}</div>
    </Card>
  );
};

/* ------------------------------------------------------------- 3. Idea ---- */
export const Idea: React.FC = () => {
  const f = useCurrentFrame();
  const merge = interpolate(f, [120, 170], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const pillar = (title: string, body: string, color: string, names: string[], side: -1 | 1, delay: number) => {
    const p = usePop(delay);
    return (
      <Card accent={color} style={{ width: 720, opacity: p, translate: `${side * (1 - p) * 120 + side * -merge * 40}px 0`, rotate: `${side * (1 - merge) * 2}deg` }}>
        <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: "0.12em", textTransform: "uppercase" }}>{side < 0 ? "Clinic counter" : "Emergency & ICU"}</div>
        <div style={{ marginTop: 10, fontSize: 56, fontWeight: 900, color: C.ink, letterSpacing: "-0.03em" }}>{title}</div>
        <div style={{ marginTop: 14, fontSize: 30, lineHeight: 1.4, color: C.ink2 }}>{body}</div>
        <div style={{ marginTop: 22, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {names.map((n) => <span key={n} style={{ padding: "8px 18px", borderRadius: 999, border: `2px solid ${color}66`, color, fontSize: 24, fontWeight: 800 }}>{n}</span>)}
        </div>
      </Card>
    );
  };
  return (
    <SceneFrame cues={[
      { from: 10, to: 125, text: "ShasthoGrid solves both with one engine: provable constraint solving." },
      { from: 125, to: 240, text: "One grid. Every decision explained. Every booking safe." },
    ]}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 50 }}>
        <TitleBlock kicker="The idea" title={<>Two crises, <span style={{ color: C.mint }}>one grid</span></>} size={100} />
        <div style={{ display: "flex", gap: 40 }}>
          {pillar("Antibiotic stewardship", "Pick the safest stocked Access antibiotic, refuse antibiotics for mild viral illness, dispense earliest-expiring stock first.", C.green, ["RxSolve", "FreshStock", "StewardLens"], -1, 30)}
          {pillar("Critical-care allocation", "Find a staffed ICU bed, ventilator and compatible blood in the golden hour — then book it so it can never be double-sold.", C.sky, ["PulseScore", "CareMatch", "LockStep"], 1, 44)}
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

/* --------------------------------------------------------- 4. Workflow ---- */
type Step = { t: string; s: string; color: string };
const CC: Step[] = [
  { t: "Intake", s: "Vitals or a Bangla / English note", color: C.ink2 },
  { t: "PulseScore", s: "NEWS2 acuity", color: C.red },
  { t: "CareMatch", s: "CP-SAT picks the best hospital", color: C.sky },
  { t: "ConflictProof", s: "If impossible: why + safe repairs", color: C.amber },
  { t: "Clinician approves", s: "Human in the loop", color: C.ink },
  { t: "LockStep", s: "Bed + vent + blood held atomically", color: C.lilac },
  { t: "FacilityDesk", s: "Hospital confirms · patient admitted", color: C.mint },
];
const RX: Step[] = [
  { t: "Patient & syndrome", s: "Allergies · pregnancy · kidney", color: C.ink2 },
  { t: "RxSolve", s: "CP-SAT: safest Access antibiotic", color: C.green },
  { t: "Pharmacist gate", s: "Watch / Reserve need approval", color: C.amber },
  { t: "FreshStock", s: "Earliest-expiring lot first", color: C.teal },
  { t: "SyncSafe", s: "Works offline, merges safely", color: C.sky },
  { t: "StewardLens", s: "WHO ≥ 60% Access KPI", color: C.mint },
];
const Lane: React.FC<{ steps: Step[]; start: number; label: string; color: string }> = ({ steps, start, label, color }) => {
  const f = useCurrentFrame();
  const w = 1640 / steps.length;
  return (
    <div style={{ position: "relative", width: 1640 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 18 }}>{label}</div>
      <svg width={1640} height={8} style={{ position: "absolute", top: 90, left: 0 }}>
        <line x1={w / 2} y1={4} x2={1640 - w / 2} y2={4} stroke={color} strokeOpacity={0.25} strokeWidth={6} strokeLinecap="round" />
        <line x1={w / 2} y1={4} x2={w / 2 + interpolate(f, [start, start + steps.length * 22], [0, 1640 - w], clamp)} y2={4} stroke={color} strokeWidth={6} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      </svg>
      <div style={{ display: "flex" }}>
        {steps.map((s, i) => {
          const d = start + i * 22;
          const p = spring({ frame: f - d, fps: 30, config: { damping: 13, stiffness: 120 } });
          return (
            <div key={s.t} style={{ width: w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", opacity: p, translate: `0 ${(1 - p) * 30}px` }}>
              <div style={{ width: 80, height: 80, borderRadius: 40, background: `${s.color}22`, border: `4px solid ${s.color}`, display: "grid", placeItems: "center", fontSize: 34, fontWeight: 900, color: s.color, boxShadow: `0 0 30px ${s.color}55`, marginTop: 12 }}>{i + 1}</div>
              <div style={{ marginTop: 12, fontSize: 29, fontWeight: 800, color: C.ink }}>{s.t}</div>
              <div style={{ marginTop: 6, fontSize: 22, lineHeight: 1.3, color: C.ink2, maxWidth: w - 20 }}>{s.s}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export const Workflow: React.FC = () => (
  <SceneFrame cues={[
    { from: 10, to: 160, text: "How it works — the emergency lane: from a paramedic's note to a locked ICU bed." },
    { from: 160, to: 320, text: "If no hospital can meet every rule, ConflictProof says exactly why — and offers safe repairs." },
    { from: 320, to: 480, text: "The clinic lane: RxSolve picks the safest antibiotic, FreshStock dispenses, StewardLens tracks the WHO target." },
  ]}>
    <AbsoluteFill style={{ padding: "64px 140px", gap: 26 }}>
      <TitleBlock kicker="How it works" title="One workflow, two lanes" align="left" size={70} />
      <Lane steps={CC} start={20} label="Emergency lane · critical care" color={C.sky} />
      <Lane steps={RX} start={190} label="Clinic lane · antibiotic stewardship" color={C.green} />
    </AbsoluteFill>
  </SceneFrame>
);
