"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckSquare, Clock, Download, Table2, BarChart3 } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { ApiError } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";
import { getInsights, type InsightFacility, type Insights } from "@/lib/insights";

type Copy = Record<Locale, string>;
const c = (en: string, bn: string): Copy => ({ en, bn });

const BLOOD_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"] as const;
const WINDOWS = [7, 30, 90] as const;

// ICU stacked bar: one teal ramp for the two states of staffed beds + a hatched neutral.
const OCCUPIED = "#115E59";
const FREE = "#14B8A6";
const HATCH = "repeating-linear-gradient(45deg, #CBD5E1 0 4px, #E2E8F0 4px 8px)";

// Blood heatmap: single red sequential ramp. [upper bound inclusive, fill, text]
const BLOOD_RAMP: [number, string, string, string][] = [
  [2, "#FEE2E2", "#1D1D1F", "1–2"],
  [5, "#FCA5A5", "#1D1D1F", "3–5"],
  [10, "#F87171", "#1D1D1F", "6–10"],
  [20, "#DC2626", "#FFFFFF", "11–20"],
  [Infinity, "#991B1B", "#FFFFFF", "21+"],
];
const rampFor = (units: number) => BLOOD_RAMP.find(([max]) => units <= max)!;

const FRESHNESS: Record<InsightFacility["data_freshness"], { chip: string; label: Copy }> = {
  LIVE: { chip: "bg-success-soft text-success-ink", label: c("Live", "লাইভ") },
  STALE: { chip: "bg-warn-soft text-warn-ink", label: c("Stale", "পুরোনো") },
  DEMO: { chip: "bg-fill text-ink-2", label: c("Demo", "ডেমো") },
};

const HOLD_LABEL: Record<string, Copy> = {
  HELD: c("Held", "হোল্ড"),
  CONFIRMED: c("Confirmed", "নিশ্চিত"),
  EN_ROUTE: c("En route", "পথে"),
  ADMITTED: c("Admitted", "ভর্তি"),
  EXPIRED: c("Expired", "মেয়াদোত্তীর্ণ"),
  CANCELLED: c("Cancelled", "বাতিল"),
};

function ago(iso: string | null, locale: Locale): string {
  if (!iso) return locale === "bn" ? "কখনো হালনাগাদ হয়নি" : "never reported";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return locale === "bn" ? "এইমাত্র" : "just now";
  if (min < 60) return locale === "bn" ? `${min} মিনিট আগে` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return locale === "bn" ? `${h} ঘণ্টা আগে` : `${h} h ago`;
  const d = Math.round(h / 24);
  return locale === "bn" ? `${d} দিন আগে` : `${d} days ago`;
}

/* ------------------------------------------------------------ pieces ---- */

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="mac-card p-4">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="mac-card h-24 animate-pulse bg-surface/40" />
        ))}
      </div>
      <div className="mac-card h-64 animate-pulse bg-surface/40" />
      <div className="mac-card h-72 animate-pulse bg-surface/40" />
    </div>
  );
}

