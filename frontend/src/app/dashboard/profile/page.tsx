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
          <h1 className="text-2xl font-bold tracking-tight text-[#172A33] sm:text-3xl">
            {t("profile.title")}
          </h1>
          <p className="text-sm text-[#536975]">{t("profile.subtitle")}</p>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={handleRefreshSession}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E9] bg-[#FFFFFF] px-3.5 py-2 text-xs font-semibold text-[#172A33] hover:bg-[#EDF3F5] disabled:opacity-60"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-3.5 w-3.5 text-[#0F766E] ${refreshing ? "animate-spin" : ""}`}
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
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0FDFA] text-[#0F766E]">
                <User aria-hidden="true" className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-[#172A33]">
                  {user.full_name}
                </h2>
                <p className="truncate text-xs text-[#536975]">{user.email}</p>
              </div>
            </div>
            <StatusBadge variant={isOfflineSession ? "OFFLINE" : "ONLINE"} />
          </div>

          <dl className="mt-5 space-y-2.5 text-xs">
            <div className="flex justify-between gap-2 border-b border-[#DCE6E9] pb-2">
              <dt className="font-semibold text-[#536975]">
                {t("profile.roleLabel")}
              </dt>
              <dd className="font-bold text-[#0F766E]">
                {user.role.toUpperCase()}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-[#DCE6E9] pb-2">
              <dt className="font-semibold text-[#536975]">
                {t("profile.clinicLabel")}
              </dt>
              <dd className="font-semibold text-[#172A33]">
                {user.clinic_name}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-[#DCE6E9] pb-2">
              <dt className="font-semibold text-[#536975]">
                {t("profile.clinicIdLabel")}
              </dt>
              <dd className="font-mono text-[#405663]">{user.clinic_id}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold text-[#536975]">
                {t("profile.sessionType")}
              </dt>
              <dd className="font-medium text-[#172A33]">
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
          <h2 className="flex items-center gap-2 text-base font-bold text-[#172A33]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#0F766E]" />
            <span>{t("profile.permissionsTitle")}</span>
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-[#405663]">
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
          <h2 className="flex items-center gap-2 text-base font-bold text-[#172A33]">
            <KeyRound aria-hidden="true" className="h-4 w-4 text-[#0F766E]" />
            <span>{t("profile.verifyPinTitle")}</span>
          </h2>

          <form onSubmit={handleVerifyPin} className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="profile-pin-check"
                className="block text-xs font-semibold text-[#405663]"
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
                className="mt-1 w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33] placeholder:text-[#5C727E]"
              />
            </div>

            {pinStatus === "ok" && (
              <div
                role="status"
                className="rounded-lg border border-[#059669]/40 bg-[#ECFDF5] px-3 py-2 text-xs font-semibold text-[#065F46]"
              >
                {t("profile.pinVerified")}
              </div>
            )}

            {pinError && (
              <div
                role="alert"
                className="rounded-lg border border-[#DC2626]/40 bg-[#FEE2E2] px-3 py-2 text-xs font-semibold text-[#991B1B]"
              >
                {pinError}
              </div>
            )}

            <button
              type="submit"
              disabled={verifying}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#115E59] disabled:opacity-60"
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
          <h2 className="text-base font-bold text-[#172A33]">
            {t("auth.vaultAccountsTitle")}
          </h2>
          {vaultUsers.length === 0 ? (
            <p className="mt-3 text-xs text-[#536975]">
              {t("auth.noVaultAccounts")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {vaultUsers.map((v) => (
                <li
                  key={v.email}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#172A33]">
                      {v.email}
                    </p>
                    <p className="truncate text-[#536975]">
                      {v.clinic_name} · {v.hash_algo}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-[#F0FDFA] px-2 py-0.5 font-semibold text-[#0F766E]">
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
