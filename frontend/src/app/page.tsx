"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Droplets,
  Lock,
  Pill,
  RotateCcw,
  ShieldAlert,
  Stethoscope,
  Zap,
} from "lucide-react";
import { useI18n, type Locale } from "@/lib/i18n";
import { BRAND, FEATURES } from "@/lib/brand";
import { EUROPE_PMC_REFERENCES } from "@/lib/clinicalEvidence";
import { CareNetworkIllustration } from "@/components/brand/CareNetworkIllustration";
import { NumberTicker } from "@/components/fx/NumberTicker";
import { trackSpotlight } from "@/components/fx/spotlight";

type Copy = Record<Locale, string>;
const c = (en: string, bn: string): Copy => ({ en, bn });

const COPY = {
  heroBadge: c("WHO AWaRe · NEWS2 · CP-SAT solver · LockStep", "WHO AWaRe · NEWS2 · CP-SAT সলভার · LockStep"),
  heroTitleA: c("Safe care, proven at every step —", "প্রতিটি ধাপে প্রমাণসহ নিরাপদ চিকিৎসা —"),
  heroTitleB: c("from the pharmacy counter to the ICU bed.", "ফার্মেসির কাউন্টার থেকে আইসিইউ বেড পর্যন্ত।"),
  heroSub: c(
    "ShasthoGrid checks every antibiotic against WHO AWaRe guidance, finds critically ill patients an ICU bed with staff on duty and blood that truly matches, and books the last bed so it can never be given out twice.",
    "স্বাস্থ্যগ্রিড WHO AWaRe নির্দেশিকা মেনে প্রতিটি অ্যান্টিবায়োটিক যাচাই করে, মুমূর্ষু রোগীর জন্য খুঁজে দেয় চালু আইসিইউ বেড আর গ্রুপ মিলে যাওয়া রক্ত। শেষ বেডটিও এমনভাবে বুক হয় যে তা কখনো দুজনকে দেওয়া যায় না।"
  ),
  ctaPrimary: c("Open the command center", "কমান্ড সেন্টারে যান"),
  ctaSecondary: c("Try a demo account", "ডেমো অ্যাকাউন্টে ঢুকুন"),
  evidenceTitle: c("The problem, in numbers", "সমস্যাটি সংখ্যায়"),
  pillarsTitle: c("Two crises, one grid", "দুটি সংকট, একটি গ্রিড"),
  featuresTitle: c("Every feature has a name and a job", "প্রতিটি ফিচারের নাম আছে, দায়িত্বও আছে"),
  featuresSub: c(
    "Each feature is tied to the hackathon criterion it proves, so nothing is counted twice.",
    "প্রতিটি ফিচার হ্যাকাথনের কোন মানদণ্ড প্রমাণ করে তা নির্দিষ্ট — কোনো কিছু দুবার গোনা হয়নি।"
  ),
  proofTitle: c("Proof, not promises", "প্রতিশ্রুতি নয়, প্রমাণ"),
  stepsTitle: c("How a case moves through ShasthoGrid", "স্বাস্থ্যগ্রিডে একটি কেস যেভাবে এগোয়"),
  closeTitle: c("Try the impossible case yourself.", "অসম্ভব কেসটি নিজেই চালিয়ে দেখুন।"),
  closeBody: c(
    "Sign in with a demo account, send a request no single hospital can meet, and watch ConflictProof explain exactly why — then race 25 requests for the last bed in RaceLab.",
    "ডেমো অ্যাকাউন্টে ঢুকে এমন একটি অনুরোধ পাঠান যা কোনো একক হাসপাতাল মেটাতে পারে না, আর দেখুন ConflictProof ঠিক কেন তা ব্যাখ্যা করে — তারপর RaceLab-এ শেষ বেডটির জন্য একসাথে ২৫টি অনুরোধ পাঠিয়ে দেখুন।"
  ),
  demoNote: c(
    "Bed and blood counts are simulated for this demo. Clinicians always make the final decision.",
    "এই ডেমোর বেড ও রক্তের সংখ্যাগুলো অনুকরণ করা। চূড়ান্ত চিকিৎসা-সিদ্ধান্ত সবসময় চিকিৎসকের।"
  ),
};

