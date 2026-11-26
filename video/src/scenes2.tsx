import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame } from "remotion";
import { AppWindow, Card, SceneFrame, TitleBlock, usePop } from "./components";
import { Sathi } from "./characters";
import { C } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const ChallengeTag: React.FC<{ code: string; name: string; color: string }> = ({ code, name, color }) => {
  const p = usePop(0);
  return (
    <div style={{ position: "absolute", top: 60, left: 140, display: "flex", alignItems: "center", gap: 18, opacity: p, translate: `${(1 - p) * -40}px 0` }}>
      <span style={{ padding: "10px 22px", borderRadius: 14, background: color, color: "#04131A", fontSize: 34, fontWeight: 900 }}>{code}</span>
      <span style={{ fontSize: 34, fontWeight: 800, color: C.ink }}>{name}</span>
    </div>
  );
};

const Shot: React.FC<{ src: string; dur: number; title: string; callouts?: Parameters<typeof AppWindow>[0]["callouts"]; focusX?: number; focusY?: number; zoomTo?: number }> = ({ src, dur, title, callouts, focusX, focusY, zoomTo }) => (
  <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 124 }}>
    <AppWindow src={src} title={title} width={1260} durationInFrames={dur} callouts={callouts} focusX={focusX} focusY={focusY} zoomTo={zoomTo} />
  </AbsoluteFill>
);

/* ------------------------------------------------ 5. Advanced Challenge A02 ---- */
export const ChallengeA02: React.FC = () => (
  <SceneFrame hue="blue" cues={[
    { from: 10, to: 120, text: "Advanced Challenge A02 — constraint-based decision making." },
    { from: 120, to: 250, text: "CareMatch turns a patient's needs into hard constraints and solves them with Google OR-Tools CP-SAT." },
    { from: 250, to: 400, text: "No hospital fits? ConflictProof returns the exact minimal conflict sets — not a vague 'no results'." },
    { from: 400, to: 520, text: "Then it proposes safe repairs. Clinical rules — ICU, ventilator, blood type — are never relaxed." },
    { from: 520, to: 660, text: "The same engine powers RxSolve: the safest Access antibiotic that is actually in stock." },
  ]}>
    <ChallengeTag code="A02" name="Constraint-based decision making" color={C.sky} />
    <Sequence from={0} durationInFrames={250}>
      <Shot src="ss/12-dispatch-conflictproof.png" dur={250} title="CareMatch · dispatch" focusX={60} focusY={70} zoomTo={1.06}
        callouts={[
          { at: 40, x: 17.7, y: 42.5, w: 25.5, h: 36, label: "Patient needs → constraints", color: C.sky, side: "top" },
          { at: 130, x: 45.3, y: 71.8, w: 9.2, h: 4, label: "NEWS2 15 · CP-SAT 46 ms", color: C.red, side: "right" },
        ]} />
    </Sequence>
    <Sequence from={250} durationInFrames={270}>
      <Shot src="ss/13-dispatch-repairs.png" dur={270} title="ConflictProof · minimal conflict sets" focusX={65} focusY={60} zoomTo={1.05}
        callouts={[
          { at: 20, x: 45.3, y: 40.3, w: 37.3, h: 29.5, label: "Exact clashing rules (MUS)", color: C.amber, side: "top" },
          { at: 150, x: 45.2, y: 71.2, w: 12.2, h: 24.3, label: "Safe repair: split co-dispatch", color: C.mint, side: "left" },
        ]} />
    </Sequence>
    <Sequence from={520} durationInFrames={140}>
      <Shot src="ss/51-rxsolve-triage.png" dur={140} title="RxSolve · antibiotic optimizer" focusX={50} focusY={40} />
    </Sequence>
  </SceneFrame>
);

