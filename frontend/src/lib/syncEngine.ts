import {
  getDb,
  type BatchRecord,
  type CatalogDrugRecord,
  type ConflictRecord,
  type ConflictResolutionStatus,
  type DispenseRecord,
  type GuidelineRecord,
  type PatientRecord,
  type SyncEntityType,
  type SyncMutationRecord,
  type SyncMutationType,
} from "@/db/dexie";
import {
  getSyncBootstrap,
  pushSyncMutation,
  resolveSyncConflict,
  SyncConflictApiError,
} from "@/lib/api";

export interface SyncStore {
  getPatient(id: string): Promise<PatientRecord | undefined>;
  putPatient(patient: PatientRecord): Promise<void>;
  bulkPutPatients(patients: PatientRecord[]): Promise<void>;
  bulkPutBatches(batches: BatchRecord[]): Promise<void>;
  bulkPutGuidelines(guidelines: GuidelineRecord[]): Promise<void>;
  bulkPutCatalog(catalog: CatalogDrugRecord[]): Promise<void>;
  bulkPutDispenses(dispenses: DispenseRecord[]): Promise<void>;
  putMutation(mutation: SyncMutationRecord): Promise<void>;
  getMutation(id: string): Promise<SyncMutationRecord | undefined>;
  listPendingMutations(clinicId?: string): Promise<SyncMutationRecord[]>;
  listSyncingMutations?(clinicId?: string): Promise<SyncMutationRecord[]>;
  listConflictMutations(clinicId?: string): Promise<SyncMutationRecord[]>;
  putConflict(conflict: ConflictRecord): Promise<void>;
  getConflict(id: string): Promise<ConflictRecord | undefined>;
  bulkPutConflicts(conflicts: ConflictRecord[]): Promise<void>;
  listOpenConflicts(clinicId?: string): Promise<ConflictRecord[]>;
  runTransaction<T>(fn: () => Promise<T>): Promise<T>;
}

export interface SyncApiAdapter {
  pushMutation(
    req: {
      client_mutation_id: string;
      entity_type: SyncEntityType;
      entity_id: string;
      base_version: number;
      payload: Record<string, unknown>;
    },
    idempotencyKey: string
  ): Promise<{
    status: string;
    client_mutation_id: string;
    entity_type: SyncEntityType;
    entity_id: string;
    new_version?: number;
    entity_snapshot?: Record<string, unknown>;
  }>;
  resolveConflict(
    conflictId: string,
    input: {
      resolution: Exclude<ConflictResolutionStatus, "OPEN">;
      notes?: string;
      merged_payload?: Record<string, unknown>;
    }
  ): Promise<{
    id?: string;
    status: ConflictResolutionStatus;
    entity_snapshot?: Record<string, unknown>;
    cpsat_verdict?: Record<string, unknown>;
  }>;
  getBootstrap(): Promise<{
    patients: PatientRecord[];
    batches: BatchRecord[];
    guidelines: GuidelineRecord[];
    catalog: CatalogDrugRecord[];
    dispenses: DispenseRecord[];
    conflicts: ConflictRecord[];
  }>;
}

export interface SyncDependencies {
  store?: SyncStore;
  api?: SyncApiAdapter;
  clinicId?: string;
  now?: () => string;
}

export interface SyncRunSummary {
  syncedCount: number;
  conflictCount: number;
  failedCount: number;
  remainingPending: number;
}

export function emitSyncUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("awaregrid:sync-updated"));
  }
}

