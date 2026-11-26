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
    container: "bg-[#ECFDF5] text-[#065F46] border-[#059669]/45",
    dot: "bg-[#059669]",
    labelKey: "aware.ACCESS",
  },
  WATCH: {
    container: "bg-[#FEF3C7] text-[#92400E] border-[#D97706]/55",
    dot: "bg-[#D97706]",
    labelKey: "aware.WATCH",
  },
  RESERVE: {
    container: "bg-[#FEE2E2] text-[#991B1B] border-[#DC2626]/45",
    dot: "bg-[#DC2626]",
    labelKey: "aware.RESERVE",
  },
  NO_ANTIBIOTIC: {
    container: "bg-[#E0F2FE] text-[#075985] border-[#0284C7]/45",
    dot: "bg-[#0284C7]",
    labelKey: "aware.NO_ANTIBIOTIC",
  },
  DISPENSED: {
    container: "bg-[#ECFDF5] text-[#065F46] border-[#059669]/45",
    dot: "bg-[#059669]",
    labelKey: "status.DISPENSED",
  },
  PENDING_APPROVAL: {
    container: "bg-[#FEF3C7] text-[#92400E] border-[#D97706]/55",
    dot: "bg-[#D97706]",
    labelKey: "status.PENDING_APPROVAL",
  },
  DRAFT: {
    container: "bg-[#EDF3F5] text-[#405663] border-[#91A2AB]/60",
    dot: "bg-[#536975]",
    labelKey: "status.DRAFT",
  },
  REJECTED: {
    container: "bg-[#FEE2E2] text-[#991B1B] border-[#DC2626]/45",
    dot: "bg-[#DC2626]",
    labelKey: "status.REJECTED",
  },
  VOIDED: {
    container: "bg-[#EDF3F5] text-[#405663] border-[#91A2AB]/60",
    dot: "bg-[#5C727E]",
    labelKey: "status.VOIDED",
  },
  ONLINE: {
    container: "bg-[#ECFDF5] text-[#065F46] border-[#059669]/45",
    dot: "bg-[#059669]",
    labelKey: "status.ONLINE",
  },
  OFFLINE: {
    container: "bg-[#FEF3C7] text-[#92400E] border-[#D97706]/55",
    dot: "bg-[#D97706]",
    labelKey: "status.OFFLINE",
  },
  OPEN: {
    container: "bg-[#FEE2E2] text-[#991B1B] border-[#DC2626]/45",
    dot: "bg-[#DC2626]",
    labelKey: "status.OPEN",
  },
  CONFLICT: {
    container: "bg-[#FEE2E2] text-[#991B1B] border-[#DC2626]/45",
    dot: "bg-[#DC2626]",
    labelKey: "status.CONFLICT",
  },
  SYNCED: {
    container: "bg-[#ECFDF5] text-[#065F46] border-[#059669]/45",
    dot: "bg-[#059669]",
    labelKey: "status.SYNCED",
  },
  RESOLVED_SERVER: {
    container: "bg-[#E0F2FE] text-[#075985] border-[#0284C7]/45",
    dot: "bg-[#0284C7]",
    labelKey: "status.RESOLVED_SERVER",
  },
  RESOLVED_CLIENT: {
    container: "bg-[#E0F2FE] text-[#075985] border-[#0284C7]/45",
    dot: "bg-[#0284C7]",
    labelKey: "status.RESOLVED_CLIENT",
  },
  RESOLVED_MERGED: {
    container: "bg-[#ECFDF5] text-[#065F46] border-[#059669]/45",
    dot: "bg-[#059669]",
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
