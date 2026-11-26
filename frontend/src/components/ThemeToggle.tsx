"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Monitor, Palette } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type ThemeChoice = "light" | "aurora" | "ocean" | "dark" | "system";

const KEY = "awaregrid_theme";
const EVENT = "awaregrid-theme-change";
const CHOICES: ThemeChoice[] = ["light", "aurora", "ocean", "dark", "system"];

const THEMES: Record<ThemeChoice, { en: string; bn: string; hintEn: string; hintBn: string; swatch: string }> = {
  light: {
    en: "Clinic light", bn: "ক্লিনিক লাইট", hintEn: "Calm and bright", hintBn: "শান্ত ও উজ্জ্বল",
    swatch: "linear-gradient(135deg,#F4F7F8 0%,#E5F5F2 55%,#DDEFF8 100%)",
  },
  aurora: {
    en: "Aurora", bn: "অরোরা", hintEn: "Mixed teal, sky and violet", hintBn: "টিল, আকাশি ও বেগুনির মিশ্রণ",
    swatch: "radial-gradient(circle at 18% 22%,#2DD4BF 0,transparent 55%),radial-gradient(circle at 82% 20%,#38BDF8 0,transparent 55%),radial-gradient(circle at 78% 85%,#A78BFA 0,transparent 55%),radial-gradient(circle at 20% 85%,#FDBA74 0,transparent 55%),#F0F7FF",
  },
  ocean: {
    en: "Ocean night", bn: "সমুদ্র রাত", hintEn: "Deep blue-teal, mixed glow", hintBn: "গভীর নীল-টিল",
    swatch: "radial-gradient(circle at 20% 25%,#14B8A6 0,transparent 55%),radial-gradient(circle at 85% 30%,#0EA5E9 0,transparent 55%),radial-gradient(circle at 60% 90%,#6366F1 0,transparent 60%),#071722",
  },
  dark: {
    en: "Night shift", bn: "নাইট শিফট", hintEn: "Low glare for ICU nights", hintBn: "রাতে চোখের আরাম",
    swatch: "linear-gradient(135deg,#090F12 0%,#111A1F 55%,#0F857B 100%)",
  },
  system: {
    en: "Match system", bn: "সিস্টেম অনুযায়ী", hintEn: "Follows your device", hintBn: "ডিভাইস অনুসারে",
    swatch: "linear-gradient(90deg,#F4F7F8 0 50%,#090F12 50% 100%)",
  },
};

function readChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY) as ThemeChoice | null;
    return v && CHOICES.includes(v) ? v : "light";
  } catch {
    return "light";
  }
}

/** Resolve a choice and set <html data-theme>; CSS tokens do the rest. */
function apply(choice: ThemeChoice) {
  const resolved =
    choice === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : choice;
  document.documentElement.dataset.theme = resolved;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ThemeToggle() {
  const { locale } = useI18n();
  const choice = useSyncExternalStore(subscribe, readChoice, () => "light" as ThemeChoice);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const t = (en: string, bn: string) => (locale === "bn" ? bn : en);

  // Keep <html> in sync, and follow the OS live while on "system".
  useEffect(() => {
    apply(choice);
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onOs = () => apply("system");
    mq.addEventListener("change", onOs);
    return () => mq.removeEventListener("change", onOs);
  }, [choice]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (value: ThemeChoice) => {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      /* private mode: still apply for this page view */
    }
    apply(value);
    window.dispatchEvent(new Event(EVENT));
  };

  const current = THEMES[choice];

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t(`Theme: ${current.en}`, `থিম: ${current.bn}`)}
        title={t("Change theme", "থিম বদলান")}
        className="glass inline-flex h-9 items-center gap-2 rounded-full px-2 text-sm font-medium text-ink-2 transition hover:text-ink sm:px-2.5"
      >
        <span className="h-5 w-5 rounded-full ring-1 ring-line" style={{ background: current.swatch }} aria-hidden="true" />
        <Palette className="hidden h-4 w-4 sm:block" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="radiogroup"
          aria-label={t("Colour theme", "রঙের থিম")}
          // Opaque menu: a blur nested inside the glass header can't blur the page behind it.
          className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-line bg-surface p-2 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.35)]"
        >
          <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
            {t("Appearance", "চেহারা")}
          </p>
          {CHOICES.map((value) => {
            const th = THEMES[value];
            const active = value === choice;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => choose(value)}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                  active ? "bg-brand-soft" : "hover:bg-fill"
                }`}
              >
                <span
                  className="grid h-9 w-12 shrink-0 place-items-center rounded-lg ring-1 ring-line"
                  style={{ background: th.swatch }}
                  aria-hidden="true"
                >
                  {value === "system" && <Monitor className="h-4 w-4 text-white mix-blend-difference" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{t(th.en, th.bn)}</span>
                  <span className="block text-xs text-ink-3">{t(th.hintEn, th.hintBn)}</span>
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-brand-ink" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
