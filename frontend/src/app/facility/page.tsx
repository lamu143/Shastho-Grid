"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ambulance,
  BedDouble,
  Check,
  Copy,
  Droplets,
  KeyRound,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  ChevronRight,
  X,
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { z } from "zod";
import { ApiError, apiRequest, getApiBaseUrl } from "@/lib/api";
import type { SessionUser } from "@/db/dexie";
import { useI18n, type Locale } from "@/lib/i18n";
import {
  getFacility,
  listFacilities,
  listFeedKeys,
  listReservations,
  revokeFeedKey,
  transitionReservation,
  updateBlood,
  updateResource,
  type BloodStock,
  type Facility,
  type FacilityDetail,
  FeedKeySchema,
  type FeedKey,
  type HospitalResource,
  type Reservation,
} from "@/lib/criticalCare";

type Copy = Record<Locale, string>;
const c = (en: string, bn: string): Copy => ({ en, bn });

const RESOURCE_LABEL: Record<HospitalResource["resource_type"], Copy> = {
  ICU_BED: c("ICU beds", "আইসিইউ বেড"),
  VENTILATOR: c("Ventilators", "ভেন্টিলেটর"),
  HDU_BED: c("HDU beds", "এইচডিইউ বেড"),
  NICU_BED: c("NICU beds", "এনআইসিইউ বেড"),
};

const SOURCE_LABEL: Record<HospitalResource["data_source"], { copy: Copy; chip: string }> = {
  FEED: { copy: c("Hospital feed", "হাসপাতাল ফিড"), chip: "bg-info-soft text-info-ink" },
  STAFF: { copy: c("Entered by staff", "স্টাফ দিয়েছেন"), chip: "bg-success-soft text-success-ink" },
  SEED_DEMO: { copy: c("Demo data", "ডেমো ডেটা"), chip: "bg-fill text-ink-2" },
};

const PENDING: Reservation["status"][] = ["HELD", "CONFIRMED", "EN_ROUTE"];

function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : "Something went wrong.";
}

function ago(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return locale === "bn" ? "কখনো হালনাগাদ হয়নি" : "never reported";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return locale === "bn" ? "এইমাত্র" : "just now";
  if (min < 60) return locale === "bn" ? `${min} মিনিট আগে` : `${min} min ago`;
  const h = Math.round(min / 60);
  return locale === "bn" ? `${h} ঘণ্টা আগে` : `${h} h ago`;
}

/* ------------------------------------------------------------- stepper ---- */

