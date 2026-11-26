"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Droplets,
  Lock,
  Pill,
  ShieldAlert,
  Stethoscope,
  Zap,
} from "lucide-react";
import { useI18n, type Locale } from "@/lib/i18n";
import { BRAND, FEATURES } from "@/lib/brand";
import { CareNetworkIllustration } from "@/components/brand/CareNetworkIllustration";

type Copy = Record<Locale, string>;
const c = (en: string, bn: string): Copy => ({ en, bn });

const COPY = {
  badge: c("Built for Bangladesh · Hack the Vibe 2026", "বাংলাদেশের জন্য তৈরি · হ্যাক দ্য ভাইব ২০২৬"),
  heroTitleA: c("Provably safe care,", "প্রমাণিতভাবে নিরাপদ চিকিৎসা,"),
  heroTitleB: c("from pharmacy counter to ICU.", "ফার্মেসি কাউন্টার থেকে আইসিইউ পর্যন্ত।"),
  heroSub: c(
    "ShasthoGrid checks every antibiotic against WHO AWaRe rules, matches critical patients to a staffed ICU and compatible blood, and books the last bed without ever giving it twice.",
    "স্বাস্থ্যগ্রিড প্রতিটি অ্যান্টিবায়োটিক WHO AWaRe নিয়মে যাচাই করে, গুরুতর রোগীকে কর্মী-সমৃদ্ধ আইসিইউ ও মানানসই রক্তের সাথে মেলায়, এবং শেষ বেড কখনো দুবার বরাদ্দ করে না।"
  ),
  ctaPrimary: c("Open the command center", "কমান্ড সেন্টার খুলুন"),
  ctaSecondary: c("Sign in as a demo role", "ডেমো রোল দিয়ে সাইন ইন"),
  evidenceTitle: c("The problem, in numbers", "সমস্যাটি সংখ্যায়"),
  pillarsTitle: c("Two crises, one grid", "দুটি সংকট, একটি গ্রিড"),
  featuresTitle: c("Every feature, named and accountable", "প্রতিটি ফিচার, নামসহ ও জবাবদিহিমূলক"),
  featuresSub: c(
    "Each feature maps to the hackathon rubric item it proves, so nothing is counted twice.",
    "প্রতিটি ফিচার রুব্রিকের যে অংশ প্রমাণ করে তার সাথে মিলানো — কিছুই দুবার গোনা হয় না।"
  ),
  proofTitle: c("Proof, not promises", "প্রতিশ্রুতি নয়, প্রমাণ"),
  stepsTitle: c("How a case flows through ShasthoGrid", "স্বাস্থ্যগ্রিডে একটি কেস যেভাবে এগোয়"),
  closeTitle: c("Try the impossible case yourself.", "অসম্ভব কেসটি নিজেই চেষ্টা করুন।"),
  closeBody: c(
    "Sign in with a demo role, run an infeasible request, and watch ConflictProof explain it — then fire RaceLab at the final bed.",
    "ডেমো রোলে সাইন ইন করুন, একটি অসম্ভব অনুরোধ চালান, ConflictProof এর ব্যাখ্যা দেখুন — তারপর শেষ বেডে RaceLab চালান।"
  ),
  demoNote: c(
    "Bed and blood counts are simulated demo data. Clinical staff make every final decision.",
    "বেড ও রক্তের সংখ্যা সিমুলেটেড ডেমো ডেটা। চূড়ান্ত সিদ্ধান্ত চিকিৎসা কর্মীর।"
  ),
};

