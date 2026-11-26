"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, Mic, Send, Square, Volume2 } from "lucide-react";
import { AssistantOrb } from "@/components/brand/AssistantOrb";
import { useI18n } from "@/lib/i18n";
import { answerSathi, ASSISTANT_QUICK_ASKS } from "@/lib/assistantGuide";
import { useSathiVoice } from "@/lib/sathiVoice";

// Sathi turns keep the question, not frozen text: the answer is re-derived in the current
// UI language on every render, so switching EN/বাংলা switches the whole conversation.
type Turn = { id: number; role: "user" | "sathi"; text: string };

/**
 * Shastho Sathi conversation + voice dock, shared by the floating drawer and the full
 * Copilot page so both have the same knowledge base and the same voice behaviour.
 * Unmounting stops any listening or speech (the voice hook cleans up).
 */
export function SathiChat({ onNavigate, inputId }: { onNavigate?: () => void; inputId: string }) {
  const { locale } = useI18n();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const orbRef = useRef<HTMLSpanElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const L = (en: string, bn: string) => (locale === "bn" ? bn : en);

  const voice = useSathiVoice(locale, orbRef);
  const { stop: stopVoice } = voice;

  // Changing EN/বাংলা stops any speech or listening in the old language.
  useEffect(() => {
    stopVoice();
  }, [locale, stopVoice]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  /** Answer a question; spoken questions get spoken answers. */
  const ask = (text: string, spoken = false) => {
    const clean = text.trim();
    if (!clean) return;
    setTurns((prev) => [
      ...prev,
      { id: nextId.current++, role: "user", text: clean },
      { id: nextId.current++, role: "sathi", text: clean },
    ]);
    setQuestion("");
    if (spoken) void voice.speak(answerSathi(clean, locale).text);
  };

  const onOrb = () => {
    if (voice.state === "listening") voice.finishListening();
    else if (voice.state === "speaking" || voice.state === "thinking") voice.stop();
    else void voice.listen((heard) => ask(heard, true));
  };

  const orbLabel =
    voice.state === "listening"
      ? L("Listening… tap to finish", "শুনছি… শেষ করতে চাপুন")
      : voice.state === "thinking"
        ? L("Preparing the answer… tap to stop", "উত্তর তৈরি হচ্ছে… থামাতে চাপুন")
        : voice.state === "speaking"
          ? L("Speaking… tap to stop", "বলছি… থামাতে চাপুন")
          : L("Tap to talk", "কথা বলতে চাপুন");

  const lastAsked = [...turns].reverse().find((t) => t.role === "sathi");
  const followUps = lastAsked ? answerSathi(lastAsked.text, locale).followUps : ASSISTANT_QUICK_ASKS[locale];
  const compact = turns.length > 0;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-5">
        <div className="space-y-3" aria-live="polite">
          <div className="flex gap-2.5">
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[#FFD8C2]"><Bot className="h-4 w-4" aria-hidden="true" /></span>
            <p className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.07] px-3.5 py-3 text-sm leading-relaxed text-white/90">{L("Hello, I’m Shastho Sathi. Ask me anything about ShasthoGrid, by typing or by tapping the orb to talk.", "আসসালামু আলাইকুম, আমি Shastho Sathi। ShasthoGrid সম্পর্কে যেকোনো প্রশ্ন লিখুন, অথবা অর্বে চেপে কথা বলুন।")}</p>
          </div>
          {turns.map((turn) => {
            if (turn.role === "user") {
              return <p key={turn.id} className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm border border-white/10 bg-gradient-to-br from-[#7C8CFF]/30 to-[#FF9E78]/20 px-3.5 py-2.5 text-sm text-white">{turn.text}</p>;
            }
            const answer = answerSathi(turn.text, locale);
            return (
              <div key={turn.id} className="flex gap-2.5">
                <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[#FFD8C2]"><Bot className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0 rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.07] px-3.5 py-3 text-sm leading-relaxed text-white/90">
                  <p lang={locale}>{answer.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void voice.speak(answer.text)} className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white">
                      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />{L("Listen", "শুনুন")}
                    </button>
                    {answer.href && (
                      <Link href={answer.href} onClick={onNavigate} className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-[#14161C] transition hover:bg-white">
                        {answer.linkLabel ?? L("Open", "খুলুন")}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={threadEnd} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {followUps.map((prompt) => (
            <button key={prompt} type="button" onClick={() => ask(prompt)} className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-left text-xs font-semibold text-white/80 transition hover:border-[#FFC9AE]/50 hover:bg-white/10 hover:text-white">{prompt}</button>
          ))}
        </div>
      </div>

      {/* Voice dock: always visible above the input. Big while the chat is empty, compact after. */}
      <div className={`flex items-center justify-center gap-3 px-4 sm:px-5 ${compact ? "flex-row py-2" : "flex-col py-5"}`}>
        <button
          type="button"
          onClick={onOrb}
          aria-label={orbLabel}
          aria-pressed={voice.state === "listening"}
          className={`sathi-orb-button group relative shrink-0 rounded-full transition-transform duration-300 hover:scale-[1.04] focus-visible:outline-offset-8 ${compact ? "p-1" : "p-3"}`}
        >
          <AssistantOrb ref={orbRef} size={compact ? "launcher" : "hero"} state={voice.state} />
          <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
            {voice.state === "listening" ? (
              <Square className={`${compact ? "h-4 w-4" : "h-6 w-6"} fill-[#4B3F7A] text-[#4B3F7A] opacity-80`} />
            ) : voice.state === "idle" ? (
              <Mic className={`${compact ? "h-5 w-5" : "h-7 w-7"} text-[#4B3F7A] opacity-0 transition-opacity duration-300 group-hover:opacity-80 group-focus-visible:opacity-80`} />
            ) : null}
          </span>
        </button>
        <div className={`min-w-0 ${compact ? "text-left" : "text-center"}`}>
          <p role="status" className="text-sm font-semibold text-white/85">{orbLabel}</p>
          {voice.interim ? (
            <p lang={locale} className="text-sm italic text-[#FFD8C2]">“{voice.interim}”</p>
          ) : voice.notice ? (
            <p role="alert" className="text-xs text-[#FFD08A]">{voice.notice}</p>
          ) : (
            <p className="text-[11px] text-white/50">{L("Bangla or English · please don’t say patient names", "বাংলা বা ইংরেজি · রোগীর নাম বলবেন না")}</p>
          )}
        </div>
      </div>

      <form className="mx-4 mb-4 flex gap-2 rounded-2xl border border-white/15 bg-black/25 p-2 shadow-inner backdrop-blur-xl sm:mx-5" onSubmit={(event) => { event.preventDefault(); ask(question); }}>
        <label className="sr-only" htmlFor={inputId}>{L("Ask Shastho Sathi", "Shastho Sathi-কে জিজ্ঞাসা করুন")}</label>
        <input id={inputId} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={L("Ask about any part of ShasthoGrid…", "ShasthoGrid-এর যেকোনো বিষয়ে জিজ্ঞাসা করুন…")} className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/45" />
        <button type="submit" aria-label={L("Send message", "বার্তা পাঠান")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFE7DA] to-[#DCE3FF] text-[#14161C] transition hover:brightness-105"><Send className="h-4 w-4" aria-hidden="true" /></button>
      </form>
    </>
  );
}
