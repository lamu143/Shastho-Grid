"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { KeyRound, LogIn, ShieldCheck, UserCheck } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useI18n } from "@/lib/i18n";
import { listOfflineVaultUsers, type OfflineAuthRecord } from "@/db/dexie";
import { bootstrapClinicState } from "@/lib/syncEngine";
import { ApiError } from "@/lib/api";

const credentialsSchema = z.object({
  email: z.string().trim().email("Please enter a valid clinic email address."),
  password: z.string().min(1, "Password is required."),
});

const pinSchema = z.object({
  email: z.string().trim().email("Please enter a valid offline account email."),
  pin: z.string().trim().min(4, "PIN must be at least 4 characters."),
});

interface DemoAccount {
  id: string;
  labelKey:
    | "auth.roleDispenser"
    | "auth.rolePharmacist"
    | "auth.roleAuditor"
    | "auth.roleAdmin"
    | "auth.roleDhamraiDispenser"
    | "auth.roleDispatcher"
    | "auth.roleHospitalAdmin"
    | "auth.roleBloodOfficer";
  email: string;
  password: string;
  clinic: string;
  role: string;
}

// Ashulia accounts are ordered strictly before Dhamrai so /dispenser/i selects Ashulia first.
const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "ashulia-dispenser",
    labelKey: "auth.roleDispenser",
    email: "dispenser@awaregrid.org",
    password: "Dispenser#2026!",
    clinic: "Ashulia Union Sub-Center",
    role: "dispenser",
  },
  {
    id: "ashulia-pharmacist",
    labelKey: "auth.rolePharmacist",
    email: "pharmacist@awaregrid.org",
    password: "Pharmacist#2026!",
    clinic: "Ashulia Union Sub-Center",
    role: "pharmacist",
  },
  {
    id: "ashulia-auditor",
    labelKey: "auth.roleAuditor",
    email: "auditor@awaregrid.org",
    password: "Auditor#2026!",
    clinic: "Ashulia Union Sub-Center",
    role: "auditor",
  },
  {
    id: "ashulia-admin",
    labelKey: "auth.roleAdmin",
    email: "admin@awaregrid.org",
    password: "Admin#2026!",
    clinic: "Ashulia Union Sub-Center",
    role: "admin",
  },
  {
    id: "dhamrai-dispenser",
    labelKey: "auth.roleDhamraiDispenser",
    email: "dhamrai.dispenser@awaregrid.org",
    password: "Dispenser#2026!",
    clinic: "Dhamrai Community Dispensary",
    role: "dispenser",
  },
  {
    id: "dhaka-dispatcher",
    labelKey: "auth.roleDispatcher",
    email: "dispatcher@shasthogrid.org",
    password: "Dispatcher#2026!",
    clinic: "Dhaka Regional Health Command",
    role: "dispatcher",
  },
  {
    id: "bmu-hospital-admin",
    labelKey: "auth.roleHospitalAdmin",
    email: "bmu.admin@shasthogrid.org",
    password: "Hospital#2026!",
    clinic: "BMU Super Specialised Hospital",
    role: "hospital_admin",
  },
  {
    id: "dmch-blood-officer",
    labelKey: "auth.roleBloodOfficer",
    email: "dmch.blood@shasthogrid.org",
    password: "BloodBank#2026!",
    clinic: "DMCH Blood Bank",
    role: "blood_bank_officer",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { signIn, unlockWithOfflinePin } = useAuth();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<"credentials" | "pin">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pinEmail, setPinEmail] = useState("dispenser@awaregrid.org");
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [vaultUsers, setVaultUsers] = useState<OfflineAuthRecord[]>([]);

  useEffect(() => {
    let active = true;
    const loadVault = async () => {
      try {
        const rows = await listOfflineVaultUsers();
        if (active) {
          setVaultUsers(rows);
          if (rows.length > 0) {
            setPinEmail(rows[0].email);
          }
        }
      } catch {
        // Ignore storage unavailable
      }
    };
    void loadVault();
    return () => {
      active = false;
    };
  }, []);

  const executeCredentialsSignIn = async (
    targetEmail: string,
    targetPassword: string
  ) => {
    setErrorMsg(null);
    const parsed = credentialsSchema.safeParse({
      email: targetEmail,
      password: targetPassword,
    });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? "Invalid credentials.");
      return;
    }

    setSubmitting(true);
    try {
      const signedInUser = await signIn(
        parsed.data.email,
        parsed.data.password,
        "2026"
      );
      const isCriticalCare = ["dispatcher", "hospital_admin", "blood_bank_officer"].includes(
        signedInUser.role
      );
      if (!isCriticalCare && typeof window !== "undefined" && window.navigator.onLine) {
        try {
          await bootstrapClinicState({ clinicId: signedInUser.clinic_id });
        } catch {
          // Non-blocking cache hydration
        }
      }
      router.push(signedInUser.role === "dispatcher" ? "/dispatch" : "/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Unable to sign in.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeCredentialsSignIn(email, password);
  };

  const handleQuickFill = async (account: DemoAccount) => {
    setActiveTab("credentials");
    setEmail(account.email);
    setPassword(account.password);
    setPinEmail(account.email);
    await executeCredentialsSignIn(account.email, account.password);
  };

  const handleOfflinePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = pinSchema.safeParse({ email: pinEmail, pin });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? "Invalid PIN input.");
      return;
    }

    setSubmitting(true);
    try {
      await unlockWithOfflinePin(parsed.data.email, parsed.data.pin);
      router.push("/dashboard");
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Invalid offline PIN or no cached clinic vault found."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#172A33] sm:text-3xl">
          {t("auth.title")}
        </h1>
        <p className="text-sm text-[#536975]">{t("auth.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section
          aria-label={t("auth.title")}
          className="min-w-0 mac-card p-6 lg:col-span-7"
        >
          <div
            role="tablist"
            aria-label={t("auth.title")}
            className="mb-5 flex flex-wrap gap-2 border-b border-[#DCE6E9] pb-3"
          >
            <button
              type="button"
              role="tab"
              id="tab-credentials"
              aria-selected={activeTab === "credentials"}
              aria-controls="panel-credentials"
              onClick={() => {
                setActiveTab("credentials");
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] ${
                activeTab === "credentials"
                  ? "bg-[#0F766E] text-white"
                  : "border border-[#DCE6E9] bg-[#F3F7F8] text-[#405663] hover:bg-[#EDF3F5]"
              }`}
            >
              <LogIn aria-hidden="true" className="h-3.5 w-3.5" />
              <span>{t("auth.tabCredentials")}</span>
            </button>

            <button
              type="button"
              role="tab"
              id="tab-offline-pin"
              aria-selected={activeTab === "pin"}
              aria-controls="panel-offline-pin"
              onClick={() => {
                setActiveTab("pin");
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] ${
                activeTab === "pin"
                  ? "bg-[#0F766E] text-white"
                  : "border border-[#DCE6E9] bg-[#F3F7F8] text-[#405663] hover:bg-[#EDF3F5]"
              }`}
            >
              <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
              <span>{t("auth.tabOfflinePin")}</span>
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-[#DC2626]/40 bg-[#FEE2E2] px-4 py-3 text-sm font-medium text-[#991B1B]"
            >
              {errorMsg}
            </div>
          )}

          {activeTab === "credentials" ? (
            <form
              id="panel-credentials"
              role="tabpanel"
              aria-labelledby="tab-credentials"
              onSubmit={handleCredentialsSubmit}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("auth.emailLabel")}
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33] placeholder:text-[#5C727E] focus:border-[#0F766E] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("auth.passwordLabel")}
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33] placeholder:text-[#5C727E] focus:border-[#0F766E] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#115E59] disabled:opacity-60"
              >
                <LogIn aria-hidden="true" className="h-4 w-4" />
                <span>
                  {submitting ? t("auth.signingIn") : t("auth.signInButton")}
                </span>
              </button>
            </form>
          ) : (
            <form
              id="panel-offline-pin"
              role="tabpanel"
              aria-labelledby="tab-offline-pin"
              onSubmit={handleOfflinePinSubmit}
              className="space-y-4"
            >
              <p className="rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] px-3 py-2 text-xs text-[#536975]">
                {t("auth.pinHint")}
              </p>

              <div className="space-y-1.5">
                <label
                  htmlFor="pin-email"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("auth.pinEmailLabel")}
                </label>
                <input
                  id="pin-email"
                  name="pinEmail"
                  type="email"
                  required
                  value={pinEmail}
                  onChange={(e) => setPinEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33] placeholder:text-[#5C727E] focus:border-[#0F766E] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="offline-pin"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("auth.pinLabel")}
                </label>
                <input
                  id="offline-pin"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={t("auth.pinPlaceholder")}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33] placeholder:text-[#5C727E] focus:border-[#0F766E] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#115E59] disabled:opacity-60"
              >
                <KeyRound aria-hidden="true" className="h-4 w-4" />
                <span>
                  {submitting ? t("auth.unlocking") : t("auth.unlockButton")}
                </span>
              </button>

              <div className="pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-[#536975]">
                  {t("auth.vaultAccountsTitle")}
                </h2>
                {vaultUsers.length === 0 ? (
                  <p className="mt-1 text-xs text-[#536975]">
                    {t("auth.noVaultAccounts")}
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {vaultUsers.map((v) => (
                      <button
                        key={v.email}
                        type="button"
                        onClick={() => setPinEmail(v.email)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] px-2.5 py-1 text-xs font-medium text-[#405663] hover:bg-[#EDF3F5]"
                      >
                        <UserCheck aria-hidden="true" className="h-3.5 w-3.5 text-[#0F766E]" />
                        <span>
                          {v.email} ({v.role})
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </form>
          )}
        </section>

        <section
          aria-label={t("auth.quickFillTitle")}
          className="min-w-0 mac-card p-6 lg:col-span-5"
        >
          <div className="flex items-start gap-2.5">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-[#0F766E]"
            />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#172A33]">
                {t("auth.quickFillTitle")}
              </h2>
              <p className="mt-0.5 text-xs text-[#536975]">
                {t("auth.quickFillSubtitle")}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.id}
                type="button"
                disabled={submitting}
                onClick={() => handleQuickFill(account)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] px-3.5 py-2.5 text-left transition-colors hover:border-[#0F766E]/50 hover:bg-[#F0FDFA] disabled:opacity-60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#172A33]">
                    {t(account.labelKey)}
                  </p>
                  <p className="truncate text-xs text-[#536975]">
                    {account.email} · {account.clinic}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-[#0F766E] px-2.5 py-1 text-xs font-semibold text-white">
                  {account.role.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
