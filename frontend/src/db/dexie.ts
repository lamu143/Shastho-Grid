import Dexie, { type EntityTable } from "dexie";

export type Sex = "M" | "F" | "O";
export type Severity = "MILD" | "MODERATE" | "SEVERE";
export type AwareCategory = "ACCESS" | "WATCH" | "RESERVE";
export type AwareVerdictCategory = AwareCategory | "NO_ANTIBIOTIC";
export type UserRole =
  | "dispenser"
  | "pharmacist"
  | "auditor"
  | "admin"
  | "dispatcher"
  | "hospital_admin"
  | "blood_bank_officer";
export type DispenseStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "DISPENSED"
  | "REJECTED"
  | "VOIDED";

export interface PatientRecord {
  id: string; // UUIDv4
  clinic_id: string;
  mrn: string;
  full_name: string;
  age_years: number;
  weight_kg: number;
  sex: Sex;
  is_pregnant: boolean;
  egfr: number | null;
  allergies: string[];
  version: number;
  created_at: string;
  updated_at: string;
  _dirty?: boolean; // client-only indicator while pending sync
}

export interface BatchRecord {
  id: string; // UUIDv4
  clinic_id: string;
  antibiotic_id: string;
  drug_code: string;
  generic_name: string;
  generic_name_bn: string;
  drug_class: string;
  aware_category: AwareCategory;
  aware_tier_cost: 1 | 15 | 120;
  pregnancy_contraindicated: boolean;
  renal_contraindicated_egfr_lt: number | null;
  min_age_years: number;
  dose_regimen_en: string;
  dose_regimen_bn: string;
  lot_number: string;
  qty_initial: number;
  qty_remaining: number;
  expiry_date: string; // YYYY-MM-DD
  unit: string;
  version: number;
  updated_at: string;
}

export interface CatalogDrugRecord {
  id: string;
  drug_code: string;
  generic_name: string;
  generic_name_bn: string;
  drug_class: string;
  aware_category: AwareCategory;
  aware_tier_cost: 1 | 15 | 120;
  pregnancy_contraindicated: boolean;
  renal_contraindicated_egfr_lt: number | null;
  min_age_years: number;
  dose_regimen_en: string;
  dose_regimen_bn: string;
  is_active: boolean;
}

export interface GuidelineRecord {
  id: string;
  syndrome_code: string;
  syndrome_name_en: string;
  syndrome_name_bn: string;
  severity: Severity;
  viral_no_antibiotic_if_mild: boolean;
  first_line_drug_codes: string[];
  second_line_drug_codes: string[];
  default_duration_days: number;
  guidance_en: string;
  guidance_bn: string;
}

export interface DispenseRecord {
  id: string;
  clinic_id: string;
  patient_id: string;
  batch_id: string | null;
  antibiotic_id: string | null;
  drug_code: string | null;
  syndrome_code: string;
  aware_category: AwareVerdictCategory;
  qty: number;
  status: DispenseStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export type SyncEntityType = "PATIENT" | "DISPENSE" | "INVENTORY";
export type SyncMutationType =
  | "CREATE"
  | "UPDATE"
  | "SUBMIT"
  | "APPROVE"
  | "REJECT"
  | "VOID";
export type SyncMutationStatus =
  | "pending"
  | "syncing"
  | "conflict"
  | "synced"
  | "failed";

export interface SyncMutationRecord {
  id: string; // client_mutation_id UUIDv4
  clinic_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  mutation_type: SyncMutationType;
  base_version: number;
  idempotency_key: string; // UUIDv4
  payload: Record<string, unknown>;
  status: SyncMutationStatus;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  synced_at: string | null;
}

export type ConflictResolutionStatus =
  | "OPEN"
  | "RESOLVED_SERVER"
  | "RESOLVED_CLIENT"
  | "RESOLVED_MERGED";

export interface ConflictRecord {
  id: string; // conflict_id from backend 409
  clinic_id: string;
  mutation_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  server_snapshot: Record<string, unknown>;
  client_snapshot: Record<string, unknown>;
  cpsat_verdict: Record<string, unknown>;
  status: ConflictResolutionStatus;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface OfflineAuthRecord {
  email: string;
  user_id: string;
  full_name: string;
  role: UserRole;
  clinic_id: string;
  clinic_name: string;
  salt_b64: string;
  pin_hash_b64: string;
  hash_algo: "PBKDF2-SHA256" | "SHA256-ITER";
  cached_token: string;
  updated_at: string;
}

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  clinic_id: string;
  clinic_name: string;
  /** Set for facility-scoped critical-care roles (hospital_admin, blood_bank_officer). */
  facility_id?: string | null;
}

export class AwareGridDB extends Dexie {
  patients!: EntityTable<PatientRecord, "id">;
  batches!: EntityTable<BatchRecord, "id">;
  guidelines!: EntityTable<GuidelineRecord, "id">;
  catalog!: EntityTable<CatalogDrugRecord, "id">;
  dispenses!: EntityTable<DispenseRecord, "id">;
  syncMutations!: EntityTable<SyncMutationRecord, "id">;
  conflicts!: EntityTable<ConflictRecord, "id">;
  offlineAuth!: EntityTable<OfflineAuthRecord, "email">;

