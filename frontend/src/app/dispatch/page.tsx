"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ambulance,
  BrainCircuit,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Droplets,
  ExternalLink,
  Loader2,
  Lock,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { DhakaMap } from "@/components/carematch/DhakaMap";
import { ApiError } from "@/lib/api";
import type { SessionUser } from "@/db/dexie";
import { useI18n, type Locale } from "@/lib/i18n";
import {
  CONSTRAINT_SHORT,
  FARMGATE,
  careMatchOptimize,
  copilotTriageAssist,
  createReservation,
  listFacilities,
  previewNews2,
  transitionReservation,
  type BloodGroup,
  type CareMatch,
  type CareMatchInput,
  type CopilotResult,
  type Facility,
  type HospitalOption,
  type Repair,
  type Reservation,
  type Specialty,
  type VitalsInput,
} from "@/lib/criticalCare";

type Copy = Record<Locale, string>;
const c = (en: string, bn: string): Copy => ({ en, bn });

const HOLD_STATUS_LABEL: Record<string, Copy> = {
  HELD: c("Held", "হোল্ড"),
  CONFIRMED: c("Confirmed", "নিশ্চিত"),
  EN_ROUTE: c("En route", "পথে"),
  ADMITTED: c("Admitted", "ভর্তি"),
  EXPIRED: c("Expired", "মেয়াদ শেষ"),
  CANCELLED: c("Cancelled", "বাতিল"),
};

const ACUITY_STYLE: Record<string, { label: Copy; cls: string }> = {
  RED_CRITICAL: { label: c("Critical", "অত্যন্ত গুরুতর"), cls: "bg-danger text-white" },
  ORANGE_URGENT: { label: c("Urgent", "জরুরি"), cls: "bg-[#C2410C] text-white" },
  YELLOW_ELEVATED: { label: c("Elevated", "সতর্কতা"), cls: "bg-[#FACC15] text-[#422006]" },
  GREEN_STABLE: { label: c("Stable", "স্থিতিশীল"), cls: "bg-[#15803D] text-white" },
};

interface Preset {
  id: string;
  label: Copy;
  note: string;
  vitals: VitalsInput;
  needs: Omit<CareMatchInput, "incident_lat" | "incident_lon" | "vitals">;
}

const PRESETS: Preset[] = [
  {
    id: "farmgate",
    label: c("Farmgate · obstetric bleed (O−)", "ফার্মগেট · প্রসূতি রক্তক্ষরণ (O−)"),
    note:
      "প্রসূতি রোগী, প্রসবের পর রক্তক্ষরণ, ফার্মগেট। শ্বাস ২৪, স্যাচুরেশন ৮৯, অক্সিজেন চলছে, প্রেশার ৮৪, পালস ১২৬, বিভ্রান্ত, তাপমাত্রা ৯৭। ভেন্টিলেটর ও আইসিইউ লাগবে। ও নেগেটিভ ২ ব্যাগ রক্ত, ১৫ মিনিটের মধ্যে, সরকারি হাসপাতাল।",
    vitals: { respiration_rate: 24, spo2: 89, on_oxygen: true, systolic_bp: 84, pulse: 126, consciousness: "C", temperature_c: 36.2 },
    needs: { needs_icu: true, needs_vent: true, specialty: "OBSTETRIC", blood_type: "O-", blood_units: 2, public_only: true, max_eta_minutes: 15 },
  },
  {
    id: "stroke",
    label: c("Stroke · public ICU in 20 min", "স্ট্রোক · ২০ মিনিটে সরকারি আইসিইউ"),
    note: "Suspected stroke near Farmgate, 62M, drowsy. RR 20, SpO2 94 on air, BP 188, pulse 96, temp 37.1. Needs ICU, govt hospital, within 20 min.",
    vitals: { respiration_rate: 20, spo2: 94, on_oxygen: false, systolic_bp: 188, pulse: 96, consciousness: "C", temperature_c: 37.1 },
    needs: { needs_icu: true, needs_vent: false, specialty: "NEURO", blood_type: null, blood_units: 0, public_only: true, max_eta_minutes: 20 },
  },
  {
    id: "trauma",
    label: c("Road crash · A+ 2 units", "সড়ক দুর্ঘটনা · A+ ২ ব্যাগ"),
    note: "RTA motorbike crash, Farmgate. HR 122, BP 92, RR 26, sat 93 room air, alert, temp 36.6. Needs ICU, A+ 2 units, private ok.",
    vitals: { respiration_rate: 26, spo2: 93, on_oxygen: false, systolic_bp: 92, pulse: 122, consciousness: "A", temperature_c: 36.6 },
    needs: { needs_icu: true, needs_vent: false, specialty: "TRAUMA", blood_type: "A+", blood_units: 2, public_only: false, max_eta_minutes: 20 },
  },
];

