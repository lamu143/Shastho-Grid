import crypto from "node:crypto";
import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export const API_URL =
  process.env.PLAYWRIGHT_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

export type UserRole = "dispenser" | "pharmacist" | "auditor" | "admin";
export type AwareCategory = "ACCESS" | "WATCH" | "RESERVE" | "NO_ANTIBIOTIC";
export type DispenseStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "DISPENSED"
  | "REJECTED"
  | "VOIDED";

export interface DemoAccount {
  email: string;
  password: string;
  pin: string;
  role: UserRole;
  clinicCode: "ASHULIA-01" | "DHAMRAI-01";
  clinicName: string;
}

export const DEMO_ACCOUNTS: Record<string, DemoAccount> = {
  dispenser: {
    email: "dispenser@awaregrid.org",
    password: "Dispenser#2026!",
    pin: "2026",
    role: "dispenser",
    clinicCode: "ASHULIA-01",
    clinicName: "Ashulia Union Sub-Center",
  },
  pharmacist: {
    email: "pharmacist@awaregrid.org",
    password: "Pharmacist#2026!",
    pin: "2026",
    role: "pharmacist",
    clinicCode: "ASHULIA-01",
    clinicName: "Ashulia Union Sub-Center",
  },
  auditor: {
    email: "auditor@awaregrid.org",
    password: "Auditor#2026!",
    pin: "2026",
    role: "auditor",
    clinicCode: "ASHULIA-01",
    clinicName: "Ashulia Union Sub-Center",
  },
  admin: {
    email: "admin@awaregrid.org",
    password: "Admin#2026!",
    pin: "2026",
    role: "admin",
    clinicCode: "ASHULIA-01",
    clinicName: "Ashulia Union Sub-Center",
  },
  dhamraiDispenser: {
    email: "dhamrai.dispenser@awaregrid.org",
    password: "Dispenser#2026!",
    pin: "2026",
    role: "dispenser",
    clinicCode: "DHAMRAI-01",
    clinicName: "Dhamrai Community Dispensary",
  },
};

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  clinic_id: string;
  clinic_name: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface ErrorEnvelope {
  error_code: string;
  message: string;
  details: Record<string, unknown>;
  trace_id: string;
}

export interface PatientRecord {
  id: string;
  clinic_id?: string;
  mrn?: string;
  full_name: string;
  age_years: number;
  weight_kg: number;
  sex: string;
  is_pregnant: boolean;
  egfr: number | null;
  allergies: string[];
  version: number;
}

export interface BatchRecord {
  id: string;
  clinic_id?: string;
  antibiotic_id?: string;
  drug_code?: string;
  generic_name?: string;
  antibiotic_code?: string;
  antibiotic_name?: string;
  aware_category?: AwareCategory;
  aware_tier?: AwareCategory;
  drug_class?: string;
  lot_number?: string;
  batch_number?: string;
  expiry_date: string;
  days_to_expiry?: number;
  qty_initial?: number;
  qty_remaining: number;
  version?: number;
}

export interface MusConflict {
  code: string;
  label: string;
  detail: string;
}

export interface SafeRelaxation {
  action:
    | "SWITCH_TO_SYMPTOMATIC_CARE"
    | "ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL"
    | "REFER_UPAZILA_STOCK_TRANSFER"
    | string;
  rationale: string;
  candidate_drug?: string | null;
}

export interface CounselingOutput {
  summary: string;
  instructions: string | string[];
  red_flags: string | string[];
  model_used: string;
  deidentified: boolean;
  hallucination_guard_passed: boolean;
}

export interface OptimizeResponse {
  solver_status: "OPTIMAL" | "INFEASIBLE" | "NO_ANTIBIOTIC";
  recommended_antibiotic: Record<string, unknown> | null;
  recommended_batch: BatchRecord | null;
  aware_category: AwareCategory;
  mus_conflicts: MusConflict[];
  safe_relaxations: SafeRelaxation[];
  counseling: CounselingOutput;
}

