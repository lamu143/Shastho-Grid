"use client";

import React, { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import {
  Building2,
  ClipboardList,
  FileText,
  Pill,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { StatusBadge } from "@/components/StatusBadge";
import type { SessionUser, UserRole } from "@/db/dexie";
import {
  ApiError,
  adminCreateUser,
  adminListAuditLogs,
  adminListCatalog,
  adminListClinics,
  adminListGuidelines,
  adminListUsers,
  type AdminUser,
  type AuditLog,
  type CatalogDrug,
  type Clinic,
  type Guideline,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type AdminTab = "clinics" | "users" | "guidelines" | "catalog" | "audit";

const createUserSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required."),
  email: z.string().trim().email("Valid email is required."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  pin: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (v.length >= 4 && v.length <= 12), {
      message: "PIN must be 4-12 characters when provided.",
    }),
  role: z.enum(["dispenser", "pharmacist", "auditor", "admin"]),
  clinic_id: z.string().min(1, "Clinic is required."),
});

function AdminContent({ user }: { user: SessionUser }) {
  const { locale, t } = useI18n();
  const [activeTab, setActiveTab] = useState<AdminTab>("clinics");

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [catalog, setCatalog] = useState<CatalogDrug[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [actionFilter, setActionFilter] = useState("");
  const [traceFilter, setTraceFilter] = useState("");

  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPin, setNewPin] = useState("2026");
  const [newRole, setNewRole] = useState<UserRole>("dispenser");
  const [newClinicId, setNewClinicId] = useState(user.clinic_id);

  const [loading, setLoading] = useState(true);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadAllAdminData = useCallback(async () => {
    setErrorMsg(null);
    try {
      const [cli, usr, guide, cat, logs] = await Promise.all([
        adminListClinics(),
        adminListUsers(),
        adminListGuidelines(),
        adminListCatalog(),
        adminListAuditLogs({ limit: 100 }),
      ]);
      setClinics(cli);
      setUsers(usr);
      setGuidelines(guide);
      setCatalog(cat);
      setAuditLogs(logs);
      if (cli.length > 0) {
        setNewClinicId(cli[0].id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Unable to load admin governance data.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAllAdminData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAllAdminData]);

  const handleFilterAuditLogs = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const logs = await adminListAuditLogs({
        action: actionFilter.trim() || undefined,
        trace_id: traceFilter.trim() || undefined,
        limit: 100,
      });
      setAuditLogs(logs);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Failed to filter audit logs."
      );
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const parsed = createUserSchema.safeParse({
      full_name: newFullName,
      email: newEmail,
      password: newPassword,
      pin: newPin.trim() || undefined,
      role: newRole,
      clinic_id: newClinicId,
    });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? "Invalid user fields.");
      return;
    }

    setSubmittingUser(true);
    try {
      const created = await adminCreateUser({
        full_name: parsed.data.full_name,
        email: parsed.data.email,
        password: parsed.data.password,
        pin: parsed.data.pin,
        role: parsed.data.role,
        clinic_id: parsed.data.clinic_id,
      });
      setUsers((prev) => [...prev, created]);
      setNewFullName("");
      setNewEmail("");
      setNewPassword("");
      setSuccessMsg(`Created user ${created.email} (${created.role}).`);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Unable to create user."
      );
    } finally {
      setSubmittingUser(false);
    }
  };

  const tabs: Array<{
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "clinics", label: t("admin.tabClinics"), icon: Building2 },
    { id: "users", label: t("admin.tabUsers"), icon: Users },
    { id: "guidelines", label: t("admin.tabGuidelines"), icon: FileText },
    { id: "catalog", label: t("admin.tabCatalog"), icon: Pill },
    { id: "audit", label: t("admin.tabAuditLogs"), icon: ClipboardList },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#172A33] sm:text-3xl">
          {t("admin.title")}
        </h1>
        <p className="text-sm text-[#536975]">{t("admin.subtitle")}</p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-[#DC2626]/40 bg-[#FEE2E2] px-4 py-3 text-sm font-medium text-[#991B1B]"
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="rounded-lg border border-[#059669]/40 bg-[#ECFDF5] px-4 py-3 text-sm font-medium text-[#065F46]"
        >
          {successMsg}
        </div>
      )}

      <div
        role="tablist"
        aria-label={t("admin.title")}
        className="flex flex-wrap gap-2 border-b border-[#DCE6E9] pb-3"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`admin-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`admin-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                selected
                  ? "bg-[#0F766E] text-white"
                  : "border border-[#DCE6E9] bg-[#FFFFFF] text-[#405663] hover:bg-[#EDF3F5]"
              }`}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-sm text-[#536975]">{t("common.loading")}</p>
      ) : (
        <>
          {activeTab === "clinics" && (
            <section
              id="admin-panel-clinics"
              role="tabpanel"
              aria-labelledby="admin-tab-clinics"
              className="mac-card p-5"
            >
              <h2 className="text-base font-bold text-[#172A33]">
                {t("admin.tabClinics")}
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[540px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#DCE6E9] bg-[#F3F7F8] text-[#405663]">
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("admin.colCode")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("admin.colName")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("admin.colLocation")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("admin.colTarget")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE6E9]">
                    {clinics.map((c) => (
                      <tr key={c.id} className="hover:bg-[#F3F7F8]">
                        <td className="px-3 py-2.5 font-mono font-semibold text-[#172A33]">
                          {c.code}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-[#172A33]">
                          {c.name}
                        </td>
                        <td className="px-3 py-2.5 text-[#405663]">
                          {c.upazila ?? "-"}, {c.district ?? "-"}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-[#0F766E]">
                          {c.target_access_pct ?? 60}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "users" && (
            <section
              id="admin-panel-users"
              role="tabpanel"
              aria-labelledby="admin-tab-users"
              className="space-y-6"
            >
              <div className="mac-card p-5">
                <h2 className="flex items-center gap-2 text-base font-bold text-[#172A33]">
                  <UserPlus aria-hidden="true" className="h-4 w-4 text-[#0F766E]" />
                  <span>{t("admin.createUserTitle")}</span>
                </h2>
                <form
                  onSubmit={handleCreateUser}
                  className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div>
                    <label
                      htmlFor="admin-user-name"
                      className="block text-xs font-semibold text-[#405663]"
                    >
                      {t("admin.userFullName")}
                    </label>
                    <input
                      id="admin-user-name"
                      type="text"
                      required
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#D1DEE3] px-3 py-2 text-xs text-[#172A33]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="admin-user-email"
                      className="block text-xs font-semibold text-[#405663]"
                    >
                      {t("admin.userEmail")}
                    </label>
                    <input
                      id="admin-user-email"
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#D1DEE3] px-3 py-2 text-xs text-[#172A33]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="admin-user-password"
                      className="block text-xs font-semibold text-[#405663]"
                    >
                      {t("admin.userPassword")}
                    </label>
                    <input
                      id="admin-user-password"
                      type="password"
                      minLength={8}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#D1DEE3] px-3 py-2 text-xs text-[#172A33]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="admin-user-pin"
                      className="block text-xs font-semibold text-[#405663]"
                    >
                      {t("admin.userPin")}
                    </label>
                    <input
                      id="admin-user-pin"
                      type="text"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#D1DEE3] px-3 py-2 text-xs text-[#172A33]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="admin-user-role"
                      className="block text-xs font-semibold text-[#405663]"
                    >
                      {t("admin.userRole")}
                    </label>
                    <select
                      id="admin-user-role"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as UserRole)}
                      className="mt-1 w-full rounded-lg border border-[#D1DEE3] px-3 py-2 text-xs text-[#172A33]"
                    >
                      <option value="dispenser">dispenser</option>
                      <option value="pharmacist">pharmacist</option>
                      <option value="auditor">auditor</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="admin-user-clinic"
                      className="block text-xs font-semibold text-[#405663]"
                    >
                      {t("admin.userClinic")}
                    </label>
                    <select
                      id="admin-user-clinic"
                      value={newClinicId}
                      onChange={(e) => setNewClinicId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#D1DEE3] px-3 py-2 text-xs text-[#172A33]"
                    >
                      {clinics.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <button
                      type="submit"
                      disabled={submittingUser}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#115E59] disabled:opacity-60"
                    >
                      <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
                      <span>{t("admin.createUserBtn")}</span>
                    </button>
                  </div>
                </form>
              </div>

              <div className="mac-card p-5">
                <h2 className="text-base font-bold text-[#172A33]">
                  {t("admin.tabUsers")}
                </h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[600px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#DCE6E9] bg-[#F3F7F8] text-[#405663]">
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          {t("admin.colName")}
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          {t("admin.userEmail")}
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          {t("admin.userRole")}
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          {t("common.status")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE6E9]">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-[#F3F7F8]">
                          <td className="px-3 py-2.5 font-medium text-[#172A33]">
                            {u.full_name}
                          </td>
                          <td className="px-3 py-2.5 text-[#405663]">
                            {u.email}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-[#0F766E]">
                            {u.role.toUpperCase()}
                          </td>
                          <td className="px-3 py-2.5">
                            {u.is_active !== false ? (
                              <span className="inline-flex rounded-full border border-[#059669]/40 bg-[#ECFDF5] px-2.5 py-0.5 text-xs font-semibold text-[#065F46]">
                                ACTIVE
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-[#DC2626]/40 bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-semibold text-[#991B1B]">
                                INACTIVE
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {activeTab === "guidelines" && (
            <section
              id="admin-panel-guidelines"
              role="tabpanel"
              aria-labelledby="admin-tab-guidelines"
              className="mac-card p-5"
            >
              <h2 className="text-base font-bold text-[#172A33]">
                {t("admin.tabGuidelines")}
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#DCE6E9] bg-[#F3F7F8] text-[#405663]">
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("admin.colCode")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("admin.colName")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        First-Line
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        Viral No-Abx
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE6E9]">
                    {guidelines.map((g) => (
                      <tr key={g.id} className="hover:bg-[#F3F7F8]">
                        <td className="px-3 py-2.5 font-mono font-semibold text-[#172A33]">
                          {g.syndrome_code}
                        </td>
                        <td className="px-3 py-2.5 text-[#172A33]">
                          {locale === "bn" && g.syndrome_name_bn
                            ? g.syndrome_name_bn
                            : g.syndrome_name_en}
                        </td>
                        <td className="px-3 py-2.5 text-[#405663]">
                          {g.first_line_drug_codes.join(", ") || "Symptomatic"}
                        </td>
                        <td className="px-3 py-2.5">
                          {g.viral_no_antibiotic_if_mild
                            ? t("common.yes")
                            : t("common.no")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "catalog" && (
            <section
              id="admin-panel-catalog"
              role="tabpanel"
              aria-labelledby="admin-tab-catalog"
              className="mac-card p-5"
            >
              <h2 className="text-base font-bold text-[#172A33]">
                {t("admin.tabCatalog")}
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#DCE6E9] bg-[#F3F7F8] text-[#405663]">
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("admin.colCode")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("inventory.colDrug")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("inventory.colClass")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("inventory.colTier")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        Min Age / eGFR
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE6E9]">
                    {catalog.map((d) => (
                      <tr key={d.id} className="hover:bg-[#F3F7F8]">
                        <td className="px-3 py-2.5 font-mono font-semibold text-[#172A33]">
                          {d.drug_code}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-[#172A33]">
                          {d.generic_name}
                        </td>
                        <td className="px-3 py-2.5 text-[#405663]">
                          {d.drug_class}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge variant={d.aware_category} />
                        </td>
                        <td className="px-3 py-2.5 text-[#405663]">
                          Age &gt;= {d.min_age_years} · eGFR &gt;={" "}
                          {d.renal_contraindicated_egfr_lt ?? "Any"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "audit" && (
            <section
              id="admin-panel-audit"
              role="tabpanel"
              aria-labelledby="admin-tab-audit"
              className="mac-card p-5"
            >
              <h2 className="text-base font-bold text-[#172A33]">
                {t("admin.tabAuditLogs")}
              </h2>

              <form
                onSubmit={handleFilterAuditLogs}
                className="mt-4 flex flex-wrap items-end gap-3"
              >
                <div>
                  <label
                    htmlFor="audit-action-filter"
                    className="block text-xs font-semibold text-[#405663]"
                  >
                    {t("admin.auditActionFilter")}
                  </label>
                  <input
                    id="audit-action-filter"
                    type="text"
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    placeholder="ADMIN_CREATE_USER"
                    className="mt-1 rounded-lg border border-[#D1DEE3] px-3 py-1.5 text-xs text-[#172A33]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="audit-trace-filter"
                    className="block text-xs font-semibold text-[#405663]"
                  >
                    {t("admin.auditTraceFilter")}
                  </label>
                  <input
                    id="audit-trace-filter"
                    type="text"
                    value={traceFilter}
                    onChange={(e) => setTraceFilter(e.target.value)}
                    placeholder="trace_id UUID"
                    className="mt-1 rounded-lg border border-[#D1DEE3] px-3 py-1.5 text-xs text-[#172A33]"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#115E59]"
                >
                  <Search aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>{t("admin.applyFiltersBtn")}</span>
                </button>
              </form>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#DCE6E9] bg-[#F3F7F8] text-[#405663]">
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("admin.colAction")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("admin.colResource")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("admin.userRole")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("admin.colTraceId")}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        {t("common.createdAt")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE6E9]">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#F3F7F8]">
                        <td className="px-3 py-2.5 font-semibold text-[#172A33]">
                          {log.action}
                        </td>
                        <td className="px-3 py-2.5 text-[#405663]">
                          {log.resource_type}
                          {log.resource_id
                            ? ` (${log.resource_id.slice(0, 8)})`
                            : ""}
                        </td>
                        <td className="px-3 py-2.5 text-[#405663]">
                          {log.actor_role ?? "-"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[#536975]">
                          {log.trace_id}
                        </td>
                        <td className="px-3 py-2.5 text-[#536975]">
                          {log.created_at.slice(0, 19).replace("T", " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { t } = useI18n();
  return (
    <AuthGuard pageTitle={t("admin.title")} allowedRoles={["admin"]}>
      {(user) => <AdminContent user={user} />}
    </AuthGuard>
  );
}