const EVIDENCE: { value: string; label: Copy; source: string }[] = [
  {
    value: "92.4%",
    label: c(
      "of surveyed pharmacy staff dispense antibiotics without a prescription",
      "জরিপকৃত ফার্মেসি কর্মী প্রেসক্রিপশন ছাড়া অ্যান্টিবায়োটিক দেন"
    ),
    source: "PMC12778233",
  },
  {
    value: "~50%",
    label: c(
      "of Bangladesh public ICU beds sit idle for lack of staff",
      "বাংলাদেশের সরকারি আইসিইউ বেড কর্মী সংকটে অলস পড়ে থাকে"
    ),
    source: "New Age, Apr 2026",
  },
  {
    value: "74.5%",
    label: c(
      "of maternal & perinatal deaths in an LMIC cohort involved 2+ referrals",
      "একটি নিম্ন-মধ্যম আয়ের দেশের গবেষণায় মাতৃ ও নবজাতক মৃত্যুর ক্ষেত্রে ২+ বার রেফারাল"
    ),
    source: "J Glob Health 2026",
  },
  {
    value: "≥60%",
    label: c(
      "WHO target share of antibiotic use from the Access group",
      "WHO লক্ষ্য: অ্যান্টিবায়োটিক ব্যবহারের অন্তত ৬০% অ্যাক্সেস গ্রুপ থেকে"
    ),
    source: "WHO AWaRe",
  },
];

const PILLARS = [
  {
    icon: Pill,
    accent: "#059669",
    tint: "#ECFDF5",
    title: c("Antibiotic stewardship", "অ্যান্টিবায়োটিক স্টুয়ার্ডশিপ"),
    body: c(
      "RxSolve picks the safest stocked Access antibiotic, refuses antibiotics for mild viral illness, and routes Watch/Reserve drugs to a pharmacist. FreshStock dispenses the earliest-expiring lot.",
      "RxSolve মজুতে থাকা সবচেয়ে নিরাপদ অ্যাক্সেস অ্যান্টিবায়োটিক বাছে, মৃদু ভাইরাল রোগে অ্যান্টিবায়োটিক প্রত্যাখ্যান করে এবং ওয়াচ/রিজার্ভ ওষুধ ফার্মাসিস্টের কাছে পাঠায়।"
    ),
    names: ["RxSolve", "FreshStock", "StewardLens"],
  },
  {
    icon: Activity,
    accent: "#0891B2",
    tint: "#ECFEFF",
    title: c("Critical-care allocation", "জরুরি চিকিৎসা বরাদ্দ"),
    body: c(
      "PulseScore rates acuity with NEWS2. CareMatch finds a staffed ICU, ventilator and compatible blood within the golden hour — or pairs an ICU with a blood-hub courier. LockStep books it atomically.",
      "PulseScore NEWS2 দিয়ে তীব্রতা মাপে। CareMatch গোল্ডেন আওয়ারের মধ্যে আইসিইউ, ভেন্টিলেটর ও মানানসই রক্ত খোঁজে — বা আইসিইউর সাথে ব্লাড-হাব কুরিয়ার জোড়ে। LockStep তা পারমাণবিকভাবে বুক করে।"
    ),
    names: ["PulseScore", "CareMatch", "LockStep"],
  },
];

const STEPS = [
  { icon: Stethoscope, title: c("Intake", "ইনটেক"), body: c("Vitals or a Bangla/English note via Shastho Copilot.", "ভাইটাল বা বাংলা/ইংরেজি নোট, Shastho Copilot দিয়ে।") },
  { icon: BrainCircuit, title: c("Solve", "সমাধান"), body: c("CP-SAT finds the optimal option in milliseconds.", "CP-SAT মিলিসেকেন্ডে সেরা বিকল্প খোঁজে।") },
  { icon: ShieldAlert, title: c("Explain", "ব্যাখ্যা"), body: c("ConflictProof names the exact clashing rules and fixes.", "ConflictProof সংঘর্ষরত নিয়ম ও সমাধান দেখায়।") },
  { icon: Lock, title: c("Lock", "লক"), body: c("A human approves; LockStep reserves bed and blood together.", "মানুষ অনুমোদন দেয়; LockStep বেড ও রক্ত একসাথে সংরক্ষণ করে।") },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
} as const;