export function createDexieSyncStore(): SyncStore {
  return {
    async getPatient(id) {
      return getDb().patients.get(id);
    },
    async putPatient(patient) {
      await getDb().patients.put(patient);
    },
    async bulkPutPatients(patients) {
      if (patients.length > 0) await getDb().patients.bulkPut(patients);
    },
    async bulkPutBatches(batches) {
      if (batches.length > 0) await getDb().batches.bulkPut(batches);
    },
    async bulkPutGuidelines(guidelines) {
      if (guidelines.length > 0) await getDb().guidelines.bulkPut(guidelines);
    },
    async bulkPutCatalog(catalog) {
      if (catalog.length > 0) await getDb().catalog.bulkPut(catalog);
    },
    async bulkPutDispenses(dispenses) {
      if (dispenses.length > 0) await getDb().dispenses.bulkPut(dispenses);
    },
    async putMutation(mutation) {
      await getDb().syncMutations.put(mutation);
    },
    async getMutation(id) {
      return getDb().syncMutations.get(id);
    },
    async listPendingMutations(clinicId) {
      const rows = await getDb()
        .syncMutations.where("status")
        .equals("pending")
        .toArray();
      const filtered = clinicId
        ? rows.filter((r) => r.clinic_id === clinicId)
        : rows;
      return filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async listSyncingMutations(clinicId) {
      const rows = await getDb()
        .syncMutations.where("status")
        .equals("syncing")
        .toArray();
      const filtered = clinicId
        ? rows.filter((r) => r.clinic_id === clinicId)
        : rows;
      return filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async listConflictMutations(clinicId) {
      const rows = await getDb()
        .syncMutations.where("status")
        .equals("conflict")
        .toArray();
      return clinicId ? rows.filter((r) => r.clinic_id === clinicId) : rows;
    },
    async putConflict(conflict) {
      await getDb().conflicts.put(conflict);
    },
    async getConflict(id) {
      return getDb().conflicts.get(id);
    },
    async bulkPutConflicts(conflicts) {
      if (conflicts.length > 0) await getDb().conflicts.bulkPut(conflicts);
    },
    async listOpenConflicts(clinicId) {
      const rows = await getDb()
        .conflicts.where("status")
        .equals("OPEN")
        .toArray();
      const filtered = clinicId
        ? rows.filter((r) => r.clinic_id === clinicId)
        : rows;
      return filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async runTransaction<T>(fn: () => Promise<T>): Promise<T> {
      const database = getDb();
      return database.transaction(
        "rw",
        [
          database.patients,
          database.batches,
          database.guidelines,
          database.catalog,
          database.dispenses,
          database.syncMutations,
          database.conflicts,
        ],
        fn
      );
    },
  };
}

function getDefaultApiAdapter(): SyncApiAdapter {
  return {
    pushMutation: pushSyncMutation,
    resolveConflict: resolveSyncConflict,
    getBootstrap: getSyncBootstrap,
  };
}

function resolveDeps(deps?: SyncDependencies): {
  store: SyncStore;
  api: SyncApiAdapter;
  clinicId?: string;
  now: () => string;
} {
  return {
    store: deps?.store ?? createDexieSyncStore(),
    api: deps?.api ?? getDefaultApiAdapter(),
    clinicId: deps?.clinicId,
    now: deps?.now ?? (() => new Date().toISOString()),
  };
}

export async function enqueuePatientCreate(
  input: Omit<PatientRecord, "version" | "created_at" | "updated_at" | "_dirty"> & {
    id?: string;
  },
  deps?: SyncDependencies
): Promise<{ patient: PatientRecord; mutation: SyncMutationRecord }> {
  const { store, now } = resolveDeps(deps);
  const ts = now();
  const id = input.id ?? crypto.randomUUID();
  const patient: PatientRecord = {
    ...input,
    id,
    version: 1,
    created_at: ts,
    updated_at: ts,
    _dirty: true,
  };
  const mutation: SyncMutationRecord = {
    id: crypto.randomUUID(),
    clinic_id: patient.clinic_id,
    entity_type: "PATIENT",
    entity_id: id,
    mutation_type: "CREATE",
    base_version: 0,
    idempotency_key: crypto.randomUUID(),
    payload: {
      id: patient.id,
      mrn: patient.mrn,
      full_name: patient.full_name,
      age_years: patient.age_years,
      weight_kg: patient.weight_kg,
      sex: patient.sex,
      is_pregnant: patient.is_pregnant,
      egfr: patient.egfr,
      allergies: patient.allergies,
    },
    status: "pending",
    retry_count: 0,
    last_error: null,
    created_at: ts,
    synced_at: null,
  };

  await store.runTransaction(async () => {
    await store.putPatient(patient);
    await store.putMutation(mutation);
  });
  emitSyncUpdated();
  return { patient, mutation };
}

export async function enqueuePatientUpdate(
  patient: PatientRecord,
  patch: Partial<
    Pick<
      PatientRecord,
      "full_name" | "age_years" | "weight_kg" | "sex" | "is_pregnant" | "egfr" | "allergies"
    >
  >,
  deps?: SyncDependencies
): Promise<{ patient: PatientRecord; mutation: SyncMutationRecord }> {
  const { store, now } = resolveDeps(deps);
  const ts = now();

  const updatedPatient: PatientRecord = {
    ...patient,
    ...patch,
    version: patient.version,
    updated_at: ts,
    _dirty: true,
  };

  const mutation: SyncMutationRecord = {
    id: crypto.randomUUID(),
    clinic_id: patient.clinic_id,
    entity_type: "PATIENT",
    entity_id: patient.id,
    mutation_type: "UPDATE",
    base_version: patient.version,
    idempotency_key: crypto.randomUUID(),
    payload: { ...patch },
    status: "pending",
    retry_count: 0,
    last_error: null,
    created_at: ts,
    synced_at: null,
  };

  await store.runTransaction(async () => {
    await store.putPatient(updatedPatient);
    await store.putMutation(mutation);
  });
  emitSyncUpdated();
  return { patient: updatedPatient, mutation };
}

export async function enqueueDispenseMutation(
  params: {
    clinicId: string;
    entityId: string;
    mutationType: SyncMutationType;
    baseVersion: number;
    payload: Record<string, unknown>;
  },
  deps?: SyncDependencies
): Promise<SyncMutationRecord> {
  const { store, now } = resolveDeps(deps);
  const mutation: SyncMutationRecord = {
    id: crypto.randomUUID(),
    clinic_id: params.clinicId,
    entity_type: "DISPENSE",
    entity_id: params.entityId,
    mutation_type: params.mutationType,
    base_version: params.baseVersion,
    idempotency_key: crypto.randomUUID(),
    payload: params.payload,
    status: "pending",
    retry_count: 0,
    last_error: null,
    created_at: now(),
    synced_at: null,
  };
  await store.putMutation(mutation);
  emitSyncUpdated();
  return mutation;
}

function isConflictError(err: unknown): err is SyncConflictApiError {
  if (err instanceof SyncConflictApiError) return true;
  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    (err as { status?: unknown }).status === 409
  ) {
    return true;
  }
  return false;
}

function parseFiniteNumberValue(val: unknown): number | undefined {
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : undefined;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function extractSnapshotPatch(
  snapshot: Record<string, unknown> | undefined
): Partial<PatientRecord> {
  if (!snapshot) return {};
  const patch: Partial<PatientRecord> = {};
  if (typeof snapshot.full_name === "string") patch.full_name = snapshot.full_name;
  const ageYears = parseFiniteNumberValue(snapshot.age_years);
  if (ageYears !== undefined) patch.age_years = ageYears;
  const weightKg = parseFiniteNumberValue(snapshot.weight_kg);
  if (weightKg !== undefined) patch.weight_kg = weightKg;
  if (snapshot.sex === "M" || snapshot.sex === "F" || snapshot.sex === "O") {
    patch.sex = snapshot.sex;
  }
  if (typeof snapshot.is_pregnant === "boolean") {
    patch.is_pregnant = snapshot.is_pregnant;
  }
  if (snapshot.egfr === null) {
    patch.egfr = null;
  } else {
    const egfr = parseFiniteNumberValue(snapshot.egfr);
    if (egfr !== undefined) patch.egfr = egfr;
  }
  if (Array.isArray(snapshot.allergies)) {
    patch.allergies = snapshot.allergies.filter(
      (x): x is string => typeof x === "string"
    );
  }
  const version = parseFiniteNumberValue(snapshot.version);
  if (version !== undefined) patch.version = Math.trunc(version);
  if (typeof snapshot.updated_at === "string") {
    patch.updated_at = snapshot.updated_at;
  }
  return patch;
}

const defaultSyncFlights = new Map<string, Promise<SyncRunSummary>>();
const storeSyncFlights = new WeakMap<
  SyncStore,
  Map<string, Promise<SyncRunSummary>>
>();

export async function syncPendingMutations(
  deps?: SyncDependencies
): Promise<SyncRunSummary> {
  const scopeKey = deps?.clinicId ?? "__all__";
  let flightMap: Map<string, Promise<SyncRunSummary>>;
  if (deps?.store) {
    let existingMap = storeSyncFlights.get(deps.store);
    if (!existingMap) {
      existingMap = new Map();
      storeSyncFlights.set(deps.store, existingMap);
    }
    flightMap = existingMap;
  } else {
    flightMap = defaultSyncFlights;
  }

  const allFlight = flightMap.get("__all__");
  if (allFlight) {
    return allFlight;
  }

  const existingFlight = flightMap.get(scopeKey);
  if (existingFlight) {
    return existingFlight;
  }

  const priorFlights =
    scopeKey === "__all__" && flightMap.size > 0
      ? Array.from(flightMap.values())
      : [];

  const runPromise = (async () => {
    if (priorFlights.length > 0) {
      await Promise.allSettled(priorFlights);
    }
    return runSyncPendingMutations(deps);
  })().finally(() => {
    if (flightMap.get(scopeKey) === runPromise) {
      flightMap.delete(scopeKey);
    }
  });
  flightMap.set(scopeKey, runPromise);
  return runPromise;
}

async function runSyncPendingMutations(
  deps?: SyncDependencies
): Promise<SyncRunSummary> {
  const { store, api, clinicId, now } = resolveDeps(deps);

  if (store.listSyncingMutations) {
    const staleSyncing = await store.listSyncingMutations(clinicId);
    if (staleSyncing.length > 0) {
      await store.runTransaction(async () => {
        for (const m of staleSyncing) {
          await store.putMutation({
            ...m,
            status: "pending",
          });
        }
      });
    }
  }

  const [pending, existingConflicts, existingConflictMutations] =
    await Promise.all([
      store.listPendingMutations(clinicId),
      store.listOpenConflicts(clinicId),
      store.listConflictMutations(clinicId),
    ]);

  const blockedEntities = new Set<string>();
  for (const c of existingConflicts) {
    blockedEntities.add(c.entity_id);
  }
  for (const m of existingConflictMutations) {
    blockedEntities.add(m.entity_id);
  }

  let syncedCount = 0;
  let conflictCount = 0;
  let failedCount = 0;

  for (let i = 0; i < pending.length; i += 1) {
    const mutation = pending[i];
    if (blockedEntities.has(mutation.entity_id)) {
      continue;
    }

    await store.putMutation({
      ...mutation,
      status: "syncing",
    });

    try {
      const response = await api.pushMutation(
        {
          client_mutation_id: mutation.id,
          entity_type: mutation.entity_type,
          entity_id: mutation.entity_id,
          base_version: mutation.base_version,
          payload: mutation.payload,
        },
        mutation.idempotency_key
      );

      const syncedAt = now();
      let rebasedVersionForPending: number | undefined;
      let rebasedIds = new Set<string>();

      await store.runTransaction(async () => {
        rebasedVersionForPending = undefined;
        rebasedIds = new Set<string>();

        await store.putMutation({
          ...mutation,
          status: "synced",
          last_error: null,
          synced_at: syncedAt,
        });

        const clinicScope = clinicId ?? (mutation.clinic_id || undefined);
        const [allPending, allSyncing, allConflicts] = await Promise.all([
          store.listPendingMutations(clinicScope),
          store.listSyncingMutations
            ? store.listSyncingMutations(clinicScope)
            : Promise.resolve([]),
          store.listConflictMutations(clinicScope),
        ]);

        const remainingPending = allPending
          .filter(
            (m) => m.entity_id === mutation.entity_id && m.id !== mutation.id
          )
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        const remainingSyncing = allSyncing.filter(
          (m) => m.entity_id === mutation.entity_id && m.id !== mutation.id
        );
        const remainingConflicts = allConflicts.filter(
          (m) => m.entity_id === mutation.entity_id && m.id !== mutation.id
        );
        const hasRemaining =
          remainingPending.length > 0 ||
          remainingSyncing.length > 0 ||
          remainingConflicts.length > 0;

        const snapshotPatch = extractSnapshotPatch(response.entity_snapshot);
        let nextVersion: number | undefined =
          typeof response.new_version === "number"
            ? Math.trunc(response.new_version)
            : snapshotPatch.version;

        if (mutation.entity_type === "PATIENT") {
          const existing = await store.getPatient(mutation.entity_id);
          if (existing) {
            const patientVersion =
              nextVersion ??
              (mutation.mutation_type === "CREATE"
                ? existing.version
                : existing.version + 1);
            nextVersion = patientVersion;

            let nextPatient: PatientRecord = {
              ...existing,
              ...snapshotPatch,
              version: patientVersion,
              _dirty: hasRemaining,
            };

            for (const pendingMut of remainingPending) {
              if (pendingMut.entity_type === "PATIENT") {
                const deltaPatch = extractSnapshotPatch(pendingMut.payload);
                nextPatient = {
                  ...nextPatient,
                  ...deltaPatch,
                  version: patientVersion,
                  _dirty: true,
                };
              }
            }

            await store.putPatient(nextPatient);
          }
        }

        if (nextVersion !== undefined && remainingPending.length > 0) {
          for (const pendingMut of remainingPending) {
            if (pendingMut.base_version !== nextVersion) {
              await store.putMutation({
                ...pendingMut,
                base_version: nextVersion,
              });
              rebasedIds.add(pendingMut.id);
            }
          }
          if (rebasedIds.size > 0) {
            rebasedVersionForPending = nextVersion;
          }
        }
      });

      if (rebasedVersionForPending !== undefined && rebasedIds.size > 0) {
        for (let j = i + 1; j < pending.length; j += 1) {
          if (rebasedIds.has(pending[j].id)) {
            pending[j] = {
              ...pending[j],
              base_version: rebasedVersionForPending,
            };
          }
        }
      }

      syncedCount += 1;
    } catch (err) {
      const ts = now();
      if (isConflictError(err)) {
        const conflictErr = err as {
          conflict_id?: string;
          server_snapshot?: Record<string, unknown>;
          client_snapshot?: Record<string, unknown>;
          cpsat_verdict?: Record<string, unknown>;
          message?: string;
        };

        const conflictRecord: ConflictRecord = {
          id: conflictErr.conflict_id || crypto.randomUUID(),
          clinic_id: mutation.clinic_id,
          mutation_id: mutation.id,
          entity_type: mutation.entity_type,
          entity_id: mutation.entity_id,
          server_snapshot: conflictErr.server_snapshot ?? {},
          client_snapshot:
            Object.keys(conflictErr.client_snapshot ?? {}).length > 0
              ? (conflictErr.client_snapshot ?? {})
              : mutation.payload,
          cpsat_verdict: conflictErr.cpsat_verdict ?? {},
          status: "OPEN",
          resolution_notes: null,
          created_at: ts,
          resolved_at: null,
        };

        await store.runTransaction(async () => {
          await store.putConflict(conflictRecord);
          await store.putMutation({
            ...mutation,
            status: "conflict",
            last_error:
              conflictErr.message ?? "Version conflict (HTTP 409)",
          });
        });

        blockedEntities.add(mutation.entity_id);
        conflictCount += 1;
      } else {
        const message =
          err instanceof Error ? err.message : "Transient sync failure";
        await store.putMutation({
          ...mutation,
          status: "pending",
          retry_count: mutation.retry_count + 1,
          last_error: message,
        });
        blockedEntities.add(mutation.entity_id);
        failedCount += 1;
      }
    }
  }

  const remaining = await store.listPendingMutations(clinicId);
  emitSyncUpdated();

  return {
    syncedCount,
    conflictCount,
    failedCount,
    remainingPending: remaining.length,
  };
}

export async function resolveConflict(
  conflictId: string,
  input: {
    resolution: Exclude<ConflictResolutionStatus, "OPEN">;
    notes?: string;
    merged_payload?: Record<string, unknown>;
  },
  deps?: SyncDependencies
): Promise<ConflictRecord | null> {
  const { store, api, clinicId, now } = resolveDeps(deps);
  const existing = await store.getConflict(conflictId);
  if (!existing) {
    throw new Error(`Conflict ${conflictId} not found in local store`);
  }

  const result = await api.resolveConflict(conflictId, input);
  const resolvedAt = now();

  const updatedConflict: ConflictRecord = {
    ...existing,
    status: result.status || input.resolution,
    resolution_notes: input.notes ?? existing.resolution_notes,
    cpsat_verdict: result.cpsat_verdict ?? existing.cpsat_verdict,
    resolved_at: resolvedAt,
  };

  await store.runTransaction(async () => {
    await store.putConflict(updatedConflict);
    if (existing.mutation_id) {
      const mut = await store.getMutation(existing.mutation_id);
      if (mut) {
        await store.putMutation({
          ...mut,
          status: "synced",
          last_error: null,
          synced_at: resolvedAt,
        });
      }
    }

    const clinicScope = clinicId ?? (existing.clinic_id || undefined);
    const [allPending, allSyncing, allConflicts] = await Promise.all([
      store.listPendingMutations(clinicScope),
      store.listSyncingMutations
        ? store.listSyncingMutations(clinicScope)
        : Promise.resolve([]),
      store.listConflictMutations(clinicScope),
    ]);

    const remainingPending = allPending.filter(
      (m) => m.entity_id === existing.entity_id && m.id !== existing.mutation_id
    );
    const remainingSyncing = allSyncing.filter(
      (m) => m.entity_id === existing.entity_id && m.id !== existing.mutation_id
    );
    const remainingConflicts = allConflicts.filter(
      (m) => m.entity_id === existing.entity_id && m.id !== existing.mutation_id
    );
    const hasRemaining =
      remainingPending.length > 0 ||
      remainingSyncing.length > 0 ||
      remainingConflicts.length > 0;

    let resolvedVersion = parseFiniteNumberValue(
      result.entity_snapshot?.version
    );

    if (existing.entity_type === "PATIENT") {
      const patient = await store.getPatient(existing.entity_id);
      if (patient) {
        const fallbackSnapshot =
          input.resolution === "RESOLVED_SERVER"
            ? existing.server_snapshot
            : input.resolution === "RESOLVED_CLIENT"
            ? existing.client_snapshot
            : {
                ...existing.server_snapshot,
                ...existing.client_snapshot,
                ...(input.merged_payload ?? {}),
              };

        const effectiveSnapshot =
          result.entity_snapshot &&
          Object.keys(result.entity_snapshot).length > 0
            ? result.entity_snapshot
            : fallbackSnapshot;

        const patch = extractSnapshotPatch(effectiveSnapshot);
        if (resolvedVersion === undefined) {
          resolvedVersion = patch.version ?? patient.version;
        } else {
          resolvedVersion = Math.trunc(resolvedVersion);
        }

        let nextPatient: PatientRecord = {
          ...patient,
          ...patch,
          version: resolvedVersion,
          _dirty: hasRemaining,
        };

        if (remainingPending.length > 0) {
          for (const pendingMut of remainingPending) {
            if (pendingMut.entity_type === "PATIENT") {
              const deltaPatch = extractSnapshotPatch(pendingMut.payload);
              nextPatient = {
                ...nextPatient,
                ...deltaPatch,
                version: resolvedVersion,
                _dirty: true,
              };
            }
          }
        }

        await store.putPatient(nextPatient);
      }
    }

    if (resolvedVersion !== undefined && remainingPending.length > 0) {
      const targetBaseVersion = Math.trunc(resolvedVersion);
      for (const pendingMut of remainingPending) {
        if (pendingMut.base_version !== targetBaseVersion) {
          await store.putMutation({
            ...pendingMut,
            base_version: targetBaseVersion,
          });
        }
      }
    }
  });

  emitSyncUpdated();
  return updatedConflict;
}

export async function bootstrapClinicState(
  deps?: SyncDependencies
): Promise<void> {
  const { store, api, clinicId } = resolveDeps(deps);
  const snapshot = await api.getBootstrap();

  const [pending, syncing, conflicts] = await Promise.all([
    store.listPendingMutations(clinicId),
    store.listSyncingMutations
      ? store.listSyncingMutations(clinicId)
      : Promise.resolve([]),
    store.listConflictMutations(clinicId),
  ]);
  const dirtyEntityIds = new Set<string>();
  for (const m of pending) dirtyEntityIds.add(m.entity_id);
  for (const m of syncing) dirtyEntityIds.add(m.entity_id);
  for (const m of conflicts) dirtyEntityIds.add(m.entity_id);

  const safePatients: PatientRecord[] = [];
  for (const serverPatient of snapshot.patients) {
    if (dirtyEntityIds.has(serverPatient.id)) {
      const local = await store.getPatient(serverPatient.id);
      if (local?._dirty) {
        continue;
      }
    }
    safePatients.push({ ...serverPatient, _dirty: false });
  }

  await store.runTransaction(async () => {
    await store.bulkPutPatients(safePatients);
    await store.bulkPutBatches(snapshot.batches);
    await store.bulkPutGuidelines(snapshot.guidelines);
    await store.bulkPutCatalog(snapshot.catalog);
    await store.bulkPutDispenses(snapshot.dispenses);
    await store.bulkPutConflicts(snapshot.conflicts);
  });

  emitSyncUpdated();
}

export async function getSyncQueueSummary(clinicId?: string): Promise<{
  pendingCount: number;
  conflictMutationCount: number;
  openConflictCount: number;
}> {
  if (typeof window === "undefined") {
    return { pendingCount: 0, conflictMutationCount: 0, openConflictCount: 0 };
  }
  const database = getDb();
  const [pending, syncing, conflictMuts, openConflicts] = await Promise.all([
    database.syncMutations.where("status").equals("pending").toArray(),
    database.syncMutations.where("status").equals("syncing").toArray(),
    database.syncMutations.where("status").equals("conflict").toArray(),
    database.conflicts.where("status").equals("OPEN").toArray(),
  ]);

  const filterClinic = <T extends { clinic_id: string }>(arr: T[]) =>
    clinicId ? arr.filter((item) => item.clinic_id === clinicId) : arr;

  return {
    pendingCount: filterClinic(pending).length + filterClinic(syncing).length,
    conflictMutationCount: filterClinic(conflictMuts).length,
    openConflictCount: filterClinic(openConflicts).length,
  };
}
