"use client";

import React from "react";
import Link from "next/link";
import {
  CloudOff,
  LayoutDashboard,
  Package,
  RefreshCw,
  RotateCw,
  Stethoscope,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { StatusBadge } from "@/components/StatusBadge";

export default function OfflineFallbackPage() {
  const { t } = useI18n();

  const cachedRoutes = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/dashboard/triage", label: t("nav.triage"), icon: Stethoscope },
    { href: "/dashboard/inventory", label: t("nav.inventory"), icon: Package },
    { href: "/dashboard/sync", label: t("nav.sync"), icon: RefreshCw },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="mac-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#92400E]">
              <CloudOff aria-hidden="true" className="h-6 w-6 text-[#D97706]" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-[#172A33] sm:text-2xl">
                {t("offline.title")}
              </h1>
              <p className="text-sm text-[#536975]">{t("status.offlineNotice")}</p>
            </div>
          </div>
          <StatusBadge variant="OFFLINE" />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[#405663]">
          {t("offline.subtitle")}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#115E59]"
          >
            <RotateCw aria-hidden="true" className="h-4 w-4" />
            <span>{t("offline.retry")}</span>
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-[#DCE6E9] bg-[#FFFFFF] px-4 py-2.5 text-sm font-semibold text-[#172A33] hover:bg-[#EDF3F5]"
          >
            <LayoutDashboard aria-hidden="true" className="h-4 w-4 text-[#0F766E]" />
            <span>{t("nav.dashboard")}</span>
          </Link>
        </div>
      </section>

      <section className="mac-card p-6">
        <h2 className="text-base font-bold text-[#172A33]">
          {t("offline.cachedRoutes")}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cachedRoutes.map((route) => {
            const Icon = route.icon;
            return (
              <Link
                key={route.href}
                href={route.href}
                className="flex items-center gap-3 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] p-3.5 text-sm font-semibold text-[#172A33] transition-colors hover:border-[#0F766E] hover:bg-[#F0FDFA]"
              >
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-[#0F766E]" />
                <span>{route.label}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
