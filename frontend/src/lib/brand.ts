/**
 * ShasthoGrid brand system — single source of truth for the product name,
 * SEO copy and the official feature names used across every screen.
 *
 * ShasthoGrid merges two blueprints:
 *  - AWaReGrid: WHO AWaRe antibiotic stewardship + FEFO dispensary + offline sync
 *  - PranGrid:  ICU / ventilator / blood-bank allocation + race-proof atomic booking
 *
 * Declared advanced challenges: A02 (Intelligent Decisions & Optimization)
 * and A05 (Concurrency & Transaction Management). Offline-first sync stays in
 * the product as a bonus capability but is not a declared challenge.
 */

import type { Locale } from "@/lib/i18n";

export const BRAND = {
  name: "ShasthoGrid",
  nameBn: "স্বাস্থ্যগ্রিড",
  tagline: "Provably safe care — antibiotics, ICU beds and blood, even offline",
  taglineBn: "প্রমাণিতভাবে নিরাপদ চিকিৎসা — অ্যান্টিবায়োটিক, আইসিইউ বেড ও রক্ত, অফলাইনেও",
  description:
    "ShasthoGrid is a clinical decision-support and resource-allocation platform for Bangladesh: WHO AWaRe antibiotic stewardship, NEWS2 triage, ICU/ventilator and blood-bank matching with Google OR-Tools CP-SAT, and race-proof atomic bookings.",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://shasthogrid.vercel.app",
  themeColor: "#0F766E",
  keywords: [
    "ShasthoGrid",
    "antibiotic stewardship Bangladesh",
    "WHO AWaRe",
    "ICU bed finder Dhaka",
    "blood bank availability Bangladesh",
    "NEWS2 triage",
    "OR-Tools CP-SAT",
    "hospital bed allocation",
    "FEFO pharmacy inventory",
    "clinical decision support",
  ],
} as const;

export type FeatureId =
  | "rxsolve"
  | "carematch"
  | "lockstep"
  | "conflictproof"
  | "pulsescore"
  | "freshstock"
  | "syncsafe"
  | "stewardlens"
  | "copilot"
  | "racelab";

export interface Feature {
  id: FeatureId;
  /** Official product name — never translated. */
  name: string;
  /** Rubric item the feature proves. */
  rubric: string;
  summary: Record<Locale, string>;
  accent: string;
}

export const FEATURES: Feature[] = [
  {
    id: "rxsolve",
    name: "RxSolve",
    rubric: "A02",
    accent: "#059669",
    summary: {
      en: "CP-SAT antibiotic regimen optimizer: Access-first, allergy, pregnancy, renal, age and live stock constraints solved together.",
      bn: "CP-SAT অ্যান্টিবায়োটিক রেজিমেন অপটিমাইজার: অ্যাক্সেস-প্রথম, অ্যালার্জি, গর্ভাবস্থা, কিডনি, বয়স ও মজুত একসাথে যাচাই।",
    },
  },
  {
    id: "carematch",
    name: "CareMatch",
    rubric: "A02",
    accent: "#0891B2",
    summary: {
      en: "Matches critical patients to a staffed ICU, ventilator and compatible blood. When no hospital has everything, it pairs an ICU with a blood-hub courier.",
      bn: "গুরুতর রোগীকে কর্মী-সমৃদ্ধ আইসিইউ, ভেন্টিলেটর ও মানানসই রক্তের সাথে মেলায়; কোনো হাসপাতালে সব না থাকলে আইসিইউ ও ব্লাড-হাব কুরিয়ার একসাথে পাঠায়।",
    },
  },
  {
    id: "conflictproof",
    name: "ConflictProof",
    rubric: "A02",
    accent: "#DC2626",
    summary: {
      en: "When a request is impossible, shows the exact minimal set of rules that clash and solver-verified ways to fix it.",
      bn: "অনুরোধ অসম্ভব হলে ঠিক কোন নিয়মগুলো সংঘর্ষ করছে এবং সলভার-যাচাইকৃত সমাধান দেখায়।",
    },
  },
  {
    id: "lockstep",
    name: "LockStep",
    rubric: "A05",
    accent: "#7C3AED",
    summary: {
      en: "Race-proof bookings: row locks in a fixed order, database guards and idempotency keys — the last bed is never given twice.",
      bn: "রেস-প্রুফ বুকিং: নির্দিষ্ট ক্রমে রো-লক, ডাটাবেস গার্ড ও আইডেম্পোটেন্সি কী — শেষ বেড কখনো দুবার বরাদ্দ হয় না।",
    },
  },
  {
    id: "racelab",
    name: "RaceLab",
    rubric: "A05",
    accent: "#D97706",
    summary: {
      en: "Fire 25 simultaneous requests at the final bed and watch exactly one win — live proof for judges.",
      bn: "শেষ বেডের জন্য একসাথে ২৫টি অনুরোধ পাঠান — ঠিক একটি সফল হয়, বিচারকদের জন্য সরাসরি প্রমাণ।",
    },
  },
  {
    id: "pulsescore",
    name: "PulseScore",
    rubric: "M04",
    accent: "#E11D48",
    summary: {
      en: "Royal College of Physicians NEWS2 acuity scoring with ABO/Rh blood compatibility checks.",
      bn: "রয়্যাল কলেজ অব ফিজিশিয়ানস NEWS2 তীব্রতা স্কোর এবং ABO/Rh রক্ত সামঞ্জস্য যাচাই।",
    },
  },
  {
    id: "freshstock",
    name: "FreshStock",
    rubric: "M02 · M04",
    accent: "#0F766E",
    summary: {
      en: "First-Expired, First-Out dispensary with pharmacist approval for Watch and Reserve antibiotics.",
      bn: "প্রথম-মেয়াদোত্তীর্ণ-প্রথম-বের ডিস্পেন্সারি, ওয়াচ ও রিজার্ভ অ্যান্টিবায়োটিকে ফার্মাসিস্ট অনুমোদন।",
    },
  },
  {
    id: "syncsafe",
    name: "SyncSafe",
    rubric: "Bonus",
    accent: "#0284C7",
    summary: {
      en: "Keeps working without internet and blocks unsafe overwrites when devices reconnect.",
      bn: "ইন্টারনেট ছাড়াও কাজ চলে এবং পুনঃসংযোগে অনিরাপদ ওভাররাইট আটকায়।",
    },
  },
  {
    id: "stewardlens",
    name: "StewardLens",
    rubric: "M05",
    accent: "#2563EB",
    summary: {
      en: "Live WHO Access-ratio KPI, staffed-vs-idle ICU gap and blood scarcity analytics.",
      bn: "সরাসরি WHO অ্যাক্সেস অনুপাত, কর্মী-সমৃদ্ধ বনাম অলস আইসিইউ এবং রক্ত সংকট বিশ্লেষণ।",
    },
  },
  {
    id: "copilot",
    name: "Shastho Copilot",
    rubric: "AI",
    accent: "#9333EA",
    summary: {
      en: "Bangla/English intake assistant that only calls the solver tools, never invents data, and always waits for human sign-off.",
      bn: "বাংলা/ইংরেজি ইনটেক সহকারী — শুধু সলভার টুল ব্যবহার করে, তথ্য বানায় না, এবং সবসময় মানুষের অনুমোদনের অপেক্ষা করে।",
    },
  },
];