const SPECIALTIES: Specialty[] = ["TRAUMA", "OBSTETRIC", "NEURO", "CARDIAC", "PEDIATRIC"];
const BLOOD: BloodGroup[] = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];
const DHAKA_HUBS: { id: string; label: Copy; lat: number; lon: number }[] = [
  { id: "farmgate", label: c("Farmgate", "ফার্মগেট"), lat: FARMGATE.lat, lon: FARMGATE.lon },
  { id: "mirpur", label: c("Mirpur 10", "মিরপুর ১০"), lat: 23.8069, lon: 90.3687 },
  { id: "dhanmondi", label: c("Dhanmondi", "ধানমন্ডি"), lat: 23.7461, lon: 90.3742 },
  { id: "uttara", label: c("Uttara", "উত্তরা"), lat: 23.8759, lon: 90.3795 },
  { id: "motijheel", label: c("Motijheel", "মতিঝিল"), lat: 23.733, lon: 90.4172 },
];

function errorText(err: unknown): string {
  if (err instanceof ApiError) return `${err.message} (${err.error_code})`;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* ------------------------------------------------------------------ UI bits */

function PulseBadge({ score, acuity, locale, preview }: { score: number; acuity: string; locale: Locale; preview?: boolean }) {
  const style = ACUITY_STYLE[acuity];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold tabular-nums shadow-sm ${style.cls}`}
    >
      NEWS2 {score} · {style.label[locale]}
      {preview && <span className="text-[0.7rem] font-medium opacity-80">{locale === "bn" ? "প্রাথমিক" : "preview"}</span>}
    </span>
  );
}

function NumberField({
  id, label, value, onChange, step = 1, min, max,
}: {
  id: string; label: string; value: number; onChange: (v: number) => void; step?: number; min: number; max: number;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs font-medium text-ink-3">
      {label}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="rounded-xl border border-line-strong bg-surface/80 px-3 py-2 text-base font-semibold text-ink tabular-nums shadow-inner shadow-black/[0.02] focus:border-brand"
      />
    </label>
  );
}

function OptionCard({
  option, selected, onSelect, badge, extra, tone = "teal",
}: {
  option: HospitalOption; selected: boolean; onSelect: () => void; badge?: string; extra?: React.ReactNode; tone?: "teal" | "amber" | "violet";
}) {
  const ring = { teal: "ring-brand", amber: "ring-warn", violet: "ring-[#7C3AED]" }[tone];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`mac-card w-full p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${selected ? `ring-2 ${ring}` : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {badge && <p className="text-[0.7rem] font-bold tracking-wide text-brand-ink uppercase">{badge}</p>}
          <p className="truncate font-semibold text-ink">{option.name}</p>
          <p className="text-xs text-ink-3">
            {option.tier} · ICU {option.icu_available} · Vent {option.vent_available}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-1 text-sm font-bold text-brand-ink tabular-nums">
          {option.eta_minutes} min
        </span>
      </div>
      {extra}
    </button>
  );
}

/* --------------------------------------------------------------- the page */

const FRESHNESS_STYLE: Record<Facility["data_freshness"], { dot: string; chip: string; en: string; bn: string }> = {
  LIVE: { dot: "bg-success", chip: "bg-success-soft text-success-ink", en: "Live", bn: "লাইভ" },
  STALE: { dot: "bg-[#F59E0B]", chip: "bg-warn-soft text-warn-ink", en: "Stale", bn: "পুরোনো" },
  DEMO: { dot: "bg-[#94A3B8]", chip: "bg-fill text-ink-2", en: "Demo", bn: "ডেমো" },
};

function ago(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return locale === "bn" ? "কখনো হালনাগাদ হয়নি" : "never reported";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return locale === "bn" ? "এইমাত্র" : "just now";
  if (min < 60) return locale === "bn" ? `${min} মিনিট আগে` : `${min} min ago`;
  const h = Math.round(min / 60);
  return locale === "bn" ? `${h} ঘণ্টা আগে` : `${h} h ago`;
}

/** Header chip: how much of the map is real, live hospital data. */
function FreshnessSummary({ facilities, locale }: { facilities: Facility[]; locale: Locale }) {
  if (!facilities.length) return null;
  const n = (k: Facility["data_freshness"]) => facilities.filter((f) => f.data_freshness === k).length;
  return (
    <p role="group" className="segmented inline-flex items-center gap-3 px-3 py-1.5 text-xs font-medium text-ink-2" aria-label={locale === "bn" ? "ডেটা কতটা নতুন" : "Data freshness"}>
      {(["LIVE", "STALE", "DEMO"] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${FRESHNESS_STYLE[k].dot}`} aria-hidden="true" />
          {n(k)} {locale === "bn" ? FRESHNESS_STYLE[k].bn : FRESHNESS_STYLE[k].en}
        </span>
      ))}
    </p>
  );
}

/** Per-hospital provenance, so a dispatcher never mistakes demo numbers for real beds. */
function FreshnessPanel({ facilities, locale }: { facilities: Facility[]; locale: Locale }) {
  if (!facilities.length) return null;
  const allDemo = facilities.every((f) => f.data_freshness === "DEMO");
  return (
    <details className="mac-card group p-4" open={!allDemo}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-1.5 text-sm font-semibold text-ink">
        <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
        {locale === "bn" ? "ডেটা কতটা নতুন" : "Where these counts come from"}
        <span className="ml-1 font-normal text-ink-3">
          {allDemo
            ? locale === "bn"
              ? "সব সংখ্যা এখনো ডেমো। হাসপাতাল ফিড চালু হলে লাইভ হবে।"
              : "All counts are demo data until hospitals connect their feed."
            : locale === "bn"
              ? "লাইভ সংখ্যা হাসপাতাল নিজে পাঠায়; ৬ ঘণ্টা পুরোনো হলে সতর্কতা।"
              : "Live counts are pushed by each hospital; flagged stale after 6 h."}
        </span>
      </summary>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {facilities.map((f) => {
          const st = FRESHNESS_STYLE[f.data_freshness];
          return (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface/60 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink" title={f.name}>{f.code}</span>
                <span className="block text-xs text-ink-3">{ago(f.last_updated_at, locale)}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${st.chip}`}>
                {locale === "bn" ? st.bn : st.en}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function DispatchWorkbench({ user }: { user: SessionUser }) {
  const { locale } = useI18n();
  const L = (x: Copy) => x[locale] ?? x.en;

  const [mode, setMode] = useState<"copilot" | "vitals">("copilot");
  const [activePreset, setActivePreset] = useState<string>(PRESETS[0].id);
  const [incident, setIncident] = useState<{ lat: number; lon: number }>(FARMGATE);
  const [note, setNote] = useState(PRESETS[0].note);
  const [vitals, setVitals] = useState<VitalsInput>(PRESETS[0].vitals);
  const [needs, setNeeds] = useState(PRESETS[0].needs);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  const [busy, setBusy] = useState<null | "solve" | "lock" | "move">(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CareMatch | null>(null);
  const [copilot, setCopilot] = useState<CopilotResult | null>(null);
  const [lastInput, setLastInput] = useState<CareMatchInput | null>(null);
  const [choice, setChoice] = useState<number>(0);

  const [hold, setHold] = useState<Reservation | null>(null);
  const [holdKey, setHoldKey] = useState<string | null>(null);
  const [holdBody, setHoldBody] = useState<Parameters<typeof createReservation>[0] | null>(null);
  const [replayNote, setReplayNote] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    listFacilities(incident.lat, incident.lon)
      .then((r) => setFacilities(r.items))
      .catch((e) => setError(errorText(e)));
  }, [incident.lat, incident.lon]);

  useEffect(() => {
    if (!hold) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hold]);

  // Lock / move buttons unmount after each transition: keep keyboard focus on the hold card.
  const holdId = hold?.reservation_id;
  const holdStatus = hold?.status;
  useEffect(() => {
    if (holdId) document.getElementById("hold-title")?.focus();
  }, [holdId, holdStatus]);

  const preview = useMemo(() => {
    const ok = Object.values(vitals).every((v) => v !== undefined && v !== null && !(typeof v === "number" && !Number.isFinite(v)));
    return ok ? previewNews2(vitals) : null;
  }, [vitals]);

  const applyPreset = (p: Preset) => {
    setActivePreset(p.id);
    setNote(p.note);
    setVitals(p.vitals);
    setNeeds(p.needs);
    setResult(null);
    setCopilot(null);
    setHold(null);
    setError(null);
  };

  const run = async () => {
    setBusy("solve");
    setError(null);
    setHold(null);
    setReplayNote(null);
    try {
      if (mode === "copilot") {
        const r = await copilotTriageAssist(note, incident.lat, incident.lon);
        const ex = r.extraction as Record<string, unknown>;
        setCopilot(r);
        setResult(r.carematch);
        setLastInput({
          incident_lat: incident.lat,
          incident_lon: incident.lon,
          needs_icu: true,
          needs_vent: Boolean(ex.needs_vent),
          blood_type: (ex.blood_type as BloodGroup | null) ?? null,
          blood_units: (ex.blood_type ? (ex.blood_units as number) : 0) || 0,
          public_only: Boolean(ex.public_only),
        });
      } else {
        const input: CareMatchInput = { incident_lat: incident.lat, incident_lon: incident.lon, vitals, ...needs };
        setCopilot(null);
        setResult(await careMatchOptimize(input));
        setLastInput(input);
      }
      setChoice(0);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const repairs: Repair[] = result?.conflict_proof?.repairs ?? [];
  const selectedRepair = result?.status === "INFEASIBLE" ? repairs[choice] : undefined;
  const selectedHospital: HospitalOption | undefined =
    result?.status === "OPTIMAL"
      ? [result.recommendation!, ...result.alternatives][choice]
      : selectedRepair?.hospital;
  const selectedSource = selectedRepair?.blood_source ?? null;

  const lock = async () => {
    if (!selectedHospital || !lastInput) return;
    const body = {
      hospital_id: selectedHospital.facility_id,
      needs_icu: lastInput.needs_icu || lastInput.needs_vent,
      needs_vent: lastInput.needs_vent,
      blood:
        lastInput.blood_type && lastInput.blood_units > 0
          ? {
              source_facility_id: selectedSource?.facility_id ?? selectedHospital.facility_id,
              blood_type: lastInput.blood_type,
              units: lastInput.blood_units,
            }
          : null,
      triage_request_id: result?.triage_request_id ?? null,
    };
    const key = newKey();
    setBusy("lock");
    setError(null);
    try {
      setHold(await createReservation(body, key));
      setHoldKey(key);
      setHoldBody(body);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const replay = async () => {
    if (!holdKey || !holdBody) return;
    try {
      const again = await createReservation(holdBody, holdKey);
      setReplayNote(
        again.reservation_id === hold?.reservation_id
          ? L(c("Same hold returned — no second bed was taken.", "একই হোল্ড ফেরত এসেছে — দ্বিতীয় বেড নেওয়া হয়নি।"))
          : "Unexpected: a different hold was returned."
      );
    } catch (e) {
      setReplayNote(errorText(e));
    }
  };

  const move = async (target: "CONFIRMED" | "EN_ROUTE" | "ADMITTED" | "CANCELLED") => {
    if (!hold) return;
    setBusy("move");
    setError(null);
    try {
      setHold(await transitionReservation(hold.reservation_id, target));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const remaining = hold ? Math.max(0, Math.floor((new Date(hold.hold_expires_at).getTime() - now) / 1000)) : 0;

  // Hold announcements change only at 2:00 / 1:00 / 0:30 / expiry and on status changes.
  const holdAnnouncement = (() => {
    if (!hold) return "";
    const st = L(HOLD_STATUS_LABEL[hold.status] ?? c(hold.status, hold.status));
    if (hold.status !== "HELD") return `LockStep: ${st}`;
    if (remaining <= 0) return L(c("Hold expired.", "হোল্ডের মেয়াদ শেষ।"));
    if (remaining <= 30) return L(c("30 seconds left on the hold.", "হোল্ডে ৩০ সেকেন্ড বাকি।"));
    if (remaining <= 60) return L(c("1 minute left on the hold.", "হোল্ডে ১ মিনিট বাকি।"));
    if (remaining <= 120) return L(c("2 minutes left on the hold.", "হোল্ডে ২ মিনিট বাকি।"));
    return L(c(`Bed held at ${selectedHospital?.code ?? "hospital"}. Waiting for confirmation.`, `${selectedHospital?.code ?? "হাসপাতালে"} বেড হোল্ড করা হয়েছে। নিশ্চিতকরণের অপেক্ষা।`));
  })();

  const resultAnnouncement = (() => {
    if (!result) return "";
    const stale = result.stale_facilities.length
      ? L(c(` Stale counts: ${result.stale_facilities.join(", ")}.`, ` পুরোনো সংখ্যা: ${result.stale_facilities.join(", ")}।`))
      : "";
    if (result.status === "OPTIMAL" && result.recommendation) {
      return L(c(`CareMatch: best match ${result.recommendation.code}, ${result.recommendation.eta_minutes} minutes away.`, `CareMatch: সেরা বিকল্প ${result.recommendation.code}, ${result.recommendation.eta_minutes} মিনিট দূরে।`)) + stale;
    }
    return L(c(`ConflictProof: no single hospital meets every rule. ${result.conflict_proof?.repairs.length ?? 0} safe options shown.`, `ConflictProof: কোনো একক হাসপাতাল সব শর্ত পূরণ করে না। ${result.conflict_proof?.repairs.length ?? 0}টি নিরাপদ বিকল্প দেখানো হলো।`)) + stale;
  })();

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-ink">CareMatch · ConflictProof · LockStep</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {L(c("Critical-care dispatch", "জরুরি চিকিৎসা ডিসপ্যাচ"))}
          </h1>
          <p className="text-sm text-ink-3">
            {user.full_name} · {L(c("Incident at Farmgate, Dhaka.", "ঘটনাস্থল ফার্মগেট, ঢাকা।"))}
          </p>
        </div>
        <FreshnessSummary facilities={facilities} locale={locale} />
      </header>

      <FreshnessPanel facilities={facilities} locale={locale} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ---------------- intake ---------------- */}
        <section aria-labelledby="intake-title" className="mac-card space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="intake-title" className="text-lg font-semibold">{L(c("Patient intake", "রোগীর তথ্য"))}</h2>
            <div className="segmented" role="group" aria-label={L(c("Intake mode", "তথ্য দেওয়ার ধরন"))}>
              {(["copilot", "vitals"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-[0.6rem] px-3 py-1.5 text-sm font-medium transition ${
                    mode === m ? "bg-surface text-brand-ink shadow-sm" : "text-ink-2 hover:bg-surface/60"
                  }`}
                >
                  {m === "copilot" ? "Shastho Copilot" : L(c("Structured vitals", "ভাইটাল ফর্ম"))}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label={L(c("Demo presets", "ডেমো উদাহরণ"))}>
            {PRESETS.map((p) => {
              const isSelected = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => applyPreset(p)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    isSelected
                      ? "border-brand/50 bg-brand-soft font-semibold text-brand-ink shadow-xs"
                      : "border-line bg-surface/70 text-ink-2 hover:bg-surface"
                  }`}
                >
                  {L(p.label)}
                </button>
              );
            })}
          </div>

          {mode === "copilot" ? (
            <label className="block space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-ink-2">
                <Sparkles className="h-4 w-4 text-[#9333EA]" aria-hidden="true" />
                {L(c("Paramedic note — English, Bangla or Banglish", "প্যারামেডিক নোট — ইংরেজি, বাংলা বা বাংলিশ"))}
              </span>
              <textarea
                lang={/[\u0980-\u09FF]/.test(note) ? "bn" : "en"}
                value={note}
                onChange={(e) => {
                  setActivePreset("");
                  setNote(e.target.value);
                }}
                rows={6}
                maxLength={2000}
                className="w-full rounded-2xl border border-line-strong bg-surface/80 p-4 text-base leading-relaxed text-ink focus:border-brand"
              />
              <p className="text-xs text-ink-3">
                {L(c("Names and phone numbers are removed before any AI sees the note.", "এআই দেখার আগে নাম ও ফোন নম্বর মুছে ফেলা হয়।"))}
              </p>
            </label>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink-2">PulseScore</span>
                {preview && <PulseBadge score={preview.score} acuity={preview.acuity} locale={locale} preview />}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <NumberField id="rr" label={L(c("Resp. rate", "শ্বাসের হার"))} value={vitals.respiration_rate} min={0} max={80} onChange={(v) => setVitals({ ...vitals, respiration_rate: v })} />
                <NumberField id="spo2" label="SpO₂ %" value={vitals.spo2} min={50} max={100} onChange={(v) => setVitals({ ...vitals, spo2: v })} />
                <NumberField id="sbp" label={L(c("Systolic BP", "সিস্টোলিক রক্তচাপ"))} value={vitals.systolic_bp} min={30} max={300} onChange={(v) => setVitals({ ...vitals, systolic_bp: v })} />
                <NumberField id="pulse" label={L(c("Pulse", "পালস"))} value={vitals.pulse} min={0} max={300} onChange={(v) => setVitals({ ...vitals, pulse: v })} />
                <NumberField id="temp" label={L(c("Temp °C", "তাপমাত্রা °C"))} step={0.1} value={vitals.temperature_c} min={25} max={45} onChange={(v) => setVitals({ ...vitals, temperature_c: v })} />
                <label htmlFor="acvpu" className="flex flex-col gap-1 text-xs font-medium text-ink-3">
                  ACVPU
                  <select
                    id="acvpu"
                    value={vitals.consciousness}
                    onChange={(e) => setVitals({ ...vitals, consciousness: e.target.value as VitalsInput["consciousness"] })}
                    className="rounded-xl border border-line-strong bg-surface/80 px-3 py-2 text-base font-semibold"
                  >
                    {["A", "C", "V", "P", "U"].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={vitals.on_oxygen} onChange={(e) => setVitals({ ...vitals, on_oxygen: e.target.checked })} className="h-4 w-4 accent-brand-ink" />
                {L(c("On supplemental oxygen", "অক্সিজেন দেওয়া হচ্ছে"))}
              </label>

              <div className="grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={needs.needs_icu} onChange={(e) => setNeeds({ ...needs, needs_icu: e.target.checked })} className="h-4 w-4 accent-brand-ink" />
                  ICU
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={needs.needs_vent} onChange={(e) => setNeeds({ ...needs, needs_vent: e.target.checked })} className="h-4 w-4 accent-brand-ink" />
                  {L(c("Ventilator", "ভেন্টিলেটর"))}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={needs.public_only} onChange={(e) => setNeeds({ ...needs, public_only: e.target.checked })} className="h-4 w-4 accent-brand-ink" />
                  {L(c("Public only", "শুধু সরকারি"))}
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
                  {L(c("Specialty", "বিশেষায়িত"))}
                  <select value={needs.specialty ?? ""} onChange={(e) => setNeeds({ ...needs, specialty: (e.target.value || null) as Specialty | null })} className="rounded-xl border border-line bg-surface/80 px-3 py-2 text-sm">
                    <option value="">—</option>
                    {SPECIALTIES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
                  {L(c("Blood", "রক্ত"))}
                  <select value={needs.blood_type ?? ""} onChange={(e) => setNeeds({ ...needs, blood_type: (e.target.value || null) as BloodGroup | null, blood_units: e.target.value ? Math.max(needs.blood_units, 1) : 0 })} className="rounded-xl border border-line bg-surface/80 px-3 py-2 text-sm">
                    <option value="">—</option>
                    {BLOOD.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </label>
                <NumberField id="units" label={L(c("Units", "ব্যাগ"))} value={needs.blood_units} min={0} max={10} onChange={(v) => setNeeds({ ...needs, blood_units: v })} />
              </div>
              <label className="block text-xs font-medium text-ink-3">
                {L(c("Max ETA", "সর্বোচ্চ সময়"))}: <span className="font-bold text-ink">{needs.max_eta_minutes ?? "—"} min</span>
                <input type="range" min={5} max={60} value={needs.max_eta_minutes ?? 60} onChange={(e) => setNeeds({ ...needs, max_eta_minutes: Number(e.target.value) })} className="mt-2 w-full accent-brand-ink" />
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={run}
            disabled={busy !== null}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3 text-base font-semibold text-white shadow-lg shadow-[#0F766E]/20 transition hover:bg-brand-strong disabled:opacity-60"
          >
            {busy === "solve" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <BrainCircuit className="h-5 w-5" aria-hidden="true" />}
            {mode === "copilot" ? L(c("Run Copilot → CareMatch", "Copilot → CareMatch চালান")) : L(c("Run CareMatch", "CareMatch চালান"))}
          </button>

          {error && (
            <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-ink">
              {error}
            </p>
          )}
        </section>

        {/* ---------------- results ---------------- */}
        <section aria-labelledby="result-title" className="space-y-5">
          <div className="mac-card overflow-hidden p-2">
            <DhakaMap
              facilities={facilities}
              incident={incident}
              hospitalId={selectedHospital?.facility_id}
              bloodSourceId={selectedSource?.facility_id}
              locale={locale}
              onIncidentChange={(pos) => setIncident(pos)}
              className="h-auto w-full"
            />
            <div className="flex flex-wrap items-center gap-1.5 px-2 pt-2 pb-1">
              <span className="text-[11px] font-medium text-ink-3">
                {L(c("Incident zone:", "ঘটনাস্থল:"))}
              </span>
              {DHAKA_HUBS.map((hub) => {
                const isHere = Math.abs(incident.lat - hub.lat) < 0.002 && Math.abs(incident.lon - hub.lon) < 0.002;
                return (
                  <button
                    key={hub.id}
                    type="button"
                    onClick={() => setIncident({ lat: hub.lat, lon: hub.lon })}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                      isHere ? "bg-danger-soft text-danger-ink" : "bg-fill text-ink-2 hover:text-ink"
                    }`}
                  >
                    {L(hub.label)}
                  </button>
                );
              })}
            </div>
          </div>

          <h2 id="result-title" className="sr-only">{L(c("CareMatch result", "CareMatch ফলাফল"))}</h2>
          {/* Always-mounted live regions: text changes only on real events, never per second. */}
          <p role="status" className="sr-only">{resultAnnouncement}</p>
          <p role="status" className="sr-only">{holdAnnouncement}</p>
          <p role="status" className="sr-only">{replayNote ?? ""}</p>

          {result && result.stale_facilities.length > 0 && (
            <p className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn-ink">
              {L(c(
                `Counts for ${result.stale_facilities.join(", ")} have not been refreshed recently, so CareMatch ranked them lower. Phone the hospital to confirm before you lock.`,
                `${result.stale_facilities.join(", ")}-এর সংখ্যা সম্প্রতি হালনাগাদ হয়নি, তাই CareMatch সেগুলো নিচে রেখেছে। লক করার আগে হাসপাতালে ফোন করে নিশ্চিত হোন।`,
              ))}
            </p>
          )}

          {!result && facilities.length > 0 && (
            <div className="mac-card flex flex-wrap items-center justify-between gap-3 p-4 text-xs text-ink-2">
              <div className="space-y-0.5">
                <p className="font-semibold text-ink">
                  {L(c(
                    `${facilities.filter((f) => f.tier !== "BLOOD_HUB").length} hospitals · ${facilities.reduce((sum, f) => sum + f.icu_available, 0)} free ICU beds on Dhaka grid`,
                    `ঢাকা গ্রিডে ${facilities.filter((f) => f.tier !== "BLOOD_HUB").length}টি হাসপাতাল · ${facilities.reduce((sum, f) => sum + f.icu_available, 0)}টি খালি আইসিইউ বেড`
                  ))}
                </p>
                <p className="text-ink-3">
                  {L(c("Pick a preset or enter vitals, then run CareMatch to see routes, ConflictProof repairs, and LockStep holds.", "একটি উদাহরণ বেছে নিন বা ভাইটাল লিখুন, তারপর CareMatch চালিয়ে রুট ও LockStep হোল্ড দেখুন।"))}
                </p>
              </div>
              <button
                type="button"
                onClick={run}
                disabled={busy !== null}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 font-semibold text-white transition hover:bg-brand-strong disabled:opacity-60"
              >
                <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />
                {L(c("Run now", "এখনই চালান"))}
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={result.triage_request_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="space-y-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {result.news2 && <PulseBadge score={result.news2.score} acuity={result.news2.acuity} locale={locale} />}
                  <span className="rounded-full bg-fill px-3 py-1 text-xs font-semibold text-ink-2 tabular-nums">
                    CP-SAT · {result.wall_time_ms} ms
                  </span>
                  {copilot && (
                    <span className="rounded-full bg-[#9333EA]/10 px-3 py-1 text-xs font-semibold text-[#7E22CE]">
                      Copilot · {copilot.provider_used}
                    </span>
                  )}
                </div>

                {copilot && (
                  <div className="mac-card space-y-2 p-4">
                    <p className="text-sm leading-relaxed text-ink">{locale === "bn" ? copilot.brief.bn : copilot.brief.en}</p>
                    <details className="text-xs text-ink-3">
                      <summary className="cursor-pointer font-semibold text-ink-2">
                        {L(c("Tool trace", "টুল ট্রেস"))} ({copilot.tool_trace.length} {L(c("steps", "ধাপ"))})
                      </summary>
                      <ol className="mt-2 space-y-1">
                        {copilot.tool_trace.map((s) => (
                          <li key={s.step} className="font-mono">
                            {s.step}. {s.tool} · {s.duration_ms} ms
                          </li>
                        ))}
                      </ol>
                      {copilot.missing_vitals.length > 0 && (
                        <p className="mt-2 text-warn-ink">{L(c("Missing vitals", "যে ভাইটাল নেই"))}: <span lang="en">{copilot.missing_vitals.join(", ")}</span></p>
                      )}
                    </details>
                  </div>
                )}

                {result.status === "INFEASIBLE" && result.conflict_proof && (
                  <div className="rounded-2xl border border-danger-line/70 bg-danger-soft/80 p-5 backdrop-blur">
                    <p className="flex items-center gap-2 font-semibold text-danger-ink">
                      <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                      ConflictProof · {L(c("no single hospital meets every rule", "কোনো একক হাসপাতাল সব শর্ত পূরণ করে না"))}
                    </p>
                    <div className="mt-3 space-y-2">
                      {result.conflict_proof.mus_cores.map((core, i) => (
                        <div key={i} className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-danger-ink">
                              {L(c("Clashing set", "সংঘর্ষ সেট"))} {i + 1}:
                            </span>
                            {core.map((k) => (
                              <span key={k} title={result.conflict_proof!.labels[k]} className="rounded-md bg-danger/15 px-2 py-0.5 font-mono text-xs font-bold text-danger-ink">
                                {CONSTRAINT_SHORT[k] ?? k}
                              </span>
                            ))}
                          </div>
                          <ul className="space-y-0.5 pl-1 text-xs text-danger-ink/90">
                            {core.map((k) => (
                              <li key={`${k}-label`}>
                                <span className="font-mono font-semibold">{k}:</span>{" "}
                                {result.conflict_proof!.labels[k] ?? CONSTRAINT_SHORT[k] ?? k}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-3">
                  {result.status === "OPTIMAL"
                    ? [result.recommendation!, ...result.alternatives].map((o, i) => (
                        <OptionCard key={o.facility_id} option={o} selected={choice === i} onSelect={() => setChoice(i)} badge={i === 0 ? L(c("Best match", "সেরা বিকল্প")) : undefined} />
                      ))
                    : repairs.map((r, i) => (
                        <OptionCard
                          key={r.repair_type}
                          option={r.hospital}
                          selected={choice === i}
                          onSelect={() => setChoice(i)}
                          badge={r.title}
                          tone={r.clinical_compromise ? "amber" : r.repair_type === "SPLIT_RESOURCE_CO_DISPATCH" ? "teal" : "violet"}
                          extra={
                            <div className="mt-3 space-y-1 text-xs text-ink-2">
                              {r.blood_source && (
                                <p className="flex items-center gap-1.5 text-info-ink">
                                  <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
                                  {r.blood_source.units}× {r.blood_source.blood_type} from {r.blood_source.code} · {r.blood_source.courier_eta_minutes} min
                                </p>
                              )}
                              <p>{r.note}</p>
                            </div>
                          }
                        />
                      ))}
                </div>

                {!hold && selectedHospital && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={lock}
                      disabled={busy !== null}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#172A33] px-5 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-black disabled:opacity-60"
                    >
                      {busy === "lock" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Lock className="h-5 w-5" aria-hidden="true" />}
                      {L(c("Approve & lock with LockStep", "অনুমোদন দিন ও LockStep দিয়ে লক করুন"))} — {selectedHospital.code}
                      {selectedSource ? ` + ${selectedSource.code}` : ""}
                    </button>
                    {(() => {
                      const hospObj = facilities.find((f) => f.id === selectedHospital.facility_id);
                      if (!hospObj) return null;
                      return (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&origin=${incident.lat},${incident.lon}&destination=${hospObj.lat},${hospObj.lon}&travelmode=driving`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-brand-ink transition hover:bg-fill"
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          {L(c("Google Maps", "গুগল ম্যাপ"))}
                        </a>
                      );
                    })()}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {hold && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mac-card space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="hold-title" tabIndex={-1} className="flex flex-wrap items-center gap-2 font-semibold">
                  {hold.status === "CANCELLED" || hold.status === "EXPIRED" ? (
                    <XCircle className="h-5 w-5 text-danger-ink" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-success-ink" aria-hidden="true" />
                  )}
                  <span>LockStep · {L(HOLD_STATUS_LABEL[hold.status] ?? c(hold.status, hold.status))}</span>
                  <span className="rounded bg-fill px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink-3">
                    {hold.reservation_id.slice(0, 8)}…
                  </span>
                  {hold.is_split_dispatch && <span className="rounded-full bg-[#0891B2]/10 px-2 py-0.5 text-xs text-info-ink">{L(c("split dispatch", "বিভক্ত ডিসপ্যাচ"))}</span>}
                </h3>
                {hold.status === "HELD" && (
                  <span aria-hidden="true" className="inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-3 py-1 text-sm font-bold text-warn-ink tabular-nums">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
                  </span>
                )}
              </div>

              {/* 4-step lifecycle stepper */}
              {!["CANCELLED", "EXPIRED"].includes(hold.status) && (
                <ol className="grid grid-cols-4 gap-1.5 text-center text-[11px] font-semibold" aria-label={L(c("Reservation lifecycle", "হোল্ডের ধাপ"))}>
                  {(["HELD", "CONFIRMED", "EN_ROUTE", "ADMITTED"] as const).map((step, idx, arr) => {
                    const currentIdx = arr.indexOf(hold.status as (typeof arr)[number]);
                    const reached = currentIdx >= idx;
                    const active = currentIdx === idx;
                    return (
                      <li
                        key={step}
                        className={`rounded-lg px-2 py-1 ${
                          active
                            ? "bg-brand text-white"
                            : reached
                              ? "bg-success-soft text-success-ink"
                              : "bg-fill text-ink-3"
                        }`}
                      >
                        {L(HOLD_STATUS_LABEL[step])}
                      </li>
                    );
                  })}
                </ol>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 break-all font-mono text-xs text-ink-3">Idempotency-Key: {holdKey}</p>
                {holdKey && (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(holdKey).then(() => {
                        setCopiedKey(true);
                        window.setTimeout(() => setCopiedKey(false), 1500);
                      });
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-ink-2 hover:text-ink"
                  >
                    {copiedKey ? <Check className="h-3 w-3 text-success-ink" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                    {copiedKey ? L(c("Copied", "কপি হয়েছে")) : L(c("Copy key", "কপি"))}
                  </button>
                )}
              </div>
              {hold.blood.map((b, i) => (
                <p key={i} className="text-sm text-info-ink">
                  {b.units}× {b.donor_blood_type} ({b.status.toLowerCase()})
                  {b.courier_eta_minutes !== null ? ` · courier ${b.courier_eta_minutes} min` : ""}
                </p>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={replay} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-sm font-medium hover:bg-surface">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> {L(c("Retry same request", "একই অনুরোধ আবার পাঠান"))}
                </button>
                {user.role === "admin" && hold.status === "HELD" && (
                  <button type="button" disabled={busy !== null} onClick={() => move("CONFIRMED")} className="rounded-full bg-success px-3 py-1.5 text-sm font-semibold text-white">
                    {L(c("Confirm (hospital)", "নিশ্চিত করুন (হাসপাতাল)"))}
                  </button>
                )}
                {hold.status === "CONFIRMED" && (
                  <button type="button" disabled={busy !== null} onClick={() => move("EN_ROUTE")} className="inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] px-3 py-1.5 text-sm font-semibold text-white">
                    <Ambulance className="h-4 w-4" aria-hidden="true" /> {L(c("Mark en route", "রওনা দিয়েছে"))}
                  </button>
                )}
                {user.role === "admin" && hold.status === "EN_ROUTE" && (
                  <button type="button" disabled={busy !== null} onClick={() => move("ADMITTED")} className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1.5 text-sm font-semibold text-white">
                    <Stethoscope className="h-4 w-4" aria-hidden="true" /> {L(c("Admit", "ভর্তি"))}
                  </button>
                )}
                {["HELD", "CONFIRMED", "EN_ROUTE"].includes(hold.status) && (
                  <button type="button" disabled={busy !== null} onClick={() => move("CANCELLED")} className="rounded-full border border-danger/30 px-3 py-1.5 text-sm font-semibold text-danger-ink hover:bg-danger-soft">
                    {L(c("Cancel & release stock", "বাতিল ও স্টক ফেরত"))}
                  </button>
                )}
              </div>
              {hold.status === "HELD" && user.role !== "admin" && (
                <p className="text-xs text-ink-3">
                  {L(c("Waiting for the hospital's ICU charge to confirm. The hold auto-expires when the timer ends.", "হাসপাতালের আইসিইউ ইনচার্জের নিশ্চিতকরণের অপেক্ষা। সময় শেষ হলে হোল্ড স্বয়ংক্রিয়ভাবে বাতিল হবে।"))}
                </p>
              )}
              {replayNote && <p aria-hidden="true" className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success-ink">{replayNote}</p>}
            </motion.div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function DispatchPage() {
  return (
    <AuthGuard pageTitle="CareMatch Dispatch" allowedRoles={["dispatcher", "admin"]}>
      {(user) => <DispatchWorkbench user={user} />}
    </AuthGuard>
  );
}
