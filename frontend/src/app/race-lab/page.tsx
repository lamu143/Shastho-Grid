"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Grid3X3,
  KeyRound,
  Loader2,
  Lock,
  RotateCcw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { ApiError } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";
import {
  createReservation,
  racelabReset,
  racelabRun,
  racelabStatus,
  type RaceLabStatus,
  type RaceRun,
  type ReservationInput,
} from "@/lib/criticalCare";

type Copy = Record<Locale, string>;
const c = (en: string, bn: string): Copy => ({ en, bn });

interface Tile {
  n: number;
  status: number | null;
  ms: number | null;
  detail: string;
  key?: string;
  startedOffsetMs?: number;
  finishedOffsetMs?: number;
}

interface RunRecord {
  id: number;
  mode: "browser" | "server";
  concurrency: number;
  winners: number;
  rejected: number;
  doubleBookings: number;
  wallMs: number;
  passed: boolean;
}

interface IdempotencyProof {
  kind: "replay_winner" | "replay_loser" | "tamper";
  httpStatus: number;
  code: string;
  message: string;
  ok: boolean;
}

const PRESETS = [5, 10, 15, 25] as const;

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function Kpi({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone: string }) {
  return (
    <div className="mac-card p-4">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function RaceLab() {
  const { locale } = useI18n();
  const L = useCallback((x: Copy) => x[locale] ?? x.en, [locale]);

  const [concurrency, setConcurrency] = useState(25);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [running, setRunning] = useState<null | "browser" | "server" | "reset">(null);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<RaceRun | null>(null);
  const [sandbox, setSandbox] = useState<RaceLabStatus | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "waterfall">("grid");
  const [selectedAttempt, setSelectedAttempt] = useState<number | null>(null);
  const [wallTimeMs, setWallTimeMs] = useState<number | null>(null);

  const [winner, setWinner] = useState<{ key: string; body: ReservationInput; id: string } | null>(null);
  const [firstLoser, setFirstLoser] = useState<{ key: string; body: ReservationInput } | null>(null);
  const [proof, setProof] = useState<IdempotencyProof | null>(null);
  const [proving, setProving] = useState<null | IdempotencyProof["kind"]>(null);
  const [history, setHistory] = useState<RunRecord[]>([]);

  const refreshSandbox = useCallback(async () => {
    try {
      const s = await racelabStatus();
      setSandbox(s);
    } catch {
      // Status is best-effort on initial mount; race buttons surface actionable errors.
    }
  }, []);

  useEffect(() => {
    let active = true;
    racelabStatus()
      .then((s) => {
        if (active) setSandbox(s);
      })
      .catch(() => {
        // Status is best-effort on initial mount; race buttons surface actionable errors.
      });
    return () => {
      active = false;
    };
  }, []);

  const resetSandboxOnly = async () => {
    setRunning("reset");
    setError(null);
    try {
      await racelabReset();
      await refreshSandbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed.");
    } finally {
      setRunning(null);
    }
  };

  /** Real race from this browser: N simultaneous HTTP requests, each with its own Idempotency-Key. */
  const runBrowser = async () => {
    setRunning("browser");
    setError(null);
    setServer(null);
    setProof(null);
    setWinner(null);
    setFirstLoser(null);
    setSelectedAttempt(null);
    setWallTimeMs(null);

    try {
      const resetRes = await racelabReset();
      const body: ReservationInput = {
        hospital_id: resetRes.facility_id,
        needs_icu: true,
        needs_vent: false,
        blood: null,
      };
      setTiles(Array.from({ length: concurrency }, (_, i) => ({ n: i + 1, status: null, ms: null, detail: "" })));

      const raceOrigin = performance.now();
      let winCount = 0;
      let rejectCount = 0;

      await Promise.all(
        Array.from({ length: concurrency }, async (_, i) => {
          const key = newKey();
          const started = performance.now();
          const startedOffsetMs = Math.max(0, Math.round(started - raceOrigin));
          let status = 0;
          let detail = "";
          try {
            const r = await createReservation(body, key);
            status = 201;
            detail = r.reservation_id;
            winCount += 1;
            setWinner({ key, body, id: r.reservation_id });
          } catch (e) {
            status = e instanceof ApiError ? e.status : 0;
            detail = e instanceof ApiError ? e.error_code : "NETWORK";
            if (status === 409) {
              rejectCount += 1;
              setFirstLoser((prev) => prev ?? { key, body });
            }
          }
          const finished = performance.now();
          const ms = Math.round(finished - started);
          const finishedOffsetMs = Math.max(startedOffsetMs + 1, Math.round(finished - raceOrigin));
          setTiles((prev) =>
            prev.map((t) =>
              t.n === i + 1
                ? { ...t, status, ms, detail, key, startedOffsetMs, finishedOffsetMs }
                : t
            )
          );
        })
      );

      const totalWall = Math.round(performance.now() - raceOrigin);
      setWallTimeMs(totalWall);
      setHistory((prev) => [
        {
          id: prev.length + 1,
          mode: "browser",
          concurrency,
          winners: winCount,
          rejected: rejectCount,
          doubleBookings: Math.max(0, winCount - 1),
          wallMs: totalWall,
          passed: winCount === 1 && winCount + rejectCount === concurrency,
        },
        ...prev.slice(0, 7),
      ]);
      await refreshSandbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Race failed.");
    } finally {
      setRunning(null);
    }
  };

  /** Server-side race: N independent database transactions released at the same instant. */
  const runServer = async () => {
    setRunning("server");
    setError(null);
    setProof(null);
    setWinner(null);
    setFirstLoser(null);
    setSelectedAttempt(null);
    setWallTimeMs(null);
    setTiles(Array.from({ length: concurrency }, (_, i) => ({ n: i + 1, status: null, ms: null, detail: "" })));

    try {
      const r = await racelabRun(concurrency);
      setServer(r);
      const wall = r.wall_time_ms ?? Math.max(...r.attempts.map((a) => a.finished_offset_ms ?? a.ms), 0);
      setWallTimeMs(Math.round(wall));
      setTiles(
        r.attempts.map((a) => ({
          n: a.attempt,
          status: a.status,
          ms: Math.round(a.ms),
          detail: a.detail,
          startedOffsetMs: a.started_offset_ms ?? 0,
          finishedOffsetMs: a.finished_offset_ms ?? Math.round(a.ms),
        }))
      );
      setHistory((prev) => [
        {
          id: prev.length + 1,
          mode: "server",
          concurrency: r.concurrency,
          winners: r.winners,
          rejected: r.rejected,
          doubleBookings: r.double_bookings,
          wallMs: Math.round(wall),
          passed: r.winners === 1 && r.errors === 0 && r.double_bookings === 0,
        },
        ...prev.slice(0, 7),
      ]);
      await refreshSandbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Race failed.");
      setTiles([]);
    } finally {
      setRunning(null);
    }
  };

  const runIdempotencyProof = async (kind: IdempotencyProof["kind"]) => {
    if (kind === "replay_winner" && winner) {
      setProving(kind);
      try {
        const again = await createReservation(winner.body, winner.key);
        const same = again.reservation_id === winner.id;
        setProof({
          kind,
          httpStatus: 201,
          code: same ? "X-Idempotent-Replay: true" : "NEW_RESERVATION",
          message: same
            ? L(
                c(
                  `Replayed: returned the exact same hold (${again.reservation_id.slice(0, 8)}…) and took 0 extra beds.`,
                  `রিপ্লে: ঠিক একই হোল্ড (${again.reservation_id.slice(0, 8)}…) ফেরত এসেছে এবং বাড়তি কোনো বেড নেওয়া হয়নি।`
                )
              )
            : L(c("Unexpected: a different hold was returned.", "অপ্রত্যাশিত: ভিন্ন একটি হোল্ড ফেরত এসেছে।")),
          ok: same,
        });
      } catch (e) {
        setProof({
          kind,
          httpStatus: e instanceof ApiError ? e.status : 0,
          code: e instanceof ApiError ? e.error_code : "ERROR",
          message: e instanceof Error ? e.message : "Replay failed.",
          ok: false,
        });
      } finally {
        setProving(null);
      }
    } else if (kind === "replay_loser" && firstLoser) {
      setProving(kind);
      try {
        await createReservation(firstLoser.body, firstLoser.key);
        setProof({
          kind,
          httpStatus: 201,
          code: "UNEXPECTED_201",
          message: L(c("Unexpected: a rejected key succeeded on replay.", "অপ্রত্যাশিত: প্রত্যাখ্যাত কী রিপ্লেতে সফল হয়েছে।")),
          ok: false,
        });
      } catch (e) {
        const is409 = e instanceof ApiError && e.status === 409;
        setProof({
          kind,
          httpStatus: e instanceof ApiError ? e.status : 0,
          code: e instanceof ApiError ? e.error_code : "ERROR",
          message: is409
            ? L(
                c(
                  "Remembered rejection: replaying a lost race's key returns the same 409 RESOURCE_EXHAUSTED.",
                  "মনে রাখা প্রত্যাখ্যান: হেরে যাওয়া রেসের কী আবার পাঠালে একই ৪০৯ RESOURCE_EXHAUSTED ফেরত আসে।"
                )
              )
            : e instanceof Error
              ? e.message
              : "Replay failed.",
          ok: is409,
        });
      } finally {
        setProving(null);
      }
    } else if (kind === "tamper" && winner) {
      setProving(kind);
      try {
        await createReservation({ ...winner.body, needs_vent: true }, winner.key);
        setProof({
          kind,
          httpStatus: 201,
          code: "TAMPER_ALLOWED",
          message: L(c("Unexpected: modified payload was accepted under the same key.", "অপ্রত্যাশিত: পরিবর্তিত পেলোড একই কী-তে গৃহীত হয়েছে।")),
          ok: false,
        });
      } catch (e) {
        const conflict = e instanceof ApiError && e.status === 409 && e.error_code === "IDEMPOTENCY_KEY_CONFLICT";
        setProof({
          kind,
          httpStatus: e instanceof ApiError ? e.status : 0,
          code: e instanceof ApiError ? e.error_code : "ERROR",
          message: conflict
            ? L(
                c(
                  "Tamper blocked: reusing the winner's Idempotency-Key with a modified body (needs_vent: true) returned 409 IDEMPOTENCY_KEY_CONFLICT.",
                  "টেম্পার আটকানো হয়েছে: বিজয়ীর Idempotency-Key দিয়ে পরিবর্তিত পেলোড (needs_vent: true) পাঠানোয় ৪০৯ IDEMPOTENCY_KEY_CONFLICT এসেছে।"
                )
              )
            : e instanceof Error
              ? e.message
              : "Tamper check failed.",
          ok: conflict,
        });
      } finally {
        setProving(null);
      }
    }
  };

  const done = tiles.filter((t) => t.status !== null);
  const winners = done.filter((t) => t.status === 201).length;
  const rejected = done.filter((t) => t.status === 409).length;
  const other = done.filter((t) => t.status !== 201 && t.status !== 409).length;
  const allFinished = tiles.length > 0 && done.length === tiles.length;

  const latencyStats = useMemo(() => {
    const times = done.map((t) => t.ms ?? 0).sort((a, b) => a - b);
    if (times.length === 0) return null;
    return {
      min: Math.round(times[0]),
      median: percentile(times, 50),
      p95: percentile(times, 95),
      max: Math.round(times[times.length - 1]),
    };
  }, [done]);

  const maxWaterfallMs = useMemo(() => {
    const maxFinish = Math.max(...tiles.map((t) => t.finishedOffsetMs ?? t.ms ?? 0), 1);
    return Math.max(maxFinish, 1);
  }, [tiles]);

  const activeTile = selectedAttempt !== null ? tiles.find((t) => t.n === selectedAttempt) ?? null : null;

  return (
    <div className="space-y-6">
      {/* Hero + Sandbox Status */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-lock-soft px-3 py-1 text-xs font-semibold text-lock-ink">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>LockStep · A05</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            RaceLab — {L(c("who gets the last ICU bed?", "শেষ আইসিইউ বেড কে পাবে?"))}
          </h1>
          <p className="max-w-2xl text-sm text-ink-3">
            {L(
              c(
                "Resets an isolated sandbox ICU to 1 free bed and fires simultaneous bookings at it. PostgreSQL row locks and check constraints guarantee exactly one winner — real hospitals are never touched.",
                "একটি বিচ্ছিন্ন স্যান্ডবক্স আইসিইউতে ঠিক ১টি খালি বেড রেখে একসাথে অনেকগুলো বুকিং পাঠানো হয়। PostgreSQL রো-লক ও চেক কনস্ট্রেইন্ট ঠিক একজন বিজয়ী নিশ্চিত করে — আসল হাসপাতালে কোনো প্রভাব পড়ে না।"
              )
            )}
          </p>
        </div>

        {/* Live Sandbox Card */}
        <div className="mac-card flex shrink-0 items-center justify-between gap-4 p-4 lg:min-w-[300px]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  sandbox?.available_count === 1
                    ? "bg-success"
                    : sandbox
                      ? "bg-warn"
                      : "bg-ink-3"
                }`}
                aria-hidden="true"
              />
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                {sandbox?.facility_code ?? "RACELAB-SANDBOX"}
              </span>
            </div>
            <p className="text-base font-bold tabular-nums text-ink">
              {sandbox
                ? `${sandbox.available_count} / ${sandbox.staffed_capacity_count} ${L(c("ICU Bed Free", "আইসিইউ বেড খালি"))}`
                : L(c("Sandbox ready", "স্যান্ডবক্স প্রস্তুত"))}
            </p>
            {sandbox?.active_reservation_id && (
              <p className="font-mono text-xs text-ink-3">
                {L(c("Held by", "হোল্ড"))}: {sandbox.active_reservation_id.slice(0, 8)}…
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={resetSandboxOnly}
            disabled={running !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface/80 px-3 py-2 text-xs font-semibold text-ink transition hover:bg-surface disabled:opacity-60"
          >
            {running === "reset" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {L(c("Reset to 1", "১-এ রিসেট"))}
          </button>
        </div>
      </header>

      {/* Control Deck */}
      <section className="mac-card flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="racelab-concurrency" className="text-sm font-medium text-ink-2">
              {L(c("Simultaneous requests", "একসাথে অনুরোধ"))}:{" "}
              <span className="font-bold tabular-nums text-ink">{concurrency}</span>
            </label>
            <div className="segmented" role="group" aria-label={L(c("Concurrency presets", "একসাথে অনুরোধ প্রিসেট"))}>
              {PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setConcurrency(n)}
                  disabled={running !== null}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums transition ${
                    concurrency === n
                      ? "bg-surface text-brand-ink shadow-sm"
                      : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {n}×
                </button>
              ))}
            </div>
          </div>
          <input
            id="racelab-concurrency"
            type="range"
            min={2}
            max={25}
            value={concurrency}
            disabled={running !== null}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="w-full accent-lock-ink"
          />
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={runBrowser}
            disabled={running !== null}
            className="inline-flex items-center gap-2 rounded-2xl bg-lock px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#7C3AED]/25 transition hover:opacity-95 disabled:opacity-60"
          >
            {running === "browser" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Zap className="h-4 w-4" aria-hidden="true" />
            )}
            {L(c("Fire race from this browser", "এই ব্রাউজার থেকে রেস চালান"))}
          </button>
          <button
            type="button"
            onClick={runServer}
            disabled={running !== null}
            className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface/80 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface disabled:opacity-60"
          >
            {running === "server" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Server className="h-4 w-4" aria-hidden="true" />
            )}
            {L(c("Server-side race", "সার্ভারে রেস"))}
          </button>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          {error}
        </p>
      )}

      {/* Screen-reader live status */}
      <p role="status" className="sr-only">
        {running === "browser" || running === "server"
          ? L(c("Race running…", "রেস চলছে…"))
          : allFinished
            ? L(
                c(
                  `Race finished: ${winners} winner, ${rejected} rejected, ${server ? server.double_bookings : Math.max(0, winners - 1)} double bookings.`,
                  `রেস শেষ: ${winners} বিজয়ী, ${rejected} প্রত্যাখ্যাত, ${server ? server.double_bookings : Math.max(0, winners - 1)} দ্বৈত বুকিং।`
                )
              )
            : ""}
      </p>
      <p role="status" className="sr-only">{proof?.message ?? ""}</p>

      {/* 4 KPI Cards */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label={L(c("201 winners", "২০১ বিজয়ী"))}
          value={done.length ? winners : "—"}
          hint={L(c("Expected: 1", "প্রত্যাশিত: ১"))}
          tone="text-success-ink"
        />
        <Kpi
          label={L(c("409 rejected", "৪০৯ প্রত্যাখ্যাত"))}
          value={done.length ? rejected : "—"}
          hint="RESOURCE_EXHAUSTED"
          tone="text-warn-ink"
        />
        <Kpi
          label={L(c("Beds left in DB", "ডাটাবেসে বাকি বেড"))}
          value={
            server
              ? server.db_available_after
              : allFinished
                ? Math.max(0, 1 - winners)
                : "—"
          }
          hint={L(c("Atomic decrement", "অ্যাটমিক বিয়োগ"))}
          tone="text-ink"
        />
        <Kpi
          label={L(c("Double bookings", "দ্বৈত বুকিং"))}
          value={
            server
              ? server.double_bookings
              : allFinished
                ? Math.max(0, winners - 1)
                : "—"
          }
          hint={L(c("Invariant: always 0", "শর্ত: সর্বদা ০"))}
          tone={winners > 1 ? "text-danger-ink" : "text-success-ink"}
        />
      </section>

      {/* Results Workbench: Matrix Grid + Lock Waterfall */}
      {tiles.length > 0 && (
        <section className="mac-card space-y-4 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {allFinished ? (
                winners === 1 && other === 0 ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success-ink" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-danger-ink" aria-hidden="true" />
                )
              ) : (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-lock-ink" aria-hidden="true" />
              )}
              <p
                className={`text-sm font-semibold ${
                  !allFinished
                    ? "text-ink-2"
                    : winners === 1 && other === 0
                      ? "text-success-ink"
                      : "text-danger-ink"
                }`}
              >
                {!allFinished
                  ? L(c("Executing concurrent transactions…", "একসাথে ট্রানজ্যাকশন চলছে…"))
                  : winners === 1 && other === 0
                    ? L(c("Exactly one winner. The last bed was never given twice.", "ঠিক একজন বিজয়ী। শেষ বেড কখনো দুবার দেওয়া হয়নি।"))
                    : L(c(`${winners} winners, ${other} other errors`, `${winners} বিজয়ী, ${other}টি অন্য ত্রুটি`))}
              </p>
            </div>

            <div className="segmented self-start" role="tablist" aria-label={L(c("Result view", "ফলাফল দৃশ্য"))}>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === "grid" ? "bg-surface text-brand-ink shadow-sm" : "text-ink-2 hover:text-ink"
                }`}
              >
                <Grid3X3 className="h-3.5 w-3.5" aria-hidden="true" />
                {L(c("Matrix", "ম্যাট্রিক্স"))}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "waterfall"}
                onClick={() => setViewMode("waterfall")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === "waterfall" ? "bg-surface text-brand-ink shadow-sm" : "text-ink-2 hover:text-ink"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                {L(c("Lock Waterfall", "লক টাইমলাইন"))}
              </button>
            </div>
          </div>

          {/* Latency Stats Strip */}
          {latencyStats && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-fill/70 px-3.5 py-2 text-xs text-ink-2">
              <span>
                Min: <strong className="font-mono text-ink">{latencyStats.min}ms</strong>
              </span>
              <span>
                Median: <strong className="font-mono text-ink">{latencyStats.median}ms</strong>
              </span>
              <span>
                P95: <strong className="font-mono text-ink">{latencyStats.p95}ms</strong>
              </span>
              <span>
                Max: <strong className="font-mono text-ink">{latencyStats.max}ms</strong>
              </span>
              {wallTimeMs !== null && (
                <span className="sm:ml-auto">
                  {L(c("Total wall time", "মোট সময়"))}:{" "}
                  <strong className="font-mono text-ink">{wallTimeMs}ms</strong>
                </span>
              )}
            </div>
          )}

          {/* Matrix Grid */}
          {viewMode === "grid" ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="list" aria-label={L(c("Request results", "অনুরোধের ফলাফল"))}>
              {tiles.map((t) => {
                const isSelected = selectedAttempt === t.n;
                return (
                  <motion.button
                    key={`${t.n}-${t.status}`}
                    type="button"
                    role="listitem"
                    onClick={() => setSelectedAttempt(isSelected ? null : t.n)}
                    initial={{ scale: 0.92, opacity: 0.65 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`flex h-16 flex-col items-center justify-center rounded-xl font-mono text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-brand ${
                      t.status === null
                        ? "animate-pulse bg-fill text-ink-3"
                        : t.status === 201
                          ? "bg-success text-white shadow-lg shadow-[#047857]/30"
                          : t.status === 409
                            ? "bg-warn-soft text-warn-ink hover:brightness-95"
                            : "bg-danger-soft text-danger-ink"
                    } ${isSelected ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : ""}`}
                    title={t.detail}
                  >
                    <span>#{String(t.n).padStart(2, "0")}</span>
                    <span>
                      {t.status ?? "…"}
                      {t.ms !== null ? ` · ${t.ms}ms` : ""}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          ) : (
            /* Lock Waterfall */
            <div className="space-y-1.5" role="list" aria-label={L(c("Lock serialization timeline", "লক সিরিয়ালাইজেশন টাইমলাইন"))}>
              {tiles.map((t) => {
                const start = t.startedOffsetMs ?? 0;
                const end = t.finishedOffsetMs ?? t.ms ?? 0;
                const leftPct = Math.min(95, (start / maxWaterfallMs) * 100);
                const widthPct = Math.max(3, ((end - start) / maxWaterfallMs) * 100);
                return (
                  <button
                    key={t.n}
                    type="button"
                    role="listitem"
                    onClick={() => setSelectedAttempt(selectedAttempt === t.n ? null : t.n)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left text-xs transition hover:bg-fill/60"
                  >
                    <span className="w-8 shrink-0 font-mono font-semibold text-ink-2">
                      #{String(t.n).padStart(2, "0")}
                    </span>
                    <span
                      className={`w-10 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[0.7rem] font-bold ${
                        t.status === 201
                          ? "bg-success text-white"
                          : t.status === 409
                            ? "bg-warn-soft text-warn-ink"
                            : "bg-fill text-ink-3"
                      }`}
                    >
                      {t.status ?? "…"}
                    </span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-fill">
                      <div
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        className={`absolute top-0 bottom-0 rounded-full ${
                          t.status === 201
                            ? "bg-success"
                            : t.status === 409
                              ? "bg-warn/70"
                              : "bg-danger/70"
                        }`}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right font-mono tabular-nums text-ink-2">
                      {t.ms !== null ? `${t.ms}ms` : "…"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected Attempt Inspector */}
          {activeTile && (
            <div className="rounded-xl border border-line bg-surface/80 p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-bold text-ink">
                  Attempt #{String(activeTile.n).padStart(2, "0")} · HTTP {activeTile.status ?? "—"}
                </span>
                <span className="font-mono text-ink-3">
                  {activeTile.ms ?? 0}ms
                  {activeTile.startedOffsetMs !== undefined && activeTile.finishedOffsetMs !== undefined
                    ? ` (+${activeTile.startedOffsetMs}ms → +${activeTile.finishedOffsetMs}ms)`
                    : ""}
                </span>
              </div>
              <p className="mt-1.5 font-mono text-ink-2 break-all">
                {activeTile.status === 201 ? "reservation_id: " : "error_code: "}
                {activeTile.detail || "—"}
              </p>
              {activeTile.key && (
                <p className="mt-1 font-mono text-ink-3 break-all">Idempotency-Key: {activeTile.key}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Interactive Idempotency & Tamper-Proofing Lab */}
      {winner && (
        <section className="mac-card space-y-3 p-5">
          <div className="flex items-start gap-2.5">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-lock-ink" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-ink">
                {L(c("Idempotency & Tamper-Proofing Lab", "আইডেম্পোটেন্সি ও টেম্পার-প্রুফিং ল্যাব"))}
              </h2>
              <p className="text-xs text-ink-3">
                {L(
                  c(
                    "Test LockStep's replay cache and SHA-256 request-body hash against the real /reservations endpoint using keys from this browser race.",
                    "এই ব্রাউজার রেসের কী ব্যবহার করে আসল /reservations এন্ডপয়েন্টে রিপ্লে ক্যাশ এবং SHA-256 পেলোড হ্যাশ পরীক্ষা করুন।"
                  )
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runIdempotencyProof("replay_winner")}
              disabled={proving !== null}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface/80 px-3.5 py-2 text-xs font-semibold text-ink transition hover:bg-surface disabled:opacity-60"
            >
              {proving === "replay_winner" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 text-success-ink" aria-hidden="true" />
              )}
              {L(c("Replay winner's key (expect 201)", "বিজয়ীর কী আবার পাঠান (২০১)"))}
            </button>

            {firstLoser && (
              <button
                type="button"
                onClick={() => void runIdempotencyProof("replay_loser")}
                disabled={proving !== null}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface/80 px-3.5 py-2 text-xs font-semibold text-ink transition hover:bg-surface disabled:opacity-60"
              >
                {proving === "replay_loser" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 text-warn-ink" aria-hidden="true" />
                )}
                {L(c("Replay rejected key (expect 409)", "প্রত্যাখ্যাত কী আবার পাঠান (৪০৯)"))}
              </button>
            )}

            <button
              type="button"
              onClick={() => void runIdempotencyProof("tamper")}
              disabled={proving !== null}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface/80 px-3.5 py-2 text-xs font-semibold text-ink transition hover:bg-surface disabled:opacity-60"
            >
              {proving === "tamper" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 text-danger-ink" aria-hidden="true" />
              )}
              {L(c("Tamper payload with winner's key (expect 409)", "একই কী-তে পেলোড বদলে পাঠান (৪০৯)"))}
            </button>
          </div>

          {proof && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-xs ${
                proof.ok
                  ? "border-line bg-success-soft text-success-ink"
                  : "border-danger-line bg-danger-soft text-danger-ink"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-mono font-bold">
                <span>HTTP {proof.httpStatus}</span>
                <span>·</span>
                <span>{proof.code}</span>
              </div>
              <p className="mt-1 font-sans">{proof.message}</p>
            </div>
          )}
        </section>
      )}

      {/* Session Run History */}
      {history.length > 0 && (
        <section className="mac-card space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-brand-ink" aria-hidden="true" />
            <h2 className="text-sm font-bold text-ink">{L(c("Session Run History", "সেশন রান ইতিহাস"))}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="py-2 pr-3 font-semibold">#</th>
                  <th className="py-2 pr-3 font-semibold">{L(c("Mode", "মোড"))}</th>
                  <th className="py-2 pr-3 font-semibold">{L(c("Requests", "অনুরোধ"))}</th>
                  <th className="py-2 pr-3 font-semibold">{L(c("Won", "জয়"))}</th>
                  <th className="py-2 pr-3 font-semibold">{L(c("Rejected", "প্রত্যাখ্যাত"))}</th>
                  <th className="py-2 pr-3 font-semibold">{L(c("Double", "দ্বৈত"))}</th>
                  <th className="py-2 pr-3 font-semibold">{L(c("Wall Time", "মোট সময়"))}</th>
                  <th className="py-2 font-semibold">{L(c("Verdict", "ফলাফল"))}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {history.map((run) => (
                  <tr key={run.id} className="text-ink-2">
                    <td className="py-2 pr-3 font-mono">{run.id}</td>
                    <td className="py-2 pr-3 font-semibold capitalize text-ink">{run.mode}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{run.concurrency}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums text-success-ink">{run.winners}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums text-warn-ink">{run.rejected}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{run.doubleBookings}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{run.wallMs}ms</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${
                          run.passed ? "bg-success-soft text-success-ink" : "bg-danger-soft text-danger-ink"
                        }`}
                      >
                        {run.passed ? "PASS" : "CHECK"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* How LockStep Guarantees Zero Double-Bookings */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="mac-card space-y-1.5 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <Lock className="h-4 w-4 text-lock-ink" aria-hidden="true" />
            <span>{L(c("1. Global Lock Order", "১. গ্লোবাল লক ক্রম"))}</span>
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            {L(
              c(
                "Every transaction acquires SELECT ... FOR UPDATE locks in one strict order: reservations → hospital_resources → blood_inventories (sorted by ID), eliminating deadlocks.",
                "প্রতিটি ট্রানজ্যাকশন নির্দিষ্ট ক্রমে SELECT ... FOR UPDATE লক নেয়: reservations → hospital_resources → blood_inventories (আইডি অনুযায়ী), ফলে ডেডলক হয় না।"
              )
            )}
          </p>
        </div>
        <div className="mac-card space-y-1.5 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <Database className="h-4 w-4 text-brand-ink" aria-hidden="true" />
            <span>{L(c("2. DB Check Constraints", "২. ডাটাবেস চেক গার্ড"))}</span>
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            {L(
              c(
                "Availability is re-checked inside the lock and guarded by PostgreSQL CHECK (available_count >= 0). Losing transactions roll back with 409 RESOURCE_EXHAUSTED.",
                "লকের ভেতরে প্রাপ্যতা পুনরায় যাচাই হয় এবং PostgreSQL CHECK (available_count >= 0) দ্বারা সুরক্ষিত থাকে। হেরে যাওয়া অনুরোধ ৪০৯ RESOURCE_EXHAUSTED ফেরত পায়।"
              )
            )}
          </p>
        </div>
        <div className="mac-card space-y-1.5 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <KeyRound className="h-4 w-4 text-info-ink" aria-hidden="true" />
            <span>{L(c("3. Idempotency & Audit", "৩. আইডেম্পোটেন্সি ও অডিট"))}</span>
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            {L(
              c(
                "Retries with the same Idempotency-Key replay the stored 201 or 409 response. Tampering with the payload returns 409 IDEMPOTENCY_KEY_CONFLICT, and every race loss is audited.",
                "একই Idempotency-Key দিয়ে পুনরায় পাঠালে সংরক্ষিত ২০১ বা ৪০৯ উত্তর ফেরত আসে। পেলোড বদলালে ৪০৯ IDEMPOTENCY_KEY_CONFLICT আসে এবং প্রতিটি হার অডিট হয়।"
              )
            )}
          </p>
        </div>
      </section>
    </div>
  );
}

export default function RaceLabPage() {
  return (
    <AuthGuard pageTitle="RaceLab" allowedRoles={["dispatcher", "admin"]}>
      {() => <RaceLab />}
    </AuthGuard>
  );
}
