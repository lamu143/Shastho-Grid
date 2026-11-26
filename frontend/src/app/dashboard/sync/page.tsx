"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  RefreshCw,
  Server,
  Smartphone,
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  getDb,
  type ConflictRecord,
  type ConflictResolutionStatus,
  type SessionUser,
  type SyncMutationRecord,
} from "@/db/dexie";
import { ApiError, listSyncConflicts } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  bootstrapClinicState,
  resolveConflict,
  syncPendingMutations,
  type SyncRunSummary,
} from "@/lib/syncEngine";

function extractStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function buildDefaultMergedAllergies(conflict: ConflictRecord): string {
  const srv = extractStringArray(conflict.server_snapshot?.allergies);
  const cli = extractStringArray(conflict.client_snapshot?.allergies);
  return Array.from(new Set([...srv, ...cli])).join(", ");
}

function formatSnapshotEntries(snapshot: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(snapshot).map(([k, v]) => {
    if (Array.isArray(v)) {
      return [k, v.length > 0 ? v.join(", ") : "[]"];
    }
    if (v === null || v === undefined) {
      return [k, "null"];
    }
    if (typeof v === "object") {
      return [k, JSON.stringify(v)];
    }
    return [k, String(v)];
  });
}

function SyncContent({ user }: { user: SessionUser }) {
  const { t } = useI18n();
  const isReadOnlyAuditor = user.role === "auditor";

  const [mutations, setMutations] = useState<SyncMutationRecord[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [mergedAllergiesById, setMergedAllergiesById] = useState<
    Record<string, string>
  >({});
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<SyncRunSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadLocalAndRemote = useCallback(async () => {
    const database = getDb();
    const online = typeof window !== "undefined" && window.navigator.onLine;

    if (online) {
      try {
        const remoteConflicts = await listSyncConflicts();
        if (remoteConflicts.length > 0) {
          await database.conflicts.bulkPut(remoteConflicts);
        }
      } catch {
        // Ignore transient network errors when offline or unreachable
      }
    }

    const [localMutations, localConflicts] = await Promise.all([
      database.syncMutations
        .where("clinic_id")
        .equals(user.clinic_id)
        .toArray(),
      database.conflicts.where("clinic_id").equals(user.clinic_id).toArray(),
    ]);

    const sortedMutations = [...localMutations].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    const sortedConflicts = [...localConflicts].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );

    setMutations(sortedMutations);
    setConflicts(sortedConflicts);

    setMergedAllergiesById((prev) => {
      const next = { ...prev };
      for (const c of sortedConflicts) {
        if (next[c.id] === undefined) {
          next[c.id] = buildDefaultMergedAllergies(c);
        }
      }
      return next;
    });
  }, [user.clinic_id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLocalAndRemote();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLocalAndRemote]);

  const handleSyncNow = async () => {
    setErrorMsg(null);
    setSyncing(true);
    try {
      const summary = await syncPendingMutations({ clinicId: user.clinic_id });
      setLastSummary(summary);
      await loadLocalAndRemote();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Sync failed.");
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleHydrate = async () => {
    setErrorMsg(null);
    setHydrating(true);
    try {
      await bootstrapClinicState({ clinicId: user.clinic_id });
      await loadLocalAndRemote();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to refresh clinic snapshot."
      );
    } finally {
      setHydrating(false);
    }
  };

  const handleResolve = async (
    conflict: ConflictRecord,
    resolution: Exclude<ConflictResolutionStatus, "OPEN">
  ) => {
    if (isReadOnlyAuditor) return;
    setErrorMsg(null);
    setResolvingId(conflict.id);

    const rawNotes = (notesById[conflict.id] ?? "").trim();
    const effectiveNotes =
      rawNotes ||
      `Reconciled ${conflict.entity_type} via 409 Conflict Workbench (${resolution}).`;

    const mergedAllergyTokens = (
      mergedAllergiesById[conflict.id] ?? buildDefaultMergedAllergies(conflict)
    )
      .split(/[,\n;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const mergedPayload =
      resolution === "RESOLVED_MERGED"
        ? {
            ...conflict.server_snapshot,
            ...conflict.client_snapshot,
            allergies: Array.from(new Set(mergedAllergyTokens)),
          }
        : undefined;

    try {
      await resolveConflict(conflict.id, {
        resolution,
        notes: effectiveNotes,
        merged_payload: mergedPayload,
      });
      await loadLocalAndRemote();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Failed to resolve conflict.");
      }
    } finally {
      setResolvingId(null);
    }
  };

  const openConflicts = conflicts.filter((c) => c.status === "OPEN");
  const resolvedConflicts = conflicts.filter((c) => c.status !== "OPEN");
  const pendingCount = mutations.filter(
    (m) => m.status === "pending" || m.status === "syncing"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-[#172A33] sm:text-3xl">
            {t("sync.title")}
          </h1>
          <p className="text-sm text-[#536975]">{t("sync.subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={hydrating}
            onClick={handleHydrate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E9] bg-[#FFFFFF] px-3.5 py-2 text-xs font-semibold text-[#172A33] hover:bg-[#EDF3F5] disabled:opacity-60"
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 text-[#0F766E]" />
            <span>{t("sync.hydrateBtn")}</span>
          </button>

          {!isReadOnlyAuditor && (
            <button
              type="button"
              disabled={syncing}
              onClick={handleSyncNow}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#115E59] disabled:opacity-60"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
              />
              <span>{syncing ? t("sync.syncing") : t("sync.syncNowBtn")}</span>
            </button>
          )}
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

      {lastSummary && (
        <div
          role="status"
          className="rounded-lg border border-[#059669]/40 bg-[#ECFDF5] px-4 py-2.5 text-xs font-semibold text-[#065F46]"
        >
          Synced: {lastSummary.syncedCount} · Conflicts: {lastSummary.conflictCount} ·
          Failed: {lastSummary.failedCount} · Remaining: {lastSummary.remainingPending}
        </div>
      )}

      <section
        aria-label="Sync Summary"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <div className="mac-card p-4">
          <p className="text-xs font-semibold text-[#536975]">
            {t("sync.summaryPending")}
          </p>
          <p className="mt-1 text-2xl font-bold text-[#172A33]">{pendingCount}</p>
        </div>

        <div className="mac-card p-4">
          <p className="text-xs font-semibold text-[#536975]">
            {t("sync.summaryOpenConflicts")}
          </p>
          <p className="mt-1 text-2xl font-bold text-[#991B1B]">
            {openConflicts.length}
          </p>
        </div>

        <div className="mac-card p-4">
          <p className="text-xs font-semibold text-[#536975]">
            {t("sync.summaryTotalMutations")}
          </p>
          <p className="mt-1 text-2xl font-bold text-[#172A33]">
            {mutations.length}
          </p>
        </div>
      </section>

      <section
        aria-label={t("sync.workbenchTitle")}
        className="space-y-4 mac-card p-5"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#172A33]">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 text-[#DC2626]" />
            <span>{t("sync.workbenchTitle")}</span>
          </h2>
          {openConflicts.length > 0 && <StatusBadge variant="OPEN" />}
        </div>

        {openConflicts.length === 0 ? (
          <p className="py-4 text-sm text-[#536975]">{t("sync.noConflicts")}</p>
        ) : (
          <div className="space-y-6">
            {openConflicts.map((c) => {
              const verdict = c.cpsat_verdict ?? {};
              const musConflicts = Array.isArray(verdict.mus_conflicts)
                ? (verdict.mus_conflicts as Array<Record<string, unknown>>)
                : [];
              const safeRelaxations = Array.isArray(verdict.safe_relaxations)
                ? (verdict.safe_relaxations as Array<Record<string, unknown>>)
                : [];
              const solverStatus =
                typeof verdict.solver_status === "string"
                  ? verdict.solver_status
                  : "INFEASIBLE";
              const isBusy = resolvingId === c.id;

              return (
                <article
                  key={c.id}
                  className="space-y-4 rounded-xl border border-[#DC2626]/35 bg-[#FFFBFB] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCE6E9] pb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#172A33]">
                        {c.entity_type} · {c.entity_id}
                      </p>
                      <p className="text-xs text-[#536975]">
                        Conflict ID: {c.id}
                      </p>
                    </div>
                    <StatusBadge variant="OPEN" />
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="min-w-0 rounded-lg border border-[#0284C7]/35 bg-[#F0F9FF] p-3.5">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#075985]">
                        <Server aria-hidden="true" className="h-3.5 w-3.5" />
                        <span>{t("sync.serverSnapshot")}</span>
                      </h3>
                      <dl className="mt-2 space-y-1 text-xs">
                        {formatSnapshotEntries(c.server_snapshot).map(
                          ([k, val]) => (
                            <div
                              key={k}
                              className="flex justify-between gap-2 border-b border-[#BAE6FD]/60 py-1"
                            >
                              <dt className="font-semibold text-[#172A33]">
                                {k}
                              </dt>
                              <dd className="break-all text-right text-[#405663]">
                                {val}
                              </dd>
                            </div>
                          )
                        )}
                      </dl>
                    </div>

                    <div className="min-w-0 rounded-lg border border-[#D97706]/45 bg-[#FFFBEB] p-3.5">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#92400E]">
                        <Smartphone aria-hidden="true" className="h-3.5 w-3.5" />
                        <span>{t("sync.clientSnapshot")}</span>
                      </h3>
                      <dl className="mt-2 space-y-1 text-xs">
                        {formatSnapshotEntries(c.client_snapshot).map(
                          ([k, val]) => (
                            <div
                              key={k}
                              className="flex justify-between gap-2 border-b border-[#FDE68A]/70 py-1"
                            >
                              <dt className="font-semibold text-[#172A33]">
                                {k}
                              </dt>
                              <dd className="break-all text-right text-[#405663]">
                                {val}
                              </dd>
                            </div>
                          )
                        )}
                      </dl>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#DC2626]/35 bg-[#FEE2E2]/55 p-3.5">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-[#991B1B]">
                      {t("sync.cpsatVerdict")}: {solverStatus}
                    </h3>
                    {musConflicts.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-[#7F1D1D]">
                        {musConflicts.map((m, idx) => (
                          <li key={idx}>
                            <strong>
                              [{String(m.code ?? "CONFLICT")}]{" "}
                              {String(m.label ?? "")}
                            </strong>{" "}
                            — {String(m.detail ?? "")}
                          </li>
                        ))}
                      </ul>
                    )}
                    {safeRelaxations.length > 0 && (
                      <ul className="mt-2 space-y-1 border-t border-[#FECACA] pt-2 text-xs text-[#78350F]">
                        {safeRelaxations.map((rel, idx) => (
                          <li key={idx}>
                            <strong>{String(rel.action ?? "")}</strong>:{" "}
                            {String(rel.rationale ?? "")}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <label
                        htmlFor={`merged-allergies-${c.id}`}
                        className="block text-xs font-semibold text-[#405663]"
                      >
                        {t("sync.mergedAllergiesLabel")}
                      </label>
                      <input
                        id={`merged-allergies-${c.id}`}
                        type="text"
                        disabled={isReadOnlyAuditor}
                        value={mergedAllergiesById[c.id] ?? ""}
                        onChange={(e) =>
                          setMergedAllergiesById((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-xs text-[#172A33] disabled:bg-[#EDF3F5]"
                      />
                    </div>

                    <div className="min-w-0">
                      <label
                        htmlFor={`conflict-notes-${c.id}`}
                        className="block text-xs font-semibold text-[#405663]"
                      >
                        {t("sync.resolutionNotesLabel")}
                      </label>
                      <input
                        id={`conflict-notes-${c.id}`}
                        type="text"
                        disabled={isReadOnlyAuditor}
                        value={notesById[c.id] ?? ""}
                        onChange={(e) =>
                          setNotesById((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                        placeholder={t("sync.resolutionNotesPlaceholder")}
                        className="mt-1 w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-xs text-[#172A33] placeholder:text-[#5C727E] disabled:bg-[#EDF3F5]"
                      />
                    </div>
                  </div>

                  {!isReadOnlyAuditor && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleResolve(c, "RESOLVED_MERGED")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#115E59] disabled:opacity-60"
                      >
                        <GitMerge aria-hidden="true" className="h-3.5 w-3.5" />
                        <span>{t("sync.resolveMergedBtn")}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleResolve(c, "RESOLVED_SERVER")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#0284C7]/45 bg-[#E0F2FE] px-3.5 py-2 text-xs font-semibold text-[#075985] hover:bg-[#BAE6FD] disabled:opacity-60"
                      >
                        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                        <span>{t("sync.resolveServerBtn")}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleResolve(c, "RESOLVED_CLIENT")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3.5 py-2 text-xs font-semibold text-[#405663] hover:bg-[#EDF3F5] disabled:opacity-60"
                      >
                        <span>{t("sync.resolveClientBtn")}</span>
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {resolvedConflicts.length > 0 && (
          <div className="border-t border-[#DCE6E9] pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#536975]">
              Resolved Conflicts ({resolvedConflicts.length})
            </h3>
            <ul className="mt-2 space-y-2 text-xs">
              {resolvedConflicts.map((rc) => (
                <li
                  key={rc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] px-3 py-2"
                >
                  <span className="font-medium text-[#172A33]">
                    {rc.entity_type} · {rc.entity_id} — {rc.resolution_notes ?? ""}
                  </span>
                  <StatusBadge variant={rc.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section
        aria-label={t("sync.queueTitle")}
        className="mac-card p-5"
      >
        <h2 className="text-base font-bold text-[#172A33]">
          {t("sync.queueTitle")}
        </h2>

        <div className="mt-4 overflow-x-auto">
          {mutations.length === 0 ? (
            <p className="py-4 text-sm text-[#536975]">{t("sync.emptyQueue")}</p>
          ) : (
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#DCE6E9] bg-[#F3F7F8] text-[#405663]">
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("sync.colEntity")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("sync.colMutation")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("sync.colBaseVersion")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("sync.colStatus")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("sync.colError")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE6E9]">
                {mutations.map((m) => (
                  <tr key={m.id} className="hover:bg-[#F3F7F8]">
                    <td className="px-3 py-2.5 font-medium text-[#172A33]">
                      {m.entity_type} · {m.entity_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2.5 text-[#405663]">
                      {m.mutation_type}
                    </td>
                    <td className="px-3 py-2.5 text-[#405663]">
                      v{m.base_version}
                    </td>
                    <td className="px-3 py-2.5">
                      {m.status === "conflict" ? (
                        <StatusBadge variant="CONFLICT" />
                      ) : m.status === "synced" ? (
                        <StatusBadge variant="SYNCED" />
                      ) : (
                        <span className="inline-flex rounded-full border border-[#D97706]/50 bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-semibold text-[#92400E]">
                          {m.status.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[#536975]">
                      {m.last_error ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

export default function SyncPage() {
  const { t } = useI18n();
  return (
    <AuthGuard pageTitle={t("sync.title")}>
      {(user) => <SyncContent user={user} />}
    </AuthGuard>
  );
}
