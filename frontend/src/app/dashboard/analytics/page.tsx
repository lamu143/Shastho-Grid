"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Database,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { KpiGauge } from "@/components/KpiGauge";
import { StatusBadge } from "@/components/StatusBadge";
import {
  getDb,
  type AwareVerdictCategory,
  type BatchRecord,
  type DispenseRecord,
  type DispenseStatus,
  type SessionUser,
} from "@/db/dexie";
import {
  fetchLakehouseNdjson,
  getStewardshipAnalytics,
  listDispenses,
  type Dispense,
  type StewardshipAnalytics,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function formatSyndrome(code: string): string {
  return code
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildOfflineAnalytics(
  user: SessionUser,
  dispenses: DispenseRecord[],
  batches: BatchRecord[]
): StewardshipAnalytics {
  const dispensed = dispenses.filter((d) => d.status === "DISPENSED");
  const access_count = dispensed.filter((d) => d.aware_category === "ACCESS").length;
  const watch_count = dispensed.filter((d) => d.aware_category === "WATCH").length;
  const reserve_count = dispensed.filter((d) => d.aware_category === "RESERVE").length;
  const no_antibiotic_count = dispensed.filter((d) => d.aware_category === "NO_ANTIBIOTIC").length;
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
  const { locale, t } = useI18n();
  const bn = locale === "bn";
  const [analytics, setAnalytics] = useState<StewardshipAnalytics | null>(null);
  const [dispenses, setDispenses] = useState<Dispense[]>([]);
  const [dataSource, setDataSource] = useState<"live" | "offline">("live");
  const [tierFilter, setTierFilter] = useState<AwareVerdictCategory | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<DispenseStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const loadAnalytics = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
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
          setDataSource("live");
          setLoading(false);
          setRefreshing(false);
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
        setDataSource("offline");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAnalytics();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAnalytics]);

  const filteredDispenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dispenses.filter((d) => {
      if (tierFilter !== "ALL" && d.aware_category !== tierFilter) return false;
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (!q) return true;
      const syndrome = d.syndrome_code.toLowerCase();
      const drug = (d.generic_name ?? d.drug_code ?? "symptomatic").toLowerCase();
      return syndrome.includes(q) || drug.includes(q);
    });
  }, [dispenses, tierFilter, statusFilter, searchQuery]);

  const pendingApprovals = useMemo(
    () => dispenses.filter((d) => d.status === "PENDING_APPROVAL").length,
    [dispenses]
  );

  const watchReserveStats = useMemo(() => {
    const watchReserve = (analytics?.watch_count ?? 0) + (analytics?.reserve_count ?? 0);
    const abxTotal = analytics?.antibiotic_dispensed ?? 0;
    const pct = abxTotal > 0 ? Math.round((watchReserve / abxTotal) * 100) : 0;
    return { count: watchReserve, pct };
  }, [analytics]);

  const topSyndromes = useMemo(() => {
    const map = new Map<string, { code: string; total: number; access: number; watchReserve: number }>();
    for (const d of dispenses) {
      const entry = map.get(d.syndrome_code) ?? {
        code: d.syndrome_code,
        total: 0,
        access: 0,
        watchReserve: 0,
      };
      entry.total += 1;
      if (d.aware_category === "ACCESS") entry.access += 1;
      if (d.aware_category === "WATCH" || d.aware_category === "RESERVE") entry.watchReserve += 1;
      map.set(d.syndrome_code, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [dispenses]);

  const topDrugs = useMemo(() => {
    const map = new Map<
      string,
      { label: string; category: AwareVerdictCategory; count: number; totalQty: number }
    >();
    for (const d of dispenses) {
      const label = d.generic_name ?? d.drug_code ?? (bn ? "লক্ষণভিত্তিক (অ্যান্টিবায়োটিক নয়)" : "Symptomatic (No Antibiotic)");
      const key = `${label}::${d.aware_category}`;
      const entry = map.get(key) ?? {
        label,
        category: d.aware_category,
        count: 0,
        totalQty: 0,
      };
      entry.count += 1;
      entry.totalQty += d.qty;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [dispenses, bn]);

  const totalForBars = Math.max(
    1,
    (analytics?.access_count ?? 0) +
      (analytics?.watch_count ?? 0) +
      (analytics?.reserve_count ?? 0) +
      (analytics?.no_antibiotic_count ?? 0)
  );

  const distributionRows = [
    { key: "ACCESS" as const, count: analytics?.access_count ?? 0, barColor: "bg-success" },
    { key: "WATCH" as const, count: analytics?.watch_count ?? 0, barColor: "bg-warn" },
    { key: "RESERVE" as const, count: analytics?.reserve_count ?? 0, barColor: "bg-danger" },
    { key: "NO_ANTIBIOTIC" as const, count: analytics?.no_antibiotic_count ?? 0, barColor: "bg-info" },
  ];

  const handleExportCsv = () => {
    const header = ["syndrome_code", "drug", "aware_category", "qty", "status"];
    const rows = filteredDispenses.map((d) => [
      d.syndrome_code,
      (d.generic_name ?? d.drug_code ?? "Symptomatic").replaceAll('"', '""'),
      d.aware_category,
      String(d.qty),
      d.status,
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    triggerDownload("shasthogrid-stewardlens-dispenses.csv", csv, "text/csv;charset=utf-8");
    setExportStatus(bn ? "ডি-আইডেন্টিফায়েড CSV ডাউনলোড হয়েছে।" : "De-identified CSV exported.");
  };

  const handleExportLakehouse = async () => {
    try {
      const ndjson = await fetchLakehouseNdjson();
      triggerDownload("shasthogrid-stewardship-lakehouse.ndjson", ndjson, "application/x-ndjson");
      setExportStatus(bn ? "Lakehouse NDJSON ডাউনলোড হয়েছে।" : "Lakehouse NDJSON exported.");
    } catch {
      setExportStatus(
        bn
          ? "অফলাইন অবস্থায় Lakehouse NDJSON পাওয়া যায়নি; CSV ব্যবহার করুন।"
          : "Lakehouse NDJSON unavailable offline; use CSV export instead."
      );
    }
  };

  const canSeeCriticalInsights = ["dispatcher", "hospital_admin", "blood_bank_officer", "auditor", "admin"].includes(
    user.role
  );

  return (
    <div className="space-y-6">
      {/* HEADER + ACTIONS */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              {t("analytics.title")}
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                dataSource === "live"
                  ? "border-success/40 bg-success-soft text-success-ink"
                  : "border-warn/50 bg-warn-soft text-warn-ink"
              }`}
            >
              {dataSource === "live" ? (
                <Database aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {dataSource === "live"
                ? bn
                  ? "লাইভ এপিআই"
                  : "Live API"
                : bn
                ? "অফলাইন ক্যাশ"
                : "Offline Cache"}
            </span>
          </div>
          <p className="text-sm text-ink-2">{t("analytics.subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadAnalytics(true)}
            disabled={refreshing}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-brand/40 hover:bg-canvas disabled:opacity-60"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {bn ? "হালনাগাদ" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredDispenses.length === 0}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-brand/40 hover:bg-canvas disabled:opacity-50"
          >
            <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5 text-brand-ink" />
            {bn ? "CSV ডাউনলোড" : "Export CSV"}
          </button>
          <button
            type="button"
            onClick={() => void handleExportLakehouse()}
            disabled={dataSource === "offline"}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            {bn ? "লেকহাউস NDJSON" : "Lakehouse NDJSON"}
          </button>
          {canSeeCriticalInsights && (
            <Link
              href="/insights"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-brand/35 bg-brand-soft px-3.5 py-2 text-xs font-semibold text-brand-ink transition hover:border-brand"
            >
              <Activity aria-hidden="true" className="h-3.5 w-3.5" />
              {bn ? "আইসিইউ ও রক্ত ইনসাইটস" : "Critical-Care Insights"}
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {exportStatus && (
        <p role="status" aria-live="polite" className="rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-2 text-xs font-medium text-brand-ink">
          {exportStatus}
        </p>
      )}

      {dataSource === "offline" && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-warn/50 bg-warn-soft px-4 py-2.5 text-xs font-medium text-warn-ink">
          <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>
            {bn
              ? "অফলাইন মোড: স্থানীয় Dexie সংরক্ষণ থেকে হিসাব দেখানো হচ্ছে। অনলাইনে এলে সার্ভারের সাথে মিলিয়ে নিন।"
              : "Offline mode: displaying analytics computed from local Dexie storage. Refresh when online to sync."}
          </span>
        </div>
      )}

      {/* LOADING SKELETON */}
      {loading && (
        <div aria-busy="true" aria-label={t("common.loading")} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="mac-card h-24 animate-pulse bg-fill/50 p-4" />
          ))}
        </div>
      )}

      {/* SUMMARY TILES */}
      {analytics && (
        <section aria-label={bn ? "মূল স্টুয়ার্ডশিপ সূচক" : "Key stewardship metrics"} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="mac-card p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
              <span>{bn ? "WHO অ্যাক্সেস অনুপাত" : "WHO Access Share"}</span>
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-success-ink" />
            </div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-ink">
              {analytics.access_ratio_pct.toFixed(1)}%
            </p>
            <p className="mt-1 text-xs text-ink-3">
              {analytics.meets_who_target
                ? bn
                  ? "WHO ≥৬০% লক্ষ্যমাত্রা অর্জিত"
                  : "Meets WHO ≥60% target"
                : bn
                ? "WHO ≥৬০% লক্ষ্যমাত্রার নিচে"
                : "Below WHO ≥60% target"}
            </p>
          </div>

          <div className="mac-card p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
              <span>{bn ? "ওয়াচ + রিজার্ভ চাপ" : "Watch + Reserve Pressure"}</span>
              <AlertTriangle aria-hidden="true" className="h-4 w-4 text-warn-ink" />
            </div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-ink">
              {watchReserveStats.count}{" "}
              <span className="text-sm font-semibold text-ink-2">({watchReserveStats.pct}%)</span>
            </p>
            <p className="mt-1 text-xs text-ink-3">
              {bn ? "মোট অ্যান্টিবায়োটিক ডিস্পেন্সের অংশ" : "Share of antibiotic dispenses"}
            </p>
          </div>

          <div className="mac-card p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
              <span>{bn ? "অ্যান্টিবায়োটিক সাশ্রয় (ভাইরাল)" : "Antibiotics Spared (Viral)"}</span>
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-info-ink" />
            </div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-ink">
              {analytics.no_antibiotic_count}
            </p>
            <p className="mt-1 text-xs text-ink-3">
              {bn ? "লক্ষণভিত্তিক চিকিৎসায় অপ্রয়োজনীয় ওষুধ রোধ" : "Viral cases managed without antibiotics"}
            </p>
          </div>

          <div className="mac-card p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
              <span>{bn ? "অপেক্ষমাণ অনুমোদন ও মজুদ সতর্কতা" : "Pending & Stock Alerts"}</span>
              <AlertTriangle aria-hidden="true" className="h-4 w-4 text-danger-ink" />
            </div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-ink">
              {pendingApprovals}{" "}
              <span className="text-xs font-semibold text-ink-2">
                {bn ? "অনুমোদন বাকি" : "pending"}
              </span>
            </p>
            <p className="mt-1 text-xs text-ink-3">
              {bn
                ? `${analytics.expiring_soon_count}টি মেয়াদোত্তীর্ণ-প্রায় · ${analytics.stocked_out_count}টি স্টক শেষ`
                : `${analytics.expiring_soon_count} expiring ≤14d · ${analytics.stocked_out_count} stocked out`}
            </p>
          </div>
        </section>
      )}

      {analytics && <KpiGauge analytics={analytics} />}

      {/* TIER BREAKDOWN + SYNDROME/DRUG INSIGHTS */}
      <div className="grid gap-5 lg:grid-cols-3">
        {analytics && (
          <section aria-label={t("analytics.tierBreakdownTitle")} className="mac-card p-5">
            <h2 className="text-base font-bold text-ink">{t("analytics.tierBreakdownTitle")}</h2>
            <div className="mt-4 space-y-3">
              {distributionRows.map((row) => {
                const pct = Math.round((row.count / totalForBars) * 100);
                return (
                  <div key={row.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <StatusBadge variant={row.key} />
                      <span className="font-semibold tabular-nums text-ink">
                        {row.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-fill">
                      <div className={`h-full rounded-full ${row.barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section aria-label={bn ? "শীর্ষ সিনড্রোমসমূহ" : "Top Syndromes"} className="mac-card p-5">
          <h2 className="text-base font-bold text-ink">
            {bn ? "শীর্ষ সিনড্রোম ও অ্যাক্সেস বিভাজন" : "Top Syndromes & Access Split"}
          </h2>
          {topSyndromes.length === 0 ? (
            <p className="mt-4 text-xs text-ink-2">{t("analytics.noDispenses")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {topSyndromes.map((s) => {
                const accessPct = Math.round((s.access / s.total) * 100);
                return (
                  <li key={s.code} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-ink">{formatSyndrome(s.code)}</span>
                      <span className="shrink-0 tabular-nums text-ink-2">
                        {s.total} {bn ? "টি কেস" : "cases"}
                      </span>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-fill">
                      <div className="bg-success" style={{ width: `${accessPct}%` }} />
                      <div
                        className="bg-warn"
                        style={{ width: `${Math.round((s.watchReserve / s.total) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label={bn ? "শীর্ষ ব্যবহৃত ওষুধ" : "Top Dispensed Regimens"} className="mac-card p-5">
          <h2 className="text-base font-bold text-ink">
            {bn ? "শীর্ষ ব্যবহৃত ওষুধসমূহ" : "Top Dispensed Regimens"}
          </h2>
          {topDrugs.length === 0 ? (
            <p className="mt-4 text-xs text-ink-2">{t("analytics.noDispenses")}</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {topDrugs.map((item) => (
                <li
                  key={`${item.label}-${item.category}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{item.label}</p>
                    <p className="text-[11px] text-ink-3">
                      {item.count} {bn ? "বার" : "Rx"} · {item.totalQty} {bn ? "ইউনিট" : "units"}
                    </p>
                  </div>
                  <StatusBadge variant={item.category} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* DISPENSE AUDIT LOG */}
      <section aria-label={t("analytics.dispensesLogTitle")} className="mac-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">{t("analytics.dispensesLogTitle")}</h2>
            <p aria-live="polite" className="mt-0.5 text-xs text-ink-3">
              {bn
                ? `মোট ${dispenses.length}টির মধ্যে ${filteredDispenses.length}টি রেকর্ড দেখানো হচ্ছে`
                : `Showing ${filteredDispenses.length} of ${dispenses.length} clinic records`}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <label htmlFor="analytics-search" className="block text-xs font-semibold text-ink-2">
                {bn ? "খুঁজুন" : "Search"}
              </label>
              <div className="relative mt-1">
                <Search aria-hidden="true" className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-ink-3" />
                <input
                  id="analytics-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={bn ? "সিনড্রোম বা ওষুধ..." : "Syndrome or drug..."}
                  className="min-h-9 rounded-lg border border-line bg-surface pr-3 pl-8 text-xs text-ink placeholder:text-ink-3"
                />
              </div>
            </div>

            <div>
              <label htmlFor="analytics-tier-filter" className="block text-xs font-semibold text-ink-2">
                {t("dashboard.filterTier")}
              </label>
              <select
                id="analytics-tier-filter"
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as AwareVerdictCategory | "ALL")}
                className="mt-1 min-h-9 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink"
              >
                <option value="ALL">{t("common.all")}</option>
                <option value="ACCESS">{t("aware.ACCESS")}</option>
                <option value="WATCH">{t("aware.WATCH")}</option>
                <option value="RESERVE">{t("aware.RESERVE")}</option>
                <option value="NO_ANTIBIOTIC">{t("aware.NO_ANTIBIOTIC")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="analytics-status-filter" className="block text-xs font-semibold text-ink-2">
                {t("dashboard.colStatus")}
              </label>
              <select
                id="analytics-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as DispenseStatus | "ALL")}
                className="mt-1 min-h-9 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink"
              >
                <option value="ALL">{t("common.all")}</option>
                <option value="DISPENSED">DISPENSED</option>
                <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {filteredDispenses.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas p-4">
              <p className="text-sm text-ink-2">{t("analytics.noDispenses")}</p>
              {(tierFilter !== "ALL" || statusFilter !== "ALL" || searchQuery.trim() !== "") && (
                <button
                  type="button"
                  onClick={() => {
                    setTierFilter("ALL");
                    setStatusFilter("ALL");
                    setSearchQuery("");
                  }}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-brand-ink hover:border-brand"
                >
                  {bn ? "ফিল্টার রিসেট করুন" : "Reset filters"}
                </button>
              )}
            </div>
          ) : (
            <table className="w-full min-w-[600px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-canvas text-ink-2">
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
                  <tr key={d.id} className="hover:bg-canvas">
                    <td className="px-3 py-2.5 font-medium text-ink">
                      {formatSyndrome(d.syndrome_code)}
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">
                      {d.generic_name ?? d.drug_code ?? "Symptomatic"}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge variant={d.aware_category} />
                    </td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums text-ink">{d.qty}</td>
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
