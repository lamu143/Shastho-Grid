"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, Maximize2, MessageCircle, Workflow, X } from "lucide-react";
import { AssistantOrb } from "@/components/brand/AssistantOrb";
import { SathiChat } from "@/components/SathiChat";
import { useI18n } from "@/lib/i18n";

/* ------------------------------------------------- draggable launcher position ---- */
// Stored as distance from the bottom-right corner so it survives window resizes sensibly.
type Pos = { right: number; bottom: number };
const POS_KEY = "awaregrid_sathi_pos";
const POS_EVENT = "awaregrid-sathi-pos";
const DEFAULT_POS: Pos = { right: 24, bottom: 24 };
const SIZE = 56;

function clampPos(p: Pos): Pos {
  if (typeof window === "undefined") return p;
  const m = 8;
  return {
    right: Math.min(Math.max(p.right, m), window.innerWidth - SIZE - m),
    bottom: Math.min(Math.max(p.bottom, m), window.innerHeight - SIZE - m),
  };
}
function readPosRaw(): string {
  try {
    return window.localStorage.getItem(POS_KEY) ?? "";
  } catch {
    return "";
  }
}
function savePos(p: Pos | null) {
  try {
    if (p) window.localStorage.setItem(POS_KEY, JSON.stringify(p));
    else window.localStorage.removeItem(POS_KEY);
  } catch {
    /* private mode: position just isn't remembered */
  }
  window.dispatchEvent(new Event(POS_EVENT));
}
function subscribePos(cb: () => void) {
  window.addEventListener(POS_EVENT, cb);
  window.addEventListener("resize", cb);
  return () => {
    window.removeEventListener(POS_EVENT, cb);
    window.removeEventListener("resize", cb);
  };
}

