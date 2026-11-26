import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AppWindow, SceneFrame, type Callout } from "./components";
import { C, fontFamily } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Section tag in the top-left, matching the challenge tags elsewhere in the film. */
const Tag: React.FC<{ code: string; name: string; color: string }> = ({ code, name, color }) => {
  const f = useCurrentFrame();
  const p = spring({ frame: f - 4, fps: 30, config: { damping: 15 } });
  return (
    <div style={{ position: "absolute", top: 60, left: 140, display: "flex", alignItems: "center", gap: 18, opacity: p, translate: `${(1 - p) * -30}px 0` }}>
      <span style={{ padding: "8px 18px", borderRadius: 10, background: color, color: "#04211f", fontSize: 30, fontWeight: 900, letterSpacing: "0.02em" }}>{code}</span>
      <span style={{ fontSize: 34, fontWeight: 800, color: C.ink }}>{name}</span>
    </div>
  );
};

const Shot: React.FC<{ src: string; dur: number; title: string; callouts?: Callout[]; focusX?: number; focusY?: number; zoomTo?: number }> = ({ src, dur, title, callouts, focusX, focusY, zoomTo }) => (
  <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 124 }}>
    <AppWindow src={src} title={title} width={1260} durationInFrames={dur} callouts={callouts} focusX={focusX} focusY={focusY} zoomTo={zoomTo} />
  </AbsoluteFill>
);

/* ---- the scroll story, shown as one window whose page "scrolls" between beats ---- */
const BEATS = [
  { src: "ss/73-story-hero.png", label: "Hero", sub: "No single hospital could say yes" },
  { src: "ss/74-story-clash.png", label: "Rule clash", sub: "Bed, ventilator, blood, public, ≤ 15 min" },
  { src: "ss/75-story-repair.png", label: "Safe repair", sub: "ICU at BMU + O− blood from DMCH" },
  { src: "ss/76-story-lockstep.png", label: "LockStep hold", sub: "Held together — or not at all" },
];
const BEAT = 75; // frames per beat
const XF = 16; // cross-fade frames

const StoryWindow: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f, fps, config: { damping: 18, stiffness: 90, mass: 0.9 } });
  const W = 1180;
  const H = (W * 1080) / 1920;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 124 }}>
      <div style={{ display: "flex", gap: 34, alignItems: "flex-start", opacity: enter, translate: `0 ${(1 - enter) * 50}px` }}>
        {/* beat rail */}
        <div style={{ width: 250, paddingTop: 70, display: "flex", flexDirection: "column", gap: 26, fontFamily }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.16em", color: C.mint, textTransform: "uppercase" }}>/story · scroll</div>
          {BEATS.map((b, i) => {
            const on = interpolate(f, [i * BEAT, i * BEAT + XF], [0, 1], clamp) * (i === BEATS.length - 1 ? 1 : interpolate(f, [(i + 1) * BEAT, (i + 1) * BEAT + XF], [1, 0.35], clamp));
            const lit = Math.max(0.35, on);
            return (
              <div key={b.label} style={{ display: "flex", gap: 14, opacity: lit }}>
                <span style={{ width: 14, height: 14, marginTop: 8, borderRadius: 7, background: on > 0.5 ? C.mint : "transparent", border: `2px solid ${C.mint}`, boxShadow: on > 0.5 ? `0 0 14px ${C.mint}` : "none", flex: "none" }} />
                <div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: C.ink }}>{b.label}</div>
                  <div style={{ marginTop: 2, fontSize: 19, lineHeight: 1.3, color: C.ink2 }}>{b.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
        {/* browser window */}
        <div style={{ width: W, borderRadius: 22, overflow: "hidden", background: "#0B1418", boxShadow: "0 60px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12)" }}>
          <div style={{ height: 46, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: "linear-gradient(#1A2329, #121A1F)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
            <span style={{ marginLeft: 18, fontFamily, fontSize: 18, color: C.ink3, fontWeight: 600 }}>shasthogrid.vercel.app/story</span>
          </div>
          <div style={{ position: "relative", width: W, height: H, overflow: "hidden" }}>
            {BEATS.map((b, i) => {
              const a = i === 0 ? 1 : interpolate(f, [i * BEAT - XF / 2, i * BEAT + XF / 2], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
              const drift = interpolate(f, [i * BEAT, (i + 1) * BEAT], [0, -18], clamp); // a slow "still scrolling" drift
              return (
                <Img key={b.src} src={staticFile(b.src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: a, translate: `0 ${drift}px`, scale: "1.04" }} />
              );
            })}
            {/* scroll progress, like the page's own bar */}
            <div style={{ position: "absolute", left: "50%", bottom: 16, width: 140, height: 3, translate: "-50% 0", borderRadius: 2, background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
              <div style={{ width: "100%", height: "100%", background: C.mint, transformOrigin: "left", scale: `${interpolate(f, [0, BEATS.length * BEAT], [0.05, 1], clamp)} 1` }} />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------- Live demo ---- */
export const LiveExperience: React.FC = () => (
  <SceneFrame hue="teal" cues={[
    { from: 10, to: 200, text: "And it's live. The redesigned landing page: an interactive dot grid, a live care map, and honest demo labels." },
    { from: 200, to: 330, text: "Every feature has a name and a job. Flagship tools get wide cards, and every card opens the real app." },
    { from: 330, to: 480, text: "The Farmgate case is also a scroll story: as you scroll, the camera follows the emergency across the map." },
    { from: 480, to: 630, text: "The rule clash, the safe repair, the LockStep hold — one scroll, with the real numbers." },
  ]}>
    <Tag code="LIVE" name="shasthogrid.vercel.app" color={C.mint} />
    <Sequence from={0} durationInFrames={200}>
      <Shot src="ss/70-new-landing-hero.png" dur={200} title="ShasthoGrid · landing" focusX={40} focusY={45} zoomTo={1.06}
        callouts={[
          { at: 50, x: 19.5, y: 23.5, w: 31, h: 26, label: "Interactive dot grid", color: C.mint, side: "top" },
          { at: 110, x: 52.3, y: 30, w: 27.8, h: 39.5, label: "Live care map", color: C.sky, side: "left" },
        ]} />
    </Sequence>
    <Sequence from={200} durationInFrames={130}>
      <Shot src="ss/71-new-landing-bento.png" dur={130} title="Features · bento grid" focusX={50} focusY={35} zoomTo={1.07} />
    </Sequence>
    <Sequence from={330} durationInFrames={300}>
      <StoryWindow />
    </Sequence>
  </SceneFrame>
);
