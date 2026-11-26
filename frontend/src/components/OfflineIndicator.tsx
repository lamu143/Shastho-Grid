"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CloudOff, Wifi } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/authContext";
import { getSyncQueueSummary } from "@/lib/syncEngine";

export function OfflineIndicator() {
  const { t } = useI18n();
  const { user } = useAuth();
  const clinicId = user?.clinic_id;
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [openConflictCount, setOpenConflictCount] = useState(0);

  const refreshCounts = useCallback(async () => {
    try {
      const summary = await getSyncQueueSummary(clinicId);
      setPendingCount(summary.pendingCount);
      setOpenConflictCount(summary.openConflictCount);
    } catch {
      // Ignore IndexedDB unavailability
    }
  }, [clinicId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOnlineState = () => {
      setIsOnline(window.navigator.onLine);
    };

    const timer = window.setTimeout(() => {
      updateOnlineState();
      void refreshCounts();
    }, 0);

    const onSyncUpdated = () => {
      void refreshCounts();
    };

    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    window.addEventListener("awaregrid:sync-updated", onSyncUpdated);

    const interval = window.setInterval(() => {
      void refreshCounts();
    }, 5000);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
      window.removeEventListener("awaregrid:sync-updated", onSyncUpdated);
      window.clearInterval(interval);
    };
  }, [refreshCounts]);

  return (
    <div
      aria-live="polite"
      data-testid="offline-indicator"
      className="flex flex-wrap items-center gap-1.5"
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
          isOnline
            ? "border-success/40 bg-success-soft text-success-ink"
            : "border-warn/50 bg-warn-soft text-warn-ink"
        }`}
      >
        {isOnline ? (
          <Wifi aria-hidden="true" className="h-3.5 w-3.5 text-success-ink" />
        ) : (
          <CloudOff aria-hidden="true" className="h-3.5 w-3.5 text-warn-ink" />
        )}
        <span>{isOnline ? t("status.online") : t("status.offline")}</span>
      </span>

      {pendingCount > 0 && (
        <Link
          href="/dashboard/sync"
          className="inline-flex items-center gap-1 rounded-full border border-info/40 bg-info-soft px-2.5 py-1 text-xs font-semibold text-info-ink hover:bg-info-soft"
        >
          <span>{t("status.pending")}:</span>
          <span>{pendingCount}</span>
        </Link>
      )}

      {openConflictCount > 0 && (
        <Link
          href="/dashboard/sync"
          className="inline-flex items-center gap-1 rounded-full border border-danger/45 bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger-ink hover:bg-danger-soft"
        >
          <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-danger-ink" />
          <span>
            {t("status.conflicts")}: {openConflictCount}
          </span>
        </Link>
      )}
    </div>
  );
}
