"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { KpiGauge } from "@/components/KpiGauge";
import { StatusBadge } from "@/components/StatusBadge";
import {
  getDb,
  type AwareVerdictCategory,
  type BatchRecord,
  type DispenseRecord,
  type SessionUser,
} from "@/db/dexie";
import {
  getStewardshipAnalytics,
  listDispenses,
  type Dispense,
  type StewardshipAnalytics,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function buildOfflineAnalytics(
  user: SessionUser,
  dispenses: DispenseRecord[],
  batches: BatchRecord[]
): StewardshipAnalytics {
  const dispensed = dispenses.filter((d) => d.status === "DISPENSED");
  const access_count = dispensed.filter(
    (d) => d.aware_category === "ACCESS"
  ).length;
  const watch_count = dispensed.filter(
    (d) => d.aware_category === "WATCH"
  ).length;
  const reserve_count = dispensed.filter(
    (d) => d.aware_category === "RESERVE"
  ).length;
  const no_antibiotic_count = dispensed.filter(
    (d) => d.aware_category === "NO_ANTIBIOTIC"
  ).length;
  const antibiotic_dispensed = access_count + watch_count + reserve_count;
  const access_ratio_pct =
    antibiotic_dispensed > 0
      ? Number(((access_count / antibiotic_dispensed) * 100).toFixed(1))
      : 0;

  const nowMs = Date.now();
  const in14DaysMs = nowMs + 14 * 86_400_000;
  let expiring_soon_count = 0;
  let stocked_out_count = 0;
  for (const b of batches) {
    if (b.qty_remaining <= 0) {
      stocked_out_count += 1;
    } else {
      const expMs = Date.parse(`${b.expiry_date.slice(0, 10)}T00:00:00Z`);
      if (Number.isFinite(expMs) && expMs > nowMs && expMs <= in14DaysMs) {
        expiring_soon_count += 1;
      }
    }
  }

  return {
    clinic_id: user.clinic_id,
    clinic_name: user.clinic_name,
    total_dispensed: dispensed.length,
    antibiotic_dispensed,
    access_count,
    watch_count,
    reserve_count,
    no_antibiotic_count,
    access_ratio_pct,
    target_access_pct: 60.0,
    meets_who_target: access_ratio_pct >= 60.0,
    expiring_soon_count,
    stocked_out_count,
  };
}

function AnalyticsContent({ user }: { user: SessionUser }) {
  const { t } = useI18n();
  const [analytics, setAnalytics] = useState<StewardshipAnalytics | null>(null);
  const [dispenses, setDispenses] = useState<Dispense[]>([]);
  const [tierFilter, setTierFilter] = useState<AwareVerdictCategory | "ALL">("ALL");
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    const database = getDb();
    const online = typeof window !== "undefined" && window.navigator.onLine;

    if (online) {
      try {
        const [stats, dispList] = await Promise.all([
          getStewardshipAnalytics(),
          listDispenses(),
        ]);
        setAnalytics(stats);
        setDispenses(dispList);
        setLoading(false);
        return;
      } catch {
        // Fall through to Dexie
      }
    }

    try {
      const [localDispenses, localBatches] = await Promise.all([
        database.dispenses.where("clinic_id").equals(user.clinic_id).toArray(),
        database.batches.where("clinic_id").equals(user.clinic_id).toArray(),
      ]);
      setDispenses(localDispenses);
      setAnalytics(buildOfflineAnalytics(user, localDispenses, localBatches));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAnalytics();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAnalytics]);

  const filteredDispenses = useMemo(() => {
    if (tierFilter === "ALL") return dispenses;
    return dispenses.filter((d) => d.aware_category === tierFilter);
  }, [dispenses, tierFilter]);

  const totalForBars = Math.max(
    1,
    (analytics?.access_count ?? 0) +
      (analytics?.watch_count ?? 0) +
      (analytics?.reserve_count ?? 0) +
      (analytics?.no_antibiotic_count ?? 0)
  );

  const distributionRows = [
    {
      key: "ACCESS" as const,
      count: analytics?.access_count ?? 0,
      barColor: "bg-[#059669]",
      cardBg: "bg-[#ECFDF5] text-[#065F46] border-[#059669]/40",
    },
    {
      key: "WATCH" as const,
      count: analytics?.watch_count ?? 0,
      barColor: "bg-[#D97706]",
      cardBg: "bg-[#FEF3C7] text-[#92400E] border-[#D97706]/45",
    },
    {
      key: "RESERVE" as const,
      count: analytics?.reserve_count ?? 0,
      barColor: "bg-[#DC2626]",
      cardBg: "bg-[#FEE2E2] text-[#991B1B] border-[#DC2626]/40",
    },
    {
      key: "NO_ANTIBIOTIC" as const,
      count: analytics?.no_antibiotic_count ?? 0,
      barColor: "bg-[#0284C7]",
      cardBg: "bg-[#E0F2FE] text-[#075985] border-[#0284C7]/40",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#172A33] sm:text-3xl">
          {t("analytics.title")}
        </h1>
        <p className="text-sm text-[#536975]">{t("analytics.subtitle")}</p>
      </div>

      {loading && (
        <p className="text-sm text-[#536975]">{t("common.loading")}</p>
      )}

      {analytics && <KpiGauge analytics={analytics} />}

      {analytics && (
        <section
          aria-label={t("analytics.tierBreakdownTitle")}
          className="mac-card p-5"
        >
          <h2 className="text-base font-bold text-[#172A33]">
            {t("analytics.tierBreakdownTitle")}
          </h2>

          <div className="mt-4 space-y-3">
            {distributionRows.map((row) => {
              const pct = Math.round((row.count / totalForBars) * 100);
              return (
                <div key={row.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <StatusBadge variant={row.key} />
                    <span className="font-semibold text-[#172A33]">
                      {row.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-[#EDF3F5]">
                    <div
                      className={`h-full rounded-full ${row.barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section
        aria-label={t("analytics.dispensesLogTitle")}
        className="mac-card p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-bold text-[#172A33]">
            {t("analytics.dispensesLogTitle")}
          </h2>
          <div>
            <label
              htmlFor="analytics-tier-filter"
              className="block text-xs font-semibold text-[#405663]"
            >
              {t("dashboard.filterTier")}
            </label>
            <select
              id="analytics-tier-filter"
              value={tierFilter}
              onChange={(e) =>
                setTierFilter(e.target.value as AwareVerdictCategory | "ALL")
              }
              className="mt-1 rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#172A33]"
            >
              <option value="ALL">{t("common.all")}</option>
              <option value="ACCESS">{t("aware.ACCESS")}</option>
              <option value="WATCH">{t("aware.WATCH")}</option>
              <option value="RESERVE">{t("aware.RESERVE")}</option>
              <option value="NO_ANTIBIOTIC">{t("aware.NO_ANTIBIOTIC")}</option>
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {filteredDispenses.length === 0 ? (
            <p className="py-4 text-sm text-[#536975]">
              {t("analytics.noDispenses")}
            </p>
          ) : (
            <table className="w-full min-w-[600px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#DCE6E9] bg-[#F3F7F8] text-[#405663]">
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colSyndrome")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colDrugLot")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colTier")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colQty")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colStatus")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE6E9]">
                {filteredDispenses.map((d) => (
                  <tr key={d.id} className="hover:bg-[#F3F7F8]">
                    <td className="px-3 py-2.5 font-medium text-[#172A33]">
                      {d.syndrome_code}
                    </td>
                    <td className="px-3 py-2.5 text-[#405663]">
                      {d.generic_name ?? d.drug_code ?? "Symptomatic"}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge variant={d.aware_category} />
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-[#172A33]">
                      {d.qty}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge variant={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  return (
    <AuthGuard pageTitle={t("analytics.title")}>
      {(user) => <AnalyticsContent user={user} />}
    </AuthGuard>
  );
}
