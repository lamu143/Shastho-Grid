import React from "react";
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame } from "remotion";
import { AppWindow, Card, EcgLine, SceneFrame, TitleBlock, usePop } from "./components";
import { Person, Sathi } from "./characters";
import { C } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/* ---------------------------------------------------- 9. Feature tour ---- */
const TOUR = [
  { src: "ss/40-facility-desk.png", name: "FacilityDesk", line: "Hospitals update live bed counts and confirm incoming patients in one tap.", c: C.sky },
  { src: "ss/42-blood-officer.png", name: "Blood-bank desk", line: "Blood banks keep stock and expiry live; every number shows its source and age.", c: C.red },
  { src: "ss/30-insights.png", name: "StewardLens · critical care", line: "ICU occupancy, unstaffed beds, blood scarcity and hold outcomes at a glance.", c: C.mint },
  { src: "ss/52-freshstock.png", name: "FreshStock", line: "FEFO pharmacy inventory: the earliest-expiring lot is dispensed first.", c: C.teal },
  { src: "ss/53-syncsafe.png", name: "SyncSafe", line: "Works without internet; on reconnect, conflicts are reviewed — never silently overwritten.", c: C.sky },
  { src: "ss/54-stewardlens-aware.png", name: "StewardLens · AWaRe", line: "Tracks the WHO target: at least 60% of antibiotics from the Access group.", c: C.green },
  { src: "ss/07-sathi-drawer.png", name: "Shastho Sathi", line: "A bilingual guide with a natural Bangla voice — it explains every feature.", c: C.lilac },
  { src: "ss/32-radar.png", name: "CareRadar", line: "Nearby pharmacies, ICUs and blood banks on a 3D map with turn-by-turn navigation.", c: C.amber },
  { src: "ss/06-theme-aurora.png", name: "Themes & bilingual UI", line: "Clinic light, Aurora, Ocean night and Night shift — in English and বাংলা.", c: C.peach },
  { src: "ss/60-admin.png", name: "Admin & audit", line: "Users, clinics, guidelines and a full audit trail with trace IDs.", c: C.ink2 },
];
const PER = 96;
export const FeatureTour: React.FC = () => (
  <SceneFrame cues={TOUR.map((t, i) => ({ from: i * PER + 6, to: (i + 1) * PER, text: `${t.name} — ${t.line}` }))}>
    {TOUR.map((t, i) => (
      <Sequence key={t.src} from={i * PER} durationInFrames={PER}>
        <TourSlide t={t} />
      </Sequence>
    ))}
  </SceneFrame>
);
const TourSlide: React.FC<{ t: (typeof TOUR)[number] }> = ({ t }) => {
  const f = useCurrentFrame();
  const tag = spring({ frame: f - 4, fps: 30, config: { damping: 15 } });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 130 }}>
      <div style={{ position: "absolute", top: 54, left: 140, display: "flex", alignItems: "center", gap: 16, opacity: tag, translate: `${(1 - tag) * -30}px 0` }}>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: t.c, boxShadow: `0 0 18px ${t.c}` }} />
        <span style={{ fontSize: 40, fontWeight: 900, color: C.ink }}>{t.name}</span>
      </div>
      <AppWindow src={t.src} title={t.name} width={1220} durationInFrames={PER} zoomFrom={1.02} zoomTo={1.1} focusX={50} focusY={30} />
    </AbsoluteFill>
  );
};

