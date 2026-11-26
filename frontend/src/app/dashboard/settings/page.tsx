"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Accessibility, Database, Languages, RefreshCw, Wifi } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { StatusBadge } from "@/components/StatusBadge";
import { getDb } from "@/db/dexie";
import { useAuth } from "@/lib/authContext";
import { useI18n } from "@/lib/i18n";
import { bootstrapClinicState } from "@/lib/syncEngine";

interface StoreCounts {
  patients: number;
  batches: number;
  guidelines: number;
  catalog: number;
  dispenses: number;
  syncMutations: number;
  conflicts: number;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useI18n();

  const [isOnline, setIsOnline] = useState(true);
  const [swActive, setSwActive] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [counts, setCounts] = useState<StoreCounts>({
    patients: 0,
    batches: 0,
    guidelines: 0,
    catalog: 0,
    dispenses: 0,
    syncMutations: 0,
    conflicts: 0,
  });
  const [hydrating, setHydrating] = useState(false);
  const [hydrateMsg, setHydrateMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshCounts = useCallback(async () => {
    try {
      const db = getDb();
      const [
        patients,
        batches,
        guidelines,
        catalog,
        dispenses,
        syncMutations,
        conflicts,
      ] = await Promise.all([
        db.patients.count(),
        db.batches.count(),
        db.guidelines.count(),
        db.catalog.count(),
        db.dispenses.count(),
        db.syncMutations.count(),
        db.conflicts.count(),
      ]);
      setCounts({
        patients,
        batches,
        guidelines,
        catalog,
        dispenses,
        syncMutations,
        conflicts,
      });
    } catch {
      // Ignore IndexedDB errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateEnvState = () => {
      setIsOnline(window.navigator.onLine);
      setSwActive(Boolean(window.navigator.serviceWorker?.controller));
      setPrefersReducedMotion(
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
      );
    };

    const timer = window.setTimeout(() => {
      updateEnvState();
      void refreshCounts();
    }, 0);

    window.addEventListener("online", updateEnvState);
    window.addEventListener("offline", updateEnvState);
    window.addEventListener("awaregrid:sync-updated", refreshCounts);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", updateEnvState);
      window.removeEventListener("offline", updateEnvState);
      window.removeEventListener("awaregrid:sync-updated", refreshCounts);
    };
  }, [refreshCounts]);

  const handleHydrateCache = async () => {
    setErrorMsg(null);
    setHydrateMsg(null);
    if (!user) {
      setErrorMsg(t("common.signInRequiredBody"));
      return;
    }

    setHydrating(true);
    try {
      await bootstrapClinicState({ clinicId: user.clinic_id });
      await refreshCounts();
      setHydrateMsg(t("settings.hydrateSuccess"));
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to hydrate offline cache."
      );
    } finally {
      setHydrating(false);
    }
  };

  const countCards = [
    { label: t("settings.storePatients"), value: counts.patients },
    { label: t("settings.storeBatches"), value: counts.batches },
    { label: t("settings.storeGuidelines"), value: counts.guidelines },
    { label: t("settings.storeCatalog"), value: counts.catalog },
    { label: t("settings.storeDispenses"), value: counts.dispenses },
    { label: t("settings.storeMutations"), value: counts.syncMutations },
    { label: t("settings.storeConflicts"), value: counts.conflicts },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {t("settings.title")}
        </h1>
        <p className="text-sm text-ink-2">{t("settings.subtitle")}</p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger-ink"
        >
          {errorMsg}
        </div>
      )}

      {hydrateMsg && (
        <div
          role="status"
          className="rounded-lg border border-success/40 bg-success-soft px-4 py-3 text-sm font-medium text-success-ink"
        >
          {hydrateMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section
          aria-label={t("settings.languageSection")}
          className="min-w-0 mac-card p-5"
        >
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Languages aria-hidden="true" className="h-4 w-4 text-brand-ink" />
            <span>{t("settings.languageSection")}</span>
          </h2>
          <div className="mt-4">
            <LanguageToggle />
          </div>
        </section>

        <section
          aria-label={t("settings.connectivitySection")}
          className="min-w-0 mac-card p-5"
        >
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Wifi aria-hidden="true" className="h-4 w-4 text-brand-ink" />
            <span>{t("settings.connectivitySection")}</span>
          </h2>
          <div className="mt-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink-2">
                {t("common.status")}
              </span>
              <StatusBadge variant={isOnline ? "ONLINE" : "OFFLINE"} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink-2">
                {t("settings.swLabel")}
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 font-semibold ${
                  swActive
                    ? "border-success/40 bg-success-soft text-success-ink"
                    : "border-line bg-canvas text-ink-2"
                }`}
              >
                {swActive ? t("settings.swActive") : t("settings.swInactive")}
              </span>
            </div>
          </div>
        </section>
      </div>

      <section
        aria-label={t("settings.cacheSection")}
        className="mac-card p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Database aria-hidden="true" className="h-4 w-4 text-brand-ink" />
            <span>{t("settings.cacheSection")}</span>
          </h2>

          <button
            type="button"
            disabled={hydrating}
            onClick={handleHydrateCache}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${hydrating ? "animate-spin" : ""}`}
            />
            <span>
              {hydrating ? t("settings.hydrating") : t("settings.hydrateBtn")}
            </span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {countCards.map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-lg border border-line bg-canvas p-3"
            >
              <p className="truncate text-xs font-semibold text-ink-2">
                {item.label}
              </p>
              <p className="mt-1 text-xl font-bold text-ink">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-label={t("settings.a11ySection")}
        className="mac-card p-5"
      >
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <Accessibility aria-hidden="true" className="h-4 w-4 text-brand-ink" />
          <span>{t("settings.a11ySection")}</span>
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-2">
          {t("settings.a11yBody")}
        </p>
        <p className="mt-2 text-xs font-semibold text-brand-ink">
          prefers-reduced-motion: {prefersReducedMotion ? "reduce" : "no-preference"}
        </p>
      </section>
    </div>
  );
}
