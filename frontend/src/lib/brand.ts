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
  | "racelab"
  | "facilitydesk"
  | "careradar";

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
      bn: "CP-SAT দিয়ে অ্যান্টিবায়োটিক বাছাই: আগে অ্যাক্সেস গ্রুপ, সাথে অ্যালার্জি, গর্ভাবস্থা, কিডনির কার্যক্ষমতা, বয়স ও মজুত — সব একসাথে যাচাই।",
    },
  },
  {
    id: "carematch",
    name: "CareMatch",
    rubric: "A02",
    accent: "#0891B2",
    summary: {
      en: "Matches critical patients to a staffed ICU, ventilator and compatible blood. When no hospital has everything, it pairs an ICU with a blood-hub courier.",
      bn: "মুমূর্ষু রোগীর জন্য চালু আইসিইউ বেড, ভেন্টিলেটর আর গ্রুপ মিলে যাওয়া রক্ত খুঁজে দেয়; কোনো এক হাসপাতালে সব না থাকলে আইসিইউর সাথে ব্লাড ব্যাংক থেকে রক্ত-কুরিয়ার জুড়ে দেয়।",
    },
  },
  {
    id: "conflictproof",
    name: "ConflictProof",
    rubric: "A02",
    accent: "#DC2626",
    summary: {
      en: "When a request is impossible, shows the exact minimal set of rules that clash and solver-verified ways to fix it.",
      bn: "অনুরোধ পূরণ করা অসম্ভব হলে ঠিক কোন শর্তগুলো একে অপরের সাথে মেলে না তা দেখায়, সাথে সলভারে যাচাই করা নিরাপদ বিকল্প।",
    },
  },
  {
    id: "lockstep",
    name: "LockStep",
    rubric: "A05",
    accent: "#7C3AED",
    summary: {
      en: "Race-proof bookings: row locks in a fixed order, database guards and idempotency keys — the last bed is never given twice.",
      bn: "একসাথে অনেক অনুরোধ এলেও নিরাপদ বুকিং: নির্দিষ্ট ক্রমে ডাটাবেস লক আর পুনরাবৃত্তি-রোধী কী — শেষ বেডটি কখনো দুজনকে দেওয়া হয় না।",
    },
  },
  {
    id: "facilitydesk",
    name: "FacilityDesk",
    rubric: "A05",
    accent: "#0369A1",
    summary: {
      en: "Hospitals and blood banks keep their own counts live, either by hand or through a keyed system feed. Every number shows its source and age, and incoming holds are confirmed in one tap.",
      bn: "হাসপাতাল ও ব্লাড ব্যাংক নিজেরাই হাতে বা নিরাপদ সিস্টেম ফিড দিয়ে সংখ্যা হালনাগাদ রাখে; প্রতিটি সংখ্যার উৎস ও সময় দেখা যায়, আর আসা হোল্ড এক ট্যাপে নিশ্চিত হয়।",
    },
  },
  {
    id: "racelab",
    name: "RaceLab",
    rubric: "A05",
    accent: "#D97706",
    summary: {
      en: "Fire 25 simultaneous requests at the final bed and watch exactly one win — live proof for judges.",
      bn: "শেষ বেডের জন্য একসাথে ২৫টি অনুরোধ পাঠান — ঠিক একটিই সফল হয়। চোখের সামনে সরাসরি প্রমাণ।",
    },
  },
  {
    id: "pulsescore",
    name: "PulseScore",
    rubric: "M04",
    accent: "#E11D48",
    summary: {
      en: "Royal College of Physicians NEWS2 acuity scoring with ABO/Rh blood compatibility checks.",
      bn: "রয়্যাল কলেজ অব ফিজিশিয়ানসের NEWS2 স্কোরে রোগীর অবস্থা কতটা গুরুতর তা মাপা, আর ABO/Rh অনুযায়ী রক্তের গ্রুপ মেলানো।",
    },
  },
  {
    id: "freshstock",
    name: "FreshStock",
    rubric: "M02 · M04",
    accent: "#0F766E",
    summary: {
      en: "First-Expired, First-Out dispensary with pharmacist approval for Watch and Reserve antibiotics.",
      bn: "যে ওষুধের মেয়াদ আগে শেষ হবে, সেটিই আগে দেওয়া হয়; ওয়াচ ও রিজার্ভ অ্যান্টিবায়োটিকে ফার্মাসিস্টের অনুমোদন লাগে।",
    },
  },
  {
    id: "syncsafe",
    name: "SyncSafe",
    rubric: "Bonus",
    accent: "#0284C7",
    summary: {
      en: "Keeps working without internet and blocks unsafe overwrites when devices reconnect.",
      bn: "ইন্টারনেট না থাকলেও কাজ চলে; সংযোগ ফিরলে কারও তথ্য চুপচাপ মুছে না দিয়ে নিরাপদে মিলিয়ে নেয়।",
    },
  },
  {
    id: "stewardlens",
    name: "StewardLens",
    rubric: "M05",
    accent: "#2563EB",
    summary: {
      en: "Live WHO Access-ratio KPI, staffed-vs-idle ICU gap and blood scarcity analytics.",
      bn: "সরাসরি দেখুন WHO অ্যাক্সেস অনুপাত, কতগুলো আইসিইউ বেড চালু আর কতগুলো জনবলের অভাবে বন্ধ, আর কোথায় রক্তের ঘাটতি।",
    },
  },
  {
    id: "careradar",
    name: "CareRadar",
    rubric: "3D Map",
    accent: "#0F766E",
    summary: {
      en: "3D satellite & street locator for nearby pharmacies, ICU hospitals, and blood banks with turn-by-turn navigation.",
      bn: "কাছের ফার্মেসি, আইসিইউ হাসপাতাল ও ব্লাড ব্যাংক খুঁজতে ৩ডি স্যাটেলাইট ও স্ট্রিট ম্যাপ এবং টার্ন-বাই-টার্ন নেভিগেশন।",
    },
  },
  {
    id: "copilot",
    name: "Shastho Copilot",
    rubric: "AI",
    accent: "#9333EA",
    summary: {
      en: "Bangla/English intake assistant that only calls the solver tools, never invents data, and always waits for human sign-off.",
      bn: "বাংলা বা ইংরেজিতে রোগীর তথ্য নেওয়ার সহকারী — শুধু যাচাই করা টুল ব্যবহার করে, নিজে কোনো তথ্য বানায় না, আর চূড়ান্ত সিদ্ধান্তের জন্য সবসময় চিকিৎসকের অনুমোদন চায়।",
    },
  },
];