const EVIDENCE: { value: string; label: Copy; source: string; detail: Copy }[] = [
  {
    value: "92.4%",
    label: c(
      "of surveyed pharmacy staff dispense antibiotics without a prescription",
      "জরিপে অংশ নেওয়া ফার্মেসি কর্মীদের এই অংশ প্রেসক্রিপশন ছাড়াই অ্যান্টিবায়োটিক দেন"
    ),
    source: "PMC12778233",
    detail: c("Simulated-client survey · Bangladesh community pharmacies", "ছদ্ম-ক্রেতা জরিপ · বাংলাদেশের কমিউনিটি ফার্মেসি"),
  },
  {
    value: "~50%",
    label: c(
      "of Bangladesh public ICU beds sit idle for lack of staff",
      "বাংলাদেশের সরকারি আইসিইউ বেড জনবলের অভাবে অব্যবহৃত পড়ে থাকে"
    ),
    source: "New Age, Apr 2026",
    detail: c("National public hospital staffing audit", "সরকারি হাসপাতালের জনবল নিয়ে জাতীয় প্রতিবেদন"),
  },
  {
    value: "74.5%",
    label: c(
      "of maternal & perinatal deaths in an LMIC cohort involved 2+ referrals",
      "নিম্ন ও মধ্যম আয়ের দেশের এক গবেষণায় মা ও নবজাতকের মৃত্যুর ক্ষেত্রে রোগীকে দুই বা ততোধিকবার রেফার করা হয়েছিল"
    ),
    source: "J Glob Health 2026",
    detail: c("Multi-site LMIC referral-delay cohort", "একাধিক হাসপাতালে রেফারাল-বিলম্ব গবেষণা"),
  },
  {
    value: "≥60%",
    label: c(
      "WHO target share of antibiotic use from the Access group",
      "WHO-র লক্ষ্য: মোট অ্যান্টিবায়োটিক ব্যবহারের অন্তত ৬০% হোক অ্যাক্সেস গ্রুপ থেকে"
    ),
    source: "WHO AWaRe",
    detail: c("WHO GPW13 / AWaRe global stewardship benchmark", "WHO GPW13 / AWaRe বৈশ্বিক মানদণ্ড"),
  },
];

const PILLARS = [
  {
    icon: Pill,
    tone: "success" as const,
    title: c("Antibiotic stewardship", "অ্যান্টিবায়োটিক স্টুয়ার্ডশিপ"),
    body: c(
      "RxSolve picks the safest stocked Access antibiotic, refuses antibiotics for mild viral illness, and routes Watch/Reserve drugs to a pharmacist. FreshStock dispenses the earliest-expiring lot.",
      "RxSolve মজুতে থাকা সবচেয়ে নিরাপদ অ্যাক্সেস অ্যান্টিবায়োটিকটি বেছে নেয়, সাধারণ ভাইরাল অসুখে অ্যান্টিবায়োটিক দিতে দেয় না, আর ওয়াচ ও রিজার্ভ ওষুধ ফার্মাসিস্টের অনুমোদনে পাঠায়। FreshStock যে লটের মেয়াদ আগে শেষ হবে, সেটিই আগে দেয়।"
    ),
    names: ["RxSolve", "FreshStock", "StewardLens"],
  },
  {
    icon: Activity,
    tone: "info" as const,
    title: c("Critical-care allocation", "জরুরি চিকিৎসা বরাদ্দ"),
    body: c(
      "PulseScore rates how sick the patient is with NEWS2. CareMatch finds a staffed ICU bed, a ventilator and compatible blood within the golden hour — or pairs an ICU with a blood-bank courier. LockStep books everything in one indivisible step.",
      "PulseScore NEWS2 দিয়ে রোগীর অবস্থা কতটা গুরুতর তা মাপে। CareMatch গোল্ডেন আওয়ারের মধ্যে চালু আইসিইউ বেড, ভেন্টিলেটর আর গ্রুপ মিলে যাওয়া রক্ত খোঁজে — দরকারে আইসিইউর সাথে ব্লাড ব্যাংক থেকে রক্ত-কুরিয়ার জুড়ে দেয়। LockStep সবকিছু একসাথে, এক ধাপে বুক করে — হয় পুরোটা, নয়তো কিছুই না।"
    ),
    names: ["PulseScore", "CareMatch", "LockStep"],
  },
];

