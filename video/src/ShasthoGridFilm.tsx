import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Intro, Idea, Problem, Workflow } from "./scenes1";
import { ChallengeA02, ChallengeA05, EdgeCases, EdgeFarmgate, SathiCorner } from "./scenes2";
import { Architecture, Close, FeatureTour, Journeys } from "./scenes3";

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
  { name: "Journeys", d: 600, C: Journeys },
  { name: "Architecture", d: 390, C: Architecture },
  { name: "Close", d: 240, C: Close },
] as const;

export const FILM_DURATION = SCENES.reduce((a, s) => a + s.d, 0) - T * (SCENES.length - 1);

export const ShasthoGridFilm: React.FC = () => (
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
);