export interface DispenseRecord {
  id: string;
  clinic_id?: string;
  patient_id: string;
  batch_id?: string | null;
  antibiotic_id?: string | null;
  drug_code?: string | null;
  antibiotic_code?: string | null;
  syndrome_code?: string;
  aware_category: AwareCategory;
  qty?: number;
  qty_dispensed: number;
  status: DispenseStatus;
  notes?: string | null;
  version?: number;
}

export interface CpsatVerdict {
  solver_status: string;
  mus_conflicts: MusConflict[];
  safe_relaxations: SafeRelaxation[];
}

export interface ConflictPayload {
  error_code: string;
  message: string;
  conflict_id: string;
  server_snapshot: Record<string, unknown>;
  client_snapshot: Record<string, unknown>;
  cpsat_verdict: CpsatVerdict;
  details: {
    conflict_id?: string;
    server_snapshot?: Record<string, unknown>;
    client_snapshot?: Record<string, unknown>;
    cpsat_verdict?: CpsatVerdict;
    [key: string]: unknown;
  };
  trace_id: string;
}

export interface ConflictEventRecord {
  id: string;
  status: string;
  entity_type?: string;
  entity_id?: string;
  server_snapshot: Record<string, unknown>;
  client_snapshot: Record<string, unknown>;
  cpsat_verdict: CpsatVerdict;
  resolution?: string | null;
}

export interface StewardshipAnalytics {
  clinic_id: string;
  clinic_name: string;
  total_dispensed: number;
  antibiotic_dispensed: number;
  access_count: number;
  watch_count: number;
  reserve_count: number;
  no_antibiotic_count: number;
  access_ratio_pct: number;
  target_access_pct: number;
  meets_who_target: boolean;
  expiring_soon_count: number;
  stocked_out_count: number;
}

export interface VoiceIntakeResponse {
  syndrome_code: string | null;
  severity: string | null;
  allergies: string[];
  is_pregnant: boolean | null;
  age_years: number | null;
  prompt_guard_safe: boolean;
  model_used: string;
}

const tokenCache = new Map<string, AuthResponse>();

export function apiUrl(path: string): string {
  const normalizedBase = API_URL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function authHeaders(
  token: string,
  extra?: Record<string, string>
): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(extra ?? {}),
  };
}

export function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function clearTokenCache(): void {
  tokenCache.clear();
}

export async function apiLoginFresh(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<APIResponse> {
  return request.post(apiUrl("/api/v1/auth/login"), {
    data: { email, password },
  });
}

export async function apiLogin(
  request: APIRequestContext,
  account: DemoAccount
): Promise<AuthResponse> {
  const cached = tokenCache.get(account.email);
  if (cached) {
    return cached;
  }
  const response = await apiLoginFresh(request, account.email, account.password);
  expect(response.status(), `Login failed for ${account.email}`).toBe(200);
  const body = (await response.json()) as AuthResponse;
  expect(typeof body.access_token).toBe("string");
  expect(body.access_token.length).toBeGreaterThan(10);
  tokenCache.set(account.email, body);
  return body;
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  expect(parts.length).toBe(3);
  const base64Url = parts[1] ?? "";
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const decoded = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(decoded) as Record<string, unknown>;
}

export async function assertErrorEnvelope(
  response: APIResponse,
  expectedStatuses: number[]
): Promise<ErrorEnvelope> {
  const status = response.status();
  expect(
    expectedStatuses,
    `Expected HTTP status in [${expectedStatuses.join(", ")}], got ${status}`
  ).toContain(status);
  const raw = (await response.json()) as Partial<ErrorEnvelope>;
  expect(typeof raw.error_code).toBe("string");
  expect((raw.error_code ?? "").length).toBeGreaterThan(0);
  expect(typeof raw.message).toBe("string");
  expect((raw.message ?? "").length).toBeGreaterThan(0);
  expect(raw.details).toBeDefined();
  expect(typeof raw.details).toBe("object");
  expect(typeof raw.trace_id).toBe("string");
  expect((raw.trace_id ?? "").length).toBeGreaterThan(0);
  return raw as ErrorEnvelope;
}

export function extractArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(obj[key])) {
        return obj[key] as T[];
      }
    }
  }
  return [];
}

