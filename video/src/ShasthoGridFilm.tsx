import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Intro, Idea, Problem, Workflow } from "./scenes1";
import { ChallengeA02, ChallengeA05, EdgeCases, EdgeFarmgate, SathiCorner } from "./scenes2";
import { Architecture, Close, FeatureTour, Journeys } from "./scenes3";
import { LiveExperience } from "./scenes4";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, fontFamily } from "./theme";

export const T = 15; // transition overlap (frames)

/** Scene list with durations (frames @30fps). Transitions overlap by T. */
export const SCENES = [
  { name: "Intro", d: 180, C: Intro },
  { name: "Problem", d: 330, C: Problem },
  { name: "Idea", d: 240, C: Idea },
  { name: "Workflow", d: 480, C: Workflow },
  { name: "A02", d: 660, C: ChallengeA02 },
  { name: "EdgeFarmgate", d: 540, C: EdgeFarmgate },
  { name: "A05", d: 600, C: ChallengeA05 },
  { name: "EdgeCases", d: 420, C: EdgeCases },
  { name: "FeatureTour", d: 960, C: FeatureTour },
  { name: "Live", d: 630, C: LiveExperience },
  { name: "Journeys", d: 600, C: Journeys },
  { name: "Architecture", d: 390, C: Architecture },
  { name: "Close", d: 270, C: Close },
] as const;

export const FILM_DURATION = SCENES.reduce((a, s) => a + s.d, 0) - T * (SCENES.length - 1);

/** Chapter labels shown in the corner (Intro and Close have none). */
const CHAPTER: Record<string, string> = {
  Problem: "The problem", Idea: "The idea", Workflow: "How it works", A02: "Challenge A02",
  EdgeFarmgate: "Edge case", A05: "Challenge A05", EdgeCases: "Edge cases", FeatureTour: "Features",
  Live: "Live demo", Journeys: "User journeys", Architecture: "Trust",
};
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, s) => a + s.d, 0) - T * i);
const CHAPTER_SCENES = SCENES.map((s, i) => ({ ...s, start: STARTS[i] })).filter((s) => CHAPTER[s.name]);

/** Top progress rail with a tick per chapter, plus a "04 / 11 · Challenge A02" label. */
const ChapterBar: React.FC = () => {
  const f = useCurrentFrame();
  const cur = [...CHAPTER_SCENES].reverse().find((s) => f >= s.start);
  const inChapter = cur && f < cur.start + cur.d;
  const idx = cur ? CHAPTER_SCENES.indexOf(cur) : -1;
  const show = inChapter ? interpolate(f, [cur.start, cur.start + 20, cur.start + cur.d - 20, cur.start + cur.d], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const railIn = interpolate(f, [STARTS[1], STARTS[1] + 30, STARTS[SCENES.length - 1], STARTS[SCENES.length - 1] + 20], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ pointerEvents: "none", fontFamily }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 5, background: "rgba(255,255,255,0.08)", opacity: railIn }}>
        <div style={{ height: "100%", width: `${(f / FILM_DURATION) * 100}%`, background: `linear-gradient(90deg, ${C.teal}, ${C.mint})`, boxShadow: `0 0 12px ${C.mint}` }} />
        {CHAPTER_SCENES.map((s) => (
          <span key={s.name} style={{ position: "absolute", top: 0, left: `${(s.start / FILM_DURATION) * 100}%`, width: 2, height: 9, background: "rgba(255,255,255,0.55)" }} />
        ))}
      </div>
      {cur && (
        <div style={{ position: "absolute", top: 26, right: 40, opacity: show, display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderRadius: 999, background: "rgba(4,19,25,0.55)", border: "1px solid rgba(255,255,255,0.14)" }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: C.mint, letterSpacing: "0.08em" }}>{String(idx + 1).padStart(2, "0")} / {String(CHAPTER_SCENES.length).padStart(2, "0")}</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: C.ink2, letterSpacing: "0.12em", textTransform: "uppercase" }}>{CHAPTER[cur.name]}</span>
        </div>
      )}
    </AbsoluteFill>
  );
};

export const ShasthoGridFilm: React.FC = () => (
  <>
  <TransitionSeries>
    {SCENES.map((s, i) => (
      <React.Fragment key={s.name}>
        <TransitionSeries.Sequence name={s.name} durationInFrames={s.d}>
          <s.C />
          {s.name === "Workflow" && <SathiCorner say="Every step is checked by a solver, then approved by a human." from={330} to={470} />}
          {s.name === "EdgeCases" && <SathiCorner say="I never guess silently." from={300} to={410} />}
        </TransitionSeries.Sequence>
        {i < SCENES.length - 1 && (
          <TransitionSeries.Transition
            presentation={i % 3 === 2 ? slide({ direction: "from-right" }) : fade()}
            timing={linearTiming({ durationInFrames: T })}
          />
        )}
      </React.Fragment>
    ))}
  </TransitionSeries>
  <ChapterBar />
  </>
);
