import { z } from "zod";
import {
  clearStoredSession,
  getStoredAccessToken,
  setStoredSession,
  type AwareCategory,
  type AwareVerdictCategory,
  type ConflictResolutionStatus,
  type DispenseStatus,
  type SessionUser,
  type Severity,
  type Sex,
  type SyncEntityType,
  type UserRole,
} from "@/db/dexie";

export function getApiBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  return configured.replace(/\/+$/, "");
}

export const UserRoleSchema = z.enum([
  "dispenser",
  "pharmacist",
  "auditor",
  "admin",
  "dispatcher",
  "hospital_admin",
  "blood_bank_officer",
]);

export const SexSchema = z.enum(["M", "F", "O"]);
export const SeveritySchema = z.enum(["MILD", "MODERATE", "SEVERE"]);
export const AwareCategorySchema = z.enum(["ACCESS", "WATCH", "RESERVE"]);
export const AwareVerdictCategorySchema = z.enum([
  "ACCESS",
  "WATCH",
  "RESERVE",
  "NO_ANTIBIOTIC",
]);
export const DispenseStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "DISPENSED",
  "REJECTED",
  "VOIDED",
]);

export const SessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  full_name: z.string(),
  role: UserRoleSchema,
  clinic_id: z.string(),
  clinic_name: z.string(),
  facility_id: z.string().nullable().optional(),
});

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string().default("bearer"),
  user: SessionUserSchema,
});

export const VerifyPinResponseSchema = z.object({
  verified: z.boolean(),
});

export const HealthResponseSchema = z.object({
  status: z.string(),
  db: z.string().optional(),
  redis: z.string().optional(),
});

export const finiteNumber = z
  .union([z.number(), z.string()])
  .transform((val, ctx) => {
    if (typeof val === "number") {
      if (!Number.isFinite(val)) {
        ctx.addIssue({ code: "custom", message: "Expected finite number" });
        return z.NEVER;
      }
      return val;
    }
    const trimmed = val.trim();
    if (trimmed.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Expected non-empty numeric string",
      });
      return z.NEVER;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({
        code: "custom",
        message: "Expected finite numeric string",
      });
      return z.NEVER;
    }
    return parsed;
  });

export const nullableFiniteNumber = z.union([finiteNumber, z.null()]);

export const ApiErrorEnvelopeSchema = z.object({
  error_code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).nullish(),
  trace_id: z.string().nullish(),
});

export const Conflict409PayloadSchema = z.object({
  error_code: z.string().nullish(),
  message: z.string().nullish(),
  conflict_id: z.string().nullish(),
  server_snapshot: z.record(z.string(), z.unknown()).nullish(),
  client_snapshot: z.record(z.string(), z.unknown()).nullish(),
  cpsat_verdict: z.record(z.string(), z.unknown()).nullish(),
  details: z.record(z.string(), z.unknown()).nullish(),
  trace_id: z.string().nullish(),
});