const STEPS = [
  { icon: Stethoscope, title: c("Intake", "রোগীর তথ্য"), body: c("Vital signs, or a Bangla/English note through Shastho Copilot.", "ভাইটাল সাইন, অথবা Shastho Copilot-এ বাংলা বা ইংরেজিতে লেখা নোট।") },
  { icon: BrainCircuit, title: c("Solve", "সমাধান"), body: c("The CP-SAT solver finds the best option in milliseconds.", "CP-SAT সলভার মিলিসেকেন্ডে সবচেয়ে ভালো বিকল্পটি খুঁজে দেয়।") },
  { icon: ShieldAlert, title: c("Explain", "ব্যাখ্যা"), body: c("ConflictProof names exactly which rules clash, and the safe ways out.", "ConflictProof ঠিক কোন নিয়মগুলো একে অপরের সাথে মেলে না আর নিরাপদ বিকল্প কী, তা দেখায়।") },
  { icon: Lock, title: c("Lock", "নিশ্চিত"), body: c("A clinician approves; LockStep reserves the bed and blood together.", "চিকিৎসক অনুমোদন দিলে LockStep বেড ও রক্ত একসাথে সংরক্ষণ করে।") },
];

const FEATURE_ROUTES: Record<string, string> = {
  rxsolve: "/dashboard/triage",
  carematch: "/dispatch",
  conflictproof: "/dispatch",
  lockstep: "/dispatch",
  facilitydesk: "/facility",
  racelab: "/race-lab",
  pulsescore: "/dispatch",
  freshstock: "/dashboard/inventory",
  syncsafe: "/dashboard/sync",
  stewardlens: "/insights",
  careradar: "/radar",
  copilot: "/copilot",
};

/** "Built on" strip — every item is something the codebase actually uses or tests. */
const BUILT_ON: Copy[] = [
  c("WHO AWaRe classification", "WHO AWaRe শ্রেণিবিভাগ"),
  c("NEWS2 early-warning score", "NEWS2 আর্লি-ওয়ার্নিং স্কোর"),
  c("Google OR-Tools CP-SAT", "Google OR-Tools CP-SAT"),
  c("Minimal conflict sets (MUS)", "ন্যূনতম সংঘর্ষ সেট (MUS)"),
  c("PostgreSQL row locks", "PostgreSQL রো লক"),
  c("Idempotency keys", "আইডেমপোটেন্সি কি"),
  c("Offline-first PWA", "অফলাইন-ফার্স্ট PWA"),
  c("Bangla + English", "বাংলা + ইংরেজি"),
  c("De-identified, guarded AI", "পরিচয়-গোপন, সুরক্ষিত AI"),
  c("Automated accessibility checks", "স্বয়ংক্রিয় অ্যাক্সেসিবিলিটি পরীক্ষা"),
];

/** Bento: these three span two columns on wide screens (rows of 3 fill with no gaps). */
const WIDE_FEATURES = new Set(["carematch", "lockstep", "copilot"]);

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
} as const;

const CONFLICT_DETAILS: Record<string, Copy> = {
  C_BLOOD: c(
    "Needs 2× O− units, but the nearest public ICU with a free ventilator has 0 O− units.",
    "২× O− রক্ত প্রয়োজন, কিন্তু ভেন্টিলেটরসহ নিকটতম সরকারি আইসিইউতে O− মজুত ০।"
  ),
  C_ETA: c(
    "Golden-hour limit (≤ 15 min) rules out distant tertiary hubs with both bed and blood.",
    "গোল্ডেন আওয়ারের সীমা (১৫ মিনিটের মধ্যে) দূরের বড় হাসপাতালগুলোকে বাদ দেয়।"
  ),
  C_ICU: c(
    "Requires a staffed ICU bed + ventilator together; some nearby hubs only have blood.",
    "চালু আইসিইউ বেড ও ভেন্টিলেটর একসাথে দরকার; কাছের কিছু কেন্দ্রে শুধু রক্ত আছে।"
  ),
  C_PUBLIC: c(
    "Public-only filter excludes private hospitals that carry both ICU and O− stock.",
    "শুধু সরকারি হাসপাতাল বাছাই করায় বেসরকারি হাসপাতালগুলো বাদ পড়ে, যদিও সেখানে বেড ও রক্ত দুটোই আছে।"
  ),
};

