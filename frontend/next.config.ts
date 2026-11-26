import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  register: true,
  reloadOnOnline: false,
  cacheOnNavigation: true,
  additionalPrecacheEntries: [
    { url: "/~offline", revision },
    { url: "/icons/icon-192x192.png", revision },
    { url: "/icons/icon-512x512.png", revision },
    { url: "/icons/icon-512x512-maskable.png", revision },
    { url: "/icons/apple-touch-icon.png", revision },
  ],
});

const nextConfig: NextConfig = {
  // Serwist's service worker is disabled in development; this empty config
  // declares that the app intentionally uses Next 16's default Turbopack.
  turbopack: {},
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
