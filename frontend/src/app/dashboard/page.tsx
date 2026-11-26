"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Package,
  RefreshCw,
  Send,
  Stethoscope,
  Trash2,
  XCircle,
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { KpiGauge } from "@/components/KpiGauge";
import { StatusBadge } from "@/components/StatusBadge";
import {
  getDb,
  type AwareVerdictCategory,
  type BatchRecord,
  type DispenseRecord,
  type DispenseStatus,
  type PatientRecord,
  type SessionUser,
} from "@/db/dexie";
import {
  ApiError,
  approveDispense,
  getStewardshipAnalytics,
  listDispenses,
  listInventoryBatches,
  listPatients,
  rejectDispense,
  submitDispense,
  voidDispense,
  type Dispense,
  type StewardshipAnalytics,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { bootstrapClinicState, enqueueDispenseMutation } from "@/lib/syncEngine";

function computeOfflineAnalytics(
  user: SessionUser,
  dispenses: DispenseRecord[],
  batches: BatchRecord[]
): StewardshipAnalytics {
  const dispensed = dispenses.filter((d) => d.status === "DISPENSED");
  const access_count = dispensed.filter(
    (d) => d.aware_category === "ACCESS"
  ).length;
  const watch_count = dispensed.filter(
    (d) => d.aware_category === "WATCH"
  ).length;
  const reserve_count = dispensed.filter(
    (d) => d.aware_category === "RESERVE"
  ).length;
  const no_antibiotic_count = dispensed.filter(
    (d) => d.aware_category === "NO_ANTIBIOTIC"
  ).length;
  const antibiotic_dispensed = access_count + watch_count + reserve_count;
  const access_ratio_pct =
    antibiotic_dispensed > 0
      ? Number(((access_count / antibiotic_dispensed) * 100).toFixed(1))
      : 0;

  const nowMs = Date.now();
  const in14DaysMs = nowMs + 14 * 86_400_000;
  let expiring_soon_count = 0;
  let stocked_out_count = 0;
  for (const b of batches) {
    if (b.qty_remaining <= 0) {
      stocked_out_count += 1;
    } else {
      const expMs = Date.parse(`${b.expiry_date.slice(0, 10)}T00:00:00Z`);
      if (Number.isFinite(expMs) && expMs > nowMs && expMs <= in14DaysMs) {
        expiring_soon_count += 1;
      }
    }
  }

  return {
    clinic_id: user.clinic_id,
    clinic_name: user.clinic_name,
    total_dispensed: dispensed.length,
    antibiotic_dispensed,
    access_count,
    watch_count,
    reserve_count,
    no_antibiotic_count,
    access_ratio_pct,
    target_access_pct: 60.0,
    meets_who_target: access_ratio_pct >= 60.0,
    expiring_soon_count,
    stocked_out_count,
  };
}

function DashboardContent({ user }: { user: SessionUser }) {
  const { t } = useI18n();
  const [analytics, setAnalytics] = useState<StewardshipAnalytics | null>(null);
  const [dispenses, setDispenses] = useState<Dispense[]>([]);
  const [patientsById, setPatientsById] = useState<Record<string, PatientRecord>>({});
  const [batchesById, setBatchesById] = useState<Record<string, BatchRecord>>({});
  const [statusFilter, setStatusFilter] = useState<DispenseStatus | "ALL">("ALL");
  const [tierFilter, setTierFilter] = useState<AwareVerdictCategory | "ALL">("ALL");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const canApproveOrVoid =
    user.role === "pharmacist" || user.role === "admin";
  const isReadOnlyAuditor = user.role === "auditor";

  const loadData = useCallback(async () => {
    setErrorMsg(null);
    const database = getDb();
    const online = typeof window !== "undefined" && window.navigator.onLine;

    if (online) {
      try {
        await bootstrapClinicState({ clinicId: user.clinic_id });
      } catch {
        // Ignore transient bootstrap errors and continue with direct or Dexie data
      }

      try {
        const [stats, dispList, patList, batchList] = await Promise.all([
          getStewardshipAnalytics(),
          listDispenses(),
          listPatients(),
          listInventoryBatches(),
        ]);

        const patMap: Record<string, PatientRecord> = {};
        for (const p of patList) patMap[p.id] = p;
        const batchMap: Record<string, BatchRecord> = {};
        for (const b of batchList) batchMap[b.id] = b;

        setAnalytics(stats);
        setDispenses(dispList);
        setPatientsById(patMap);
        setBatchesById(batchMap);
        setLoading(false);
        return;
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          setErrorMsg(err.message);
        }
      }
    }

    try {
      const [localDispenses, localPatients, localBatches] = await Promise.all([
        database.dispenses.where("clinic_id").equals(user.clinic_id).toArray(),
        database.patients.where("clinic_id").equals(user.clinic_id).toArray(),
        database.batches.where("clinic_id").equals(user.clinic_id).toArray(),
      ]);
      const sortedDispenses = [...localDispenses].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );
      const patMap: Record<string, PatientRecord> = {};
      for (const p of localPatients) patMap[p.id] = p;
      const batchMap: Record<string, BatchRecord> = {};
      for (const b of localBatches) batchMap[b.id] = b;

      setDispenses(sortedDispenses);
      setPatientsById(patMap);
      setBatchesById(batchMap);
      setAnalytics(computeOfflineAnalytics(user, sortedDispenses, localBatches));
    } catch {
      setErrorMsg("Unable to load local clinic records.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const filteredDispenses = useMemo(() => {
    return dispenses.filter((d) => {
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (tierFilter !== "ALL" && d.aware_category !== tierFilter) return false;
      return true;
    });
  }, [dispenses, statusFilter, tierFilter]);

  const handleWorkflowAction = async (
    dispense: Dispense,
    action: "SUBMIT" | "APPROVE" | "REJECT" | "VOID"
  ) => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setBusyId(dispense.id);
    const online = typeof window !== "undefined" && window.navigator.onLine;

    try {
      if (online) {
        if (action === "SUBMIT") {
          await submitDispense(dispense.id);
        } else if (action === "APPROVE") {
          await approveDispense(dispense.id);
        } else if (action === "REJECT") {
          await rejectDispense(dispense.id, reason.trim() || undefined);
        } else if (action === "VOID") {
          await voidDispense(dispense.id, reason.trim() || undefined);
        }
        setReason("");
        await loadData();
        return;
      }

      const nextStatus: DispenseStatus =
        action === "SUBMIT"
          ? "PENDING_APPROVAL"
          : action === "APPROVE"
          ? "DISPENSED"
          : action === "REJECT"
          ? "REJECTED"
          : "VOIDED";
      const updatedRecord: DispenseRecord = {
        id: dispense.id,
        clinic_id: dispense.clinic_id,
        patient_id: dispense.patient_id,
        batch_id: dispense.batch_id,
        antibiotic_id: dispense.antibiotic_id,
        drug_code: dispense.drug_code,
        syndrome_code: dispense.syndrome_code,
        aware_category: dispense.aware_category,
        qty: dispense.qty,
        status: nextStatus,
        version: dispense.version,
        created_at: dispense.created_at,
        updated_at: new Date().toISOString(),
      };
      await getDb().dispenses.put(updatedRecord);
      await enqueueDispenseMutation({
        clinicId: user.clinic_id,
        entityId: dispense.id,
        mutationType: action,
        baseVersion: dispense.version,
        payload: {
          status: nextStatus,
          reason: reason.trim() || undefined,
        },
      });
      setNoticeMsg(t("status.offlineNotice"));
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Workflow action failed.");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-[#172A33] sm:text-3xl">
            {t("dashboard.title")}
          </h1>
          <p className="text-sm text-[#536975]">
            {user.clinic_name} · {user.role.toUpperCase()} — {t("dashboard.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/triage"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#115E59]"
          >
            <Stethoscope aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{t("dashboard.openTriage")}</span>
          </Link>
          <Link
            href="/dashboard/inventory"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E9] bg-[#FFFFFF] px-3.5 py-2 text-xs font-semibold text-[#172A33] hover:bg-[#EDF3F5]"
          >
            <Package aria-hidden="true" className="h-3.5 w-3.5 text-[#0F766E]" />
            <span>{t("dashboard.openInventory")}</span>
          </Link>
          <Link
            href="/dashboard/sync"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E9] bg-[#FFFFFF] px-3.5 py-2 text-xs font-semibold text-[#172A33] hover:bg-[#EDF3F5]"
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 text-[#0F766E]" />
            <span>{t("dashboard.openSync")}</span>
          </Link>
        </div>
      </div>

      {isReadOnlyAuditor && (
        <div
          role="status"
          className="rounded-lg border border-[#0284C7]/40 bg-[#E0F2FE] px-4 py-2.5 text-xs font-semibold text-[#075985]"
        >
          {t("common.readOnlyAuditor")}
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-[#DC2626]/40 bg-[#FEE2E2] px-4 py-3 text-sm font-medium text-[#991B1B]"
        >
          {errorMsg}
        </div>
      )}

      {noticeMsg && (
        <div
          role="status"
          className="rounded-lg border border-[#059669]/40 bg-[#ECFDF5] px-4 py-3 text-sm font-medium text-[#065F46]"
        >
          {noticeMsg}
        </div>
      )}

      {analytics && <KpiGauge analytics={analytics} />}

      <section
        aria-label={t("dashboard.queueTitle")}
        className="mac-card p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#172A33]">
              {t("dashboard.queueTitle")}
            </h2>
            <p className="text-xs text-[#536975]">
              {t("dashboard.pharmacistGateHint")}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="filter-dispense-status"
                className="block text-xs font-semibold text-[#405663]"
              >
                {t("dashboard.filterStatus")}
              </label>
              <select
                id="filter-dispense-status"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as DispenseStatus | "ALL")
                }
                className="mt-1 rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#172A33]"
              >
                <option value="ALL">{t("common.all")}</option>
                <option value="DRAFT">{t("status.DRAFT")}</option>
                <option value="PENDING_APPROVAL">
                  {t("status.PENDING_APPROVAL")}
                </option>
                <option value="DISPENSED">{t("status.DISPENSED")}</option>
                <option value="REJECTED">{t("status.REJECTED")}</option>
                <option value="VOIDED">{t("status.VOIDED")}</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="filter-dispense-tier"
                className="block text-xs font-semibold text-[#405663]"
              >
                {t("dashboard.filterTier")}
              </label>
              <select
                id="filter-dispense-tier"
                value={tierFilter}
                onChange={(e) =>
                  setTierFilter(e.target.value as AwareVerdictCategory | "ALL")
                }
                className="mt-1 rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#172A33]"
              >
                <option value="ALL">{t("common.all")}</option>
                <option value="ACCESS">{t("aware.ACCESS")}</option>
                <option value="WATCH">{t("aware.WATCH")}</option>
                <option value="RESERVE">{t("aware.RESERVE")}</option>
                <option value="NO_ANTIBIOTIC">{t("aware.NO_ANTIBIOTIC")}</option>
              </select>
            </div>

            {canApproveOrVoid && (
              <div>
                <label
                  htmlFor="dispense-action-reason"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("dashboard.reasonLabel")}
                </label>
                <input
                  id="dispense-action-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("dashboard.reasonPlaceholder")}
                  className="mt-1 rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#172A33] placeholder:text-[#5C727E]"
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <p className="py-6 text-sm text-[#536975]">{t("common.loading")}</p>
          ) : filteredDispenses.length === 0 ? (
            <p className="py-6 text-sm text-[#536975]">
              {t("dashboard.noDispenses")}
            </p>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#DCE6E9] bg-[#F3F7F8] text-[#405663]">
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colPatient")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colSyndrome")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colDrugLot")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colTier")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colQty")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colStatus")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("dashboard.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE6E9]">
                {filteredDispenses.map((d) => {
                  const patient = patientsById[d.patient_id];
                  const batch = d.batch_id ? batchesById[d.batch_id] : undefined;
                  const drugLabel =
                    d.generic_name ??
                    batch?.generic_name ??
                    d.drug_code ??
                    "Symptomatic Care";
                  const lotLabel = d.lot_number ?? batch?.lot_number ?? "-";
                  const isBusy = busyId === d.id;

                  return (
                    <tr key={d.id} className="hover:bg-[#F3F7F8]">
                      <td className="px-3 py-3 font-medium text-[#172A33]">
                        <div>{d.patient_name ?? patient?.full_name ?? d.patient_id.slice(0, 8)}</div>
                        <div className="text-[11px] text-[#536975]">
                          {patient?.mrn ?? ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#405663]">
                        {d.syndrome_code}
                      </td>
                      <td className="px-3 py-3 text-[#405663]">
                        <div className="font-medium text-[#172A33]">{drugLabel}</div>
                        <div className="text-[11px] text-[#536975]">
                          Lot: {lotLabel}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge variant={d.aware_category} />
                      </td>
                      <td className="px-3 py-3 font-semibold text-[#172A33]">
                        {d.qty}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge variant={d.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {!isReadOnlyAuditor && d.status === "DRAFT" && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleWorkflowAction(d, "SUBMIT")}
                              className="inline-flex items-center gap-1 rounded-md bg-[#0F766E] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#115E59] disabled:opacity-60"
                            >
                              <Send aria-hidden="true" className="h-3 w-3" />
                              <span>{t("dashboard.submitBtn")}</span>
                            </button>
                          )}

                          {canApproveOrVoid &&
                            d.status === "PENDING_APPROVAL" && (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    handleWorkflowAction(d, "APPROVE")
                                  }
                                  className="inline-flex items-center gap-1 rounded-md bg-[#0F766E] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#115E59] disabled:opacity-60"
                                >
                                  <Check aria-hidden="true" className="h-3 w-3" />
                                  <span>{t("dashboard.approveBtn")}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    handleWorkflowAction(d, "REJECT")
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-[#DC2626]/40 bg-[#FEE2E2] px-2.5 py-1 text-xs font-semibold text-[#991B1B] hover:bg-[#FECACA] disabled:opacity-60"
                                >
                                  <XCircle aria-hidden="true" className="h-3 w-3" />
                                  <span>{t("dashboard.rejectBtn")}</span>
                                </button>
                              </>
                            )}

                          {canApproveOrVoid &&
                            (d.status === "PENDING_APPROVAL" ||
                              d.status === "DISPENSED") && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleWorkflowAction(d, "VOID")}
                                className="inline-flex items-center gap-1 rounded-md border border-[#D1DEE3] bg-[#F3F7F8] px-2.5 py-1 text-xs font-semibold text-[#405663] hover:bg-[#EDF3F5] disabled:opacity-60"
                              >
                                <Trash2 aria-hidden="true" className="h-3 w-3" />
                                <span>{t("dashboard.voidBtn")}</span>
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useI18n();
  return (
    <AuthGuard pageTitle={t("dashboard.title")}>
      {(user) => <DashboardContent user={user} />}
    </AuthGuard>
  );
}