/* ------------------------------------------------- 6. Edge case: Farmgate ---- */
export const EdgeFarmgate: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <SceneFrame hue="red" cues={[
      { from: 10, to: 150, text: "Edge case: a mother bleeding after childbirth at Farmgate — NEWS2 15, critical." },
      { from: 150, to: 270, text: "She needs a public ICU + ventilator + 2 units of O− blood within 15 minutes. No single hospital has all of it." },
      { from: 270, to: 400, text: "ConflictProof finds the fix: ICU at BMU (7.7 min), O− blood couriered from DMCH (4 min)." },
      { from: 400, to: 540, text: "The dispatcher approves — LockStep holds bed, ventilator and blood together, with a 10-minute timer." },
    ]}>
      <div style={{ position: "absolute", top: 60, left: 140, display: "flex", gap: 16, alignItems: "center", opacity: interpolate(f, [0, 12], [0, 1], clamp) }}>
        <span style={{ padding: "10px 22px", borderRadius: 14, background: C.red, color: "#fff", fontSize: 34, fontWeight: 900 }}>EDGE CASE</span>
        <span style={{ fontSize: 34, fontWeight: 800, color: C.ink }}>The "impossible" Farmgate case</span>
      </div>
      <Sequence from={0} durationInFrames={270}>
        <Shot src="ss/16-dispatch-copilot.png" dur={270} title="Shastho Copilot · Bangla paramedic note" focusX={40} focusY={70} zoomTo={1.05}
          callouts={[
            { at: 30, x: 18.7, y: 55.2, w: 24, h: 19, label: "Bangla note → structured vitals", color: C.lilac, side: "top" },
            { at: 150, x: 45.3, y: 85.6, w: 37.3, h: 13.5, label: "No single hospital fits → split dispatch", color: C.amber, side: "top" },
          ]} />
      </Sequence>
      <Sequence from={270} durationInFrames={270}>
        <Shot src="ss/15-dispatch-replay.png" dur={270} title="LockStep · held atomically" focusX={65} focusY={85} zoomTo={1.07}
          callouts={[
            { at: 20, x: 45.2, y: 58.5, w: 12.2, h: 24.3, label: "BMU ICU + DMCH blood", color: C.mint, side: "left" },
            { at: 130, x: 45.3, y: 84.7, w: 37.3, h: 14.5, label: "Held · 10-min timer · Idempotency-Key", color: C.lilac, side: "top" },
          ]} />
      </Sequence>
    </SceneFrame>
  );
};

