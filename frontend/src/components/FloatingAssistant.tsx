"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Bot, Maximize2, MessageCircle, Send, Workflow, X } from "lucide-react";
import { AssistantOrb } from "@/components/brand/AssistantOrb";
import { useI18n } from "@/lib/i18n";
import { answerAssistantGuide, ASSISTANT_QUICK_ASKS } from "@/lib/assistantGuide";

export function FloatingAssistant() {
  const { locale } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"guide" | "agent">("guide");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const L = (en: string, bn: string) => locale === "bn" ? bn : en;

  useEffect(() => {
    if (!open) {
      if (wasOpen.current && pathname !== "/copilot") launcherRef.current?.focus({ preventScroll: true });
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (pathname?.startsWith("/copilot")) return null;

  const ask = (text = question) => {
    const clean = text.trim();
    if (!clean) return;
    setQuestion(clean);
    setAnswer(answerAssistantGuide(clean, locale));
  };

  const openFullAgent = mode === "agent" ? "/copilot?mode=agent" : "/copilot";

  return (
    <>
      {open && (
        <>
          <button
            type="button"
            aria-label={L("Close Shastho Sathi", "Shastho Sathi বন্ধ করুন")}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-[#080D12]/30 backdrop-blur-[3px]"
          />
          <section
            role="dialog"
            aria-label={L("Shastho Sathi assistant", "Shastho Sathi সহকারী")}
            className="sg-sathi-drawer fixed z-50 flex flex-col overflow-hidden rounded-[2rem] border border-white/20 text-white shadow-[0_30px_100px_rgba(0,0,0,0.55)]"
          >
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full bg-[#FF6259] shadow-[0_0_8px_#ff625966]" />
                  <i className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E] shadow-[0_0_8px_#ffbd2e66]" />
                  <i className="h-2.5 w-2.5 rounded-full bg-[#28C840] shadow-[0_0_8px_#28c84066]" />
                </span>
                <span className="sg-sathi-header-orb"><AssistantOrb size="launcher" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold sm:text-base">Shastho Sathi</span>
                  <span className="block truncate text-xs text-white/55">{L("Your care workflow companion", "আপনার চিকিৎসা-প্রবাহের সহায়ক")}</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={openFullAgent} onClick={() => setOpen(false)} aria-label={L("Expand full assistant", "পূর্ণ সহকারী খুলুন")} title={L("Expand", "বড় করে দেখুন")} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/80 transition hover:bg-white/15 hover:text-white"><Maximize2 className="h-4 w-4" /></Link>
                <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={L("Close assistant", "সহকারী বন্ধ করুন")} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/80 transition hover:bg-white/15 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
            </header>

            <div className="px-4 pt-3 sm:px-5">
              <div className="segmented grid grid-cols-2 border border-white/10 bg-white/[0.055]">
                <button type="button" aria-pressed={mode === "guide"} onClick={() => setMode("guide")} className={`rounded-[0.7rem] px-3 py-2 text-sm font-bold transition ${mode === "guide" ? "bg-white text-[#10231F] shadow" : "text-white/65 hover:text-white"}`}><MessageCircle className="mr-2 inline h-4 w-4" />{L("Guide", "ম্যানুয়াল")}</button>
                <button type="button" aria-pressed={mode === "agent"} onClick={() => setMode("agent")} className={`rounded-[0.7rem] px-3 py-2 text-sm font-bold transition ${mode === "agent" ? "bg-white text-[#10231F] shadow" : "text-white/65 hover:text-white"}`}><Workflow className="mr-2 inline h-4 w-4" />{L("Case agent", "এজেন্ট")}</button>
              </div>
              <p className="mt-2 text-center text-xs text-white/45">{L("Guidance is informational; clinical decisions stay with your team.", "এজেন্ট সহায়তা দেয়; ক্লিনিক্যাল সিদ্ধান্ত আপনার দলের।")}</p>
            </div>

            {mode === "guide" ? (
              <>
                <div className="sg-sathi-topics mx-4 mt-3 flex items-center justify-between gap-2 border-b border-white/10 px-1 sm:mx-5">
                  <span className="border-b-2 border-[#F0C66B] px-2 py-2 text-sm font-semibold text-white"><MessageCircle className="mr-1.5 inline h-4 w-4" />{L("Chat", "কথা")}</span>
                  <Link href="/dispatch" className="px-2 py-2 text-sm text-white/50 transition hover:text-white"><Workflow className="mr-1.5 inline h-4 w-4" />CareMatch</Link>
                  <span className="px-2 py-2 text-sm text-white/50"><Bot className="mr-1.5 inline h-4 w-4" />{L("Safety", "নিরাপত্তা")}</span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-5">
                  <div aria-live="polite" className="space-y-3">
                    <div className="flex gap-2.5">
                      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-teal-100"><Bot className="h-4 w-4" /></span>
                      <p className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.065] px-3.5 py-3 text-sm leading-relaxed text-white/85">{L("Hello, I’m Shastho Sathi. Ask about ShasthoGrid’s care workflows, or switch to Case agent for an assessment.", "আসসালামু আলাইকুম, আমি Shastho Sathi। ShasthoGrid-এর সেবার ধাপ সম্পর্কে জিজ্ঞাসা করুন, অথবা মূল্যায়নে এজেন্ট বেছে নিন।")}</p>
                    </div>
                    {answer && <>
                      <p className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm border border-teal-100/10 bg-teal-300/15 px-3.5 py-2.5 text-sm text-white">{question}</p>
                      <div className="flex gap-2.5"><span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-teal-100"><Bot className="h-4 w-4" /></span><p className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.065] px-3.5 py-3 text-sm leading-relaxed text-white/85">{answer}</p></div>
                    </>}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {ASSISTANT_QUICK_ASKS[locale].map((prompt) => <button key={prompt} type="button" onClick={() => ask(prompt)} className="rounded-full border border-white/15 bg-white/[0.055] px-3 py-2 text-left text-xs font-semibold text-white/70 transition hover:border-[#BCEDE6]/45 hover:bg-white/10 hover:text-white">{prompt}</button>)}
                  </div>

                  <div className="my-auto flex min-h-36 flex-col items-center justify-center gap-1.5 py-4 text-center">
                    <AssistantOrb size="hero" />
                    <p className="text-sm font-medium text-white/60">{L("Ready when you are", "আপনি প্রস্তুত হলে শুরু করুন")}</p>
                    <p className="text-[11px] text-[#F0C66B]/80">{L("Voice input isn’t active · type below", "ভয়েস ইনপুট চালু নেই · নিচে লিখুন")}</p>
                  </div>
                </div>

                <form className="mx-4 mb-4 flex gap-2 rounded-2xl border border-white/15 bg-black/25 p-2 shadow-inner backdrop-blur-xl sm:mx-5" onSubmit={(event) => { event.preventDefault(); ask(); }}>
                  <label className="sr-only" htmlFor="sathi-drawer-question">{L("Ask Shastho Sathi", "Shastho Sathi-কে জিজ্ঞাসা করুন")}</label>
                  <input id="sathi-drawer-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={L("Ask about a care workflow…", "সেবার ধাপ সম্পর্কে জিজ্ঞাসা করুন…")} className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/40" />
                  <button type="submit" aria-label={L("Send message", "বার্তা পাঠান")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#10231F] transition hover:bg-teal-100"><Send className="h-4 w-4" /></button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center">
                <AssistantOrb size="hero" />
                <h2 className="mt-5 text-lg font-bold">{L("Case agent", "কেস এজেন্ট")}</h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">{L("Run a de-identified clinical note through PulseScore, CareMatch and ConflictProof. The full workspace includes the assessment and review controls.", "পরিচয়মুক্ত ক্লিনিক্যাল নোট PulseScore, CareMatch ও ConflictProof দিয়ে মূল্যায়ন করুন। পূর্ণ ওয়ার্কস্পেসে ফলাফল ও পর্যালোচনার নিয়ন্ত্রণ আছে।")}</p>
                <Link href="/copilot?mode=agent" onClick={() => setOpen(false)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#10231F] shadow-lg transition hover:bg-teal-100">{L("Open case workspace", "কেস ওয়ার্কস্পেস খুলুন")}<ArrowUpRight className="h-4 w-4" /></Link>
                <p className="mt-3 text-xs text-[#F0C66B]/80">{L("Dispatcher or admin sign-in required", "ডিসপ্যাচার বা অ্যাডমিন সাইন-ইন প্রয়োজন")}</p>
              </div>
            )}
          </section>
        </>
      )}

      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={L("Open Shastho Sathi", "Shastho Sathi খুলুন")}
          title={L("Ask Shastho Sathi", "Shastho Sathi-কে জিজ্ঞাসা করুন")}
          className="sg-sathi-launcher fixed bottom-5 right-5 z-40 rounded-full transition-transform hover:scale-105 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#0F766E] sm:bottom-7 sm:right-7"
        >
          <AssistantOrb />
          <span className="absolute right-[0.18rem] top-[0.18rem] h-2.5 w-2.5 rounded-full border-2 border-white bg-[#22C55E] shadow" aria-hidden="true" />
        </button>
      )}
    </>
  );
}