/* --------------------------------------------------- 10. User journeys ---- */
const ROLES = [
  { who: "Dispatcher", badge: "DISPATCH", color: C.sky, skin: 1, hair: "short" as const, path: ["Paramedic note", "CareMatch", "Approve & lock"] },
  { who: "Hospital admin", badge: "ICU", color: C.teal, skin: 2, hair: "hijab" as const, path: ["Update beds", "Confirm hold", "Patient arrived"] },
  { who: "Blood-bank officer", badge: "BLOOD", color: C.red, skin: 0, hair: "long" as const, path: ["Update stock", "Feed key", "See courier holds"] },
  { who: "Pharmacist", badge: "RX", color: C.green, skin: 3, hair: "short" as const, path: ["RxSolve", "Approve Watch", "StewardLens"] },
  { who: "Dispenser", badge: "CLINIC", color: C.amber, skin: 1, hair: "hijab" as const, path: ["Register patient", "Work offline", "Sync safely"] },
  { who: "Auditor · Admin", badge: "AUDIT", color: C.lilac, skin: 2, hair: "long" as const, path: ["Read-only review", "Audit trail", "Manage users"] },
];
export const Journeys: React.FC = () => (
  <SceneFrame cues={[
    { from: 10, to: 200, text: "Every role gets its own journey — and only sees what it is allowed to touch." },
    { from: 200, to: 400, text: "Dispatchers book. Hospitals confirm. Blood banks supply. Pharmacists approve. Clinics work offline." },
    { from: 400, to: 600, text: "Auditors review everything — every decision is logged with a trace ID." },
  ]}>
    <AbsoluteFill style={{ padding: "100px 120px", gap: 30 }}>
      <TitleBlock kicker="User journeys" title="Seven roles, one safe system" align="left" size={84} kickerColor={C.peach} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 22, marginTop: 10 }}>
        {ROLES.map((r, i) => <RoleCol key={r.who} r={r} delay={30 + i * 22} />)}
      </div>
    </AbsoluteFill>
  </SceneFrame>
);
const RoleCol: React.FC<{ r: (typeof ROLES)[number]; delay: number }> = ({ r, delay }) => {
  const f = useCurrentFrame();
  const p = usePop(delay);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: p }}>
      <Person color={r.color} skin={r.skin} hair={r.hair} badge={r.badge} enter={delay} wave={f - delay < 50} size={190} />
      <div style={{ marginTop: 4, fontSize: 30, fontWeight: 900, color: C.ink, textAlign: "center" }}>{r.who}</div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        {r.path.map((s, j) => {
          const q = spring({ frame: f - delay - 30 - j * 14, fps: 30, config: { damping: 15 } });
          return (
            <div key={s} style={{ opacity: q, translate: `0 ${(1 - q) * 16}px`, padding: "12px 14px", borderRadius: 16, background: `${r.color}1f`, border: `2px solid ${r.color}66`, color: C.ink, fontSize: 23, fontWeight: 700, textAlign: "center" }}>
              {j + 1}. {s}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------ 11. Architecture & trust ---- */
export const Architecture: React.FC = () => {
  const f = useCurrentFrame();
  const box = (label: string, sub: string, color: string, delay: number, style: React.CSSProperties = {}) => {
    const p = spring({ frame: f - delay, fps: 30, config: { damping: 14 } });
    return (
      <div style={{ opacity: p, scale: String(0.85 + 0.15 * p), padding: "22px 26px", borderRadius: 22, background: `${color}18`, border: `3px solid ${color}`, textAlign: "center", ...style }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: C.ink }}>{label}</div>
        <div style={{ marginTop: 6, fontSize: 22, color: C.ink2 }}>{sub}</div>
      </div>
    );
  };
  const stat = (n: string, l: string, delay: number, color: string) => {
    const p = spring({ frame: f - delay, fps: 30, config: { damping: 14 } });
    return (
      <Card accent={color} style={{ opacity: p, translate: `0 ${(1 - p) * 30}px`, padding: 18, textAlign: "center" }}>
        <div style={{ fontSize: 58, fontWeight: 900, color }}>{n}</div>
        <div style={{ fontSize: 24, color: C.ink2, fontWeight: 600 }}>{l}</div>
      </Card>
    );
  };
  return (
    <SceneFrame hue="blue" cues={[
      { from: 10, to: 190, text: "Under the hood: an offline-first Next.js PWA on Vercel, a FastAPI backend on Railway, CP-SAT solvers, PostgreSQL and Redis." },
      { from: 190, to: 390, text: "AI is guarded: de-identified input, injection screening, and a deterministic fallback when AI is unavailable." },
    ]}>
      <AbsoluteFill style={{ padding: "64px 140px", gap: 30 }}>
        <TitleBlock kicker="Architecture & trust" title="Built to be trusted" align="left" size={72} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 30, alignItems: "center" }}>
          {box("Next.js 16 PWA", "Offline-first · EN/বাংলা · Vercel", C.sky, 20)}
          <div style={{ display: "grid", gap: 16 }}>
            {box("FastAPI · Python 3.12", "JWT + RBAC · rate limits · audit · Railway", C.mint, 40)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              {box("CP-SAT", "RxSolve · CareMatch", C.green, 60)}
              {box("LockStep", "Row locks · idempotency", C.lilac, 72)}
              {box("AI guard", "Gemini → deterministic", C.peach, 84)}
            </div>
          </div>
          <div style={{ display: "grid", gap: 16 }}>
            {box("PostgreSQL 16", "Source of truth", C.blue, 100)}
            {box("Redis", "Rate limiting", C.red, 112)}
            {box("Hospital feeds", "Scoped API keys", C.amber, 124)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 26, opacity: interpolate(f, [150, 170], [0, 1], clamp) }}>
          {stat("174", "backend tests passing", 160, C.green)}
          {stat("25 → 1", "bookings → one winner", 172, C.lilac)}
          {stat("46 ms", "CP-SAT solve, real case", 184, C.sky)}
          {stat("2", "languages · 4 themes", 196, C.peach)}
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

/* --------------------------------------------------------- 12. Close ---- */
export const Close: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <SceneFrame cues={[
      { from: 20, to: 140, text: "ShasthoGrid — provably safe care, from the pharmacy counter to the ICU bed." },
      { from: 140, to: 270, text: "Try it live at shasthogrid.vercel.app — sign in with a demo account, no setup needed." },
    ]}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 34 }}>
        <div style={{ position: "absolute", top: 250, opacity: 0.6 }}><EcgLine start={0} dur={70} /></div>
        <TitleBlock kicker="Code-ArenaX · Hack the Vibe 2026" title={<>Shastho<span style={{ color: C.mint }}>Grid</span></>} sub="Advanced Challenges A02 + A05 · Built for Bangladesh" size={150} />
        <div style={{ display: "flex", gap: 20, opacity: interpolate(f, [60, 80], [0, 1], clamp) }}>
          {["RxSolve", "CareMatch", "ConflictProof", "LockStep", "RaceLab", "FacilityDesk", "PulseScore", "Shastho Sathi"].map((n) => (
            <span key={n} style={{ padding: "10px 20px", borderRadius: 999, border: `2px solid ${C.mint}55`, color: C.mint, fontSize: 26, fontWeight: 800 }}>{n}</span>
          ))}
        </div>
        <div style={{ opacity: interpolate(f, [95, 120], [0, 1], clamp), translate: `0 ${interpolate(f, [95, 120], [16, 0], clamp)}px`, display: "flex", alignItems: "center", gap: 16, padding: "16px 30px", borderRadius: 999, background: C.mint, color: "#04211f", fontSize: 38, fontWeight: 900, boxShadow: `0 0 50px ${C.mint}66` }}>
          <span>▶</span> Try it live · shasthogrid.vercel.app
        </div>
        <div style={{ position: "absolute", right: 150, top: 70 }}>
          <Sathi size={130} enter={30} say="Thank you! ধন্যবাদ!" sayFrom={60} sayTo={260} bubbleSide="left" />
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
