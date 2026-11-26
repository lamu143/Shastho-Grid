"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, Bot, CheckCircle2, ChevronRight, CircleHelp,
  Clock3, LoaderCircle, Maximize2, MessageCircle, Minimize2, Send, ShieldCheck,
  Sparkles, Stethoscope, Workflow,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useI18n } from "@/lib/i18n";
import { copilotTriageAssist, type CopilotResult } from "@/lib/criticalCare";
import { FARMGATE } from "@/lib/criticalCare";
import { AssistantOrb } from "@/components/brand/AssistantOrb";
import { answerAssistantGuide, ASSISTANT_QUICK_ASKS } from "@/lib/assistantGuide";

type Locale = "en" | "bn";
const c = (locale: Locale, en: string, bn: string) => locale === "bn" ? bn : en;

function CopilotWorkspace() {
  const { locale } = useI18n();
  const { user } = useAuth();
  const [mode, setMode] = useState<"guide" | "agent">("guide");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [caseReviewed, setCaseReviewed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const L = (en: string, bn: string) => c(locale, en, bn);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "agent") setMode("agent");
  }, []);

  const ask = (text = question) => {
    const clean = text.trim();
    if (!clean) return;
    setQuestion(clean);
    setAnswer(answerAssistantGuide(clean, locale));
  };

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
          <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#0F766E]/10 px-3 py-1 text-xs font-bold text-[#0F766E]"><Sparkles className="h-3.5 w-3.5" />{L("CLINICAL SUPPORT · EN / বাংলা", "ক্লিনিক্যাল সহায়তা · EN / বাংলা")}</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#172A33] sm:text-4xl">Shastho Sathi</h1>
          <p className="mt-1 text-sm text-[#5C727E]">{L("Shastho Copilot · your care workflow companion", "Shastho Copilot · আপনার চিকিৎসা-প্রবাহের সহায়ক")}</p>
        </div>
        <Link href="/dispatch" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#115E59]">{L("Open CareMatch dispatch", "CareMatch ডিসপ্যাচ খুলুন")}<ArrowRight className="h-4 w-4" /></Link>
      </header>

      <section className={`sg-copilot-panel overflow-hidden ${expanded ? "sg-copilot-expanded fixed inset-0 z-50 overflow-y-auto rounded-none" : "rounded-3xl"}`} aria-label={L("Shastho Sathi assistant", "স্বাস্থ্য সাথী সহকারী")}>
            <div className="flex flex-col gap-4 border-b border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <AssistantOrb />
            <div><h2 className="font-bold text-white">{L("Shastho Sathi", "Shastho Sathi")}</h2><p className="text-xs text-white/55">{L("Your bilingual care companion", "আপনার দ্বিভাষিক চিকিৎসা সহায়ক")}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="segmented grid grid-cols-2 border border-white/10 bg-white/5 sm:min-w-64">
              <button type="button" onClick={() => setMode("guide")} aria-pressed={mode === "guide"} className={`inline-flex items-center justify-center gap-2 rounded-[0.6rem] px-3 py-2 text-sm font-semibold ${mode === "guide" ? "bg-white text-[#17211F] shadow-sm" : "text-white/65"}`}><MessageCircle className="h-4 w-4"/>{L("Guide", "সহায়তা")}</button>
              <button type="button" onClick={() => setMode("agent")} aria-pressed={mode === "agent"} className={`inline-flex items-center justify-center gap-2 rounded-[0.6rem] px-3 py-2 text-sm font-semibold ${mode === "agent" ? "bg-white text-[#17211F] shadow-sm" : "text-white/65"}`}><Workflow className="h-4 w-4"/>{L("Case agent", "কেস এজেন্ট")}</button>
            </div>
            <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? L("Exit expanded view", "বড় দৃশ্য বন্ধ করুন") : L("Expand assistant", "সহকারী বড় করে দেখুন")} title={expanded ? L("Exit expanded view", "বড় দৃশ্য বন্ধ করুন") : L("Expand assistant", "সহকারী বড় করে দেখুন")} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white">
              {expanded ? <Minimize2 className="h-4 w-4"/> : <Maximize2 className="h-4 w-4"/>}
            </button>
          </div>
        </div>

        {mode === "guide" ? (
          <div className="sg-copilot-chat grid min-h-[38rem] lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="flex min-h-[27rem] flex-col p-4 sm:p-6">
              <div className="flex flex-1 flex-col gap-4" aria-live="polite">
                <div className="flex max-w-2xl gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-teal-100"><Bot className="h-4 w-4"/></div><div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.07] p-4 text-sm leading-relaxed text-white/85">{L("Hello, I’m Shastho Sathi. Ask me about care workflows, or switch to Case agent for a solver-backed assessment.", "আসসালামু আলাইকুম, আমি Shastho Sathi। সেবার ধাপ সম্পর্কে জিজ্ঞাসা করুন, অথবা সলভার-ভিত্তিক মূল্যায়নে কেস এজেন্ট বেছে নিন।")}</div></div>
                {answer && <><div className="ml-auto max-w-xl rounded-2xl rounded-tr-sm border border-teal-200/20 bg-teal-500/20 p-3.5 text-sm text-white">{question}</div><div className="flex max-w-2xl gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-teal-100"><Bot className="h-4 w-4"/></div><div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.07] p-4 text-sm leading-relaxed text-white/85">{answer}</div></div></>}
              </div>
              <div className="mt-6 flex flex-wrap gap-2">{ASSISTANT_QUICK_ASKS[locale].map((item) => <button type="button" key={item} onClick={() => ask(item)} className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-left text-xs font-semibold text-white/75 transition hover:border-teal-200/50 hover:bg-white/10 hover:text-white">{item}</button>)}</div>
              <div className="my-5 flex flex-col items-center gap-2 text-center"><AssistantOrb size="hero"/><p className="text-sm font-medium text-white/60">{L("Ready when you are", "আপনি প্রস্তুত হলে শুরু করুন")}</p><p className="text-xs text-white/40">{L("Type a question below · clinical decisions stay with your team", "নিচে প্রশ্ন লিখুন · ক্লিনিক্যাল সিদ্ধান্ত আপনার দলের")}</p></div>
              <form className="mt-1 flex gap-2 rounded-2xl border border-white/15 bg-black/20 p-2 shadow-inner backdrop-blur-xl" onSubmit={(e) => { e.preventDefault(); ask(); }}><label htmlFor="guide-question" className="sr-only">{L("Ask about ShasthoGrid", "ShasthoGrid সম্পর্কে জিজ্ঞাসা করুন")}</label><input id="guide-question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={L("Ask about a workflow…", "কোনো কাজের ধাপ সম্পর্কে জিজ্ঞাসা করুন…")} className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/40"/><button className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#17211F] transition hover:bg-teal-100" aria-label={L("Send question", "প্রশ্ন পাঠান")}><Send className="h-4 w-4"/></button></form>
            </div>
            <aside className="border-t border-white/10 bg-black/10 p-4 sm:p-6 lg:border-t-0 lg:border-l lg:border-white/10">
              <h3 className="mb-4 text-xs font-bold tracking-wider text-white/50 uppercase">{L("Go to a workflow", "কাজের ধাপে যান")}</h3>
              <div className="space-y-2">
                {[{href:"/dispatch", icon:Stethoscope, title:L("CareMatch", "CareMatch"), body:L("Find critical-care resources", "জরুরি সেবার সম্পদ খুঁজুন")},{href:"/dashboard/triage",icon:Activity,title:L("RxSolve", "RxSolve"),body:L("Review antibiotic options", "অ্যান্টিবায়োটিক বিকল্প দেখুন")},{href:"/dashboard/analytics",icon:Clock3,title:L("StewardLens", "StewardLens"),body:L("Check service indicators", "সেবার সূচক দেখুন")}].map((item)=><Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-white/10"><span className="rounded-lg border border-white/10 bg-white/10 p-2 text-teal-100"><item.icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white/90">{item.title}</span><span className="block text-xs text-white/50">{item.body}</span></span><ChevronRight className="h-4 w-4 text-white/35"/></Link>)}
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
              <Link href="/login" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#17211F] hover:bg-teal-100">{L("Sign in", "সাইন ইন করুন")}<ArrowRight className="h-4 w-4"/></Link>
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
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold tracking-wider text-teal-100 uppercase"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_#6ee7b7]"/>{L("Secure clinical tools ready", "নিরাপদ ক্লিনিক্যাল টুল প্রস্তুত")}</span>
                <h3 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">{L("Shastho Sathi is listening", "Shastho Sathi প্রস্তুত")}</h3>
                <p className="mt-1 text-sm text-white/65">{L("Share a de-identified case note to begin a guided assessment.", "নির্দেশিত মূল্যায়ন শুরু করতে পরিচয়মুক্ত কেস নোট দিন।")}</p>
              </div>
              <div className="relative z-10 mr-0 sm:mr-7"><AssistantOrb size="hero"/></div>
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#9D83FF]/20 blur-3xl"/>
              <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/4 h-56 w-80 rounded-full bg-[#F2A27B]/20 blur-3xl"/>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#DCEAE7] bg-[#F5FAF9] p-4"><div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#0F766E] shadow-sm"><Workflow className="h-4 w-4"/></span><p className="text-sm leading-relaxed text-[#45615D]">{L("The agent extracts stated vitals and care needs, calculates PulseScore, then runs CareMatch and ConflictProof. It uses the demo incident location in Farmgate, Dhaka. Remove names and identifiers before submitting.", "এজেন্ট উল্লেখিত ভাইটাল ও সেবার চাহিদা শনাক্ত করে, PulseScore হিসাব করে, এরপর CareMatch ও ConflictProof চালায়। এটি ঢাকার ফার্মগেটের ডেমো অবস্থান ব্যবহার করে। পাঠানোর আগে নাম ও পরিচয়সূচক তথ্য মুছে দিন।")}</p></div></div>
              <form onSubmit={(e)=>{e.preventDefault(); void runAgent();}} className="space-y-3"><label htmlFor="case-note" className="block text-sm font-bold text-[#172A33]">{L("De-identified case note", "পরিচয়মুক্ত কেস নোট")}</label><textarea id="case-note" value={note} onChange={(e)=>setNote(e.target.value)} rows={6} maxLength={4000} placeholder={L("Example: 58-year-old with severe breathing difficulty; oxygen saturation 86%, respiratory rate 32, pulse 124…", "উদাহরণ: ৫৮ বছর বয়সী, তীব্র শ্বাসকষ্ট; অক্সিজেন স্যাচুরেশন ৮৬%, শ্বাসের হার ৩২, নাড়ি ১২৪…")} className="w-full resize-y rounded-2xl border border-[#D1DEE3] bg-white p-4 text-sm leading-relaxed text-[#172A33] placeholder:text-[#91A2AB] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/15"/><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-xs text-[#5C727E]">{note.length}/4000 · {L("Do not include names, phone numbers, or IDs.", "নাম, ফোন নম্বর বা পরিচয়পত্র নম্বর দেবেন না।")}</p><button type="submit" disabled={!note.trim() || busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#115E59] disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}{busy ? L("Running clinical tools…", "ক্লিনিক্যাল টুল চলছে…") : L("Assess with Copilot", "Copilot দিয়ে মূল্যায়ন করুন")}</button></div></form>
              {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

              {result && <section className="space-y-4 rounded-2xl border border-[#DCE4E7] bg-white p-4 sm:p-5" aria-live="polite">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-wider text-[#0F766E] uppercase">{L("Agent assessment", "এজেন্ট মূল্যায়ন")}</p><h3 className="mt-1 text-lg font-bold text-[#102A2A]">{result.brief[locale]}</h3></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${result.carematch.status === "OPTIMAL" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{result.carematch.status === "OPTIMAL" ? L("Match found", "মিল পাওয়া গেছে") : L("No exact match", "সরাসরি মিল নেই")}</span></div>
                {result.carematch.news2 && <div className="flex flex-wrap gap-2"><span className="rounded-lg bg-[#EDF3F5] px-3 py-2 text-sm font-semibold">PulseScore NEWS2: {result.carematch.news2.score}</span><span className="rounded-lg bg-[#EDF3F5] px-3 py-2 text-sm font-semibold">{result.carematch.news2.acuity.replaceAll("_", " ")}</span></div>}
                {result.carematch.recommendation && <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"><p className="text-xs font-bold text-emerald-800">{L("Suggested facility · verify live availability", "প্রস্তাবিত হাসপাতাল · বর্তমান প্রাপ্যতা যাচাই করুন")}</p><p className="mt-1 text-lg font-bold text-[#102A2A]">{result.carematch.recommendation.name}</p><p className="text-sm text-[#45615D]">{result.carematch.recommendation.tier} · {result.carematch.recommendation.eta_minutes} min · ICU {result.carematch.recommendation.icu_available} · Vent {result.carematch.recommendation.vent_available}</p></div>}
                {result.carematch.conflict_proof?.mus_cores?.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="mb-2 text-sm font-bold text-amber-950">{L("Why no exact match", "সরাসরি মিল না হওয়ার কারণ")}</p>{result.carematch.conflict_proof.mus_cores.map((core,i)=><p key={i} className="text-sm text-amber-900">{core.map((key)=>result.carematch.conflict_proof?.labels[key] ?? key).join(" · ")}</p>)}{result.carematch.conflict_proof.repairs.map((repair,i)=><p key={i} className="mt-2 text-sm text-amber-950">{repair.title}: {repair.hospital.name}{repair.blood_source ? ` + ${repair.blood_source.name}` : ""}</p>)}</div> : null}
                {result.missing_vitals.length > 0 && <p className="text-sm text-amber-800">{L("Missing details to verify", "যাচাইয়ের জন্য অনুপস্থিত তথ্য")}: {result.missing_vitals.join(", ")}</p>}
                <div className="flex flex-col gap-3 border-t border-black/5 pt-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-start gap-2 text-sm text-[#536975]"><input type="checkbox" checked={caseReviewed} onChange={(e)=>setCaseReviewed(e.target.checked)} className="mt-1 accent-[#0F766E]"/><span>{L("I have reviewed this tool output with the clinical team.", "আমি ক্লিনিক্যাল দলের সাথে এই ফলাফল পর্যালোচনা করেছি।")}</span></label><Link aria-disabled={!caseReviewed} onClick={(e)=>{if(!caseReviewed)e.preventDefault();}} href="/dispatch" className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${caseReviewed ? "bg-[#0F766E] text-white hover:bg-[#115E59]" : "pointer-events-none bg-slate-100 text-slate-400"}`}>{L("Open CareMatch workbench", "CareMatch ওয়ার্কবেঞ্চ খুলুন")}<ArrowRight className="h-4 w-4"/></Link></div>
                <p className="text-xs text-[#5C727E]">{L("Always confirm vitals, location, facility availability, and the full clinical context before acting. This is decision support, not a diagnosis.", "কোনো পদক্ষেপের আগে ভাইটাল, অবস্থান, হাসপাতালের প্রাপ্যতা ও পূর্ণ ক্লিনিক্যাল প্রেক্ষাপট যাচাই করুন। এটি সিদ্ধান্ত-সহায়তা, রোগ নির্ণয় নয়।")}</p>
              </section>}
            </div>
            <aside className="space-y-4">
              <div className="rounded-2xl border border-[#DCE6E9] bg-[#FAFBFC] p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-[#172A33]"><CheckCircle2 className="h-4 w-4 text-[#0F766E]"/>{L("What the agent checks", "এজেন্ট যা যাচাই করে")}</h3><ul className="mt-3 space-y-3 text-xs leading-relaxed text-[#526274]"><li>01 · {L("Vitals and missing information", "ভাইটাল ও অনুপস্থিত তথ্য")}</li><li>02 · {L("NEWS2 acuity and red flags", "NEWS2 তীব্রতা ও সতর্ক সংকেত")}</li><li>03 · {L("ICU, ventilator, blood and ETA", "আইসিইউ, ভেন্টিলেটর, রক্ত ও পৌঁছানোর সময়")}</li><li>04 · {L("Conflicts and verified repairs", "সংঘাত ও যাচাইকৃত বিকল্প")}</li></ul></div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"><CircleHelp className="mb-2 h-4 w-4 text-amber-800"/><p className="text-xs font-bold text-amber-950">{L("Human review required", "মানব পর্যালোচনা আবশ্যক")}</p><p className="mt-1 text-xs leading-relaxed text-amber-900">{L("The agent never books a bed or dispatches blood. Availability can change; confirm with the receiving facility.", "এজেন্ট কখনো বেড বুক বা রক্ত পাঠায় না। প্রাপ্যতা বদলাতে পারে; গ্রহণকারী হাসপাতালের সাথে নিশ্চিত করুন।")}</p></div>
              <p className="text-[11px] leading-relaxed text-[#5C727E]">{L("Agent session", "এজেন্ট সেশন")}: {result?.session_id ?? L("not started", "শুরু হয়নি")}</p>
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}

export default function CopilotPage() {
  const { locale } = useI18n();
  return <CopilotWorkspace key={locale} />;
}