function Legend({ items }: { items: { label: string; swatch: React.CSSProperties }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[3px]" style={it.swatch} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------- ICU stacked bars ---- */

function IcuChart({ facilities, locale }: { facilities: InsightFacility[]; locale: Locale }) {
  const L = (x: Copy) => x[locale];
  const [asTable, setAsTable] = useState(false);
  const [tip, setTip] = useState<{ id: string; seg: number } | null>(null);
  const rows = facilities.filter((f) => f.tier !== "BLOOD_HUB" && f.icu.physical > 0);
  const max = Math.max(1, ...rows.map((f) => f.icu.physical));
  const labels = [L(c("Occupied", "ভর্তি")), L(c("Free", "খালি")), L(c("Not staffed", "স্টাফ নেই"))];

  return (
    <section aria-labelledby="icu-title" className="mac-card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="icu-title" className="text-lg font-semibold text-ink">
            {L(c("ICU beds by hospital", "হাসপাতালভিত্তিক আইসিইউ বেড"))}
          </h2>
          <p className="text-sm text-ink-3">
            {L(c(
              "Physical beds split into occupied, free, and beds with no nurses on shift.",
              "মোট বেড: ভর্তি, খালি, এবং যেসব বেডে শিফটে নার্স নেই।"
            ))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface/80 px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
        >
          {asTable ? <BarChart3 className="h-4 w-4" aria-hidden="true" /> : <Table2 className="h-4 w-4" aria-hidden="true" />}
          {asTable ? L(c("Show chart", "চার্ট দেখুন")) : L(c("Show table", "টেবিল দেখুন"))}
        </button>
      </div>

      <Legend
        items={[
          { label: labels[0], swatch: { background: OCCUPIED } },
          { label: labels[1], swatch: { background: FREE } },
          { label: labels[2], swatch: { background: HATCH } },
        ]}
      />

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="sr-only">{L(c("ICU beds by hospital", "হাসপাতালভিত্তিক আইসিইউ বেড"))}</caption>
            <thead className="text-xs text-ink-3">
              <tr>
                <th scope="col" className="py-2 font-medium">{L(c("Hospital", "হাসপাতাল"))}</th>
                <th scope="col" className="py-2 text-right font-medium">{labels[0]}</th>
                <th scope="col" className="py-2 text-right font-medium">{labels[1]}</th>
                <th scope="col" className="py-2 text-right font-medium">{labels[2]}</th>
                <th scope="col" className="py-2 text-right font-medium">{L(c("Physical", "মোট"))}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {rows.map((f) => (
                <tr key={f.id}>
                  <th scope="row" className="py-2 font-medium text-ink">{f.code}</th>
                  <td className="py-2 text-right">{f.icu.staffed - f.icu.available}</td>
                  <td className="py-2 text-right">{f.icu.available}</td>
                  <td className="py-2 text-right">{f.icu.physical - f.icu.staffed}</td>
                  <td className="py-2 text-right">{f.icu.physical}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((f) => {
            const segs = [f.icu.staffed - f.icu.available, f.icu.available, f.icu.physical - f.icu.staffed];
            const fills: React.CSSProperties[] = [{ background: OCCUPIED }, { background: FREE }, { background: HATCH }];
            const textColor = ["#FFFFFF", "#042F2E", "#1D1D1F"];
            const widthPct = (f.icu.physical / max) * 100;
            let start = 0;
            return (
              <li key={f.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 sm:grid-cols-[6rem_minmax(0,1fr)_3rem]">
                <span className="truncate text-sm font-semibold text-ink" title={f.name}>{f.code}</span>
                <div className="relative h-7">
                  <div className="flex h-full gap-[2px]" style={{ width: `${widthPct}%` }}>
                    {segs.map((n, i) => {
                      if (n <= 0) return null;
                      const pct = (n / f.icu.physical) * 100;
                      const segStart = start;
                      start += pct;
                      const active = tip?.id === f.id && tip.seg === i;
                      const name = `${f.code}: ${n} ${labels[i].toLowerCase()}`;
                      return (
                        <button
                          key={i}
                          type="button"
                          aria-label={name}
                          onMouseEnter={() => setTip({ id: f.id, seg: i })}
                          onMouseLeave={() => setTip(null)}
                          onFocus={() => setTip({ id: f.id, seg: i })}
                          onBlur={() => setTip(null)}
                          className="relative flex h-full min-w-6 items-center justify-center first:rounded-l-[4px] last:rounded-r-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                          style={{ ...fills[i], width: `${pct}%` }}
                        >
                          {/* Direct label only where it fits (~ 22px per digit). */}
                          {pct * widthPct >= 900 && (
                            <span className="text-xs font-semibold tabular-nums" style={{ color: textColor[i] }} aria-hidden="true">
                              {n}
                            </span>
                          )}
                          {active && (
                            <span
                              role="tooltip"
                              className="pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-lg bg-[#1D1D1F] px-2 py-1 text-xs font-medium text-white shadow-lg"
                              style={{ left: "50%", transform: `translateX(${segStart + pct / 2 > 70 ? "-90%" : segStart + pct / 2 < 20 ? "-10%" : "-50%"})` }}
                            >
                              {n} {labels[i].toLowerCase()} · {Math.round(pct)}%
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <span className="text-right text-xs tabular-nums text-ink-3">{f.icu.physical}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------- blood heatmap ---- */

function BloodHeatmap({ insights, locale }: { insights: Insights; locale: Locale }) {
  const L = (x: Copy) => x[locale];
  const rows = insights.facilities.filter((f) => Object.keys(f.blood).length > 0);
  return (
    <section aria-labelledby="blood-title" className="mac-card space-y-4 p-5">
      <div>
        <h2 id="blood-title" className="text-lg font-semibold text-ink">
          {L(c("Blood stock by facility and group", "ফ্যাসিলিটি ও গ্রুপভিত্তিক রক্তের মজুত"))}
        </h2>
        <p className="text-sm text-ink-3">
          {L(c("Units free to issue. Darker red means more units.", "দেওয়ার মতো ইউনিট। গাঢ় লাল মানে বেশি ইউনিট।"))}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-[3px] border border-line bg-[#F1F5F9]" aria-hidden="true" />0
        </span>
        {BLOOD_RAMP.map(([, fill, , label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-[3px]" style={{ background: fill }} aria-hidden="true" />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-warn-ink" aria-hidden="true" />
          {L(c("expires within 7 days", "৭ দিনের মধ্যে মেয়াদ শেষ"))}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-[2px] text-center text-sm">
          <caption className="sr-only">
            {L(c(
              "Blood units available per facility and blood group. Zero and soon-expiring cells are marked with icons.",
              "ফ্যাসিলিটি ও রক্তের গ্রুপ অনুযায়ী ইউনিট। শূন্য ও শীঘ্র মেয়াদোত্তীর্ণ ঘর আইকন দিয়ে চিহ্নিত।"
            ))}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1.5 text-left text-xs font-medium text-ink-3">{L(c("Facility", "ফ্যাসিলিটি"))}</th>
              {BLOOD_GROUPS.map((g) => (
                <th key={g} scope="col" className="px-1 py-1.5 text-xs font-bold text-danger-ink">{g}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <th scope="row" className="px-2 py-1 text-left font-semibold text-ink" title={f.name}>{f.code}</th>
                {BLOOD_GROUPS.map((g) => {
                  const cell = f.blood[g];
                  if (!cell) {
                    return (
                      <td key={g} className="rounded-md px-1 py-2 text-ink-3">
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">{L(c("not stocked", "মজুত নেই"))}</span>
                      </td>
                    );
                  }
                  const zero = cell.units === 0;
                  const [, fill, ink] = zero ? [0, "#F1F5F9", "#1D1D1F"] : rampFor(cell.units);
                  const tip = [
                    `${f.code} ${g}: ${cell.units} ${L(c("units", "ইউনিট"))}`,
                    cell.reserved ? `${cell.reserved} ${L(c("reserved", "সংরক্ষিত"))}` : "",
                    cell.nearest_expiry_date ? `${L(c("expires", "মেয়াদ"))} ${cell.nearest_expiry_date}` : "",
                  ].filter(Boolean).join(" · ");
                  return (
                    <td
                      key={g}
                      title={tip}
                      className={`rounded-md px-1 py-2 font-semibold tabular-nums ${cell.expiring_soon ? "ring-2 ring-inset ring-[#B45309]" : ""}`}
                      style={{ background: fill, color: ink }}
                    >
                      <span className="inline-flex items-center justify-center gap-1">
                        {zero && <AlertTriangle className="h-3.5 w-3.5 text-danger-ink" aria-hidden="true" />}
                        {cell.units}
                        {cell.expiring_soon && <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
                      </span>
                      {zero && <span className="sr-only"> {L(c("out of stock", "মজুত শেষ"))}</span>}
                      {cell.expiring_soon && <span className="sr-only"> {L(c("expiring within 7 days", "৭ দিনের মধ্যে মেয়াদ শেষ"))}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row" className="px-2 pt-2 text-left text-xs font-medium text-ink-3">{L(c("City total", "শহরে মোট"))}</th>
              {BLOOD_GROUPS.map((g) => (
                <td key={g} className="pt-2 text-xs font-semibold tabular-nums text-ink">{insights.blood_units_by_group[g] ?? 0}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {insights.scarce_blood_groups.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger-ink">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {L(c("Scarce", "স্বল্প"))}
          </span>
          {L(c("Fewer than 10 units city-wide:", "শহরে ১০ ইউনিটের কম:"))}{" "}
          <strong className="font-semibold text-ink">{insights.scarce_blood_groups.join(", ")}</strong>
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------- hold outcomes ---- */

function HoldBars({ insights, locale }: { insights: Insights; locale: Locale }) {
  const L = (x: Copy) => x[locale];
  const entries = Object.keys(HOLD_LABEL).map((k) => [k, insights.holds_by_status[k] ?? 0] as const);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return (
    <section aria-labelledby="holds-title" className="mac-card space-y-4 p-5">
      <div>
        <h2 id="holds-title" className="text-lg font-semibold text-ink">{L(c("Bed holds by outcome", "ফলাফল অনুযায়ী বেড হোল্ড"))}</h2>
        <p className="text-sm text-ink-3">
          {total
            ? L(c(`${total} holds created in this window.`, `এই সময়ে ${total}টি হোল্ড তৈরি হয়েছে।`))
            : L(c("No holds were created in this window.", "এই সময়ে কোনো হোল্ড তৈরি হয়নি।"))}
        </p>
      </div>
      <ul className="space-y-2">
        {entries.map(([k, n]) => (
          <li key={k} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 text-sm">
            <span className="text-ink-2">{L(HOLD_LABEL[k])}</span>
            <span className="flex items-center gap-2">
              <span
                className="h-5 rounded-r-[4px] bg-[#0369A1]"
                style={{ width: n ? `${Math.max(2, (n / max) * 85)}%` : "0" }}
                title={`${L(HOLD_LABEL[k])}: ${n}`}
                aria-hidden="true"
              />
              <span className="font-semibold tabular-nums text-ink">{n}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------- freshness ---- */

function Freshness({ facilities, locale }: { facilities: InsightFacility[]; locale: Locale }) {
  const L = (x: Copy) => x[locale];
  return (
    <section aria-labelledby="fresh-title" className="mac-card space-y-3 p-5">
      <div>
        <h2 id="fresh-title" className="text-lg font-semibold text-ink">{L(c("Data freshness", "ডেটা কতটা নতুন"))}</h2>
        <p className="text-sm text-ink-3">
          {L(c(
            "Demo counts are simulated seed data. Live counts come from hospital staff or their system feed; they turn stale after 6 hours without an update.",
            "ডেমো সংখ্যা সিমুলেটেড। লাইভ সংখ্যা হাসপাতালের স্টাফ বা সিস্টেম ফিড থেকে আসে; ৬ ঘণ্টা হালনাগাদ না হলে পুরোনো ধরা হয়।"
          ))}
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {facilities.map((f) => {
          const st = FRESHNESS[f.data_freshness];
          return (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface/60 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink" title={f.name}>{f.code}</span>
                <span className="block text-xs text-ink-3">{ago(f.last_updated_at, locale)}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${st.chip}`}>{L(st.label)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- page ---- */

function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : "Could not load insights.";
}

function InsightsBoard() {
  const { locale } = useI18n();
  const L = (x: Copy) => x[locale];
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(7);
  const [data, setData] = useState<{ days: number; insights: Insights } | null>(null);
  const [error, setError] = useState<{ days: number; message: string } | null>(null);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    let alive = true;
    getInsights(days)
      .then((r) => {
        if (!alive) return;
        setData({ days, insights: r });
        setError(null);
        setAnnounce(locale === "bn" ? `${days} দিনের তথ্য লোড হয়েছে` : `Loaded ${days}-day insights`);
      })
      .catch((e) => {
        if (!alive) return;
        setError({ days, message: errorText(e) });
      });
    return () => {
      alive = false;
    };
  }, [days, locale]);

  const insights = data?.days === days ? data.insights : null;
  const loading = !insights && !(error?.days === days);
  const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

  return (
    <div className="space-y-6">
      <p className="sr-only" role="status">{announce}</p>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-ink">StewardLens · {L(c("Critical care", "জরুরি চিকিৎসা"))}</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {L(c("Dhaka critical-care picture", "ঢাকার জরুরি চিকিৎসার চিত্র"))}
          </h1>
          <p className="text-sm text-ink-3">
            {L(c("ICU capacity, blood scarcity, data freshness and how holds end.", "আইসিইউ সক্ষমতা, রক্তের ঘাটতি, ডেটার সতেজতা ও হোল্ডের ফলাফল।"))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {insights && (
            <button
              type="button"
              onClick={() => {
                const lines = [
                  JSON.stringify({
                    record_type: "summary_kpi",
                    window_days: insights.window_days,
                    generated_at: insights.generated_at,
                    icu_occupancy_pct: insights.icu_occupancy_pct,
                    icu_idle_unstaffed: insights.icu_idle_unstaffed,
                    ventilators_available: insights.ventilators_available,
                    live_coverage_pct: insights.live_coverage_pct,
                    expiring_soon_units: insights.expiring_soon_units,
                    carematch_runs: insights.carematch_runs,
                    carematch_infeasible: insights.carematch_infeasible,
                    carematch_median_ms: insights.carematch_median_ms,
                    news2_mean: insights.news2_mean,
                  }),
                  ...insights.facilities.map((f) =>
                    JSON.stringify({
                      record_type: "facility_snapshot",
                      window_days: insights.window_days,
                      generated_at: insights.generated_at,
                      facility_id: f.id,
                      facility_code: f.code,
                      tier: f.tier,
                      data_freshness: f.data_freshness,
                      icu: f.icu,
                      ventilator: f.ventilator,
                      blood: f.blood,
                    })
                  ),
                ];
                const blob = new Blob([`${lines.join("\n")}\n`], { type: "application/x-ndjson" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `shasthogrid-lakehouse-${insights.window_days}d.ndjson`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface/80 px-3 py-2 text-xs font-semibold text-ink-2 transition hover:bg-surface hover:text-brand-ink"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {L(c("Lakehouse NDJSON", "লেকহাউস NDJSON"))}
            </button>
          )}
          <div className="segmented" role="group" aria-label={L(c("Time window", "সময়সীমা"))}>
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={days === w}
                onClick={() => setDays(w)}
                className={`rounded-[0.6rem] px-3.5 py-1.5 text-sm font-medium transition ${
                  days === w ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:bg-surface/50"
                }`}
              >
                {locale === "bn" ? `${w} দিন` : `${w} days`}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error?.days === days && (
        <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          {error.message}
        </p>
      )}

      {loading && <Skeleton />}

      {insights && (
        <>
          {insights.facilities.length === 0 ? (
            <p className="mac-card p-6 text-center text-sm text-ink-3">
              {L(c("No active facilities yet.", "এখনো কোনো সক্রিয় ফ্যাসিলিটি নেই।"))}
            </p>
          ) : (
            <>
              <section aria-label={L(c("Headline numbers", "মূল সংখ্যা"))} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatTile label={L(c("Staffed ICU beds occupied", "চালু আইসিইউ বেড ভর্তি"))} value={pct(insights.icu_occupancy_pct)} />
                <StatTile
                  label={L(c("ICU beds with no staff", "স্টাফবিহীন আইসিইউ বেড"))}
                  value={String(insights.icu_idle_unstaffed)}
                  sub={L(c("physical beds that cannot take a patient", "যেসব বেডে রোগী নেওয়া যায় না"))}
                />
                <StatTile label={L(c("Ventilators free", "খালি ভেন্টিলেটর"))} value={String(insights.ventilators_available)} />
                <StatTile
                  label={L(c("Facilities with live data", "লাইভ ডেটাসহ ফ্যাসিলিটি"))}
                  value={pct(insights.live_coverage_pct)}
                />
                <StatTile
                  label={L(c("Blood units expiring ≤ 7 days", "৭ দিনে মেয়াদোত্তীর্ণ রক্ত"))}
                  value={String(insights.expiring_soon_units)}
                />
                <StatTile
                  label={L(c("CareMatch runs", "CareMatch চালানো"))}
                  value={String(insights.carematch_runs)}
                  sub={
                    insights.carematch_runs
                      ? L(c(
                          `${insights.carematch_infeasible} infeasible · median ${insights.carematch_median_ms ?? "—"} ms`,
                          `${insights.carematch_infeasible}টি অসম্ভব · মধ্যমা ${insights.carematch_median_ms ?? "—"} ms`
                        ))
                      : undefined
                  }
                />
                <StatTile
                  label={L(c("Holds that expired", "মেয়াদোত্তীর্ণ হোল্ড"))}
                  value={pct(insights.hold_expiry_rate_pct)}
                  sub={L(c("of finished holds", "শেষ হওয়া হোল্ডের মধ্যে"))}
                />
                <StatTile
                  label={L(c("Mean NEWS2 at triage", "ট্রায়াজে গড় NEWS2"))}
                  value={insights.news2_mean === null ? "—" : String(insights.news2_mean)}
                />
              </section>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                <div className="min-w-0 space-y-6">
                  <IcuChart facilities={insights.facilities} locale={locale} />
                  <BloodHeatmap insights={insights} locale={locale} />
                </div>
                <div className="min-w-0 space-y-6">
                  <HoldBars insights={insights} locale={locale} />
                  <Freshness facilities={insights.facilities} locale={locale} />
                </div>
              </div>

              <EscalationTasks insights={insights} locale={locale} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ----------------------------------------- Operational Escalation Tasks ---- */

interface EscalationTask {
  title: string;
  priority: "High" | "Medium" | "Normal";
  category: string;
  detail: string;
}

function EscalationTasks({ insights, locale }: { insights: Insights; locale: Locale }) {
  const L = (x: Copy) => x[locale];
  const tasks: EscalationTask[] = [];

  if (insights.scarce_blood_groups.length > 0) {
    tasks.push({
      title: L(c(`Restock scarce blood: ${insights.scarce_blood_groups.join(", ")}`, `স্বল্প রক্তের গ্রুপ মজুত করুন: ${insights.scarce_blood_groups.join(", ")}`)),
      priority: "High",
      category: "Blood Bank",
      detail: L(c("Below safety threshold across active hubs.", "সক্রিয় হাবগুলোতে নিরাপত্তা সীমার নিচে।")),
    });
  }
  if (insights.expiring_soon_units > 0) {
    tasks.push({
      title: L(c(`Redistribute ${insights.expiring_soon_units} expiring blood units`, `মেয়াদোত্তীর্ণ হতে চলা ${insights.expiring_soon_units} ইউনিট রক্ত পুনর্বণ্টন`)),
      priority: "Medium",
      category: "FEFO Blood",
      detail: L(c("Expiring within 7 days — prioritize high-turnover hospitals.", "৭ দিনের মধ্যে মেয়াদ শেষ — বেশি চাহিদার হাসপাতালে পাঠান।")),
    });
  }
  if (insights.icu_idle_unstaffed > 0) {
    tasks.push({
      title: L(c(`Assign shift nurses to ${insights.icu_idle_unstaffed} idle ICU beds`, `${insights.icu_idle_unstaffed}টি অলস আইসিইউ বেডে নার্স নিয়োগ`)),
      priority: "Medium",
      category: "ICU Staffing",
      detail: L(c("Physical ICU beds unavailable due to staffing gap.", "স্টাফ সংকটে শারীরিক আইসিইউ বেড ব্যবহার করা যাচ্ছে না।")),
    });
  }
  const stale = insights.facilities.filter((f) => f.data_freshness === "STALE");
  if (stale.length > 0) {
    tasks.push({
      title: L(c(`Refresh stale capacity feed (${stale.map((s) => s.code).join(", ")})`, `পুরোনো ফিড হালনাগাদ (${stale.map((s) => s.code).join(", ")})`)),
      priority: "Normal",
      category: "Data Freshness",
      detail: L(c("Facility capacity has not been reported recently.", "সাম্প্রতিক সক্ষমতা তথ্য পাঠানো হয়নি।")),
    });
  }

  if (tasks.length === 0) return null;

  const downloadCsv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = "Task Name,Priority,Category,Details";
    const rows = tasks.map((t) => [esc(t.title), esc(t.priority), esc(t.category), esc(t.detail)].join(","));
    const blob = new Blob([[header, ...rows].join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shasthogrid-escalations-${insights.window_days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="escalations-title" className="mac-card space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-brand-ink" aria-hidden="true" />
          <div>
            <h2 id="escalations-title" className="text-lg font-semibold text-ink">
              {L(c("Operational Escalations & Tasks", "পরিচালনাগত করণীয় ও টাস্ক"))}
            </h2>
            <p className="text-xs text-ink-3">
              {L(c("Auto-generated from live StewardLens gaps; export as CSV for Zoho Projects or Zapier.", "StewardLens-এর ঘাটতি থেকে স্বয়ংক্রিয়ভাবে তৈরি; Zoho Projects বা Zapier-এ CSV হিসেবে নিন।"))}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface/80 px-3 py-2 text-xs font-semibold text-ink-2 transition hover:bg-surface hover:text-brand-ink"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {L(c("Export Tasks CSV", "টাস্ক CSV ডাউনলোড"))}
        </button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {tasks.map((t) => (
          <li key={t.title} className="rounded-xl border border-line bg-surface/70 p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-ink">{t.title}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  t.priority === "High"
                    ? "bg-danger-soft text-danger-ink"
                    : t.priority === "Medium"
                      ? "bg-warn-soft text-warn-ink"
                      : "bg-fill text-ink-2"
                }`}
              >
                {t.priority}
              </span>
            </div>
            <p className="mt-1 text-ink-3">
              {t.category} · {t.detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function InsightsPage() {
  return (
    <AuthGuard
      pageTitle="StewardLens"
      allowedRoles={["dispatcher", "hospital_admin", "blood_bank_officer", "auditor", "admin"]}
    >
      {() => <InsightsBoard />}
    </AuthGuard>
  );
}