export async function createIsolatedPatient(
  request: APIRequestContext,
  token: string,
  overrides?: Partial<{
    id: string;
    mrn: string;
    full_name: string;
    age_years: number;
    weight_kg: number;
    sex: "F" | "M";
    is_pregnant: boolean;
    egfr: number;
    allergies: string[];
  }>
): Promise<PatientRecord> {
  const id = overrides?.id ?? crypto.randomUUID();
  const suffix = id.slice(0, 8).toUpperCase();
  const payload = {
    id,
    mrn: overrides?.mrn ?? `MRN-E2E-${suffix}`,
    full_name: overrides?.full_name ?? `E2E Patient ${suffix}`,
    age_years: overrides?.age_years ?? 30,
    weight_kg: overrides?.weight_kg ?? 60,
    sex: overrides?.sex ?? "F",
    is_pregnant: overrides?.is_pregnant ?? false,
    egfr: overrides?.egfr ?? 95,
    allergies: overrides?.allergies ?? [],
  };

  const response = await request.post(apiUrl("/api/v1/patients"), {
    headers: authHeaders(token, {
      "Idempotency-Key": `patient-${crypto.randomUUID()}`,
    }),
    data: payload,
  });
  expect([200, 201]).toContain(response.status());
  const created = (await response.json()) as PatientRecord;
  expect(created.id).toBe(id);
  expect(created.version).toBeGreaterThanOrEqual(1);
  return created;
}