  constructor() {
    super("awaregrid_offline_v1");
    this.version(1).stores({
      patients: "&id, clinic_id, mrn, version, updated_at, [clinic_id+updated_at]",
      batches:
        "&id, clinic_id, antibiotic_id, drug_code, aware_category, expiry_date, qty_remaining, version, [clinic_id+expiry_date]",
      guidelines: "&id, &syndrome_code, viral_no_antibiotic_if_mild",
      catalog: "&id, &drug_code, drug_class, aware_category, is_active",
      dispenses: "&id, clinic_id, patient_id, status, aware_category, created_at",
      syncMutations:
        "&id, clinic_id, entity_type, entity_id, mutation_type, base_version, idempotency_key, status, created_at",
      conflicts: "&id, clinic_id, mutation_id, entity_type, entity_id, status, created_at",
      offlineAuth: "&email, user_id, clinic_id, updated_at",
    });
  }
}

let _db: AwareGridDB | null = null;

export function getDb(): AwareGridDB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is unavailable during SSR");
  }
  if (!_db) {
    _db = new AwareGridDB();
  }
  return _db;
}

export const db: AwareGridDB =
  typeof window !== "undefined" ? getDb() : (null as unknown as AwareGridDB);

const SESSION_USER_KEY = "awaregrid_session_user";
const ACCESS_TOKEN_KEY = "awaregrid_access_token";
const OFFLINE_VAULT_LS_KEY = "awaregrid_offline_vault_v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function derivePinHashBytes(
  pin: string,
  salt: Uint8Array
): Promise<{ hash: Uint8Array; algo: "PBKDF2-SHA256" | "SHA256-ITER" }> {
  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(pin.trim());
  const saltCopy = new Uint8Array(salt);

  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      pinBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derived = await window.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltCopy.buffer as ArrayBuffer,
        iterations: 100_000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );
    return { hash: new Uint8Array(derived), algo: "PBKDF2-SHA256" };
  }

  let acc = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    acc[i] =
      (saltCopy[i % saltCopy.length] ^ pinBytes[i % Math.max(1, pinBytes.length)]) &
      0xff;
  }
  for (let round = 0; round < 1000; round += 1) {
    const next = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) {
      next[i] =
        (acc[i] * 31 + acc[(i + 7) % 32] + saltCopy[(i + round) % saltCopy.length] + round) &
        0xff;
    }
    acc = next;
  }
  return { hash: acc, algo: "SHA256-ITER" };
}

export async function hashPin(
  pin: string,
  existingSaltB64?: string
): Promise<{
  salt_b64: string;
  pin_hash_b64: string;
  hash_algo: "PBKDF2-SHA256" | "SHA256-ITER";
}> {
  if (typeof window === "undefined") {
    throw new Error("hashPin requires a browser environment");
  }
  const salt = existingSaltB64
    ? fromBase64(existingSaltB64)
    : window.crypto.getRandomValues(new Uint8Array(16));
  const { hash, algo } = await derivePinHashBytes(pin, salt);
  return {
    salt_b64: toBase64(salt),
    pin_hash_b64: toBase64(hash),
    hash_algo: algo,
  };
}

function readVaultFallbackMap(): Record<string, OfflineAuthRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OFFLINE_VAULT_LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, OfflineAuthRecord>;
  } catch {
    return {};
  }
}

function writeVaultFallbackRecord(record: OfflineAuthRecord): void {
  if (typeof window === "undefined") return;
  try {
    const current = readVaultFallbackMap();
    current[record.email.toLowerCase()] = record;
    window.localStorage.setItem(OFFLINE_VAULT_LS_KEY, JSON.stringify(current));
  } catch {
    // Ignore quota errors
  }
}

export async function saveOfflinePinVault(
  user: SessionUser,
  pin: string,
  cachedToken: string
): Promise<OfflineAuthRecord | null> {
  if (typeof window === "undefined") return null;
  const email = user.email.trim().toLowerCase();
  const { salt_b64, pin_hash_b64, hash_algo } = await hashPin(pin);
  const record: OfflineAuthRecord = {
    email,
    user_id: user.id,
    full_name: user.full_name,
    role: user.role,
    clinic_id: user.clinic_id,
    clinic_name: user.clinic_name,
    salt_b64,
    pin_hash_b64,
    hash_algo,
    cached_token: cachedToken,
    updated_at: new Date().toISOString(),
  };

  writeVaultFallbackRecord(record);
  try {
    await getDb().offlineAuth.put(record);
  } catch {
    // Fallback localStorage vault still persists
  }
  return record;
}

export async function verifyOfflinePin(
  email: string,
  pin: string
): Promise<{ verified: boolean; record: OfflineAuthRecord | null }> {
  if (typeof window === "undefined") {
    return { verified: false, record: null };
  }
  const normalizedEmail = email.trim().toLowerCase();
  let record: OfflineAuthRecord | undefined;
  try {
    record = await getDb().offlineAuth.get(normalizedEmail);
  } catch {
    record = undefined;
  }
  if (!record) {
    record = readVaultFallbackMap()[normalizedEmail];
  }
  if (!record) {
    return { verified: false, record: null };
  }

  const salt = fromBase64(record.salt_b64);
  const { hash } = await derivePinHashBytes(pin, salt);
  const expected = fromBase64(record.pin_hash_b64);
  const verified = timingSafeEqual(hash, expected);
  return { verified, record: verified ? record : null };
}

export async function listOfflineVaultUsers(): Promise<OfflineAuthRecord[]> {
  if (typeof window === "undefined") return [];
  try {
    const dexieRows = await getDb().offlineAuth.toArray();
    if (dexieRows.length > 0) return dexieRows;
  } catch {
    // Fallback to localStorage
  }
  return Object.values(readVaultFallbackMap());
}

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredSession(token: string, user: SessionUser): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
    window.localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new Event("awaregrid:auth-updated"));
  } catch {
    // Ignore storage failures
  }
}

export function getStoredSessionUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(SESSION_USER_KEY);
    window.dispatchEvent(new Event("awaregrid:auth-updated"));
  } catch {
    // Ignore storage failures
  }
}