export const PatientSchema = z.object({
  id: z.string(),
  clinic_id: z.string(),
  mrn: z.string(),
  full_name: z.string(),
  age_years: finiteNumber,
  weight_kg: finiteNumber,
  sex: SexSchema,
  is_pregnant: z.boolean(),
  egfr: nullableFiniteNumber.default(null),
  allergies: z.array(z.string()).default([]),
  version: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const BatchSchema = z.object({
  id: z.string(),
  clinic_id: z.string(),
  antibiotic_id: z.string(),
  drug_code: z.string(),
  generic_name: z.string(),
  generic_name_bn: z.string().default(""),
  drug_class: z.string(),
  aware_category: AwareCategorySchema,
  aware_tier_cost: finiteNumber.transform(
    (v) => (v === 15 ? 15 : v === 120 ? 120 : 1) as 1 | 15 | 120
  ),
  pregnancy_contraindicated: z.boolean(),
  renal_contraindicated_egfr_lt: nullableFiniteNumber,
  min_age_years: finiteNumber,
  dose_regimen_en: z.string().default(""),
  dose_regimen_bn: z.string().default(""),
  lot_number: z.string(),
  qty_initial: finiteNumber,
  qty_remaining: finiteNumber,
  expiry_date: z.string(),
  unit: z.string().default("tablets"),
  version: z.number().int(),
  updated_at: z.string().default(() => new Date().toISOString()),
});

export const CatalogDrugSchema = z.object({
  id: z.string(),
  drug_code: z.string(),
  generic_name: z.string(),
  generic_name_bn: z.string().default(""),
  drug_class: z.string(),
  aware_category: AwareCategorySchema,
  aware_tier_cost: finiteNumber.transform(
    (v) => (v === 15 ? 15 : v === 120 ? 120 : 1) as 1 | 15 | 120
  ),
  pregnancy_contraindicated: z.boolean(),
  renal_contraindicated_egfr_lt: nullableFiniteNumber,
  min_age_years: finiteNumber,
  dose_regimen_en: z.string().default(""),
  dose_regimen_bn: z.string().default(""),
  is_active: z.boolean().default(true),
});

export const GuidelineSchema = z.object({
  id: z.string(),
  syndrome_code: z.string(),
  syndrome_name_en: z.string(),
  syndrome_name_bn: z.string().default(""),
  severity: SeveritySchema.default("MILD"),
  viral_no_antibiotic_if_mild: z.boolean(),
  first_line_drug_codes: z.array(z.string()).default([]),
  second_line_drug_codes: z.array(z.string()).default([]),
  default_duration_days: z.number().int().default(5),
  guidance_en: z.string().default(""),
  guidance_bn: z.string().default(""),
  source_document: z.string().optional(),
  rule_version: z.string().optional(),
  effective_date: z.string().optional(),
  review_status: z.string().optional(),
});

const stringArrayField = z.preprocess((val) => {
  if (Array.isArray(val)) {
    return val.filter((x): x is string => typeof x === "string");
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    return trimmed
      .split(/\r?\n|;\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string()));

export const MusConflictItemSchema = z.object({
  code: z.string(),
  label: z.string(),
  detail: z.string(),
});

export const SafeRelaxationItemSchema = z.object({
  action: z.enum([
    "SWITCH_TO_SYMPTOMATIC_CARE",
    "ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL",
    "REFER_UPAZILA_STOCK_TRANSFER",
  ]),
  rationale: z.string(),
  candidate_drug: z.string().nullable().default(null),
});

export const CounselingSchema = z.object({
  summary: z.string().nullish().transform((v) => v ?? ""),
  instructions: stringArrayField.default([]),
  red_flags: stringArrayField.default([]),
  model_used: z.string().nullish().transform((v) => v ?? "deterministic-local-template"),
  deidentified: z.boolean().nullish().transform((v) => v ?? true),
  hallucination_guard_passed: z.boolean().nullish().transform((v) => v ?? true),
});

export const OptimizeResponseSchema = z.object({
  solver_status: z.enum(["OPTIMAL", "INFEASIBLE", "NO_ANTIBIOTIC"]),
  recommended_antibiotic: z.record(z.string(), z.unknown()).nullable(),
  recommended_batch: z.record(z.string(), z.unknown()).nullable(),
  aware_category: AwareVerdictCategorySchema,
  mus_conflicts: z.array(MusConflictItemSchema).nullish().transform((v) => v ?? []),
  safe_relaxations: z.array(SafeRelaxationItemSchema).nullish().transform((v) => v ?? []),
  counseling: CounselingSchema,
});

export const VoiceIntakeResponseSchema = z.object({
  syndrome_code: z.string().nullish(),
  severity: SeveritySchema.nullish(),
  allergies: stringArrayField.default([]),
  is_pregnant: z.boolean().nullish(),
  age_years: nullableFiniteNumber.optional(),
  prompt_guard_safe: z.boolean(),
  model_used: z.string(),
  transcript: z.string().nullish(),
});

export const DispenseSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const obj = raw as Record<string, unknown>;
    return {
      ...obj,
      qty: obj.qty ?? obj.qty_dispensed ?? 1,
      aware_category:
        obj.aware_category ?? obj.aware_category_snapshot ?? "NO_ANTIBIOTIC",
    };
  },
  z.object({
    id: z.string(),
    clinic_id: z.string(),
    patient_id: z.string(),
    batch_id: z.string().nullish().transform((v) => v ?? null),
    antibiotic_id: z.string().nullish().transform((v) => v ?? null),
    drug_code: z.string().nullish().transform((v) => v ?? null),
    syndrome_code: z.string(),
    aware_category: AwareVerdictCategorySchema,
    qty: finiteNumber,
    status: DispenseStatusSchema,
    version: z.number().int().nullish().transform((v) => v ?? 1),
    created_at: z.string(),
    updated_at: z
      .string()
      .nullish()
      .transform((v) => v ?? new Date().toISOString()),
    patient_name: z.string().nullish(),
    generic_name: z.string().nullish(),
    lot_number: z.string().nullish(),
    days_supply: nullableFiniteNumber.optional(),
    decision_reason: z.string().nullish(),
    solver_status: z.string().nullish(),
    notes: z.string().nullish(),
  })
);

export const ConflictEventSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const obj = raw as Record<string, unknown>;
    return {
      ...obj,
      status: obj.status ?? obj.resolution_status ?? "OPEN",
      resolution_notes: obj.resolution_notes ?? obj.notes ?? null,
    };
  },
  z.object({
    id: z.string(),
    clinic_id: z.string().nullish().transform((v) => v ?? ""),
    mutation_id: z.string().nullish().transform((v) => v ?? ""),
    entity_type: z
      .enum(["PATIENT", "DISPENSE", "INVENTORY"])
      .nullish()
      .transform((v) => v ?? "PATIENT"),
    entity_id: z.string(),
    server_snapshot: z
      .record(z.string(), z.unknown())
      .nullish()
      .transform((v) => v ?? {}),
    client_snapshot: z
      .record(z.string(), z.unknown())
      .nullish()
      .transform((v) => v ?? {}),
    cpsat_verdict: z
      .record(z.string(), z.unknown())
      .nullish()
      .transform((v) => v ?? {}),
    status: z
      .enum(["OPEN", "RESOLVED_SERVER", "RESOLVED_CLIENT", "RESOLVED_MERGED"])
      .nullish()
      .transform((v) => v ?? "OPEN"),
    resolution_notes: z.string().nullish().transform((v) => v ?? null),
    created_at: z
      .string()
      .nullish()
      .transform((v) => v ?? new Date().toISOString()),
    resolved_at: z.string().nullish().transform((v) => v ?? null),
    resolved_by: z.string().nullish(),
  })
);