export function FloatingAssistant() {
  const { locale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"guide" | "agent">("guide");
  const [drag, setDrag] = useState<Pos | null>(null); // live position while dragging
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const dragStart = useRef<{ x: number; y: number; pos: Pos; moved: boolean } | null>(null);
  const L = (en: string, bn: string) => (locale === "bn" ? bn : en);

  const raw = useSyncExternalStore(subscribePos, readPosRaw, () => "");
  let saved = DEFAULT_POS;
  try {
    if (raw) saved = JSON.parse(raw) as Pos;
  } catch {
    saved = DEFAULT_POS;
  }
  const pos = clampPos(drag ?? saved);

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
  }, [open, pathname]);

  if (pathname?.startsWith("/copilot")) return null;

  const openFullAgent = mode === "agent" ? "/copilot?mode=agent" : "/copilot";

  /* Pointer drag: a press that moves > 5px is a drag (no open); otherwise it's a click. */
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    dragStart.current = { x: e.clientX, y: e.clientY, pos, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = dragStart.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) < 5) return;
    s.moved = true;
    setDrag(clampPos({ right: s.pos.right - dx, bottom: s.pos.bottom - dy }));
  };
  const onPointerUp = () => {
    const s = dragStart.current;
    dragStart.current = null;
    if (s?.moved && drag) savePos(drag);
    setDrag(null);
    if (!s?.moved) setOpen(true);
  };
  /* Keyboard: arrows nudge the launcher (Shift = bigger steps); Enter/Space open it. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 48 : 12;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    savePos(clampPos({ right: pos.right + d[0], bottom: pos.bottom + d[1] }));
  };

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
            className="sg-sathi-drawer fixed z-50 flex flex-col overflow-hidden rounded-[2rem] border border-white/15 text-white"
          >
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="sg-sathi-header-orb"><AssistantOrb size="launcher" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold sm:text-base">Shastho Sathi</span>
                  <span className="block truncate text-xs text-white/60">{L("Your care workflow companion", "আপনার চিকিৎসা-প্রবাহের সহায়ক")}</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={openFullAgent} onClick={() => setOpen(false)} aria-label={L("Expand full assistant", "পূর্ণ সহকারী খুলুন")} title={L("Expand", "বড় করে দেখুন")} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/80 transition hover:bg-white/15 hover:text-white"><Maximize2 className="h-4 w-4" aria-hidden="true" /></Link>
                <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={L("Close assistant", "সহকারী বন্ধ করুন")} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/80 transition hover:bg-white/15 hover:text-white"><X className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            </header>

            <div className="px-4 pt-3 sm:px-5">
              <div className="segmented grid grid-cols-2 border border-white/10 bg-white/[0.055]">
                <button type="button" aria-pressed={mode === "guide"} onClick={() => setMode("guide")} className={`rounded-[0.7rem] px-3 py-2 text-sm font-bold transition ${mode === "guide" ? "bg-white text-[#14161C] shadow" : "text-white/70 hover:text-white"}`}><MessageCircle className="mr-2 inline h-4 w-4" aria-hidden="true" />{L("Guide", "গাইড")}</button>
                <button type="button" aria-pressed={mode === "agent"} onClick={() => setMode("agent")} className={`rounded-[0.7rem] px-3 py-2 text-sm font-bold transition ${mode === "agent" ? "bg-white text-[#14161C] shadow" : "text-white/70 hover:text-white"}`}><Workflow className="mr-2 inline h-4 w-4" aria-hidden="true" />{L("Case agent", "কেস এজেন্ট")}</button>
              </div>
              <p className="mt-2 text-center text-xs text-white/55">{L("Guidance is informational; clinical decisions stay with your team.", "এজেন্ট সহায়তা দেয়; ক্লিনিক্যাল সিদ্ধান্ত আপনার দলের।")}</p>
            </div>

            {mode === "guide" ? (
              <SathiChat inputId="sathi-drawer-question" onNavigate={() => setOpen(false)} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center">
                <AssistantOrb size="hero" />
                <h2 className="mt-5 text-lg font-bold">{L("Case agent", "কেস এজেন্ট")}</h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/70">{L("Run a de-identified clinical note through PulseScore, CareMatch and ConflictProof. The full workspace includes the assessment and review controls.", "পরিচয়মুক্ত ক্লিনিক্যাল নোট PulseScore, CareMatch ও ConflictProof দিয়ে মূল্যায়ন করুন। পূর্ণ ওয়ার্কস্পেসে ফলাফল ও পর্যালোচনার নিয়ন্ত্রণ আছে।")}</p>
                <Link href="/copilot?mode=agent" onClick={() => setOpen(false)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#14161C] shadow-lg transition hover:bg-[#FFF1EA]">{L("Open case workspace", "কেস ওয়ার্কস্পেস খুলুন")}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
                <p className="mt-3 text-xs text-[#FFD08A]">{L("Dispatcher or admin sign-in required", "ডিসপ্যাচার বা অ্যাডমিন সাইন-ইন প্রয়োজন")}</p>
              </div>
            )}
          </section>
        </>
      )}

      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { dragStart.current = null; setDrag(null); }}
          onDoubleClick={() => savePos(null)}
          onKeyDown={onKeyDown}
          onClick={(e) => { if (e.detail === 0) setOpen(true); /* keyboard Enter/Space */ }}
          onMouseEnter={() => {
            router.prefetch("/copilot");
            router.prefetch("/dispatch");
          }}
          aria-label={L("Open Shastho Sathi (drag or use arrow keys to move)", "Shastho Sathi খুলুন (সরাতে টেনে আনুন বা অ্যারো কী চাপুন)")}
          title={L("Ask Shastho Sathi · drag to move · double-click to reset", "Shastho Sathi · সরাতে টানুন · আগের জায়গায় নিতে ডাবল-ক্লিক")}
          style={{ right: pos.right, bottom: pos.bottom, touchAction: "none" }}
          className={`sg-sathi-launcher fixed z-40 rounded-full focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand ${drag ? "cursor-grabbing" : "cursor-grab transition-transform duration-200 hover:scale-105 active:scale-95"}`}
        >
          <AssistantOrb />
          <span className="absolute right-[0.1rem] top-[0.1rem] h-2.5 w-2.5 rounded-full border-2 border-white bg-[#22C55E] shadow" aria-hidden="true" />
        </button>
      )}
    </>
  );
}