function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
  emphasis,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  emphasis?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  // Free typing: keep the raw text while editing and clamp only on blur (WCAG 3.3 / usability).
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  const commit = () => {
    const next = clamp(parseInt(text, 10));
    setText(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-3" aria-hidden="true">{label}</span>
      <div className="inline-flex items-center rounded-xl border border-line-strong bg-surface/80">
        <button
          type="button"
          aria-label={`${label} −1`}
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          className="grid h-10 w-10 place-items-center rounded-l-xl text-ink-2 hover:bg-fill disabled:opacity-30"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          value={text}
          min={min}
          max={max}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          className={`h-10 w-16 border-x border-line-strong bg-transparent text-center tabular-nums ${
            emphasis ? "text-xl font-bold text-ink" : "text-base font-semibold text-ink-2"
          }`}
        />
        <button
          type="button"
          aria-label={`${label} +1`}
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          className="grid h-10 w-10 place-items-center rounded-r-xl text-ink-2 hover:bg-fill disabled:opacity-30"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function SourceChip({ source, reportedAt, locale }: { source: HospitalResource["data_source"]; reportedAt?: string | null; locale: Locale }) {
  const s = SOURCE_LABEL[source];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-3">
      <span className={`rounded-full px-2 py-0.5 font-semibold ${s.chip}`}>{s.copy[locale]}</span>
      {source !== "SEED_DEMO" && ago(reportedAt, locale)}
    </span>
  );
}

/** Shown when the server copy changed while this row had unsaved edits. */
function ChangedElsewhere({ locale, onReload }: { locale: Locale; onReload: () => void }) {
  return (
    <p role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-ink">
      {locale === "bn"
        ? "এই সংখ্যা অন্য কোথাও হালনাগাদ হয়েছে। আপনার পরিবর্তন রাখা আছে।"
        : "Updated elsewhere while you were editing. Your changes are kept."}
      <button type="button" onClick={onReload} className="rounded-md px-2 py-1 font-semibold underline hover:bg-fill">
        {locale === "bn" ? "নতুন মান লোড করুন" : "Load latest"}
      </button>
    </p>
  );
}

/* ------------------------------------------------------- capacity rows ---- */

type ResourceDraft = { physical: number; staffed: number; available: number };
const resourceValues = (r: HospitalResource): ResourceDraft => ({
  physical: r.total_physical_count,
  staffed: r.staffed_capacity_count,
  available: r.available_count,
});
const sameDraft = (a: ResourceDraft, b: ResourceDraft) =>
  a.physical === b.physical && a.staffed === b.staffed && a.available === b.available;

function ResourceRow({
  facilityId,
  row,
  editable,
  locale,
  onSaved,
}: {
  facilityId: string;
  row: HospitalResource;
  editable: boolean;
  locale: Locale;
  onSaved: (msg: string) => void;
}) {
  // `base` is the server version this draft was taken from. When polling brings a newer
  // version we adopt it silently if untouched, or flag it if the user has unsaved edits.
  const [base, setBase] = useState(() => ({ version: row.version, values: resourceValues(row) }));
  const [draft, setDraft] = useState<ResourceDraft>(() => resourceValues(row));
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (row.version !== base.version) {
    const latest = resourceValues(row);
    if (sameDraft(draft, base.values)) {
      setDraft(latest);
      setConflict(false);
    } else {
      setConflict(true);
    }
    setBase({ version: row.version, values: sameDraft(draft, base.values) ? latest : base.values });
  }

  const loadLatest = () => {
    const latest = resourceValues(row);
    setBase({ version: row.version, values: latest });
    setDraft(latest);
    setConflict(false);
  };

  const dirty = !sameDraft(draft, base.values);
  const valid = draft.available <= draft.staffed && draft.staffed <= draft.physical;
  const pct = draft.staffed ? Math.round((1 - draft.available / draft.staffed) * 100) : 100;
  const name = RESOURCE_LABEL[row.resource_type][locale];

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const saved = await updateResource(facilityId, row.resource_type, {
        total_physical_count: draft.physical,
        staffed_capacity_count: draft.staffed,
        available_count: draft.available,
        expected_version: row.version,
      });
      const values = resourceValues(saved);
      setBase({ version: saved.version, values });
      setDraft(values);
      setConflict(false);
      onSaved(`${name} ✓`);
    } catch (e) {
      const isConflict = e instanceof ApiError && e.error_code === "VERSION_CONFLICT";
      setErr(
        isConflict
          ? locale === "bn"
            ? "অন্য কেউ বা হাসপাতাল ফিড এই সংখ্যা বদলেছে। নতুন মান দেখে আবার সংরক্ষণ করুন।"
            : "Someone else, or the hospital feed, changed this count. Load the latest value, check it and save again."
          : errorText(e)
      );
      if (isConflict) onSaved("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <BedDouble className="h-4 w-4 text-brand-ink" aria-hidden="true" />
          {name}
        </p>
        <SourceChip source={row.data_source} reportedAt={row.reported_at} locale={locale} />
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden="true">
        <div
          className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-[#F59E0B]" : "bg-success"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-ink-3">
        {row.resource_type === "VENTILATOR"
          ? locale === "bn" ? `চালু ভেন্টিলেটরের ${pct}% ব্যবহৃত` : `${pct}% of staffed ventilators in use`
          : locale === "bn" ? `চালু বেডের ${pct}% ভর্তি` : `${pct}% of staffed beds occupied`}
      </p>

      {editable ? (
        <>
          <div role="group" aria-label={name} className="mt-3 flex flex-wrap gap-4">
            <Stepper label={`${name}: ${locale === "bn" ? "খালি" : "free now"}`} value={draft.available} max={draft.staffed} emphasis onChange={(v) => setDraft((d) => ({ ...d, available: v }))} />
            <Stepper label={`${name}: ${locale === "bn" ? "স্টাফসহ চালু" : "staffed"}`} value={draft.staffed} min={draft.available} max={draft.physical} onChange={(v) => setDraft((d) => ({ ...d, staffed: v }))} />
            <Stepper label={`${name}: ${locale === "bn" ? "মোট" : "physical"}`} value={draft.physical} min={draft.staffed} onChange={(v) => setDraft((d) => ({ ...d, physical: v }))} />
          </div>
          {!valid && (
            <p className="mt-2 text-xs font-medium text-danger-ink">
              {locale === "bn" ? "খালি ≤ চালু ≤ মোট হতে হবে।" : "Free ≤ staffed ≤ physical."}
            </p>
          )}
          {conflict && <ChangedElsewhere locale={locale} onReload={loadLatest} />}
          {err && <p role="alert" className="mt-2 text-xs font-medium text-danger-ink">{err}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || !valid || busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {locale === "bn" ? "সংরক্ষণ" : "Save"}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => setDraft(base.values)}
                className="rounded-xl px-3 py-2 text-sm font-medium text-ink-2 hover:bg-fill"
              >
                {locale === "bn" ? "বাতিল" : "Undo"}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="mt-3 text-2xl font-bold tabular-nums text-ink">
          {row.available_count}
          <span className="text-sm font-medium text-ink-3"> / {row.staffed_capacity_count} {locale === "bn" ? "খালি" : "free"}</span>
        </p>
      )}
    </li>
  );
}

type BloodDraft = { units: number; expiry: string };
const bloodValues = (b: BloodStock): BloodDraft => ({ units: b.units_available, expiry: b.nearest_expiry_date ?? "" });
const sameBlood = (a: BloodDraft, b: BloodDraft) => a.units === b.units && a.expiry === b.expiry;

function BloodRow({
  facilityId,
  row,
  editable,
  locale,
  onSaved,
}: {
  facilityId: string;
  row: BloodStock;
  editable: boolean;
  locale: Locale;
  onSaved: (msg: string) => void;
}) {
  const [base, setBase] = useState(() => ({ version: row.version, values: bloodValues(row) }));
  const [draft, setDraft] = useState<BloodDraft>(() => bloodValues(row));
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mountedAt] = useState(() => Date.now());

  if (row.version !== base.version) {
    const latest = bloodValues(row);
    const untouched = sameBlood(draft, base.values);
    if (untouched) {
      setDraft(latest);
      setConflict(false);
    } else {
      setConflict(true);
    }
    setBase({ version: row.version, values: untouched ? latest : base.values });
  }

  const loadLatest = () => {
    const latest = bloodValues(row);
    setBase({ version: row.version, values: latest });
    setDraft(latest);
    setConflict(false);
  };

  const dirty = !sameBlood(draft, base.values);
  const expSoon = row.nearest_expiry_date
    ? (new Date(row.nearest_expiry_date).getTime() - mountedAt) / 86_400_000 < 7
    : false;
  const group = locale === "bn" ? `${row.blood_type} রক্ত` : `${row.blood_type} blood`;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const saved = await updateBlood(facilityId, row.blood_type, {
        units_available: draft.units,
        nearest_expiry_date: draft.expiry || null,
        expected_version: row.version,
      });
      const values = bloodValues(saved);
      setBase({ version: saved.version, values });
      setDraft(values);
      setConflict(false);
      onSaved(`${row.blood_type} ✓`);
    } catch (e) {
      setErr(errorText(e));
      if (e instanceof ApiError && e.error_code === "VERSION_CONFLICT") onSaved("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-bold text-danger-ink">
          <Droplets className="h-4 w-4" aria-hidden="true" />
          {row.blood_type}
        </p>
        <SourceChip source={row.data_source} reportedAt={row.reported_at} locale={locale} />
      </div>
      <p className="mt-1 text-xs text-ink-3">
        {row.units_reserved > 0 && (
          <span className="font-semibold text-lock-ink">
            {locale === "bn" ? `${row.units_reserved} ইউনিট সংরক্ষিত · ` : `${row.units_reserved} reserved · `}
          </span>
        )}
        {row.nearest_expiry_date && (
          <span className={expSoon ? "font-semibold text-warn-ink" : ""}>
            {locale === "bn" ? "মেয়াদ " : "expires "}
            {row.nearest_expiry_date}
          </span>
        )}
      </p>
      {editable ? (
        <div role="group" aria-label={group} className="mt-3 flex flex-wrap items-end gap-3">
          <Stepper label={`${group}: ${locale === "bn" ? "দেওয়া যায়" : "units free"}`} value={draft.units} emphasis onChange={(v) => setDraft((d) => ({ ...d, units: v }))} />
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
            {locale === "bn" ? "নিকটতম মেয়াদ" : "Nearest expiry"}
            <input
              type="date"
              value={draft.expiry}
              onChange={(e) => setDraft((d) => ({ ...d, expiry: e.target.value }))}
              className="h-10 rounded-xl border border-line-strong bg-surface/80 px-2 text-sm text-ink"
            />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-danger px-4 text-sm font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {locale === "bn" ? "সংরক্ষণ" : "Save"}
          </button>
          {conflict && <ChangedElsewhere locale={locale} onReload={loadLatest} />}
          {err && <p role="alert" className="w-full text-xs font-medium text-danger-ink">{err}</p>}
        </div>
      ) : (
        <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
          {row.units_available}
          <span className="text-sm font-medium text-ink-3"> {locale === "bn" ? "ইউনিট" : "units"}</span>
        </p>
      )}
    </li>
  );
}

/* ---------------------------------------------------------- hold queue ---- */

function HoldQueue({
  holds,
  facilities,
  canAct,
  locale,
  onChanged,
}: {
  holds: Reservation[];
  facilities: Facility[];
  canAct: boolean;
  locale: Locale;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Screen-reader announcements only at thresholds and status changes, never every second.
  const [announcement, setAnnouncement] = useState("");
  const holdsRef = useRef(holds);
  const lastRef = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    holdsRef.current = holds;
  }, [holds]);
  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const seen = lastRef.current;
      const next: Record<string, string> = {};
      const lines: string[] = [];
      for (const h of holdsRef.current) {
        const left = Math.round((new Date(h.hold_expires_at).getTime() - t) / 1000);
        const bucket =
          h.status !== "HELD" ? h.status : left <= 0 ? "EXPIRED" : left <= 30 ? "30S" : left <= 60 ? "1M" : left <= 120 ? "2M" : "HELD";
        next[h.reservation_id] = bucket;
        const prev = seen?.[h.reservation_id];
        const tag = `#${h.reservation_id.slice(0, 8)}`;
        if (seen && prev === undefined) {
          lines.push(locale === "bn" ? `নতুন হোল্ড ${tag}` : `New incoming hold ${tag}`);
        } else if (seen && prev !== bucket) {
          const msg: Record<string, [string, string]> = {
            "2M": [`${tag}: 2 minutes left to confirm`, `${tag}: নিশ্চিত করতে ২ মিনিট বাকি`],
            "1M": [`${tag}: 1 minute left to confirm`, `${tag}: নিশ্চিত করতে ১ মিনিট বাকি`],
            "30S": [`${tag}: 30 seconds left to confirm`, `${tag}: নিশ্চিত করতে ৩০ সেকেন্ড বাকি`],
            EXPIRED: [`${tag}: hold expired`, `${tag}: হোল্ডের মেয়াদ শেষ`],
            CONFIRMED: [`${tag}: confirmed`, `${tag}: নিশ্চিত`],
            EN_ROUTE: [`${tag}: ambulance on the way`, `${tag}: অ্যাম্বুলেন্স পথে`],
          };
          const m = msg[bucket];
          if (m) lines.push(locale === "bn" ? m[1] : m[0]);
        }
      }
      lastRef.current = next;
      if (lines.length) setAnnouncement(lines.join(". "));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [locale]);
  const name = (id: string | undefined) => facilities.find((f) => f.id === id)?.code ?? "—";

  const act = async (r: Reservation, target: "CONFIRMED" | "ADMITTED" | "CANCELLED") => {
    setBusy(`${r.reservation_id}:${target}`);
    setErr(null);
    try {
      await transitionReservation(r.reservation_id, target);
      // The clicked button unmounts after a transition: keep keyboard focus on the queue heading.
      document.getElementById("queue-title")?.focus();
      onChanged();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const region = (
    <p role="status" className="sr-only">
      {announcement}
    </p>
  );

  if (!holds.length) {
    return (
      <>
        {region}
        <p className="rounded-2xl bg-surface/50 px-4 py-6 text-center text-sm text-ink-3">
          {locale === "bn" ? "এখন কোনো আসন্ন রোগী নেই।" : "No incoming patients right now."}
        </p>
      </>
    );
  }

  return (
    <>
      {region}
      {err && <p role="alert" className="mb-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-ink">{err}</p>}
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {holds.map((r) => {
            const left = Math.max(0, Math.round((new Date(r.hold_expires_at).getTime() - now) / 1000));
            const urgent = r.status === "HELD" && left < 120;
            return (
              <motion.li
                key={r.reservation_id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/70 p-3"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      r.status === "HELD" ? "bg-warn-soft text-warn-ink" : r.status === "EN_ROUTE" ? "bg-info-soft text-info-ink" : "bg-success-soft text-success-ink"
                    }`}>
                      {r.status === "HELD" ? (locale === "bn" ? "হোল্ড" : "Held") : r.status === "CONFIRMED" ? (locale === "bn" ? "নিশ্চিত" : "Confirmed") : (locale === "bn" ? "পথে" : "En route")}
                    </span>
                    {r.icu_resource_id ? (locale === "bn" ? "আইসিইউ বেড" : "ICU bed") : null}
                    {r.icu_resource_id && r.vent_resource_id ? " + " : ""}
                    {r.vent_resource_id ? (locale === "bn" ? "ভেন্টিলেটর" : "Ventilator") : ""}
                    <span className="font-mono text-xs font-normal text-ink-3">#{r.reservation_id.slice(0, 8)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {r.blood.map((b) => `${b.units}× ${b.donor_blood_type} → ${b.recipient_blood_type} ${locale === "bn" ? "থেকে" : "from"} ${name(b.source_facility_id)}`).join(" · ")}
                    {r.blood.length > 0 && " · "}
                    {locale === "bn" ? "হাসপাতাল " : "to "}
                    {name(r.hospital_id)}
                    {r.status === "HELD" && (
                      <span aria-hidden="true" className={urgent ? "font-semibold text-danger-ink" : ""}>
                        {" · "}
                        {locale === "bn" ? "হোল্ড শেষ " : "hold ends in "}
                        {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
                      </span>
                    )}
                  </p>
                </div>
                {canAct ? (
                  <div className="flex gap-2">
                    {r.status === "HELD" && (
                      <button type="button" onClick={() => act(r, "CONFIRMED")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
                        {busy === `${r.reservation_id}:CONFIRMED` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                        {locale === "bn" ? "বেড নিশ্চিত" : "Confirm bed"}
                      </button>
                    )}
                    {r.status === "EN_ROUTE" && (
                      <button type="button" onClick={() => act(r, "ADMITTED")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-xl bg-info px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#075985] disabled:opacity-50">
                        <Ambulance className="h-4 w-4" aria-hidden="true" />
                        {locale === "bn" ? "ভর্তি হয়েছে" : "Patient arrived"}
                      </button>
                    )}
                    {r.status === "CONFIRMED" && (
                      <span className="self-center text-xs text-ink-3">{locale === "bn" ? "অ্যাম্বুলেন্সের অপেক্ষায়" : "Waiting for the ambulance"}</span>
                    )}
                    <button type="button" onClick={() => act(r, "CANCELLED")} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm font-medium text-danger-ink hover:bg-danger-soft disabled:opacity-50">
                      <X className="h-4 w-4" aria-hidden="true" />
                      {locale === "bn" ? "ছেড়ে দিন" : "Release"}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-ink-3">{locale === "bn" ? "শুধু দেখার জন্য" : "View only"}</span>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </>
  );
}

/* ------------------------------------------------------------ feed keys ---- */

type FeedScope = "RESOURCES" | "BLOOD" | "ALL";
const SCOPE_LABEL: Record<FeedScope, Copy> = {
  RESOURCES: c("Beds & ventilators", "বেড ও ভেন্টিলেটর"),
  BLOOD: c("Blood", "রক্ত"),
  ALL: c("Beds + blood", "বেড + রক্ত"),
};
// Read defensively: older servers may not send `scope` yet.
const keyScope = (k: object): FeedScope => {
  const v = (k as { scope?: unknown }).scope;
  return v === "RESOURCES" || v === "BLOOD" ? v : "ALL";
};
const CreatedKeySchema = FeedKeySchema.extend({ api_key: z.string() });

function FeedKeys({ facility, locale, isAdmin }: { facility: FacilityDetail; locale: Locale; isAdmin: boolean }) {
  const [keys, setKeys] = useState<FeedKey[]>([]);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<FeedScope>("ALL");
  const [fresh, setFresh] = useState<string | null>(null);
  const [freshScope, setFreshScope] = useState<FeedScope | null>(null);
  const [status, setStatus] = useState("");
  const copyRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<"key" | "curl" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    listFeedKeys(facility.id).then((r) => setKeys(r.items)).catch((e) => setErr(errorText(e)));
  }, [facility.id]);
  useEffect(() => {
    load();
  }, [load]);
  // Move focus to the one-time key's Copy button as soon as it appears.
  useEffect(() => {
    if (fresh) copyRef.current?.focus();
  }, [fresh]);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      // Only admins choose a scope; officers get their role's scope from the server.
      const k = await apiRequest(`/api/v1/facilities/${facility.id}/feed-keys`, {
        method: "POST",
        body: { label: label.trim() || `${facility.code} system feed`, ...(isAdmin ? { scope } : {}) },
        schema: CreatedKeySchema,
      });
      setFresh(k.api_key);
      setFreshScope(keyScope(k));
      setLabel("");
      setStatus(
        locale === "bn"
          ? "নতুন কী তৈরি হয়েছে। এটি একবারই দেখানো হবে, এখনই কপি করুন।"
          : "New key created. It is shown once; copy it now."
      );
      load();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const revoke = async (k: FeedKey) => {
    try {
      await revokeFeedKey(facility.id, k.id);
      setConfirmRevokeId(null);
      setStatus(locale === "bn" ? `"${k.label}" বাতিল হয়েছে।` : `Revoked "${k.label}".`);
      load();
    } catch (e) {
      setErr(errorText(e));
    }
  };

  const isHospital = freshScope ? freshScope !== "BLOOD" : facility.tier !== "BLOOD_HUB";
  const curl = `curl -X POST "${getApiBaseUrl()}/api/v1/feed/v1/capacity" \\
  -H "X-Facility-Key: ${fresh ?? "sgf_…"}" -H "Content-Type: application/json" \\
  -d '{${isHospital ? `"resources":[{"resource_type":"ICU_BED","total_physical_count":30,"staffed_capacity_count":24,"available_count":3}]` : `"blood":[{"blood_type":"O-","units_in_stock":4}]`}}'`;

  const copy = async (text: string, what: "key" | "curl") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked: text stays selectable */
    }
  };

  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  return (
    <section aria-labelledby="feed-title" className="mac-card space-y-4 p-5">
      <p role="status" className="sr-only">{status}</p>
      <div>
        <h2 id="feed-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
          <KeyRound className="h-5 w-5 text-info-ink" aria-hidden="true" />
          {locale === "bn" ? "সিস্টেম ফিড" : "System feed"}
        </h2>
        <p className="text-sm text-ink-3">
          {locale === "bn"
            ? "আপনার HIS বা ব্লাড-ব্যাংক সফটওয়্যার এই কী দিয়ে প্রতি ৫–১৫ মিনিটে সংখ্যা পাঠাতে পারে। হাতে হালনাগাদের দরকার হবে না।"
            : "Your HIS or blood-bank software can push counts with a key every 5–15 minutes, so nobody has to type them."}
        </p>
      </div>

      <AnimatePresence>
        {fresh && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2 rounded-2xl border border-warn/40 bg-warn-soft p-4">
            <p className="text-sm font-semibold text-warn-ink">
              {locale === "bn" ? "কী একবারই দেখানো হবে। এখনই কপি করে নিরাপদে রাখুন।" : "This key is shown once. Copy it now and store it safely."}
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 font-mono text-sm text-ink">{fresh}</code>
              <button ref={copyRef} type="button" onClick={() => copy(fresh, "key")} className="inline-flex items-center gap-1 rounded-lg bg-[#1D1D1F] px-3 py-2 text-sm font-medium text-white">
                {copied === "key" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied === "key" ? (locale === "bn" ? "কপি হয়েছে" : "Copied") : locale === "bn" ? "কপি" : "Copy"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="feed-label">{locale === "bn" ? "কী-এর নাম" : "Key label"}</label>
        <input
          id="feed-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder={locale === "bn" ? "যেমন: HIS সার্ভার" : "e.g. HIS server"}
          className="h-10 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface/80 px-3 text-sm"
        />
        {isAdmin && (
          <>
            <label className="sr-only" htmlFor="feed-scope">{locale === "bn" ? "কী কী পাঠাতে পারবে" : "What this key may report"}</label>
            <select
              id="feed-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as FeedScope)}
              className="h-10 rounded-xl border border-line-strong bg-surface/80 px-2 text-sm font-medium"
            >
              {(["RESOURCES", "BLOOD", "ALL"] as const).map((v) => (
                <option key={v} value={v}>{SCOPE_LABEL[v][locale]}</option>
              ))}
            </select>
          </>
        )}
        <button type="button" onClick={create} disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-info px-4 text-sm font-semibold text-white hover:bg-[#075985] disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {locale === "bn" ? "নতুন কী" : "New key"}
        </button>
      </div>
      {err && <p role="alert" className="text-sm text-danger-ink">{err}</p>}

      {active.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl bg-surface/60">
          {active.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-ink">{k.label}</span>
                  <span className="shrink-0 rounded-full bg-info-soft px-2 py-0.5 text-xs font-semibold text-info-ink">
                    {SCOPE_LABEL[keyScope(k)][locale]}
                  </span>
                </span>
                <span className="block text-xs text-ink-3">
                  <code className="font-mono">{k.key_prefix}…</code> · {locale === "bn" ? "শেষ ব্যবহার " : "last used "}
                  {k.last_used_at ? ago(k.last_used_at, locale) : locale === "bn" ? "কখনো না" : "never"}
                </span>
              </span>
              {confirmRevokeId === k.id ? (
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => revoke(k)}
                    className="inline-flex min-h-8 items-center rounded-lg bg-danger px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110"
                  >
                    {locale === "bn" ? "নিশ্চিত বাতিল" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevokeId(null)}
                    className="inline-flex min-h-8 items-center rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 hover:text-ink"
                  >
                    {locale === "bn" ? "না" : "Cancel"}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRevokeId(k.id)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-danger-ink hover:bg-danger-soft"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {locale === "bn" ? "বাতিল" : "Revoke"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {revoked.length > 0 && (
        <p className="text-xs text-ink-3">
          {locale === "bn" ? `${revoked.length}টি কী বাতিল করা হয়েছে।` : `${revoked.length} revoked key${revoked.length > 1 ? "s" : ""}.`}
        </p>
      )}

      <details className="group rounded-2xl bg-[#1D1D1F] p-4 text-sm text-white/90">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-white">
          <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
          {locale === "bn" ? "আইটি টিমের জন্য উদাহরণ" : "Example for your IT team"}
        </summary>
        <pre lang="en" className="mt-3 overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed">{curl}</pre>
        <button type="button" onClick={() => copy(curl, "curl")} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-surface/10 px-3 py-1.5 text-xs font-medium hover:bg-surface/20">
          {copied === "curl" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied === "curl" ? (locale === "bn" ? "কপি হয়েছে" : "Copied") : locale === "bn" ? "কপি" : "Copy"}
        </button>
        <p className="mt-2 text-xs text-white/60">
          {locale === "bn"
            ? "আপনার সিস্টেম যা দেখায় তাই পাঠান; ShasthoGrid নিজের চলমান হোল্ড নিজেই বাদ দেয়।"
            : "Send what your own system shows. ShasthoGrid subtracts its own pending holds."}
        </p>
      </details>
    </section>
  );
}

/* --------------------------------------------------------------- page ---- */

function FacilityDesk({ user }: { user: SessionUser }) {
  const { locale } = useI18n();
  const L = (x: Copy) => x[locale] ?? x.en;
  const isAdmin = user.role === "admin";

  const [all, setAll] = useState<Facility[]>([]);
  const [selected, setSelected] = useState<string | null>(user.facility_id ?? null);
  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [holds, setHolds] = useState<Reservation[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listFacilities()
      .then((r) => {
        setAll(r.items);
        if (!user.facility_id && r.items.length) setSelected((s) => s ?? r.items[0].id);
      })
      .catch((e) => setError(errorText(e)));
  }, [user.facility_id]);

  // Pure fetch: returns data, never touches state (keeps effects free of synchronous setState).
  const fetchDesk = useCallback(async () => {
    if (!selected) return null;
    const [f, r] = await Promise.all([getFacility(selected), listReservations()]);
    const pending = r.items.filter(
      (h) =>
        PENDING.includes(h.status) &&
        (h.hospital_id === selected || h.blood.some((b) => b.source_facility_id === selected))
    );
    return { f, pending };
  }, [selected]);

  const apply = useCallback((d: Awaited<ReturnType<typeof fetchDesk>>) => {
    if (!d) return;
    setFacility(d.f);
    setHolds(d.pending);
    setError(null);
  }, []);

  const reload = useCallback(
    () => fetchDesk().then(apply).catch((e) => setError(errorText(e))),
    [fetchDesk, apply]
  );

  const refresh = async () => {
    setLoading(true);
    await reload();
    setLoading(false);
  };

  // Initial load + 20 s polling, so new holds from dispatch show up without a refresh.
  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetchDesk()
        .then((d) => alive && apply(d))
        .catch((e) => alive && setError(errorText(e)));
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [fetchDesk, apply]);

  const saved = (msg: string) => {
    if (msg) {
      setToast(msg);
      window.setTimeout(() => setToast(null), 2000);
    }
    void reload();
  };

  const canEditBeds = isAdmin || user.role === "hospital_admin";
  const canEditBlood = isAdmin || user.role === "blood_bank_officer";
  const freshness = useMemo(() => all.find((f) => f.id === selected), [all, selected]);
  const realRows = facility ? [...facility.resources, ...facility.blood].filter((r) => r.data_source !== "SEED_DEMO").length : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-info-ink">FacilityDesk · LockStep</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {facility?.name ?? L(c("Facility desk", "ফ্যাসিলিটি ডেস্ক"))}
          </h1>
          <p className="text-sm text-ink-3">
            {user.full_name}
            {facility && ` · ${facility.district}`}
            {freshness && ` · ${L(c("last real update", "সর্বশেষ আসল হালনাগাদ"))} ${ago(freshness.last_updated_at, locale)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && all.length > 0 && (
            <label className="text-sm">
              <span className="sr-only">{L(c("Facility", "ফ্যাসিলিটি"))}</span>
              <select
                value={selected ?? ""}
                onChange={(e) => setSelected(e.target.value)}
                className="h-10 rounded-xl border border-line-strong bg-surface/80 px-3 font-medium"
              >
                {all.map((f) => (
                  <option key={f.id} value={f.id}>{f.code} · {f.name}</option>
                ))}
              </select>
            </label>
          )}
          <button type="button" onClick={() => void refresh()} aria-label={L(c("Refresh", "রিফ্রেশ"))} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface/80 hover:bg-surface">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      {!isAdmin && !user.facility_id && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          {L(c("Your account is not linked to a facility. Ask a system admin to assign one.", "আপনার অ্যাকাউন্ট কোনো ফ্যাসিলিটির সাথে যুক্ত নয়। সিস্টেম অ্যাডমিনকে জানান।"))}
        </p>
      )}
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">{error}</p>}

      {facility && realRows === 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-line bg-surface/60 px-4 py-3 text-sm text-ink-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info-ink" aria-hidden="true" />
          {L(c(
            "Every count below is still demo data. Save any row, or connect your system feed, and dispatchers will see this facility as Live.",
            "নিচের সব সংখ্যা এখনো ডেমো। যেকোনো সারি সংরক্ষণ করুন বা সিস্টেম ফিড যুক্ত করুন, ডিসপ্যাচাররা এটিকে লাইভ দেখবেন।"
          ))}
        </p>
      )}

      {facility && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="space-y-6">
            <section aria-labelledby="queue-title" className="mac-card space-y-3 p-5">
              <h2 id="queue-title" tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold text-ink">
                <Ambulance className="h-5 w-5 text-warn-ink" aria-hidden="true" />
                {L(c("Incoming holds", "আসন্ন হোল্ড"))}
                {holds.length > 0 && <span className="rounded-full bg-warn px-2 py-0.5 text-xs font-bold text-white">{holds.length}</span>}
              </h2>
              <HoldQueue
                holds={holds}
                facilities={all}
                canAct={canEditBeds && facility.tier !== "BLOOD_HUB"}
                locale={locale}
                onChanged={() => void reload()}
              />
            </section>

            {facility.resources.length > 0 && (
              <section aria-labelledby="beds-title" className="mac-card space-y-3 p-5">
                <h2 id="beds-title" className="text-lg font-semibold text-ink">{L(c("Beds & ventilators", "বেড ও ভেন্টিলেটর"))}</h2>
                <ul className="grid gap-3 md:grid-cols-2">
                  {facility.resources.map((r) => (
                    <ResourceRow key={r.id} facilityId={facility.id} row={r} editable={canEditBeds} locale={locale} onSaved={saved} />
                  ))}
                </ul>
              </section>
            )}

            {facility.blood.length > 0 && (
              <section aria-labelledby="blood-title" className="mac-card space-y-3 p-5">
                <h2 id="blood-title" className="text-lg font-semibold text-ink">{L(c("Blood stock", "রক্তের মজুত"))}</h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                  {facility.blood.map((b) => (
                    <BloodRow key={b.id} facilityId={facility.id} row={b} editable={canEditBlood} locale={locale} onSaved={saved} />
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="space-y-6">
            <FeedKeys key={facility.id} facility={facility} locale={locale} isAdmin={isAdmin} />
          </div>
        </div>
      )}

      {/* Always mounted so screen readers reliably announce saves. */}
      <p role="status" className="sr-only">
        {toast ? `${L(c("Saved · dispatchers now see it Live", "সংরক্ষিত · ডিসপ্যাচাররা এখন লাইভ দেখছেন"))} — ${toast}` : ""}
      </p>
      <AnimatePresence>
        {toast && (
          <motion.p
            aria-hidden="true"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="glass fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold text-success-ink shadow-lg"
          >
            {L(c("Saved · dispatchers now see it Live", "সংরক্ষিত · ডিসপ্যাচাররা এখন লাইভ দেখছেন"))} — {toast}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FacilityPage() {
  return (
    <AuthGuard pageTitle="FacilityDesk" allowedRoles={["hospital_admin", "blood_bank_officer", "admin"]}>
      {(user) => <FacilityDesk user={user} />}
    </AuthGuard>
  );
}
