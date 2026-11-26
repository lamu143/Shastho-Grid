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
            ? "border-[#059669]/40 bg-[#ECFDF5] text-[#065F46]"
            : "border-[#D97706]/50 bg-[#FEF3C7] text-[#92400E]"
        }`}
      >
        {isOnline ? (
          <Wifi aria-hidden="true" className="h-3.5 w-3.5 text-[#059669]" />
        ) : (
          <CloudOff aria-hidden="true" className="h-3.5 w-3.5 text-[#D97706]" />
        )}
        <span>{isOnline ? t("status.online") : t("status.offline")}</span>
      </span>

      {pendingCount > 0 && (
        <Link
          href="/dashboard/sync"
          className="inline-flex items-center gap-1 rounded-full border border-[#0284C7]/40 bg-[#E0F2FE] px-2.5 py-1 text-xs font-semibold text-[#075985] hover:bg-[#BAE6FD]"
        >
          <span>{t("status.pending")}:</span>
          <span>{pendingCount}</span>
        </Link>
      )}

      {openConflictCount > 0 && (
        <Link
          href="/dashboard/sync"
          className="inline-flex items-center gap-1 rounded-full border border-[#DC2626]/45 bg-[#FEE2E2] px-2.5 py-1 text-xs font-semibold text-[#991B1B] hover:bg-[#FECACA]"
        >
          <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-[#DC2626]" />
          <span>
            {t("status.conflicts")}: {openConflictCount}
          </span>
        </Link>
      )}
    </div>
  );
}
