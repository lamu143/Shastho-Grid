"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, CheckCircle2, ChevronRight, CircleHelp,
  Clock3, LoaderCircle, Maximize2, MessageCircle, Minimize2, ShieldCheck,
  Sparkles, Stethoscope, Workflow,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useI18n } from "@/lib/i18n";
import { copilotTriageAssist, type CopilotResult } from "@/lib/criticalCare";
import { FARMGATE } from "@/lib/criticalCare";
import { AssistantOrb } from "@/components/brand/AssistantOrb";
import { SathiChat } from "@/components/SathiChat";

type Locale = "en" | "bn";
const c = (locale: Locale, en: string, bn: string) => locale === "bn" ? bn : en;

function CopilotWorkspace({ initialMode }: { initialMode: "guide" | "agent" }) {
  const { locale } = useI18n();
  const { user } = useAuth();
  const [mode, setMode] = useState<"guide" | "agent">(initialMode);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [caseReviewed, setCaseReviewed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const L = (en: string, bn: string) => c(locale, en, bn);

  const runAgent = async () => {
    if (!note.trim()) return;
    setBusy(true); setError(null); setResult(null); setCaseReviewed(false);
    try {
      setResult(await copilotTriageAssist(note.trim(), FARMGATE.lat, FARMGATE.lon));
    } catch (e) {
      setError(e instanceof Error ? e.message : L("The assessment could not be completed.", "মূল্যায়ন সম্পন্ন করা যায়নি।"));
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand-ink"><Sparkles className="h-3.5 w-3.5" />{L("CLINICAL SUPPORT · EN / বাংলা", "ক্লিনিক্যাল সহায়তা · EN / বাংলা")}</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Shastho Sathi</h1>
          <p className="mt-1 text-sm text-ink-3">{L("Shastho Copilot · your care workflow companion", "Shastho Copilot · আপনার চিকিৎসা-প্রবাহের সহায়ক")}</p>
        </div>
        <Link href="/dispatch" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-strong">{L("Open CareMatch dispatch", "CareMatch ডিসপ্যাচ খুলুন")}<ArrowRight className="h-4 w-4" /></Link>
      </header>

      <section className={`sg-copilot-panel sg-dark-scope overflow-hidden ${expanded ? "sg-copilot-expanded fixed inset-0 z-50 overflow-y-auto rounded-none" : "rounded-3xl"}`} aria-label={L("Shastho Sathi assistant", "স্বাস্থ্য সাথী সহকারী")}>
            <div className="flex flex-col gap-4 border-b border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <AssistantOrb />
            <div><h2 className="font-bold text-white">{L("Shastho Sathi", "Shastho Sathi")}</h2><p className="text-xs text-white/55">{L("Your bilingual care companion", "আপনার দ্বিভাষিক চিকিৎসা সহায়ক")}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="segmented grid grid-cols-2 border border-white/10 bg-surface/5 sm:min-w-64">
              <button type="button" onClick={() => setMode("guide")} aria-pressed={mode === "guide"} className={`inline-flex items-center justify-center gap-2 rounded-[0.6rem] px-3 py-2 text-sm font-semibold ${mode === "guide" ? "bg-white text-[#14161C] shadow-sm" : "text-white/70 hover:text-white"}`}><MessageCircle className="h-4 w-4"/>{L("Guide", "সহায়তা")}</button>
              <button type="button" onClick={() => setMode("agent")} aria-pressed={mode === "agent"} className={`inline-flex items-center justify-center gap-2 rounded-[0.6rem] px-3 py-2 text-sm font-semibold ${mode === "agent" ? "bg-white text-[#14161C] shadow-sm" : "text-white/70 hover:text-white"}`}><Workflow className="h-4 w-4"/>{L("Case agent", "কেস এজেন্ট")}</button>
            </div>
            <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? L("Exit expanded view", "বড় দৃশ্য বন্ধ করুন") : L("Expand assistant", "সহকারী বড় করে দেখুন")} title={expanded ? L("Exit expanded view", "বড় দৃশ্য বন্ধ করুন") : L("Expand assistant", "সহকারী বড় করে দেখুন")} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-surface/5 text-white/80 transition hover:bg-surface/10 hover:text-white">
              {expanded ? <Minimize2 className="h-4 w-4"/> : <Maximize2 className="h-4 w-4"/>}
            </button>
          </div>
        </div>

        {mode === "guide" ? (
          <div className="sg-copilot-chat grid min-h-[38rem] lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="flex min-h-[34rem] flex-col">
              <SathiChat inputId="guide-question" />
            </div>
            <aside className="border-t border-white/10 bg-white/[0.03] p-4 sm:p-6 lg:border-t-0 lg:border-l lg:border-white/10">
              <h3 className="mb-4 text-xs font-bold tracking-wider text-white/50 uppercase">{L("Go to a workflow", "কাজের ধাপে যান")}</h3>
              <div className="space-y-2">
                {[{href:"/dispatch", icon:Stethoscope, title:L("CareMatch", "CareMatch"), body:L("Find critical-care resources", "জরুরি সেবার সম্পদ খুঁজুন")},{href:"/dashboard/triage",icon:Activity,title:L("RxSolve", "RxSolve"),body:L("Review antibiotic options", "অ্যান্টিবায়োটিক বিকল্প দেখুন")},{href:"/dashboard/analytics",icon:Clock3,title:L("StewardLens", "StewardLens"),body:L("Check service indicators", "সেবার সূচক দেখুন")}].map((item)=><Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-surface/10"><span className="rounded-lg border border-white/10 bg-surface/10 p-2 text-teal-100"><item.icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white/90">{item.title}</span><span className="block text-xs text-white/50">{item.body}</span></span><ChevronRight className="h-4 w-4 text-white/35"/></Link>)}
              </div>
              <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-xs leading-relaxed text-white/65"><ShieldCheck className="mb-2 h-4 w-4 text-teal-200"/>{L("Guidance only. Clinical decisions stay with the treating team.", "এটি সহায়ক নির্দেশনা। চিকিৎসার সিদ্ধান্ত চিকিৎসক দল নেবে।")}</div>
            </aside>
          </div>
        ) : !user ? (
          <div className="grid min-h-[24rem] place-items-center p-6 sm:p-10">
            <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.045] px-7 py-8 text-center shadow-2xl backdrop-blur-xl">
              <div className="mx-auto mb-4 w-fit"><AssistantOrb size="hero"/></div>
              <h3 className="mt-4 text-xl font-bold text-white">{L("Sign in to run the case agent", "কেস এজেন্ট চালাতে সাইন ইন করুন")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{L("The Guide is open to everyone. Case assessment is limited to authorized dispatch staff because it processes clinical notes.", "সহায়তা সবার জন্য উন্মুক্ত। ক্লিনিক্যাল নোট প্রক্রিয়াকরণের কারণে কেস মূল্যায়ন অনুমোদিত ডিসপ্যাচ কর্মীদের জন্য।")}</p>
              <Link href="/login" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-surface px-4 py-2.5 text-sm font-bold text-ink hover:bg-teal-100">{L("Sign in", "সাইন ইন করুন")}<ArrowRight className="h-4 w-4"/></Link>
            </div>
          </div>
        ) : !["dispatcher", "admin"].includes(user.role) ? (
          <div className="grid min-h-[24rem] place-items-center p-6 sm:p-10">
            <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.045] px-7 py-8 text-center shadow-2xl backdrop-blur-xl">
              <div className="mx-auto mb-4 w-fit"><AssistantOrb size="hero"/></div>
              <h3 className="mt-4 text-xl font-bold text-white">{L("Agent access is limited", "এজেন্ট ব্যবহারের অনুমতি সীমিত")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{L("Your account can use Guide. Ask your administrator for dispatcher access to run case assessments.", "আপনার অ্যাকাউন্টে সহায়তা ব্যবহার করা যাবে। কেস মূল্যায়নের জন্য অ্যাডমিনের কাছে ডিসপ্যাচার অনুমতি চান।")}</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="sg-agent-banner relative flex min-h-48 flex-col-reverse items-center justify-between gap-3 overflow-hidden rounded-3xl px-5 py-5 text-white sm:flex-row sm:px-8 lg:col-span-2">
              <div className="relative z-10 max-w-xl text-center sm:text-left">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-surface/10 px-3 py-1 text-[11px] font-bold tracking-wider text-teal-100 uppercase"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_#6ee7b7]"/>{L("Secure clinical tools ready", "নিরাপদ ক্লিনিক্যাল টুল প্রস্তুত")}</span>
                <h3 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">{L("Shastho Sathi is listening", "Shastho Sathi প্রস্তুত")}</h3>
                <p className="mt-1 text-sm text-white/65">{L("Share a de-identified case note to begin a guided assessment.", "নির্দেশিত মূল্যায়ন শুরু করতে পরিচয়মুক্ত কেস নোট দিন।")}</p>
              </div>
              <div className="relative z-10 mr-0 sm:mr-7"><AssistantOrb size="hero"/></div>
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#9D83FF]/20 blur-3xl"/>
              <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/4 h-56 w-80 rounded-full bg-[#F2A27B]/20 blur-3xl"/>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-line bg-fill p-4"><div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-ink shadow-sm"><Workflow className="h-4 w-4"/></span><p className="text-sm leading-relaxed text-ink-2">{L("The agent extracts stated vitals and care needs, calculates PulseScore, then runs CareMatch and ConflictProof. It uses the demo incident location in Farmgate, Dhaka. Remove names and identifiers before submitting.", "এজেন্ট উল্লেখিত ভাইটাল ও সেবার চাহিদা শনাক্ত করে, PulseScore হিসাব করে, এরপর CareMatch ও ConflictProof চালায়। এটি ঢাকার ফার্মগেটের ডেমো অবস্থান ব্যবহার করে। পাঠানোর আগে নাম ও পরিচয়সূচক তথ্য মুছে দিন।")}</p></div></div>
              <form onSubmit={(e)=>{e.preventDefault(); void runAgent();}} className="space-y-3"><label htmlFor="case-note" className="block text-sm font-bold text-white/95">{L("De-identified case note", "পরিচয়মুক্ত কেস নোট")}</label><textarea id="case-note" value={note} onChange={(e)=>setNote(e.target.value)} rows={6} maxLength={4000} placeholder={L("Example: 58-year-old with severe breathing difficulty; oxygen saturation 86%, respiratory rate 32, pulse 124…", "উদাহরণ: ৫৮ বছর বয়সী, তীব্র শ্বাসকষ্ট; অক্সিজেন স্যাচুরেশন ৮৬%, শ্বাসের হার ৩২, নাড়ি ১২৪…")} className="w-full resize-y rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"/><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-xs text-white/70">{note.length}/4000 · {L("Do not include names, phone numbers, or IDs.", "নাম, ফোন নম্বর বা পরিচয়পত্র নম্বর দেবেন না।")}</p><button type="submit" disabled={!note.trim() || busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}{busy ? L("Running clinical tools…", "ক্লিনিক্যাল টুল চলছে…") : L("Assess with Copilot", "Copilot দিয়ে মূল্যায়ন করুন")}</button></div></form>
              {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

              {result && <section className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-live="polite">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-wider text-brand-ink uppercase">{L("Agent assessment", "এজেন্ট মূল্যায়ন")}</p><h3 className="mt-1 text-lg font-bold text-ink">{result.brief[locale]}</h3></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${result.carematch.status === "OPTIMAL" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{result.carematch.status === "OPTIMAL" ? L("Match found", "মিল পাওয়া গেছে") : L("No exact match", "সরাসরি মিল নেই")}</span></div>
                {result.carematch.news2 && <div className="flex flex-wrap gap-2"><span className="rounded-lg bg-fill px-3 py-2 text-sm font-semibold">PulseScore NEWS2: {result.carematch.news2.score}</span><span className="rounded-lg bg-fill px-3 py-2 text-sm font-semibold">{result.carematch.news2.acuity.replaceAll("_", " ")}</span></div>}
                {result.carematch.recommendation && <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"><p className="text-xs font-bold text-emerald-800">{L("Suggested facility · verify live availability", "প্রস্তাবিত হাসপাতাল · বর্তমান প্রাপ্যতা যাচাই করুন")}</p><p className="mt-1 text-lg font-bold text-ink">{result.carematch.recommendation.name}</p><p className="text-sm text-ink-2">{result.carematch.recommendation.tier} · {result.carematch.recommendation.eta_minutes} min · ICU {result.carematch.recommendation.icu_available} · Vent {result.carematch.recommendation.vent_available}</p></div>}
                {result.carematch.conflict_proof?.mus_cores?.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="mb-2 text-sm font-bold text-amber-950">{L("Why no exact match", "সরাসরি মিল না হওয়ার কারণ")}</p>{result.carematch.conflict_proof.mus_cores.map((core,i)=><p key={i} className="text-sm text-amber-900">{core.map((key)=>result.carematch.conflict_proof?.labels[key] ?? key).join(" · ")}</p>)}{result.carematch.conflict_proof.repairs.map((repair,i)=><p key={i} className="mt-2 text-sm text-amber-950">{repair.title}: {repair.hospital.name}{repair.blood_source ? ` + ${repair.blood_source.name}` : ""}</p>)}</div> : null}
                {result.missing_vitals.length > 0 && <p className="text-sm text-amber-800">{L("Missing details to verify", "যাচাইয়ের জন্য অনুপস্থিত তথ্য")}: {result.missing_vitals.join(", ")}</p>}
                {result.tool_trace.length > 0 && <details className="rounded-xl border border-line bg-fill/60 p-3 text-xs text-ink-2"><summary className="cursor-pointer font-semibold text-ink">{L("Tool trace", "টুল ট্রেস")} ({result.tool_trace.length} {L("steps", "ধাপ")} · {result.provider_used})</summary><ol className="mt-2 space-y-1 font-mono text-[11px]">{result.tool_trace.map((s)=><li key={s.step}>{s.step}. {s.tool} · {s.duration_ms} ms</li>)}</ol></details>}
                <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-start gap-2 text-sm text-ink-2"><input type="checkbox" checked={caseReviewed} onChange={(e)=>setCaseReviewed(e.target.checked)} className="mt-1 accent-brand-ink"/><span>{L("I have reviewed this tool output with the clinical team.", "আমি ক্লিনিক্যাল দলের সাথে এই ফলাফল পর্যালোচনা করেছি।")}</span></label><Link aria-disabled={!caseReviewed} onClick={(e)=>{if(!caseReviewed)e.preventDefault();}} href="/dispatch" className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${caseReviewed ? "bg-brand text-white hover:bg-brand-strong" : "pointer-events-none bg-slate-100 text-slate-400"}`}>{L("Open CareMatch workbench", "CareMatch ওয়ার্কবেঞ্চ খুলুন")}<ArrowRight className="h-4 w-4"/></Link></div>
                <p className="text-xs text-ink-3">{L("Always confirm vitals, location, facility availability, and the full clinical context before acting. This is decision support, not a diagnosis.", "কোনো পদক্ষেপের আগে ভাইটাল, অবস্থান, হাসপাতালের প্রাপ্যতা ও পূর্ণ ক্লিনিক্যাল প্রেক্ষাপট যাচাই করুন। এটি সিদ্ধান্ত-সহায়তা, রোগ নির্ণয় নয়।")}</p>
              </section>}
            </div>
            <aside className="space-y-4">
              <div className="rounded-2xl border border-line bg-fill p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-ink"><CheckCircle2 className="h-4 w-4 text-brand-ink"/>{L("What the agent checks", "এজেন্ট যা যাচাই করে")}</h3><ul className="mt-3 space-y-3 text-xs leading-relaxed text-ink-2"><li>01 · {L("Vitals and missing information", "ভাইটাল ও অনুপস্থিত তথ্য")}</li><li>02 · {L("NEWS2 acuity and red flags", "NEWS2 তীব্রতা ও সতর্ক সংকেত")}</li><li>03 · {L("ICU, ventilator, blood and ETA", "আইসিইউ, ভেন্টিলেটর, রক্ত ও পৌঁছানোর সময়")}</li><li>04 · {L("Conflicts and verified repairs", "সংঘাত ও যাচাইকৃত বিকল্প")}</li></ul></div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"><CircleHelp className="mb-2 h-4 w-4 text-amber-800"/><p className="text-xs font-bold text-amber-950">{L("Human review required", "মানব পর্যালোচনা আবশ্যক")}</p><p className="mt-1 text-xs leading-relaxed text-amber-900">{L("The agent never books a bed or dispatches blood. Availability can change; confirm with the receiving facility.", "এজেন্ট কখনো বেড বুক বা রক্ত পাঠায় না। প্রাপ্যতা বদলাতে পারে; গ্রহণকারী হাসপাতালের সাথে নিশ্চিত করুন।")}</p></div>
              <p className="text-[11px] leading-relaxed text-white/70">{L("Agent session", "এজেন্ট সেশন")}: {result?.session_id ?? L("not started", "শুরু হয়নি")}</p>
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}

export default function CopilotPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  const { locale } = useI18n();
  // ?mode=agent opens the agent tab directly (read from the route, no post-mount flash).
  const initialMode = use(searchParams).mode === "agent" ? "agent" : "guide";
  return <CopilotWorkspace key={locale} initialMode={initialMode} />;
}
