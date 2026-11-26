"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ambulance,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Droplets,
  Loader2,
  Lock,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  XCircle,
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

const ACUITY_STYLE: Record<string, { label: Copy; cls: string }> = {
  RED_CRITICAL: { label: c("Critical", "অত্যন্ত গুরুতর"), cls: "bg-[#DC2626] text-white" },
  ORANGE_URGENT: { label: c("Urgent", "জরুরি"), cls: "bg-[#EA580C] text-white" },
  YELLOW_ELEVATED: { label: c("Elevated", "সতর্কতা"), cls: "bg-[#FACC15] text-[#422006]" },
  GREEN_STABLE: { label: c("Stable", "স্থিতিশীল"), cls: "bg-[#16A34A] text-white" },
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
      aria-live="polite"
    >
      NEWS2 {score} · {style.label[locale]}
      {preview && <span className="text-[0.7rem] font-medium opacity-80">preview</span>}
    </span>
  );
}

function NumberField({
  id, label, value, onChange, step = 1, min, max,
}: {
  id: string; label: string; value: number; onChange: (v: number) => void; step?: number; min: number; max: number;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs font-medium text-[#5C727E]">
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
        className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-base font-semibold text-[#172A33] tabular-nums shadow-inner shadow-black/[0.02] focus:border-[#0F766E]"
      />
    </label>
  );
}

function OptionCard({
  option, selected, onSelect, badge, extra, tone = "teal",
}: {
  option: HospitalOption; selected: boolean; onSelect: () => void; badge?: string; extra?: React.ReactNode; tone?: "teal" | "amber" | "violet";
}) {
  const ring = { teal: "ring-[#0F766E]", amber: "ring-[#D97706]", violet: "ring-[#7C3AED]" }[tone];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`mac-card w-full p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${selected ? `ring-2 ${ring}` : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {badge && <p className="text-[0.7rem] font-bold tracking-wide text-[#0F766E] uppercase">{badge}</p>}
          <p className="truncate font-semibold text-[#172A33]">{option.name}</p>
          <p className="text-xs text-[#5C727E]">
            {option.tier} · ICU {option.icu_available} · Vent {option.vent_available}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#0F766E]/10 px-2.5 py-1 text-sm font-bold text-[#0F766E] tabular-nums">
          {option.eta_minutes} min
        </span>
      </div>
      {extra}
    </button>
  );
}

/* --------------------------------------------------------------- the page */

function DispatchWorkbench({ user }: { user: SessionUser }) {
  const { locale } = useI18n();
  const L = (x: Copy) => x[locale] ?? x.en;

  const [mode, setMode] = useState<"copilot" | "vitals">("copilot");
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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    listFacilities(FARMGATE.lat, FARMGATE.lon)
      .then((r) => setFacilities(r.items))
      .catch((e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    if (!hold) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hold]);

  const preview = useMemo(() => {
    const ok = Object.values(vitals).every((v) => v !== undefined && v !== null && !(typeof v === "number" && !Number.isFinite(v)));
    return ok ? previewNews2(vitals) : null;
  }, [vitals]);

  const applyPreset = (p: Preset) => {
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
        const r = await copilotTriageAssist(note, FARMGATE.lat, FARMGATE.lon);
        const ex = r.extraction as Record<string, unknown>;
        setCopilot(r);
        setResult(r.carematch);
        setLastInput({
          incident_lat: FARMGATE.lat,
          incident_lon: FARMGATE.lon,
          needs_icu: true,
          needs_vent: Boolean(ex.needs_vent),
          blood_type: (ex.blood_type as BloodGroup | null) ?? null,
          blood_units: (ex.blood_type ? (ex.blood_units as number) : 0) || 0,
          public_only: Boolean(ex.public_only),
        });
      } else {
        const input: CareMatchInput = { incident_lat: FARMGATE.lat, incident_lon: FARMGATE.lon, vitals, ...needs };
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

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#0F766E]">CareMatch · ConflictProof · LockStep</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#172A33] sm:text-3xl">
            {L(c("Critical-care dispatch", "জরুরি চিকিৎসা ডিসপ্যাচ"))}
          </h1>
          <p className="text-sm text-[#5C727E]">
            {user.full_name} · {L(c("Incident at Farmgate, Dhaka. Bed and blood counts are simulated demo data.", "ঘটনাস্থল ফার্মগেট, ঢাকা। বেড ও রক্তের সংখ্যা সিমুলেটেড ডেমো ডেটা।"))}
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ---------------- intake ---------------- */}
        <section aria-labelledby="intake-title" className="mac-card space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="intake-title" className="text-lg font-semibold">{L(c("Patient intake", "রোগীর তথ্য"))}</h2>
            <div className="segmented" role="tablist" aria-label="Intake mode">
              {(["copilot", "vitals"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  type="button"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-[0.6rem] px-3 py-1.5 text-sm font-medium transition ${
                    mode === m ? "bg-white text-[#0F766E] shadow-sm" : "text-[#405663] hover:bg-white/60"
                  }`}
                >
                  {m === "copilot" ? "Shastho Copilot" : L(c("Structured vitals", "ভাইটাল ফর্ম"))}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Demo presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-[#405663] transition hover:bg-white"
              >
                {L(p.label)}
              </button>
            ))}
          </div>

          {mode === "copilot" ? (
            <label className="block space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-[#405663]">
                <Sparkles className="h-4 w-4 text-[#9333EA]" aria-hidden="true" />
                {L(c("Paramedic note — English, Bangla or Banglish", "প্যারামেডিক নোট — ইংরেজি, বাংলা বা বাংলিশ"))}
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={6}
                maxLength={2000}
                className="w-full rounded-2xl border border-black/10 bg-white/80 p-4 text-base leading-relaxed text-[#172A33] focus:border-[#0F766E]"
              />
              <p className="text-xs text-[#5C727E]">
                {L(c("Names and phone numbers are removed before any AI sees the note.", "এআই দেখার আগে নাম ও ফোন নম্বর মুছে ফেলা হয়।"))}
              </p>
            </label>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#405663]">PulseScore</span>
                {preview && <PulseBadge score={preview.score} acuity={preview.acuity} locale={locale} preview />}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <NumberField id="rr" label="Resp. rate" value={vitals.respiration_rate} min={0} max={80} onChange={(v) => setVitals({ ...vitals, respiration_rate: v })} />
                <NumberField id="spo2" label="SpO₂ %" value={vitals.spo2} min={50} max={100} onChange={(v) => setVitals({ ...vitals, spo2: v })} />
                <NumberField id="sbp" label="Systolic BP" value={vitals.systolic_bp} min={30} max={300} onChange={(v) => setVitals({ ...vitals, systolic_bp: v })} />
                <NumberField id="pulse" label="Pulse" value={vitals.pulse} min={0} max={300} onChange={(v) => setVitals({ ...vitals, pulse: v })} />
                <NumberField id="temp" label="Temp °C" step={0.1} value={vitals.temperature_c} min={25} max={45} onChange={(v) => setVitals({ ...vitals, temperature_c: v })} />
                <label htmlFor="acvpu" className="flex flex-col gap-1 text-xs font-medium text-[#5C727E]">
                  ACVPU
                  <select
                    id="acvpu"
                    value={vitals.consciousness}
                    onChange={(e) => setVitals({ ...vitals, consciousness: e.target.value as VitalsInput["consciousness"] })}
                    className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-base font-semibold"
                  >
                    {["A", "C", "V", "P", "U"].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={vitals.on_oxygen} onChange={(e) => setVitals({ ...vitals, on_oxygen: e.target.checked })} className="h-4 w-4 accent-[#0F766E]" />
                {L(c("On supplemental oxygen", "অক্সিজেন দেওয়া হচ্ছে"))}
              </label>

              <div className="grid grid-cols-2 gap-3 border-t border-black/5 pt-4 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={needs.needs_icu} onChange={(e) => setNeeds({ ...needs, needs_icu: e.target.checked })} className="h-4 w-4 accent-[#0F766E]" />
                  ICU
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={needs.needs_vent} onChange={(e) => setNeeds({ ...needs, needs_vent: e.target.checked })} className="h-4 w-4 accent-[#0F766E]" />
                  {L(c("Ventilator", "ভেন্টিলেটর"))}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={needs.public_only} onChange={(e) => setNeeds({ ...needs, public_only: e.target.checked })} className="h-4 w-4 accent-[#0F766E]" />
                  {L(c("Public only", "শুধু সরকারি"))}
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-[#5C727E]">
                  {L(c("Specialty", "বিশেষায়িত"))}
                  <select value={needs.specialty ?? ""} onChange={(e) => setNeeds({ ...needs, specialty: (e.target.value || null) as Specialty | null })} className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm">
                    <option value="">—</option>
                    {SPECIALTIES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-[#5C727E]">
                  {L(c("Blood", "রক্ত"))}
                  <select value={needs.blood_type ?? ""} onChange={(e) => setNeeds({ ...needs, blood_type: (e.target.value || null) as BloodGroup | null, blood_units: e.target.value ? Math.max(needs.blood_units, 1) : 0 })} className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm">
                    <option value="">—</option>
                    {BLOOD.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </label>
                <NumberField id="units" label={L(c("Units", "ব্যাগ"))} value={needs.blood_units} min={0} max={10} onChange={(v) => setNeeds({ ...needs, blood_units: v })} />
              </div>
              <label className="block text-xs font-medium text-[#5C727E]">
                {L(c("Max ETA", "সর্বোচ্চ সময়"))}: <span className="font-bold text-[#172A33]">{needs.max_eta_minutes ?? "—"} min</span>
                <input type="range" min={5} max={60} value={needs.max_eta_minutes ?? 60} onChange={(e) => setNeeds({ ...needs, max_eta_minutes: Number(e.target.value) })} className="mt-2 w-full accent-[#0F766E]" />
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={run}
            disabled={busy !== null}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0F766E] px-5 py-3 text-base font-semibold text-white shadow-lg shadow-[#0F766E]/20 transition hover:bg-[#115E59] disabled:opacity-60"
          >
            {busy === "solve" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <BrainCircuit className="h-5 w-5" aria-hidden="true" />}
            {mode === "copilot" ? L(c("Run Copilot → CareMatch", "Copilot → CareMatch চালান")) : L(c("Run CareMatch", "CareMatch চালান"))}
          </button>

          {error && (
            <p role="alert" className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
              {error}
            </p>
          )}
        </section>

        {/* ---------------- results ---------------- */}
        <section aria-labelledby="result-title" className="space-y-5">
          <div className="mac-card overflow-hidden p-2">
            <DhakaMap
              facilities={facilities}
              incident={FARMGATE}
              hospitalId={selectedHospital?.facility_id}
              bloodSourceId={selectedSource?.facility_id}
              className="h-auto w-full"
            />
          </div>

          <h2 id="result-title" className="sr-only">CareMatch result</h2>

          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={result.triage_request_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {result.news2 && <PulseBadge score={result.news2.score} acuity={result.news2.acuity} locale={locale} />}
                  <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-[#405663] tabular-nums">
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
                    <p className="text-sm leading-relaxed text-[#172A33]">{locale === "bn" ? copilot.brief.bn : copilot.brief.en}</p>
                    <details className="text-xs text-[#5C727E]">
                      <summary className="cursor-pointer font-semibold text-[#405663]">
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
                        <p className="mt-2 text-[#B45309]">Missing vitals: {copilot.missing_vitals.join(", ")}</p>
                      )}
                    </details>
                  </div>
                )}

                {result.status === "INFEASIBLE" && result.conflict_proof && (
                  <div className="rounded-2xl border border-[#FCA5A5]/70 bg-[#FEF2F2]/80 p-5 backdrop-blur" role="status">
                    <p className="flex items-center gap-2 font-semibold text-[#991B1B]">
                      <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                      ConflictProof · {L(c("no single hospital meets every rule", "কোনো একক হাসপাতাল সব শর্ত পূরণ করে না"))}
                    </p>
                    <div className="mt-3 space-y-2">
                      {result.conflict_proof.mus_cores.map((core, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-[#7F1D1D]">
                            {L(c("Clashing set", "সংঘর্ষ সেট"))} {i + 1}:
                          </span>
                          {core.map((k) => (
                            <span key={k} title={result.conflict_proof!.labels[k]} className="rounded-md bg-[#DC2626]/15 px-2 py-0.5 font-mono text-xs font-bold text-[#991B1B]">
                              {CONSTRAINT_SHORT[k] ?? k}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-3">
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
                            <div className="mt-3 space-y-1 text-xs text-[#405663]">
                              {r.blood_source && (
                                <p className="flex items-center gap-1.5 text-[#0E7490]">
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
                  <button
                    type="button"
                    onClick={lock}
                    disabled={busy !== null}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#172A33] px-5 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-black disabled:opacity-60"
                  >
                    {busy === "lock" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Lock className="h-5 w-5" aria-hidden="true" />}
                    {L(c("Approve & lock with LockStep", "অনুমোদন দিন ও LockStep দিয়ে লক করুন"))} — {selectedHospital.code}
                    {selectedSource ? ` + ${selectedSource.code}` : ""}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {hold && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mac-card space-y-4 p-5" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-semibold">
                  {hold.status === "CANCELLED" || hold.status === "EXPIRED" ? (
                    <XCircle className="h-5 w-5 text-[#DC2626]" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-[#059669]" aria-hidden="true" />
                  )}
                  LockStep · {hold.status}
                  {hold.is_split_dispatch && <span className="rounded-full bg-[#0891B2]/10 px-2 py-0.5 text-xs text-[#0E7490]">split dispatch</span>}
                </p>
                {hold.status === "HELD" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D97706]/10 px-3 py-1 text-sm font-bold text-[#B45309] tabular-nums">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
                  </span>
                )}
              </div>
              <p className="break-all font-mono text-xs text-[#5C727E]">Idempotency-Key: {holdKey}</p>
              {hold.blood.map((b, i) => (
                <p key={i} className="text-sm text-[#0E7490]">
                  {b.units}× {b.donor_blood_type} ({b.status.toLowerCase()})
                  {b.courier_eta_minutes !== null ? ` · courier ${b.courier_eta_minutes} min` : ""}
                </p>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={replay} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-sm font-medium hover:bg-white">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> {L(c("Retry same request", "একই অনুরোধ আবার পাঠান"))}
                </button>
                {user.role === "admin" && hold.status === "HELD" && (
                  <button type="button" disabled={busy !== null} onClick={() => move("CONFIRMED")} className="rounded-full bg-[#059669] px-3 py-1.5 text-sm font-semibold text-white">
                    {L(c("Confirm (hospital)", "নিশ্চিত করুন (হাসপাতাল)"))}
                  </button>
                )}
                {hold.status === "CONFIRMED" && (
                  <button type="button" disabled={busy !== null} onClick={() => move("EN_ROUTE")} className="inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] px-3 py-1.5 text-sm font-semibold text-white">
                    <Ambulance className="h-4 w-4" aria-hidden="true" /> {L(c("Mark en route", "রওনা দিয়েছে"))}
                  </button>
                )}
                {user.role === "admin" && hold.status === "EN_ROUTE" && (
                  <button type="button" disabled={busy !== null} onClick={() => move("ADMITTED")} className="inline-flex items-center gap-1.5 rounded-full bg-[#059669] px-3 py-1.5 text-sm font-semibold text-white">
                    <Stethoscope className="h-4 w-4" aria-hidden="true" /> {L(c("Admit", "ভর্তি"))}
                  </button>
                )}
                {["HELD", "CONFIRMED", "EN_ROUTE"].includes(hold.status) && (
                  <button type="button" disabled={busy !== null} onClick={() => move("CANCELLED")} className="rounded-full border border-[#DC2626]/30 px-3 py-1.5 text-sm font-semibold text-[#B91C1C] hover:bg-[#FEF2F2]">
                    {L(c("Cancel & release stock", "বাতিল ও স্টক ফেরত"))}
                  </button>
                )}
              </div>
              {hold.status === "HELD" && user.role !== "admin" && (
                <p className="text-xs text-[#5C727E]">
                  {L(c("Waiting for the hospital's ICU charge to confirm. The hold auto-expires when the timer ends.", "হাসপাতালের আইসিইউ ইনচার্জের নিশ্চিতকরণের অপেক্ষা। সময় শেষ হলে হোল্ড স্বয়ংক্রিয়ভাবে বাতিল হবে।"))}
                </p>
              )}
              {replayNote && <p className="rounded-xl bg-[#ECFDF5] px-3 py-2 text-sm text-[#065F46]">{replayNote}</p>}
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
