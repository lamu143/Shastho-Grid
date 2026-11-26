"use client";

import React from "react";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function DisclaimerBanner() {
  const { t } = useI18n();

  return (
    <div
      role="region"
      aria-label={t("disclaimer.title")}
      data-testid="clinical-disclaimer-banner"
      className="border-b border-[#99F6E4]/50 bg-[#F0FDFA]/70 px-4 py-2 text-xs text-[#134E4A] backdrop-blur-md sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-2.5 sm:items-center">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-[#0F766E] sm:mt-0"
        />
        <p className="min-w-0 leading-relaxed">
          <span className="font-semibold text-[#0F766E]">
            {t("disclaimer.title")}:{" "}
          </span>
          <span>{t("disclaimer.body")}</span>
        </p>
      </div>
    </div>
  );
}