export const StewardshipAnalyticsSchema = z.object({
  clinic_id: z.string(),
  clinic_name: z.string(),
  total_dispensed: z.number().int(),
  antibiotic_dispensed: z.number().int(),
  access_count: z.number().int(),
  watch_count: z.number().int(),
  reserve_count: z.number().int(),
  no_antibiotic_count: z.number().int(),
  access_ratio_pct: finiteNumber,
  target_access_pct: finiteNumber.default(60.0),
  meets_who_target: z.boolean(),
  expiring_soon_count: z.number().int(),
  stocked_out_count: z.number().int(),
});

export const SyncBootstrapSchema = z.object({
  patients: z.array(PatientSchema).default([]),
  batches: z.array(BatchSchema).default([]),
  guidelines: z.array(GuidelineSchema).default([]),
  catalog: z.array(CatalogDrugSchema).default([]),
  dispenses: z.array(DispenseSchema).default([]),
  conflicts: z.array(ConflictEventSchema).default([]),
  analytics: StewardshipAnalyticsSchema.nullish(),
});

export const SyncMutationResponseSchema = z.object({
  status: z.string().default("SYNCED"),
  client_mutation_id: z.string(),
  entity_type: z.enum(["PATIENT", "DISPENSE", "INVENTORY"]),
  entity_id: z.string(),
  new_version: z
    .number()
    .int()
    .nullish()
    .transform((v) => v ?? undefined),
  entity_snapshot: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? undefined),
});

export const ResolveConflictResponseSchema = z.object({
  id: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  status: z.enum([
    "OPEN",
    "RESOLVED_SERVER",
    "RESOLVED_CLIENT",
    "RESOLVED_MERGED",
  ]),
  entity_snapshot: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? undefined),
  cpsat_verdict: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? undefined),
});

export const ClinicSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  upazila: z.string().nullish(),
  district: z.string().nullish(),
  target_access_pct: finiteNumber.nullish(),
});

export const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  full_name: z.string(),
  role: UserRoleSchema,
  clinic_id: z.string(),
  clinic_name: z.string().nullish(),
  is_active: z.boolean().nullish(),
  created_at: z.string().nullish(),
});

