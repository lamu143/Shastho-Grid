"use client";

import React from "react";
import Link from "next/link";
import { Lock, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useI18n } from "@/lib/i18n";
import type { SessionUser, UserRole } from "@/db/dexie";

interface AuthGuardProps {
  pageTitle: string;
  allowedRoles?: UserRole[];
  children: (user: SessionUser) => React.ReactNode;
}

export function AuthGuard({
  pageTitle,
  allowedRoles,
  children,
}: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const { t } = useI18n();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          {pageTitle}
        </h1>
        <div className="mac-card p-6 text-sm text-ink-2">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          {pageTitle}
        </h1>
        <section
          aria-label={t("common.signInRequiredTitle")}
          className="mac-card p-6"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
              <Lock aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-2">
              <h2 className="text-lg font-bold text-ink">
                {t("common.signInRequiredTitle")}
              </h2>
              <p className="text-sm text-ink-2">
                {t("common.signInRequiredBody")}
              </p>
              <div className="pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
                >
                  {t("common.goToLogin")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          {pageTitle}
        </h1>
        <section
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger-soft p-6 text-danger-ink"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-bold">
                {t("admin.unauthorizedTitle")}
              </h2>
              <p className="text-sm">{t("admin.unauthorizedBody")}</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return <>{children(user)}</>;
}
