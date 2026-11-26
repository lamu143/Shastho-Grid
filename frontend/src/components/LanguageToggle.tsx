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
      aria-label={`${t("lang.en")} ${t("lang.bn")} — ${t("lang.toggleLabel")}`}
      data-testid="language-toggle"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas p-1 text-xs font-semibold transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${className}`}
    >
      <Languages aria-hidden="true" className="ml-1 hidden h-3.5 w-3.5 text-brand-ink sm:block" />
      <span
        className={`rounded-md px-2 py-0.5 transition-colors ${
          locale === "en"
            ? "bg-brand text-white shadow-xs"
            : "text-ink-2"
        }`}
      >
        {t("lang.en")}
      </span>
      <span aria-hidden="true" className="text-ink-3">
        /
      </span>
      <span
        className={`rounded-md px-2 py-0.5 transition-colors ${
          locale === "bn"
            ? "bg-brand text-white shadow-xs"
            : "text-ink-2"
        }`}
      >
        {t("lang.bn")}
      </span>
    </button>
  );
}