export const AuditLogSchema = z.object({
  id: z.string(),
  clinic_id: z.string().nullable().optional().default(null),
  actor_user_id: z.string().nullable().optional().default(null),
  actor_role: z.string().nullable().optional().default(null),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.string().nullable().optional().default(null),
  trace_id: z.string(),
  details: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? {}),
  created_at: z.string(),
});

export type Patient = z.infer<typeof PatientSchema>;
export type Batch = z.infer<typeof BatchSchema>;
export type CatalogDrug = z.infer<typeof CatalogDrugSchema>;
export type Guideline = z.infer<typeof GuidelineSchema>;
export type MusConflictItem = z.infer<typeof MusConflictItemSchema>;
export type SafeRelaxationItem = z.infer<typeof SafeRelaxationItemSchema>;
export type Counseling = z.infer<typeof CounselingSchema>;
export type OptimizeResponse = z.infer<typeof OptimizeResponseSchema>;
export type VoiceIntakeResponse = z.infer<typeof VoiceIntakeResponseSchema>;
export type Dispense = z.infer<typeof DispenseSchema>;
export type ConflictEvent = z.infer<typeof ConflictEventSchema>;
export type StewardshipAnalytics = z.infer<typeof StewardshipAnalyticsSchema>;
export type SyncBootstrap = z.infer<typeof SyncBootstrapSchema>;
export type SyncMutationResponse = z.infer<typeof SyncMutationResponseSchema>;
export type ResolveConflictResponse = z.infer<typeof ResolveConflictResponseSchema>;
export type Clinic = z.infer<typeof ClinicSchema>;
export type AdminUser = z.infer<typeof AdminUserSchema>;
export type AuditLog = z.infer<typeof AuditLogSchema>;

export class ApiError extends Error {
  status: number;
  error_code: string;
  details: Record<string, unknown>;
  trace_id: string;

  constructor(params: {
    status: number;
    error_code: string;
    message: string;
    details?: Record<string, unknown>;
    trace_id?: string;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.error_code = params.error_code;
    this.details = params.details ?? {};
    this.trace_id = params.trace_id ?? "";
  }
}

export interface NormalizedConflict409 {
  conflict_id: string;
  server_snapshot: Record<string, unknown>;
  client_snapshot: Record<string, unknown>;
  cpsat_verdict: Record<string, unknown>;
  trace_id: string;
}

export class SyncConflictApiError extends ApiError {
  conflict_id: string;
  server_snapshot: Record<string, unknown>;
  client_snapshot: Record<string, unknown>;
  cpsat_verdict: Record<string, unknown>;

  constructor(
    message: string,
    normalized: NormalizedConflict409,
    details: Record<string, unknown>
  ) {
    super({
      status: 409,
      error_code: "SYNC_VERSION_CONFLICT",
      message,
      details,
      trace_id: normalized.trace_id,
    });
    this.name = "SyncConflictApiError";
    this.conflict_id = normalized.conflict_id;
    this.server_snapshot = normalized.server_snapshot;
    this.client_snapshot = normalized.client_snapshot;
    this.cpsat_verdict = normalized.cpsat_verdict;
  }
}

export function extractConflictPayload(raw: unknown): NormalizedConflict409 {
  const parsed = Conflict409PayloadSchema.safeParse(raw);
  const rawObj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const data = parsed.success ? parsed.data : rawObj;

  const asRecord = (val: unknown): Record<string, unknown> =>
    val && typeof val === "object" && !Array.isArray(val)
      ? (val as Record<string, unknown>)
      : {};

  const pickNonEmptyRecord = (
    primary: unknown,
    fallback: unknown
  ): Record<string, unknown> => {
    const p = asRecord(primary);
    if (Object.keys(p).length > 0) return p;
    const f = asRecord(fallback);
    if (Object.keys(f).length > 0) return f;
    return p;
  };

  const pickNonEmptyString = (
    primary: unknown,
    fallback: unknown
  ): string | null => {
    if (typeof primary === "string" && primary.trim().length > 0) {
      return primary;
    }
    if (typeof fallback === "string" && fallback.trim().length > 0) {
      return fallback;
    }
    return null;
  };

  const details = asRecord(data.details);

  const conflict_id =
    pickNonEmptyString(data.conflict_id, details.conflict_id) ??
    crypto.randomUUID();

  const server_snapshot = pickNonEmptyRecord(
    data.server_snapshot,
    details.server_snapshot
  );
  const client_snapshot = pickNonEmptyRecord(
    data.client_snapshot,
    details.client_snapshot
  );
  const cpsat_verdict = pickNonEmptyRecord(
    data.cpsat_verdict,
    details.cpsat_verdict
  );
  const trace_id =
    pickNonEmptyString(data.trace_id, details.trace_id) ?? "";

  return {
    conflict_id,
    server_snapshot,
    client_snapshot,
    cpsat_verdict,
    trace_id,
  };
}

export function getAccessToken(): string | null {
  return getStoredAccessToken();
}

export function setAccessToken(token: string, user: SessionUser): void {
  setStoredSession(token, user);
}

export function clearSession(): void {
  clearStoredSession();
}

interface RequestOptions<T> {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  schema: z.ZodType<T>;
  auth?: boolean;
  isSyncMutation?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions<T>
): Promise<T> {
  const {
    method = "GET",
    body,
    idempotencyKey,
    schema,
    auth = true,
    isSyncMutation = false,
  } = options;

  const headers = new Headers();
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;
  if (!isFormData && body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : isFormData
        ? (body as FormData)
        : JSON.stringify(body),
  });

