import { loadFont } from "@remotion/google-fonts/Inter";

export const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});

export const FPS = 30;

/** Night-teal cinematic palette, matched to the ShasthoGrid product. */
export const C = {
  bg0: "#041318",
  bg1: "#06202A",
  bg2: "#0B2E44",
  ink: "#F2FBFA",
  ink2: "#B9D3D6",
  ink3: "#86A3A8",
  mint: "#5EEAD4",
  teal: "#14B8A6",
  sky: "#38BDF8",
  blue: "#60A5FA",
  cyan: "#22D3EE",
  red: "#F43F5E",
  amber: "#F59E0B",
  violet: "#8B5CF6",
  lilac: "#A78BFA",
  green: "#34D399",
  peach: "#FDBA74",
};

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