export default function HomePage() {
  const { locale } = useI18n();
  const L = (copy: Copy) => copy[locale] ?? copy.en;

  return (
    <div className="space-y-16 pb-8 sm:space-y-24">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-[#CCFBF1] bg-gradient-to-br from-white via-[#F0FDFA] to-[#ECFEFF] p-6 sm:p-10 lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#2DD4BF]/20 blur-3xl"
        />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#0F766E]/25 bg-white/80 px-3 py-1 text-xs font-semibold text-[#0F766E]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#14B8A6] opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0F766E]" />
              </span>
              {L(COPY.badge)}
            </span>
            <h1 className="text-3xl leading-tight font-extrabold tracking-tight text-[#172A33] sm:text-5xl">
              {L(COPY.heroTitleA)}
              <span className="block bg-gradient-to-r from-[#0F766E] to-[#0891B2] bg-clip-text text-transparent">
                {L(COPY.heroTitleB)}
              </span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-[#536975] sm:text-lg">
              {L(COPY.heroSub)}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#126338] via-[#0F766E] to-[#11877A] px-6 py-3.5 text-base font-bold text-white shadow-[0_10px_24px_rgb(13_116_109/0.24)] ring-1 ring-white/35 transition duration-200 hover:-translate-y-0.5 hover:saturate-110 hover:shadow-[0_14px_30px_rgb(13_116_109/0.3)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#0F766E] sm:w-auto sm:px-8"
              >
                {L(COPY.ctaPrimary)}
                <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full border border-white/90 bg-white/85 px-6 py-3.5 text-base font-semibold text-[#172A33] shadow-[0_8px_24px_rgb(23_42_51/0.08)] backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-[#0F766E]/25 hover:bg-white hover:shadow-[0_12px_28px_rgb(23_42_51/0.12)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#0F766E] sm:w-auto sm:px-8"
              >
                {L(COPY.ctaSecondary)}
              </Link>
            </div>
            <p className="text-xs text-[#5C727E]">{L(COPY.demoNote)}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          >
            <CareNetworkIllustration className="h-auto w-full drop-shadow-2xl" />
          </motion.div>
        </div>
      </section>

      {/* EVIDENCE */}
      <section aria-labelledby="evidence-title" className="space-y-6">
        <h2 id="evidence-title" className="text-xl font-bold text-[#172A33] sm:text-2xl">
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
              className="mac-card p-5"
            >
              <p className="text-3xl font-extrabold tracking-tight text-[#0F766E] tabular-nums">{e.value}</p>
              <p className="mt-2 text-sm leading-relaxed text-[#405663]">{L(e.label)}</p>
              <p className="mt-3 text-[11px] font-semibold tracking-wide text-[#91A2AB] uppercase">{e.source}</p>
            </motion.li>
          ))}
        </motion.ul>
      </section>

      {/* PILLARS */}
      <section aria-labelledby="pillars-title" className="space-y-6">
        <h2 id="pillars-title" className="text-xl font-bold text-[#172A33] sm:text-2xl">
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
                className="group relative overflow-hidden mac-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: p.tint, color: p.accent }}
                >
                  <Icon aria-hidden="true" className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-[#172A33]">{L(p.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#536975]">{L(p.body)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.names.map((n) => (
                    <span
                      key={n}
                      className="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                      style={{ borderColor: `${p.accent}40`, color: p.accent }}
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
          <h2 id="features-title" className="text-xl font-bold text-[#172A33] sm:text-2xl">
            {L(COPY.featuresTitle)}
          </h2>
          <p className="text-sm text-[#536975]">{L(COPY.featuresSub)}</p>
        </div>
        <motion.ul
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          transition={{ staggerChildren: 0.05 }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <motion.li
              key={f.id}
              variants={fadeUp}
              className="relative mac-card p-5"
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
                style={{ backgroundColor: f.accent }}
              />
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-[#172A33]">{f.name}</h3>
                <span className="rounded-md bg-[#EDF3F5] px-2 py-0.5 text-[11px] font-bold text-[#536975]">
                  {f.rubric}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#536975]">{L(f.summary)}</p>
            </motion.li>
          ))}
        </motion.ul>
      </section>

      {/* PROOF BAND */}
      <section
        aria-labelledby="proof-title"
        className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#042F2E] to-[#0C4A6E] p-6 text-white sm:p-10"
      >
        <h2 id="proof-title" className="text-xl font-bold sm:text-2xl">
          {L(COPY.proofTitle)}
        </h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#FCA5A5]">
              <ShieldAlert aria-hidden="true" className="h-4 w-4" /> ConflictProof · A02
            </div>
            <p className="mt-3 text-sm text-[#D1DEE3]">
              {L(c("No single hospital satisfies all rules. The minimal clashing set:", "কোনো একক হাসপাতাল সব নিয়ম মানে না। ন্যূনতম সংঘর্ষ সেট:"))}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["C_BLOOD", "C_ETA", "C_ICU", "C_PUBLIC"].map((k) => (
                <span key={k} className="rounded-md bg-[#DC2626]/20 px-2 py-1 font-mono text-xs font-bold text-[#FECACA]">
                  {k}
                </span>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#0891B2]/20 p-3 text-sm text-[#CFFAFE]">
              <Droplets aria-hidden="true" className="h-4 w-4 shrink-0" />
              {L(c("Fix: public ICU at 7.5 min + O− blood courier at 4.1 min", "সমাধান: ৭.৫ মিনিটে সরকারি আইসিইউ + ৪.১ মিনিটে O− রক্ত কুরিয়ার"))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#C4B5FD]">
              <Zap aria-hidden="true" className="h-4 w-4" /> RaceLab · A05
            </div>
            <p className="mt-3 text-sm text-[#D1DEE3]">
              {L(c("25 simultaneous requests for 1 ICU bed:", "১টি আইসিইউ বেডের জন্য একসাথে ২৫টি অনুরোধ:"))}
            </p>
            <div className="mt-3 grid grid-cols-5 gap-1.5" role="img" aria-label="1 request succeeded, 24 rejected">
              {Array.from({ length: 25 }, (_, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.6 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.03 }}
                  className={`flex h-8 items-center justify-center rounded-md font-mono text-[10px] font-bold ${
                    i === 7 ? "bg-[#10B981] text-white" : "bg-white/10 text-[#FCD34D]"
                  }`}
                >
                  {i === 7 ? "201" : "409"}
                </motion.span>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-[#A7F3D0]">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              {L(c("1 winner · 24 rejected · 0 double bookings", "১ বিজয়ী · ২৪ প্রত্যাখ্যাত · ০ দ্বৈত বুকিং"))}
            </p>
          </div>
        </div>
      </section>

      {/* STEPS */}
      <section aria-labelledby="steps-title" className="space-y-6">
        <h2 id="steps-title" className="text-xl font-bold text-[#172A33] sm:text-2xl">
          {L(COPY.stepsTitle)}
        </h2>
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={i} className="mac-card p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0F766E] text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <Icon aria-hidden="true" className="h-5 w-5 text-[#0F766E]" />
                </div>
                <h3 className="mt-4 font-bold text-[#172A33]">{L(s.title)}</h3>
                <p className="mt-1 text-sm text-[#536975]">{L(s.body)}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* CLOSE */}
      <section className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-[#CCFBF1] bg-[#F0FDFA] p-6 sm:flex-row sm:items-center sm:p-10">
        <div className="max-w-xl space-y-2">
          <h2 className="text-xl font-bold text-[#172A33] sm:text-2xl">{L(COPY.closeTitle)}</h2>
          <p className="text-sm text-[#536975]">{L(COPY.closeBody)}</p>
        </div>
        <Link
          href="/login"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#0F766E] px-5 py-3 text-sm font-semibold text-white hover:bg-[#115E59]"
        >
          {L(COPY.ctaSecondary)} <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </section>

      <p className="sr-only">{BRAND.description}</p>
    </div>
  );
}