  let rawJson: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      rawJson = JSON.parse(text);
    } catch {
      rawJson = {
        error_code: "INVALID_JSON_RESPONSE",
        message: text.slice(0, 200),
      };
    }
  }

  if (!res.ok) {
    if (res.status === 409 && isSyncMutation) {
      const normalized = extractConflictPayload(rawJson);
      const parsed409 = Conflict409PayloadSchema.safeParse(rawJson);
      const rawObj =
        rawJson && typeof rawJson === "object" && !Array.isArray(rawJson)
          ? (rawJson as Record<string, unknown>)
          : {};
      const details =
        (parsed409.success ? parsed409.data.details : undefined) ??
        (rawObj.details &&
        typeof rawObj.details === "object" &&
        !Array.isArray(rawObj.details)
          ? (rawObj.details as Record<string, unknown>)
          : {});
      const rawMsg = parsed409.success ? parsed409.data.message : rawObj.message;
      const msg =
        typeof rawMsg === "string" && rawMsg.trim().length > 0
          ? rawMsg
          : "Version skew detected; CP-SAT safety review required.";
      throw new SyncConflictApiError(msg, normalized, details);
    }

    const parsedErr = ApiErrorEnvelopeSchema.safeParse(rawJson);
    if (parsedErr.success) {
      const details = parsedErr.data.details ?? {};
      const traceId =
        typeof parsedErr.data.trace_id === "string" &&
        parsedErr.data.trace_id.trim().length > 0
          ? parsedErr.data.trace_id
          : typeof details.trace_id === "string"
          ? details.trace_id
          : "";
      throw new ApiError({
        status: res.status,
        error_code: parsedErr.data.error_code,
        message: parsedErr.data.message,
        details,
        trace_id: traceId,
      });
    }

    throw new ApiError({
      status: res.status,
      error_code: `HTTP_${res.status}`,
      message: `Request failed with status ${res.status}`,
      details:
        rawJson && typeof rawJson === "object"
          ? (rawJson as Record<string, unknown>)
          : {},
    });
  }

  const parsedOk = schema.safeParse(rawJson);
  if (!parsedOk.success) {
    const issueSummary = parsedOk.error.issues
      .map((iss) => `${iss.path.join(".") || "root"}: ${iss.message}`)
      .join("; ");
    throw new ApiError({
      status: res.status,
      error_code: "CLIENT_SCHEMA_MISMATCH",
      message: `Unexpected API response shape: ${issueSummary}`,
      details: { issues: parsedOk.error.issues },
    });
  }

  return parsedOk.data;
}

export async function healthCheck() {
  return apiRequest("/healthz", {
    schema: HealthResponseSchema,
    auth: false,
  });
}

export async function login(email: string, password: string) {
  const data = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
    schema: LoginResponseSchema,
    auth: false,
  });
  setAccessToken(data.access_token, data.user);
  return data;
}

