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
          <h2 className="text-base font-bold text-ink">
            {t("dashboard.kpiTitle")}
          </h2>
          <p className="text-xs text-ink-2">
            {analytics.clinic_name} · {t("dashboard.whoTarget")}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
            meetsTarget
              ? "border-success/45 bg-success-soft text-success-ink"
              : "border-warn/55 bg-warn-soft text-warn-ink"
          }`}
        >
          {meetsTarget ? (
            <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-success-ink" />
          ) : (
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-warn-ink" />
          )}
          <span>
            {meetsTarget ? t("dashboard.targetMet") : t("dashboard.targetBelow")}
          </span>
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-ink-2">
            {t("dashboard.accessRatio")}
          </span>
          <span className="text-2xl font-bold text-ink">
            {pct.toFixed(1)}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-label={t("analytics.progressLabel")}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative h-4 w-full overflow-hidden rounded-full bg-fill"
        >
          <div
            className={`h-full rounded-full transition-all ${
              meetsTarget ? "bg-success" : "bg-warn"
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

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0 rounded-lg border border-line bg-canvas p-3">
          <StatusBadge variant="ACCESS" />
          <p className="mt-2 text-xl font-bold text-ink">
            {analytics.access_count}
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-line bg-canvas p-3">
          <StatusBadge variant="WATCH" />
          <p className="mt-2 text-xl font-bold text-ink">
            {analytics.watch_count}
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-line bg-canvas p-3">
          <StatusBadge variant="RESERVE" />
          <p className="mt-2 text-xl font-bold text-ink">
            {analytics.reserve_count}
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-line bg-canvas p-3">
          <StatusBadge variant="NO_ANTIBIOTIC" />
          <p className="mt-2 text-xl font-bold text-ink">
            {analytics.no_antibiotic_count}
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-warn/40 bg-warn-soft/60 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-warn-ink">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span>{t("dashboard.expiringSoon")}</span>
          </div>
          <p className="mt-2 text-xl font-bold text-warn-ink">
            {analytics.expiring_soon_count}
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-danger/40 bg-danger-soft/60 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-danger-ink">
            <PackageX aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span>{t("dashboard.stockedOut")}</span>
          </div>
          <p className="mt-2 text-xl font-bold text-danger-ink">
            {analytics.stocked_out_count}
          </p>
        </div>
      </div>
    </section>
  );
}
