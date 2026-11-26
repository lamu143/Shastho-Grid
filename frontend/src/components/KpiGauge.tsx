"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, PackageX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { StatusBadge } from "@/components/StatusBadge";
import type { StewardshipAnalytics } from "@/lib/api";

export function KpiGauge({ analytics }: { analytics: StewardshipAnalytics }) {
  const { t } = useI18n();
  const pct = Math.max(0, Math.min(100, Number(analytics.access_ratio_pct) || 0));
  const targetPct = Number(analytics.target_access_pct) || 60;
  const meetsTarget = analytics.meets_who_target || pct >= targetPct;

  return (
    <section
      aria-label={t("dashboard.kpiTitle")}
      className="mac-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-[#172A33]">
            {t("dashboard.kpiTitle")}
          </h2>
          <p className="text-xs text-[#536975]">
            {analytics.clinic_name} · {t("dashboard.whoTarget")}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
            meetsTarget
              ? "border-[#059669]/45 bg-[#ECFDF5] text-[#065F46]"
              : "border-[#D97706]/55 bg-[#FEF3C7] text-[#92400E]"
          }`}
        >
          {meetsTarget ? (
            <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-[#059669]" />
          ) : (
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-[#D97706]" />
          )}
          <span>
            {meetsTarget ? t("dashboard.targetMet") : t("dashboard.targetBelow")}
          </span>
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-[#405663]">
            {t("dashboard.accessRatio")}
          </span>
          <span className="text-2xl font-bold text-[#172A33]">
            {pct.toFixed(1)}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-label={t("analytics.progressLabel")}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative h-4 w-full overflow-hidden rounded-full bg-[#EDF3F5]"
        >
          <div
            className={`h-full rounded-full transition-all ${
              meetsTarget ? "bg-[#059669]" : "bg-[#D97706]"
            }`}
            style={{ width: `${pct}%` }}
          />
          <div
            aria-hidden="true"
            title="60% WHO Target"
            className="absolute inset-y-0 w-0.5 bg-[#172A33]"
            style={{ left: `${Math.min(100, targetPct)}%` }}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="min-w-0 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] p-3">
          <StatusBadge variant="ACCESS" />
          <p className="mt-2 text-xl font-bold text-[#172A33]">
            {analytics.access_count}
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] p-3">
          <StatusBadge variant="WATCH" />
          <p className="mt-2 text-xl font-bold text-[#172A33]">
            {analytics.watch_count}
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] p-3">
          <StatusBadge variant="RESERVE" />
          <p className="mt-2 text-xl font-bold text-[#172A33]">
            {analytics.reserve_count}
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] p-3">
          <StatusBadge variant="NO_ANTIBIOTIC" />
          <p className="mt-2 text-xl font-bold text-[#172A33]">
            {analytics.no_antibiotic_count}
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-[#D97706]/40 bg-[#FEF3C7]/60 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#92400E]">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t("dashboard.expiringSoon")}</span>
          </div>
          <p className="mt-2 text-xl font-bold text-[#92400E]">
            {analytics.expiring_soon_count}
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-[#DC2626]/40 bg-[#FEE2E2]/60 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#991B1B]">
            <PackageX aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t("dashboard.stockedOut")}</span>
          </div>
          <p className="mt-2 text-xl font-bold text-[#991B1B]">
            {analytics.stocked_out_count}
          </p>
        </div>
      </div>
    </section>
  );
}