export async function verifyPin(email: string, pin: string) {
  return apiRequest("/api/v1/auth/verify-pin", {
    method: "POST",
    body: { email, pin },
    schema: VerifyPinResponseSchema,
    auth: false,
  });
}

export async function getMe() {
  return apiRequest("/api/v1/auth/me", {
    schema: SessionUserSchema,
  });
}

export async function listPatients(q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiRequest(`/api/v1/patients${qs}`, {
    schema: z.array(PatientSchema),
  });
}

export async function createPatient(
  input: {
    id?: string;
    mrn: string;
    full_name: string;
    age_years: number;
    weight_kg: number;
    sex: Sex;
    is_pregnant: boolean;
    egfr: number | null;
    allergies: string[];
  },
  idempotencyKey?: string
) {
  return apiRequest("/api/v1/patients", {
    method: "POST",
    body: input,
    idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
    schema: PatientSchema,
  });
}

export async function getPatient(id: string) {
  return apiRequest(`/api/v1/patients/${encodeURIComponent(id)}`, {
    schema: PatientSchema,
  });
}

export async function patchPatient(
  id: string,
  patch: Partial<{
    full_name: string;
    age_years: number;
    weight_kg: number;
    sex: Sex;
    is_pregnant: boolean;
    egfr: number | null;
    allergies: string[];
    base_version: number;
  }>
) {
  return apiRequest(`/api/v1/patients/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
    schema: PatientSchema,
  });
}

export async function listInventoryBatches(params?: {
  tier?: AwareCategory;
  in_stock?: boolean;
  expiring_soon?: boolean;
  q?: string;
}) {
  const search = new URLSearchParams();
  if (params?.tier) search.set("tier", params.tier);
  if (params?.in_stock !== undefined)
    search.set("in_stock", String(params.in_stock));
  if (params?.expiring_soon !== undefined)
    search.set("expiring_soon", String(params.expiring_soon));
  if (params?.q) search.set("q", params.q);
  const qs = search.toString() ? `?${search.toString()}` : "";
  return apiRequest(`/api/v1/inventory/batches${qs}`, {
    schema: z.array(BatchSchema),
  });
}

export async function createBatch(input: {
  antibiotic_id: string;
  lot_number: string;
  qty_initial: number;
  qty_remaining?: number;
  expiry_date: string;
  unit?: string;
}) {
  return apiRequest("/api/v1/inventory/batches", {
    method: "POST",
    body: input,
    idempotencyKey: crypto.randomUUID(),
    schema: BatchSchema,
  });
}

export async function patchBatch(
  id: string,
  patch: Partial<{
    qty_remaining: number;
    expiry_date: string;
    lot_number: string;
  }>
) {
  return apiRequest(`/api/v1/inventory/batches/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
    schema: BatchSchema,
  });
}

export async function optimizeRegimen(input: {
  patient_id?: string;
  patient_profile?: {
    age_years: number;
    weight_kg: number;
    sex: Sex;
    is_pregnant: boolean;
    egfr: number | null;
    allergies: string[];
  };
  syndrome_code: string;
  severity: Severity;
  max_aware_tier?: AwareCategory;
  language?: "en" | "bn";
}) {
  return apiRequest("/api/v1/optimize", {
    method: "POST",
    body: input,
    schema: OptimizeResponseSchema,
  });
}

export async function voiceIntake(
  input: { transcript: string; language: "en" | "bn" } | FormData
) {
  return apiRequest("/api/v1/voice/intake", {
    method: "POST",
    body: input,
    schema: VoiceIntakeResponseSchema,
  });
}

export async function listDispenses(params?: {
  status?: DispenseStatus;
  aware_category?: AwareVerdictCategory;
}) {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.aware_category)
    search.set("aware_category", params.aware_category);
  const qs = search.toString() ? `?${search.toString()}` : "";
  return apiRequest(`/api/v1/dispenses${qs}`, {
    schema: z.array(DispenseSchema),
  });
}

export async function createDispense(
  input: {
    id?: string;
    patient_id: string;
    batch_id?: string | null;
    antibiotic_id?: string | null;
    syndrome_code: string;
    aware_category: AwareVerdictCategory;
    qty: number;
    notes?: string;
  },
  idempotencyKey?: string
) {
  return apiRequest("/api/v1/dispenses", {
    method: "POST",
    body: input,
    idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
    schema: DispenseSchema,
  });
}

