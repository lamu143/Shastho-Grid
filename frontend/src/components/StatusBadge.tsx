"use client";

import React from "react";
import { useI18n, type TranslationKey } from "@/lib/i18n";

export type BadgeVariant =
  | "ACCESS"
  | "WATCH"
  | "RESERVE"
  | "NO_ANTIBIOTIC"
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "DISPENSED"
  | "REJECTED"
  | "VOIDED"
  | "ONLINE"
  | "OFFLINE"
  | "OPEN"
  | "CONFLICT"
  | "SYNCED"
  | "RESOLVED_SERVER"
  | "RESOLVED_CLIENT"
  | "RESOLVED_MERGED";

interface VariantStyle {
  container: string;
  dot: string;
  labelKey: TranslationKey;
}

// Verified >= 6.37:1 WCAG 2.1 AA text-to-background contrast ratios
const VARIANT_STYLES: Record<BadgeVariant, VariantStyle> = {
  ACCESS: {
    container: "bg-success-soft text-success-ink border-success/45",
    dot: "bg-success",
    labelKey: "aware.ACCESS",
  },
  WATCH: {
    container: "bg-warn-soft text-warn-ink border-warn/55",
    dot: "bg-warn",
    labelKey: "aware.WATCH",
  },
  RESERVE: {
    container: "bg-danger-soft text-danger-ink border-danger/45",
    dot: "bg-danger",
    labelKey: "aware.RESERVE",
  },
  NO_ANTIBIOTIC: {
    container: "bg-info-soft text-info-ink border-info/45",
    dot: "bg-info",
    labelKey: "aware.NO_ANTIBIOTIC",
  },
  DISPENSED: {
    container: "bg-success-soft text-success-ink border-success/45",
    dot: "bg-success",
    labelKey: "status.DISPENSED",
  },
  PENDING_APPROVAL: {
    container: "bg-warn-soft text-warn-ink border-warn/55",
    dot: "bg-warn",
    labelKey: "status.PENDING_APPROVAL",
  },
  DRAFT: {
    container: "bg-fill text-ink-2 border-line-strong/60",
    dot: "bg-[#536975]",
    labelKey: "status.DRAFT",
  },
  REJECTED: {
    container: "bg-danger-soft text-danger-ink border-danger/45",
    dot: "bg-danger",
    labelKey: "status.REJECTED",
  },
  VOIDED: {
    container: "bg-fill text-ink-2 border-line-strong/60",
    dot: "bg-[#5C727E]",
    labelKey: "status.VOIDED",
  },
  ONLINE: {
    container: "bg-success-soft text-success-ink border-success/45",
    dot: "bg-success",
    labelKey: "status.ONLINE",
  },
  OFFLINE: {
    container: "bg-warn-soft text-warn-ink border-warn/55",
    dot: "bg-warn",
    labelKey: "status.OFFLINE",
  },
  OPEN: {
    container: "bg-danger-soft text-danger-ink border-danger/45",
    dot: "bg-danger",
    labelKey: "status.OPEN",
  },
  CONFLICT: {
    container: "bg-danger-soft text-danger-ink border-danger/45",
    dot: "bg-danger",
    labelKey: "status.CONFLICT",
  },
  SYNCED: {
    container: "bg-success-soft text-success-ink border-success/45",
    dot: "bg-success",
    labelKey: "status.SYNCED",
  },
  RESOLVED_SERVER: {
    container: "bg-info-soft text-info-ink border-info/45",
    dot: "bg-info",
    labelKey: "status.RESOLVED_SERVER",
  },
  RESOLVED_CLIENT: {
    container: "bg-info-soft text-info-ink border-info/45",
    dot: "bg-info",
    labelKey: "status.RESOLVED_CLIENT",
  },
  RESOLVED_MERGED: {
    container: "bg-success-soft text-success-ink border-success/45",
    dot: "bg-success",
    labelKey: "status.RESOLVED_MERGED",
  },
};

export interface StatusBadgeProps {
  variant: BadgeVariant;
  label?: string;
  className?: string;
}

export function StatusBadge({ variant, label, className = "" }: StatusBadgeProps) {
  const { t } = useI18n();
  const style = VARIANT_STYLES[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 whitespace-nowrap ${style.container} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`}
      />
      <span>{label ?? t(style.labelKey)}</span>
    </span>
  );
}