export default function HomePage() {
  const { locale } = useI18n();
  const L = (copy: Copy) => copy[locale] ?? copy.en;
  const [selectedConstraint, setSelectedConstraint] = useState<string>("C_BLOOD");
  const [proofWinner, setProofWinner] = useState<number>(7);
  const [proofRunId, setProofRunId] = useState<number>(0);

  // Scroll-linked hero: as the page scrolls, the care-network illustration recedes a little
  // (drifts down, shrinks, dims) — depth without hijacking scroll. Off under reduced motion.
  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const artY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const artScale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);
  const artOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.45]);

  const replayProofRace = () => {
    const next = Math.floor(Math.random() * 25);
    setProofWinner(next);
    setProofRunId((id) => id + 1);
  };

  return (
    <div className="space-y-16 pb-8 sm:space-y-24">
      {/* HERO */}
      <section
        ref={heroRef}
        onPointerMove={trackSpotlight}
        className="relative overflow-hidden rounded-3xl border border-brand/40 bg-gradient-to-br from-surface via-brand-soft to-info-soft p-6 sm:p-10 lg:p-12"
      >
        <div aria-hidden="true" className="sg-dotgrid" />
        <div aria-hidden="true" className="sg-dotgrid-lit" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#2DD4BF]/20 blur-3xl"
        />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-surface/80 px-3.5 py-1 text-xs font-semibold text-brand-ink shadow-xs backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              <span>{L(COPY.heroBadge)}</span>
            </div>
            <h1
              lang={locale}
              className={`font-extrabold tracking-tight text-balance text-ink ${
                locale === "bn"
                  ? "text-[2rem] leading-[1.28] sm:text-[2.9rem] sm:leading-[1.24]"
                  : "text-3xl leading-[1.12] sm:text-5xl sm:leading-[1.08]"
              }`}
            >
              {L(COPY.heroTitleA)}
              <span className="mt-1 block bg-gradient-to-r from-brand-ink to-info-ink bg-clip-text pb-1 text-transparent">
                {L(COPY.heroTitleB)}
              </span>
            </h1>
            <p lang={locale} className={`max-w-xl text-pretty text-ink-2 sm:text-lg ${locale === "bn" ? "text-base leading-[1.85]" : "text-base leading-relaxed"}`}>
              {L(COPY.heroSub)}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#126338] via-[#0F766E] to-[#11877A] px-6 py-3.5 text-base font-bold text-white shadow-[0_10px_24px_rgb(13_116_109/0.24)] ring-1 ring-white/35 transition duration-200 hover:-translate-y-0.5 hover:saturate-110 hover:shadow-[0_14px_30px_rgb(13_116_109/0.3)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand sm:w-auto sm:px-8"
              >
                {L(COPY.ctaPrimary)}
                <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full border border-white/90 bg-surface/85 px-6 py-3.5 text-base font-semibold text-ink shadow-[0_8px_24px_rgb(23_42_51/0.08)] backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-brand/25 hover:bg-surface hover:shadow-[0_12px_28px_rgb(23_42_51/0.12)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand sm:w-auto sm:px-8"
              >
                {L(COPY.ctaSecondary)}
              </Link>
            </div>
            <p className="text-xs text-ink-3">{L(COPY.demoNote)}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          >
            <motion.div style={reduceMotion ? undefined : { y: artY, scale: artScale, opacity: artOpacity }}>
              <CareNetworkIllustration className="h-auto w-full drop-shadow-2xl" />
            </motion.div>
          </motion.div>
        </div>

        {/* ROLE & TASK ROUTER */}
        <div
          aria-label={locale === "bn" ? "ভূমিকা অনুযায়ী দ্রুত প্রবেশ" : "Choose your workflow by role"}
          className="relative mt-8 grid gap-3 border-t border-brand/20 pt-6 sm:grid-cols-3"
        >
          <Link
            href="/dispatch"
            className="group flex min-h-14 flex-col justify-between rounded-2xl border border-brand/25 bg-surface/85 p-4 transition hover:border-brand hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink">
                {locale === "bn" ? "১. জরুরি ডিসপ্যাচ" : "1. Emergency Dispatch"}
              </span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 text-brand-ink transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs text-ink-2">
              {locale === "bn"
                ? "রোগীর ভাইটাল → আইসিইউ ও রক্ত মেলানো → চিকিৎসকের অনুমোদনে বেড বুকিং"
                : "Patient vitals → ICU & blood match → clinician-approved bed hold"}
            </p>
          </Link>
          <Link
            href="/facility"
            className="group flex min-h-14 flex-col justify-between rounded-2xl border border-brand/25 bg-surface/85 p-4 transition hover:border-brand hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink">
                {locale === "bn" ? "২. হাসপাতাল সক্ষমতা" : "2. Facility Capacity"}
              </span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 text-brand-ink transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs text-ink-2">
              {locale === "bn"
                ? "আইসিইউ বেড ও রক্তের মজুদ আপডেট এবং আগত রোগী নিশ্চিত করুন"
                : "Update live ICU beds & blood stock and confirm incoming holds"}
            </p>
          </Link>
          <Link
            href="/dashboard/triage"
            className="group flex min-h-14 flex-col justify-between rounded-2xl border border-brand/25 bg-surface/85 p-4 transition hover:border-brand hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink">
                {locale === "bn" ? "৩. অ্যান্টিবায়োটিক স্টুয়ার্ডশিপ" : "3. Antibiotic Stewardship"}
              </span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 text-brand-ink transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs text-ink-2">
              {locale === "bn"
                ? "WHO AWaRe নির্দেশিকা অনুযায়ী নিরাপদ ওষুধ নির্বাচন (অফলাইন-সহ)"
                : "WHO AWaRe-guided regimen selection from clinic stock (works offline)"}
            </p>
          </Link>
        </div>
      </section>

      {/* BUILT ON — marquee (pauses on hover; static wrap under reduced motion) */}
      <section aria-label={L(c("Built on", "যার উপর তৈরি"))} className="-mt-6 sm:-mt-12">
        <div className="sg-marquee py-1">
          <ul className="sg-marquee-track">
            {[0, 1].map((copy) => (
              <React.Fragment key={copy}>
                {BUILT_ON.map((item, i) => (
                  <li
                    key={`${copy}-${i}`}
                    aria-hidden={copy === 1 ? true : undefined}
                    className={`mx-1.5 my-1 inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface/70 px-4 py-2 text-sm font-semibold whitespace-nowrap text-ink-2 backdrop-blur-sm ${copy === 1 ? "sg-marquee-dup" : ""}`}
                  >
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
                    {L(item)}
                  </li>
                ))}
              </React.Fragment>
            ))}
          </ul>
        </div>
      </section>

      {/* EVIDENCE */}
      <section aria-labelledby="evidence-title" className="space-y-6">
        <h2 id="evidence-title" className="text-xl font-bold text-ink sm:text-2xl">
          {L(COPY.evidenceTitle)}
        </h2>
        <motion.ul
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ staggerChildren: 0.08 }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {EVIDENCE.map((e) => (
            <motion.li
              key={e.value}
              variants={fadeUp}
              onPointerMove={trackSpotlight}
              className="sg-spotlight mac-card p-5"
            >
              <p className="text-3xl font-extrabold tracking-tight text-brand-ink tabular-nums">
                <NumberTicker value={e.value} />
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{L(e.label)}</p>
              <p className="mt-3 text-xs font-semibold tracking-wide text-ink-3 uppercase">{e.source}</p>
              <p className="mt-0.5 text-xs text-ink-3">{L(e.detail)}</p>
            </motion.li>
          ))}
        </motion.ul>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {EUROPE_PMC_REFERENCES.map((ref) => (
            <a
              key={ref.pmcid}
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group mac-card flex flex-col justify-between p-3.5 text-xs transition duration-150 hover:-translate-y-0.5 hover:border-brand/35"
            >
              <div>
                <span className="inline-block rounded bg-brand-soft px-2 py-0.5 font-mono text-xs font-bold text-brand-ink">
                  {ref.pmcid} · {ref.year}
                </span>
                <p className="mt-1.5 line-clamp-2 font-semibold text-ink group-hover:text-brand-ink">
                  {ref.title}
                </p>
              </div>
              <p className="mt-2 text-xs text-ink-3">
                {ref.journal} · {L(ref.topic)}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* PILLARS */}
      <section aria-labelledby="pillars-title" className="space-y-6">
        <h2 id="pillars-title" className="text-xl font-bold text-ink sm:text-2xl">
          {L(COPY.pillarsTitle)}
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <motion.article
                key={p.names[0]}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.3 }}
                variants={fadeUp}
                onPointerMove={trackSpotlight}
                style={{ "--sg-spot": p.tone === "success" ? "var(--sg-success)" : "var(--sg-info)" } as React.CSSProperties}
                className="group sg-spotlight relative overflow-hidden mac-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                    p.tone === "success" ? "bg-success-soft text-success-ink" : "bg-info-soft text-info-ink"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-ink">{L(p.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{L(p.body)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.names.map((n) => (
                    <span
                      key={n}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        p.tone === "success"
                          ? "border-success/30 bg-success-soft text-success-ink"
                          : "border-info/30 bg-info-soft text-info-ink"
                      }`}
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      {/* FEATURES */}
      <section aria-labelledby="features-title" className="space-y-6">
        <div className="max-w-2xl space-y-2">
          <h2 id="features-title" className="text-xl font-bold text-ink sm:text-2xl">
            {L(COPY.featuresTitle)}
          </h2>
          <p className="text-sm text-ink-2">{L(COPY.featuresSub)}</p>
        </div>
        <motion.ul
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          transition={{ staggerChildren: 0.05 }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((f) => {
            const href = FEATURE_ROUTES[f.id] ?? "/dashboard";
            const wide = WIDE_FEATURES.has(f.id);
            return (
              <motion.li key={f.id} variants={fadeUp} className={wide ? "lg:col-span-2" : undefined}>
                <Link
                  href={href}
                  onPointerMove={trackSpotlight}
                  style={{ "--sg-spot": f.accent } as React.CSSProperties}
                  className={`group sg-spotlight relative flex h-full flex-col mac-card transition duration-150 hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-lg active:scale-[0.99] ${wide ? "p-6 lg:p-7" : "p-5"}`}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-1 rounded-t-2xl transition-opacity group-hover:opacity-90"
                    style={{ backgroundColor: f.accent }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`font-bold text-ink transition-colors group-hover:text-brand-ink ${wide ? "text-lg lg:text-xl" : "text-base"}`}>
                      {f.name}
                    </h3>
                    <span className="rounded-md bg-fill px-2 py-0.5 text-xs font-bold text-ink-2">
                      {f.rubric}
                    </span>
                  </div>
                  <p className={`mt-2 flex-1 leading-relaxed text-ink-2 ${wide ? "text-sm lg:max-w-xl lg:text-base" : "text-sm"}`}>{L(f.summary)}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-ink opacity-80 transition group-hover:opacity-100">
                    {L(c("Open", "খুলুন"))}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </motion.li>
            );
          })}
        </motion.ul>
      </section>

      {/* PROOF BAND */}
      <section
        aria-labelledby="proof-title"
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#042F2E] via-[#063A49] to-[#0C4A6E] p-6 text-white shadow-xl sm:p-10"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="proof-title" className="text-xl font-bold sm:text-2xl">
            {L(COPY.proofTitle)}
          </h2>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-[#A7F3D0]">
            {L(c("Interactive solver & lock proofs", "ইন্টারেক্টিভ সলভার ও লক প্রমাণ"))}
          </span>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* ConflictProof Card */}
          <div
            style={{ "--sg-beam-a": "#FCA5A5", "--sg-beam-b": "#67E8F9" } as React.CSSProperties}
            className="sg-beam flex flex-col justify-between rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur"
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#FCA5A5]">
                  <ShieldAlert aria-hidden="true" className="h-4 w-4" /> ConflictProof · A02
                </div>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-xs font-bold text-[#FDE68A]">
                  INFEASIBLE → CO-DISPATCH
                </span>
              </div>
              <p className="mt-3 text-sm text-[#D1DEE3]">
                {L(c("No single hospital satisfies all rules. Click a clashing rule to inspect why:", "কোনো একক হাসপাতাল সব নিয়ম মানে না। কারণ দেখতে যেকোনো নিয়মে ক্লিক করুন:"))}
              </p>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={L(c("Minimal unsatisfiable constraints", "ন্যূনতম সংঘর্ষ নিয়মসমূহ"))}>
                {["C_BLOOD", "C_ETA", "C_ICU", "C_PUBLIC"].map((k) => {
                  const active = selectedConstraint === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedConstraint(k)}
                      className={`rounded-md px-2.5 py-1 font-mono text-xs font-bold transition ${
                        active
                          ? "bg-[#DC2626] text-white ring-2 ring-[#FECACA]/70"
                          : "bg-danger/25 text-[#FECACA] hover:bg-danger/40"
                      }`}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 min-h-[2.5rem] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-relaxed text-[#E2E8F0]">
                <strong className="font-mono text-[#FCA5A5]">{selectedConstraint}:</strong>{" "}
                {L(CONFLICT_DETAILS[selectedConstraint])}
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#22D3EE]/25 bg-[#0891B2]/20 p-3 text-xs font-medium text-[#CFFAFE] sm:text-sm">
                <Droplets aria-hidden="true" className="h-4 w-4 shrink-0" />
                {L(c("Fix: public ICU at 7.5 min + O− blood courier at 4.1 min", "সমাধান: ৭.৫ মিনিটে সরকারি আইসিইউ + ৪.১ মিনিটে O− রক্ত কুরিয়ার"))}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-xs text-[#A7F3D0]">
                {L(c("0 clinical compromises", "০টি ক্লিনিক্যাল আপস"))}
              </span>
              <Link
                href="/dispatch"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#67E8F9] transition hover:text-white"
              >
                {L(c("Try in CareMatch", "CareMatch-এ দেখুন"))}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* RaceLab Card */}
          <div
            style={{ "--sg-beam-a": "#C4B5FD", "--sg-beam-b": "#6EE7B7" } as React.CSSProperties}
            className="sg-beam sg-beam-slow flex flex-col justify-between rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur"
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#C4B5FD]">
                  <Zap aria-hidden="true" className="h-4 w-4" /> RaceLab · A05
                </div>
                <button
                  type="button"
                  onClick={replayProofRace}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/20 active:scale-95"
                >
                  <RotateCcw aria-hidden="true" className="h-3 w-3" />
                  {L(c("Replay 25×", "২৫× রিপ্লে"))}
                </button>
              </div>
              <p className="mt-3 text-sm text-[#D1DEE3]">
                {L(c("25 simultaneous requests for 1 ICU bed:", "১টি আইসিইউ বেডের জন্য একসাথে ২৫টি অনুরোধ:"))}
              </p>
              <div
                key={proofRunId}
                className="mt-3 grid grid-cols-5 gap-1.5"
                role="img"
                aria-label="1 request succeeded, 24 rejected"
              >
                {Array.from({ length: 25 }, (_, i) => {
                  const isWin = i === proofWinner;
                  return (
                    <motion.span
                      key={`${proofRunId}-${i}`}
                      initial={{ opacity: 0.35, scale: 0.78 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.012, duration: 0.16 }}
                      title={
                        isWin
                          ? `#${String(i + 1).padStart(2, "0")} · 201 CREATED`
                          : `#${String(i + 1).padStart(2, "0")} · 409 RESOURCE_EXHAUSTED`
                      }
                      className={`flex h-8 items-center justify-center rounded-md font-mono text-xs font-bold ${
                        isWin
                          ? "bg-success text-white shadow-md shadow-[#047857]/40 ring-1 ring-white/40"
                          : "bg-white/10 text-[#FCD34D]"
                      }`}
                    >
                      {isWin ? "201" : "409"}
                    </motion.span>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <p className="flex items-center gap-2 text-xs font-medium text-[#A7F3D0] sm:text-sm">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                {L(c("1 winner · 24 rejected · 0 double bookings", "১ বিজয়ী · ২৪ প্রত্যাখ্যাত · ০ দ্বৈত বুকিং"))}
              </p>
              <Link
                href="/race-lab"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C4B5FD] transition hover:text-white"
              >
                {L(c("Open live RaceLab", "লাইভ RaceLab খুলুন"))}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* STEPS */}
      <section aria-labelledby="steps-title" className="space-y-6">
        <h2 id="steps-title" className="text-xl font-bold text-ink sm:text-2xl">
          {L(COPY.stepsTitle)}
        </h2>
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={i} className="mac-card p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <Icon aria-hidden="true" className="h-5 w-5 text-brand-ink" />
                </div>
                <h3 className="mt-4 font-bold text-ink">{L(s.title)}</h3>
                <p className="mt-1 text-sm text-ink-2">{L(s.body)}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* CLOSE */}
      <section className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-brand/40 bg-brand-soft p-6 sm:flex-row sm:items-center sm:p-10">
        <div className="max-w-xl space-y-2">
          <h2 className="text-xl font-bold text-ink sm:text-2xl">{L(COPY.closeTitle)}</h2>
          <p className="text-sm text-ink-2">{L(COPY.closeBody)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link
            href="/story"
            className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-surface px-5 py-3 text-sm font-semibold text-brand-ink shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-brand active:scale-[0.98]"
          >
            {L(c("Watch the Farmgate case", "ফার্মগেট কেসটি দেখুন"))}
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:bg-brand-strong active:scale-[0.98]"
          >
            {L(COPY.ctaSecondary)} <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <p className="sr-only">{BRAND.description}</p>
    </div>
  );
}