export async function submitDispense(id: string, idempotencyKey?: string) {
  return apiRequest(`/api/v1/dispenses/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
    schema: DispenseSchema,
  });
}

export async function approveDispense(id: string, idempotencyKey?: string) {
  return apiRequest(`/api/v1/dispenses/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
    schema: DispenseSchema,
  });
}

export async function rejectDispense(
  id: string,
  reason?: string,
  idempotencyKey?: string
) {
  return apiRequest(`/api/v1/dispenses/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: reason ? { reason } : {},
    idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
    schema: DispenseSchema,
  });
}

export async function voidDispense(
  id: string,
  reason?: string,
  idempotencyKey?: string
) {
  return apiRequest(`/api/v1/dispenses/${encodeURIComponent(id)}/void`, {
    method: "POST",
    body: reason ? { reason } : {},
    idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
    schema: DispenseSchema,
  });
}

export async function getSyncBootstrap() {
  return apiRequest("/api/v1/sync/bootstrap", {
    schema: SyncBootstrapSchema,
  });
}

export async function pushSyncMutation(
  mutationReq: {
    client_mutation_id: string;
    entity_type: SyncEntityType;
    entity_id: string;
    base_version: number;
    payload: Record<string, unknown>;
  },
  idempotencyKey: string
) {
  return apiRequest("/api/v1/sync/mutations", {
    method: "POST",
    body: mutationReq,
    idempotencyKey,
    schema: SyncMutationResponseSchema,
    isSyncMutation: true,
  });
}

export async function listSyncConflicts() {
  return apiRequest("/api/v1/sync/conflicts", {
    schema: z.array(ConflictEventSchema),
  });
}

export async function resolveSyncConflict(
  id: string,
  input: {
    resolution: Exclude<ConflictResolutionStatus, "OPEN">;
    notes?: string;
    merged_payload?: Record<string, unknown>;
  }
) {
  return apiRequest(`/api/v1/sync/conflicts/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body: input,
    idempotencyKey: crypto.randomUUID(),
    schema: ResolveConflictResponseSchema,
  });
}

export async function getStewardshipAnalytics() {
  return apiRequest("/api/v1/analytics/stewardship", {
    schema: StewardshipAnalyticsSchema,
  });
}

export async function adminListClinics() {
  return apiRequest("/api/v1/admin/clinics", {
    schema: z.array(ClinicSchema),
  });
}

export async function adminListUsers() {
  return apiRequest("/api/v1/admin/users", {
    schema: z.array(AdminUserSchema),
  });
}

export async function adminCreateUser(
  input: {
    email: string;
    full_name: string;
    password: string;
    pin?: string;
    role: UserRole;
    clinic_id?: string;
  },
  idempotencyKey?: string
) {
  return apiRequest("/api/v1/admin/users", {
    method: "POST",
    body: input,
    idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
    schema: AdminUserSchema,
  });
}

export async function adminListAuditLogs(params?: {
  clinic_id?: string;
  action?: string;
  trace_id?: string;
  limit?: number;
  offset?: number;
}) {
  const search = new URLSearchParams();
  if (params?.clinic_id) search.set("clinic_id", params.clinic_id);
  if (params?.action) search.set("action", params.action);
  if (params?.trace_id) search.set("trace_id", params.trace_id);
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.offset !== undefined) search.set("offset", String(params.offset));
  const qs = search.toString() ? `?${search.toString()}` : "";
  return apiRequest(`/api/v1/admin/audit-logs${qs}`, {
    schema: z.array(AuditLogSchema),
  });
}

export async function adminListGuidelines() {
  return apiRequest("/api/v1/admin/guidelines", {
    schema: z.array(GuidelineSchema),
  });
}

export async function adminListCatalog() {
  return apiRequest("/api/v1/admin/catalog", {
    schema: z.array(CatalogDrugSchema),
  });
}

export async function fetchLakehouseNdjson(): Promise<string> {
  const token = getAccessToken();
  const res = await fetch(`${getApiBaseUrl()}/api/v1/analytics/lakehouse-export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new ApiError({
      status: res.status,
      error_code: "LAKEHOUSE_EXPORT_FAILED",
      message: `Export failed (${res.status})`,
    });
  }
  return res.text();
}
