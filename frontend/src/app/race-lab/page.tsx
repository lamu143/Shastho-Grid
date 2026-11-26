"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, RotateCcw, Server, ShieldCheck, Zap } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { ApiError } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";
import { createReservation, racelabReset, racelabRun, type RaceRun } from "@/lib/criticalCare";

type Copy = Record<Locale, string>;
const c = (en: string, bn: string): Copy => ({ en, bn });

interface Tile {
  n: number;
  status: number | null;
  ms: number | null;
  detail: string;
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="mac-card p-4">
      <p className="text-xs font-medium text-[#5C727E]">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function RaceLab() {
  const { locale } = useI18n();
  const L = (x: Copy) => x[locale] ?? x.en;

  const [concurrency, setConcurrency] = useState(25);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [running, setRunning] = useState<null | "browser" | "server">(null);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<RaceRun | null>(null);
  const [winner, setWinner] = useState<{ key: string; body: Parameters<typeof createReservation>[0]; id: string } | null>(null);
  const [replay, setReplay] = useState<string | null>(null);

  /** Real race from this browser: N simultaneous HTTP requests, each with its own Idempotency-Key. */
  const runBrowser = async () => {
    setRunning("browser");
    setError(null);
    setServer(null);
    setReplay(null);
    setWinner(null);
    try {
      const sandbox = await racelabReset();
      const body = { hospital_id: sandbox.facility_id, needs_icu: true, needs_vent: false, blood: null };
      setTiles(Array.from({ length: concurrency }, (_, i) => ({ n: i + 1, status: null, ms: null, detail: "" })));
      await Promise.all(
        Array.from({ length: concurrency }, async (_, i) => {
          const key = newKey();
          const started = performance.now();
          let status = 0;
          let detail = "";
          try {
            const r = await createReservation(body, key);
            status = 201;
            detail = r.reservation_id;
            setWinner({ key, body, id: r.reservation_id });
          } catch (e) {
            status = e instanceof ApiError ? e.status : 0;
            detail = e instanceof ApiError ? e.error_code : "NETWORK";
          }
          const ms = Math.round(performance.now() - started);
          setTiles((prev) => prev.map((t) => (t.n === i + 1 ? { ...t, status, ms, detail } : t)));
        })
      );
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
    setReplay(null);
    setWinner(null);
    try {
      const r = await racelabRun(concurrency);
      setServer(r);
      setTiles(r.attempts.map((a) => ({ n: a.attempt, status: a.status, ms: a.ms, detail: a.detail })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Race failed.");
    } finally {
      setRunning(null);
    }
  };

  const replayWinner = async () => {
    if (!winner) return;
    try {
      const again = await createReservation(winner.body, winner.key);
      setReplay(
        again.reservation_id === winner.id
          ? L(c("Replayed: the same hold came back and no extra bed was taken.", "রিপ্লে: একই হোল্ড ফেরত এসেছে, বাড়তি কোনো বেড নেওয়া হয়নি।"))
          : "Unexpected: a different hold was returned."
      );
    } catch (e) {
      setReplay(e instanceof Error ? e.message : "Replay failed.");
    }
  };

  const done = tiles.filter((t) => t.status !== null);
  const winners = done.filter((t) => t.status === 201).length;
  const rejected = done.filter((t) => t.status === 409).length;
  const other = done.filter((t) => t.status !== 201 && t.status !== 409).length;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-[#7C3AED]">LockStep · A05</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          RaceLab — {L(c("who gets the last ICU bed?", "শেষ আইসিইউ বেড কে পাবে?"))}
        </h1>
        <p className="max-w-3xl text-sm text-[#5C727E]">
          {L(
            c(
              "Resets a hidden sandbox ICU to exactly 1 free bed, then fires many simultaneous bookings at it. Row locks and database guards must let exactly one win. Real requests, real PostgreSQL transactions; the demo hospitals are never touched.",
              "একটি লুকানো স্যান্ডবক্স আইসিইউতে ঠিক ১টি খালি বেড রেখে একসাথে অনেকগুলো বুকিং পাঠানো হয়। রো-লক ও ডাটাবেস গার্ড ঠিক একটিকেই জিততে দেবে। আসল অনুরোধ, আসল PostgreSQL ট্রানজ্যাকশন।"
            )
          )}
        </p>
      </header>

      <section className="mac-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex-1 text-sm font-medium text-[#405663]">
          {L(c("Simultaneous requests", "একসাথে অনুরোধ"))}: <span className="font-bold tabular-nums text-[#172A33]">{concurrency}</span>
          <input
            type="range"
            min={2}
            max={25}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="mt-2 w-full accent-[#7C3AED]"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runBrowser}
            disabled={running !== null}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#7C3AED] px-5 py-3 font-semibold text-white shadow-lg shadow-[#7C3AED]/25 transition hover:bg-[#6D28D9] disabled:opacity-60"
          >
            {running === "browser" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Zap className="h-5 w-5" aria-hidden="true" />}
            {L(c("Fire race from this browser", "এই ব্রাউজার থেকে রেস চালান"))}
          </button>
          <button
            type="button"
            onClick={runServer}
            disabled={running !== null}
            className="inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-white/80 px-5 py-3 font-semibold text-[#172A33] transition hover:bg-white disabled:opacity-60"
          >
            {running === "server" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Server className="h-5 w-5" aria-hidden="true" />}
            {L(c("Server-side race", "সার্ভারে রেস"))}
          </button>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
          {error}
        </p>
      )}

      <section aria-live="polite" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={L(c("201 winners", "২০১ বিজয়ী"))} value={done.length ? winners : "—"} tone="text-[#059669]" />
        <Kpi label={L(c("409 rejected", "৪০৯ প্রত্যাখ্যাত"))} value={done.length ? rejected : "—"} tone="text-[#D97706]" />
        <Kpi
          label={L(c("Beds left in DB", "ডাটাবেসে বাকি বেড"))}
          value={server ? server.db_available_after : done.length === tiles.length && tiles.length ? 1 - winners : "—"}
          tone="text-[#172A33]"
        />
        <Kpi
          label={L(c("Double bookings", "দ্বৈত বুকিং"))}
          value={server ? server.double_bookings : done.length === tiles.length && tiles.length ? Math.max(0, winners - 1) : "—"}
          tone={winners > 1 ? "text-[#DC2626]" : "text-[#059669]"}
        />
      </section>

      {tiles.length > 0 && (
        <section className="mac-card p-5">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="list" aria-label="Request results">
            {tiles.map((t) => (
              <motion.div
                key={`${t.n}-${t.status}`}
                role="listitem"
                initial={{ scale: 0.9, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`flex h-16 flex-col items-center justify-center rounded-xl font-mono text-xs font-bold ${
                  t.status === null
                    ? "animate-pulse bg-black/5 text-[#5C727E]"
                    : t.status === 201
                      ? "bg-[#10B981] text-white shadow-lg shadow-[#10B981]/30"
                      : t.status === 409
                        ? "bg-[#FEF3C7] text-[#92400E]"
                        : "bg-[#FEE2E2] text-[#991B1B]"
                }`}
                title={t.detail}
              >
                <span>#{String(t.n).padStart(2, "0")}</span>
                <span>{t.status ?? "…"}{t.ms !== null ? ` · ${t.ms}ms` : ""}</span>
              </motion.div>
            ))}
          </div>
          {done.length === tiles.length && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className={`flex items-center gap-2 text-sm font-semibold ${winners === 1 && other === 0 ? "text-[#047857]" : "text-[#B91C1C]"}`}>
                {winners === 1 && other === 0 ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <ShieldCheck className="h-5 w-5" aria-hidden="true" />}
                {winners === 1 && other === 0
                  ? L(c("Exactly one winner. The last bed was never given twice.", "ঠিক একজন বিজয়ী। শেষ বেড কখনো দুবার দেওয়া হয়নি।"))
                  : `${winners} winners, ${other} other errors`}
              </p>
              {winner && (
                <button type="button" onClick={replayWinner} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-sm font-medium hover:bg-white">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {L(c("Replay the winner's request", "বিজয়ীর অনুরোধ আবার পাঠান"))}
                </button>
              )}
            </div>
          )}
          {replay && <p className="mt-3 rounded-xl bg-[#ECFDF5] px-3 py-2 text-sm text-[#065F46]">{replay}</p>}
        </section>
      )}
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
