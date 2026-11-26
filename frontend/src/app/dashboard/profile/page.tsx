"use client";

import React, { useEffect, useState } from "react";
import { KeyRound, RefreshCw, ShieldCheck, User } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  listOfflineVaultUsers,
  type OfflineAuthRecord,
  type SessionUser,
  type UserRole,
} from "@/db/dexie";
import { ApiError, verifyPin } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { useI18n } from "@/lib/i18n";

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  dispenser: [
    "Create & update clinic patients (online & offline Dexie)",
    "Run CP-SAT regimen optimizer & Bangla voice intake",
    "Create DRAFT dispenses and submit for Pharmacist approval",
    "View clinic FEFO inventory & resolve safe sync updates",
  ],
  pharmacist: [
    "All Dispenser clinical triage capabilities",
    "Approve, Reject, and Void clinic dispenses with atomic FEFO decrement/restoration",
    "Create inventory batches and adjust FEFO stock levels",
    "Adjudicate HTTP 409 Conflict Workbench resolutions",
  ],
  auditor: [
    "Read-only oversight of WHO >=60% Access KPIs and analytics",
    "Read-only inspection of FEFO inventory, dispense queue, and conflict logs",
    "Strict RBAC mutation lock (all write operations disabled)",
  ],
  admin: [
    "Full clinic governance (Clinics, Users, Guidelines, Catalog, Audit Logs)",
    "All Pharmacist & Dispenser clinical and inventory permissions",
    "Trace-ID linked security & compliance auditing",
  ],
  dispatcher: [
    "Run CareMatch and Shastho Copilot for critical patients",
    "Approve and lock ICU, ventilator and blood holds (LockStep)",
    "Mark holds en route or cancel them; run RaceLab",
  ],
  hospital_admin: [
    "Update staffed and available ICU / ventilator counts for your own hospital only",
    "Confirm incoming holds and record admissions",
  ],
  blood_bank_officer: [
    "Update blood stock for your own blood bank only",
    "Read incoming blood courier dispatches",
  ],
};

function ProfileContent({ user }: { user: SessionUser }) {
  const { isOfflineSession, refreshUser } = useAuth();
  const { t } = useI18n();

  const [vaultUsers, setVaultUsers] = useState<OfflineAuthRecord[]>([]);
  const [pinInput, setPinInput] = useState("");
  const [pinStatus, setPinStatus] = useState<"ok" | "invalid" | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    const loadVault = async () => {
      try {
        const rows = await listOfflineVaultUsers();
        if (active) setVaultUsers(rows);
      } catch {
        // Ignore storage errors
      }
    };
    void loadVault();
    return () => {
      active = false;
    };
  }, []);

  const handleRefreshSession = async () => {
    setRefreshing(true);
    try {
      await refreshUser();
    } finally {
      setRefreshing(false);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinStatus(null);
    setPinError(null);
    if (!pinInput.trim()) {
      setPinError("Enter a PIN to verify.");
      return;
    }

    setVerifying(true);
    try {
      const res = await verifyPin(user.email, pinInput.trim());
      if (res.verified) {
        setPinStatus("ok");
      } else {
        setPinStatus("invalid");
        setPinError(t("profile.pinInvalid"));
      }
    } catch (err) {
      setPinStatus("invalid");
      if (err instanceof ApiError) {
        setPinError(err.message);
      } else {
        setPinError(t("profile.pinInvalid"));
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {t("profile.title")}
          </h1>
          <p className="text-sm text-ink-2">{t("profile.subtitle")}</p>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={handleRefreshSession}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-fill disabled:opacity-60"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-3.5 w-3.5 text-brand-ink ${refreshing ? "animate-spin" : ""}`}
          />
          <span>{t("profile.refreshSessionBtn")}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section
          aria-label={t("profile.title")}
          className="min-w-0 mac-card p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                <User aria-hidden="true" className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-ink">
                  {user.full_name}
                </h2>
                <p className="truncate text-xs text-ink-2">{user.email}</p>
              </div>
            </div>
            <StatusBadge variant={isOfflineSession ? "OFFLINE" : "ONLINE"} />
          </div>

          <dl className="mt-5 space-y-2.5 text-xs">
            <div className="flex justify-between gap-2 border-b border-line pb-2">
              <dt className="font-semibold text-ink-2">
                {t("profile.roleLabel")}
              </dt>
              <dd className="font-bold text-brand-ink">
                {user.role.toUpperCase()}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-line pb-2">
              <dt className="font-semibold text-ink-2">
                {t("profile.clinicLabel")}
              </dt>
              <dd className="font-semibold text-ink">
                {user.clinic_name}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-line pb-2">
              <dt className="font-semibold text-ink-2">
                {t("profile.clinicIdLabel")}
              </dt>
              <dd className="font-mono text-ink-2">{user.clinic_id}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold text-ink-2">
                {t("profile.sessionType")}
              </dt>
              <dd className="font-medium text-ink">
                {isOfflineSession
                  ? t("profile.offlinePinSession")
                  : t("profile.onlineJwt")}
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-label={t("profile.permissionsTitle")}
          className="min-w-0 mac-card p-5"
        >
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-brand-ink" />
            <span>{t("profile.permissionsTitle")}</span>
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-ink-2">
            {ROLE_PERMISSIONS[user.role].map((perm) => (
              <li key={perm}>{perm}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section
          aria-label={t("profile.verifyPinTitle")}
          className="min-w-0 mac-card p-5"
        >
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <KeyRound aria-hidden="true" className="h-4 w-4 text-brand-ink" />
            <span>{t("profile.verifyPinTitle")}</span>
          </h2>

          <form onSubmit={handleVerifyPin} className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="profile-pin-check"
                className="block text-xs font-semibold text-ink-2"
              >
                {t("auth.pinLabel")}
              </label>
              <input
                id="profile-pin-check"
                type="password"
                inputMode="numeric"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder={t("auth.pinPlaceholder")}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3"
              />
            </div>

            {pinStatus === "ok" && (
              <div
                role="status"
                className="rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-xs font-semibold text-success-ink"
              >
                {t("profile.pinVerified")}
              </div>
            )}

            {pinError && (
              <div
                role="alert"
                className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-ink"
              >
                {pinError}
              </div>
            )}

            <button
              type="submit"
              disabled={verifying}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
            >
              <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
              <span>{t("profile.verifyPinBtn")}</span>
            </button>
          </form>
        </section>

        <section
          aria-label={t("auth.vaultAccountsTitle")}
          className="min-w-0 mac-card p-5"
        >
          <h2 className="text-base font-bold text-ink">
            {t("auth.vaultAccountsTitle")}
          </h2>
          {vaultUsers.length === 0 ? (
            <p className="mt-3 text-xs text-ink-2">
              {t("auth.noVaultAccounts")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {vaultUsers.map((v) => (
                <li
                  key={v.email}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {v.email}
                    </p>
                    <p className="truncate text-ink-2">
                      {v.clinic_name} · {v.hash_algo}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-brand-soft px-2 py-0.5 font-semibold text-brand-ink">
                    {v.role.toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useI18n();
  return (
    <AuthGuard pageTitle={t("profile.title")}>
      {(user) => <ProfileContent user={user} />}
    </AuthGuard>
  );
}
