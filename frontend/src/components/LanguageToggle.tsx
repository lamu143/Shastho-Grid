"use client";

import React from "react";
import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "en" ? "bn" : "en")}
      aria-pressed={locale === "bn"}
      aria-label={t("lang.toggleLabel")}
      data-testid="language-toggle"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] p-1 text-xs font-semibold transition-colors hover:bg-[#EDF3F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] ${className}`}
    >
      <Languages aria-hidden="true" className="ml-1 h-3.5 w-3.5 text-[#0F766E]" />
      <span
        className={`rounded-md px-2 py-0.5 transition-colors ${
          locale === "en"
            ? "bg-[#0F766E] text-white shadow-xs"
            : "text-[#405663]"
        }`}
      >
        {t("lang.en")}
      </span>
      <span aria-hidden="true" className="text-[#5C727E]">
        /
      </span>
      <span
        className={`rounded-md px-2 py-0.5 transition-colors ${
          locale === "bn"
            ? "bg-[#0F766E] text-white shadow-xs"
            : "text-[#405663]"
        }`}
      >
        {t("lang.bn")}
      </span>
    </button>
  );
}