/* ------------------------------------------------ 7. Advanced Challenge A05 ---- */
const RaceGrid: React.FC = () => {
  const f = useCurrentFrame();
  const winner = 16;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 150px)", gap: 16 }}>
      {Array.from({ length: 25 }, (_, i) => {
        const fire = 30 + i * 3;
        const land = 95 + ((i * 7) % 25) * 2;
        const p = spring({ frame: f - fire, fps: 30, config: { damping: 14 } });
        const done = f >= land;
        const win = i === winner;
        const bg = !done ? "rgba(255,255,255,0.08)" : win ? C.green : "rgba(245,158,11,0.22)";
        return (
          <div key={i} style={{ height: 96, borderRadius: 18, background: bg, border: `2px solid ${done ? (win ? C.green : C.amber) : "rgba(255,255,255,0.15)"}`, display: "grid", placeItems: "center", scale: String(0.7 + 0.3 * p * (done && win ? 1 + Math.sin(f / 4) * 0.04 : 1)), opacity: p, boxShadow: done && win ? `0 0 40px ${C.green}` : "none" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: done ? (win ? "#04131A" : C.amber) : C.ink3, fontFamily: "monospace" }}>
              #{String(i + 1).padStart(2, "0")} {done ? (win ? "201" : "409") : "…"}
            </div>
          </div>
        );
      })}
    </div>
  );
};
export const ChallengeA05: React.FC = () => {
  const f = useCurrentFrame();
  const lockOrder = ["reservations", "hospital_resources", "blood_inventories"];
  return (
    <SceneFrame hue="violet" cues={[
      { from: 10, to: 120, text: "Advanced Challenge A05 — concurrency & transaction management." },
      { from: 120, to: 240, text: "RaceLab fires 25 simultaneous bookings at the last ICU bed. Exactly one wins. 24 are rejected. Zero double bookings." },
      { from: 240, to: 420, text: "This is the real app, real PostgreSQL row locks — measured live in the browser." },
      { from: 420, to: 600, text: "Every lock is taken in one global order, so deadlocks can't happen. Retries with the same Idempotency-Key replay safely." },
    ]}>
      <ChallengeTag code="A05" name="Concurrency & transaction management" color={C.lilac} />
      <Sequence from={0} durationInFrames={240}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 40, flexDirection: "row" }}>
          <RaceGrid />
          <Card accent={C.lilac} style={{ width: 520 }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: C.lilac, letterSpacing: "0.1em" }}>LAST ICU BED</div>
            <div style={{ marginTop: 14, fontSize: 92, fontWeight: 900, color: C.ink }}>{f > 150 ? "0 / 1" : "1 / 1"}</div>
            <div style={{ fontSize: 30, color: C.ink2 }}>free beds</div>
            <div style={{ marginTop: 24, display: "grid", gap: 10, fontSize: 32, fontWeight: 800 }}>
              <span style={{ color: C.green, opacity: interpolate(f, [150, 165], [0, 1], clamp) }}>✓ 1 winner (201)</span>
              <span style={{ color: C.amber, opacity: interpolate(f, [165, 180], [0, 1], clamp) }}>✕ 24 rejected (409)</span>
              <span style={{ color: C.mint, opacity: interpolate(f, [180, 195], [0, 1], clamp) }}>0 double bookings</span>
            </div>
          </Card>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={240} durationInFrames={180}>
        <Shot src="ss/21-racelab-result.png" dur={180} title="RaceLab · live race result" focusX={40} focusY={60} zoomTo={1.06}
          callouts={[
            { at: 20, x: 17.3, y: 46, w: 65.3, h: 10.7, label: "1 winner · 24 rejected · 0 double bookings", color: C.green, side: "bottom" },
          ]} />
      </Sequence>
      <Sequence from={420} durationInFrames={180}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 46 }}>
          <div style={{ fontSize: 56, fontWeight: 900, color: C.ink }}>One global lock order → no deadlocks</div>
          <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
            {lockOrder.map((t, i) => {
              const p = spring({ frame: f - 430 - i * 18, fps: 30, config: { damping: 13 } });
              return (
                <React.Fragment key={t}>
                  <div style={{ opacity: p, scale: String(0.8 + 0.2 * p), padding: "26px 34px", borderRadius: 22, background: "rgba(139,92,246,0.16)", border: `3px solid ${C.lilac}`, fontFamily: "monospace", fontSize: 34, fontWeight: 800, color: C.ink }}>{i + 1}. {t}</div>
                  {i < 2 && <div style={{ fontSize: 50, color: C.lilac, opacity: p }}>→</div>}
                </React.Fragment>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 30, opacity: interpolate(f, [500, 520], [0, 1], clamp) }}>
            {["Idempotency-Key replay", "Hold TTL + sweeper", "Row locks + CHECK constraints"].map((t) => (
              <span key={t} style={{ padding: "14px 26px", borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", fontSize: 30, fontWeight: 700, color: C.ink2 }}>{t}</span>
            ))}
          </div>
        </AbsoluteFill>
      </Sequence>
    </SceneFrame>
  );
};

/* -------------------------------------------------------- 8. Edge cases ---- */
const EDGES = [
  { t: "Stale hospital data", d: "Counts not refreshed for 6 h are flagged STALE and ranked lower — the dispatcher is told to phone first.", c: C.amber, k: "Data" },
  { t: "Offline edit conflict", d: "Two devices edit one patient offline. SyncSafe refuses a silent overwrite and opens a side-by-side 409 workbench.", c: C.sky, k: "Offline" },
  { t: "AI invents a number", d: "If the model returns a vital sign that isn't in the note, the guard rejects it. AI can only make a request more careful.", c: C.lilac, k: "AI safety" },
  { t: "Hold never confirmed", d: "A held bed that isn't confirmed in 10 minutes expires automatically and returns to the pool.", c: C.mint, k: "Lifecycle" },
  { t: "Wrong facility", d: "A hospital officer trying to edit another hospital's stock gets 403 — and the attempt is audited.", c: C.red, k: "Security" },
  { t: "Allergy + pregnancy", d: "RxSolve excludes contraindicated drugs; if nothing safe is in stock it explains why and suggests referral.", c: C.green, k: "Clinical" },
];
export const EdgeCases: React.FC = () => (
  <SceneFrame cues={[
    { from: 10, to: 140, text: "More edge cases ShasthoGrid handles — each one covered by automated tests." },
    { from: 140, to: 290, text: "Stale data, offline conflicts, invented AI numbers, expired holds, cross-facility access, unsafe antibiotics." },
    { from: 290, to: 420, text: "The system never guesses silently: it explains, refuses, or asks a human." },
  ]}>
    <AbsoluteFill style={{ padding: "64px 140px", gap: 30 }}>
      <TitleBlock kicker="Edge cases" title="When things go wrong" align="left" size={72} kickerColor={C.amber} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
        {EDGES.map((e, i) => {
          const D = 30 + i * 16;
          return <EdgeCard key={e.t} e={e} delay={D} />;
        })}
      </div>
    </AbsoluteFill>
  </SceneFrame>
);
const EdgeCard: React.FC<{ e: (typeof EDGES)[number]; delay: number }> = ({ e, delay }) => {
  const p = usePop(delay);
  return (
    <Card accent={e.c} style={{ opacity: p, translate: `0 ${(1 - p) * 40}px`, padding: "24px 28px" }}>
      <span style={{ padding: "6px 16px", borderRadius: 999, background: `${e.c}26`, color: e.c, fontSize: 22, fontWeight: 900, letterSpacing: "0.08em" }}>{e.k.toUpperCase()}</span>
      <div style={{ marginTop: 14, fontSize: 34, fontWeight: 900, color: C.ink }}>{e.t}</div>
      <div style={{ marginTop: 8, fontSize: 24, lineHeight: 1.38, color: C.ink2 }}>{e.d}</div>
    </Card>
  );
};

export const SathiCorner: React.FC<{ say: string; from: number; to: number }> = ({ say, from, to }) => (
  <div style={{ position: "absolute", right: 90, top: 88 }}>
    <Sathi size={120} enter={from - 10} say={say} sayFrom={from} sayTo={to} bubbleSide="left" />
  </div>
);
void Easing;