export async function getInventoryBatches(
  request: APIRequestContext,
  token: string,
  query?: Record<string, string | boolean>
): Promise<BatchRecord[]> {
  const url = new URL(apiUrl("/api/v1/inventory/batches"));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
  }
  const response = await request.get(url.toString(), {
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  return extractArray<BatchRecord>(body, ["batches", "items", "results"]);
}

export async function getStewardshipAnalytics(
  request: APIRequestContext,
  token: string
): Promise<StewardshipAnalytics> {
  const response = await request.get(apiUrl("/api/v1/analytics/stewardship"), {
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as StewardshipAnalytics;
}

export function getBatchCode(batch: BatchRecord): string {
  return (
    batch.drug_code ??
    batch.antibiotic_code ??
    batch.generic_name ??
    batch.antibiotic_name ??
    ""
  ).toUpperCase();
}

export function getBatchTier(batch: BatchRecord): AwareCategory | string {
  return (batch.aware_category ?? batch.aware_tier ?? "").toUpperCase();
}

export async function createDispenseDraft(
  request: APIRequestContext,
  token: string,
  params: {
    patient_id: string;
    batch_id?: string | null;
    antibiotic_id?: string | null;
    syndrome_code: string;
    severity?: string;
    aware_category?: AwareCategory;
    qty_dispensed: number;
    notes?: string;
    idempotencyKey?: string;
  }
): Promise<DispenseRecord> {
  const response = await request.post(apiUrl("/api/v1/dispenses"), {
    headers: authHeaders(token, {
      "Idempotency-Key": params.idempotencyKey ?? `dispense-${crypto.randomUUID()}`,
    }),
    data: {
      patient_id: params.patient_id,
      batch_id: params.batch_id ?? null,
      antibiotic_id: params.antibiotic_id ?? null,
      syndrome_code: params.syndrome_code,
      severity: params.severity ?? "MODERATE",
      aware_category: params.aware_category,
      qty_dispensed: params.qty_dispensed,
      notes: params.notes ?? "E2E test dispense",
    },
  });
  expect([200, 201]).toContain(response.status());
  return (await response.json()) as DispenseRecord;
}

export async function createAndApproveDispense(
  request: APIRequestContext,
  dispenserToken: string,
  pharmacistToken: string,
  params: {
    patient_id: string;
    batch_id?: string | null;
    antibiotic_id?: string | null;
    syndrome_code: string;
    severity?: string;
    aware_category?: AwareCategory;
    qty_dispensed: number;
    notes?: string;
  }
): Promise<DispenseRecord> {
  const draft = await createDispenseDraft(request, dispenserToken, params);
  expect(draft.status).toBe("DRAFT");

  const submitRes = await request.post(
    apiUrl(`/api/v1/dispenses/${draft.id}/submit`),
    { headers: authHeaders(dispenserToken) }
  );
  expect(submitRes.status()).toBe(200);
  const pending = (await submitRes.json()) as DispenseRecord;
  expect(pending.status).toBe("PENDING_APPROVAL");

  const approveRes = await request.post(
    apiUrl(`/api/v1/dispenses/${draft.id}/approve`),
    {
      headers: authHeaders(pharmacistToken, {
        "Idempotency-Key": `approve-${crypto.randomUUID()}`,
      }),
    }
  );
  expect(approveRes.status()).toBe(200);
  const dispensed = (await approveRes.json()) as DispenseRecord;
  expect(dispensed.status).toBe("DISPENSED");
  return dispensed;
}

export async function voidDispenseSafe(
  request: APIRequestContext,
  dispenseId: string,
  account: DemoAccount = DEMO_ACCOUNTS.pharmacist
): Promise<void> {
  try {
    const auth = await apiLogin(request, account);
    await request.post(apiUrl(`/api/v1/dispenses/${dispenseId}/void`), {
      headers: authHeaders(auth.access_token),
      data: { reason: "E2E test teardown cleanup" },
    });
  } catch {
    // Cleanup must never mask primary test failures
  }
}

export async function voidDispensesCleanup(
  request: APIRequestContext,
  dispenseIds: string[],
  account: DemoAccount = DEMO_ACCOUNTS.pharmacist
): Promise<void> {
  for (const id of dispenseIds) {
    await voidDispenseSafe(request, id, account);
  }
}

export async function resolveConflictSafe(
  request: APIRequestContext,
  conflictId: string,
  account: DemoAccount = DEMO_ACCOUNTS.pharmacist,
  resolution:
    | "RESOLVED_SERVER"
    | "RESOLVED_CLIENT"
    | "RESOLVED_MERGED" = "RESOLVED_SERVER"
): Promise<void> {
  if (!conflictId) return;
  try {
    const auth = await apiLogin(request, account);
    await request.post(
      apiUrl(`/api/v1/sync/conflicts/${encodeURIComponent(conflictId)}/resolve`),
      {
        headers: authHeaders(auth.access_token),
        data: {
          resolution,
          notes: "E2E test teardown cleanup",
          merged_payload: {},
        },
      }
    );
  } catch {
    // Cleanup must never mask primary test failures
  }
}

export async function runOptimize(
  request: APIRequestContext,
  token: string,
  payload: {
    patient_id?: string;
    patient_profile?: {
      age_years: number;
      weight_kg: number;
      sex: "F" | "M";
      is_pregnant: boolean;
      egfr: number;
      allergies: string[];
    };
    syndrome_code: string;
    severity: "MILD" | "MODERATE" | "SEVERE";
    max_aware_tier?: "ACCESS" | "WATCH" | "RESERVE";
    language?: "en" | "bn";
  }
): Promise<OptimizeResponse> {
  const response = await request.post(apiUrl("/api/v1/optimize"), {
    headers: authHeaders(token),
    data: {
      language: "en",
      ...payload,
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as OptimizeResponse;
}

export function futureDateIso(daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}
