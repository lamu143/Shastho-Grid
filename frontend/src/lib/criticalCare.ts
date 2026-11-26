/**
 * Typed client for ShasthoGrid critical care:
 * PulseScore (NEWS2), CareMatch + ConflictProof, Shastho Copilot, LockStep, RaceLab.
 */
import { z } from "zod";
import { apiRequest } from "@/lib/api";

export const BloodGroupSchema = z.enum(["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]);
export const SpecialtySchema = z.enum(["TRAUMA", "OBSTETRIC", "NEURO", "CARDIAC", "PEDIATRIC"]);
export const TierSchema = z.enum(["PUBLIC", "PRIVATE", "BLOOD_HUB"]);
export type BloodGroup = z.infer<typeof BloodGroupSchema>;
export type Specialty = z.infer<typeof SpecialtySchema>;

export const News2Schema = z.object({
  score: z.number(),
  acuity: z.enum(["RED_CRITICAL", "ORANGE_URGENT", "YELLOW_ELEVATED", "GREEN_STABLE"]),
  clinical_risk: z.enum(["LOW", "LOW_MEDIUM", "MEDIUM", "HIGH"]),
  response: z.string(),
  breakdown: z.record(z.string(), z.number()),
  red_flags: z.array(z.string()),
});
export type News2 = z.infer<typeof News2Schema>;

const BloodPlanSchema = z.array(z.tuple([BloodGroupSchema, z.number()])).nullable();

export const HospitalOptionSchema = z.object({
  facility_id: z.string(),
  code: z.string(),
  name: z.string(),
  tier: TierSchema,
  eta_minutes: z.number(),
  distance_km: z.number(),
  icu_available: z.number(),
  vent_available: z.number(),
  blood_plan: BloodPlanSchema,
  cost: z.number(),
});
export type HospitalOption = z.infer<typeof HospitalOptionSchema>;

export const RepairSchema = z.object({
  repair_type: z.enum(["SPLIT_RESOURCE_CO_DISPATCH", "RELAX_PUBLIC_ONLY", "RELAX_MAX_ETA"]),
  title: z.string(),
  relaxed: z.array(z.string()),
  clinical_compromise: z.boolean(),
  hospital: HospitalOptionSchema,
  blood_source: z
    .object({
      facility_id: z.string(),
      code: z.string(),
      name: z.string(),
      tier: TierSchema,
      blood_type: BloodGroupSchema,
      units: z.number(),
      plan: BloodPlanSchema,
      courier_distance_km: z.number(),
      courier_eta_minutes: z.number(),
    })
    .nullable()
    .optional(),
  note: z.string(),
});
export type Repair = z.infer<typeof RepairSchema>;

export const CareMatchSchema = z.object({
  triage_request_id: z.string(),
  status: z.enum(["OPTIMAL", "INFEASIBLE"]),
  news2: News2Schema.nullable(),
  active_constraints: z.array(z.string()),
  recommendation: HospitalOptionSchema.nullable(),
  alternatives: z.array(HospitalOptionSchema),
  conflict_proof: z
    .object({
      mus_cores: z.array(z.array(z.string())),
      solver_core: z.array(z.string()),
      labels: z.record(z.string(), z.string()),
      repairs: z.array(RepairSchema),
    })
    .nullable(),
  wall_time_ms: z.number(),
  routing_source: z.string(),
  requires_human_approval: z.boolean(),
  data_is_simulated: z.boolean(),
  stale_facilities: z.array(z.string()).default([]),
});
export type CareMatch = z.infer<typeof CareMatchSchema>;

export interface VitalsInput {
  respiration_rate: number;
  spo2: number;
  on_oxygen: boolean;
  systolic_bp: number;
  pulse: number;
  consciousness: "A" | "C" | "V" | "P" | "U";
  temperature_c: number;
  spo2_scale2?: boolean;
}

export interface CareMatchInput {
  incident_lat: number;
  incident_lon: number;
  vitals?: VitalsInput | null;
  needs_icu: boolean;
  needs_vent: boolean;
  specialty?: Specialty | null;
  blood_type?: BloodGroup | null;
  blood_units: number;
  public_only: boolean;
  max_eta_minutes?: number | null;
}

export function careMatchOptimize(input: CareMatchInput) {
  return apiRequest("/api/v1/carematch/optimize", { method: "POST", body: input, schema: CareMatchSchema });
}

export const CopilotSchema = z.object({
  session_id: z.string(),
  provider_used: z.string(),
  language: z.string(),
  extraction: z.record(z.string(), z.unknown()),
  missing_vitals: z.array(z.string()),
  guard_rejected_fields: z.array(z.string()),
  carematch: CareMatchSchema,
  brief: z.object({ en: z.string(), bn: z.string() }),
  tool_trace: z.array(
    z.object({ step: z.number(), tool: z.string(), summary: z.record(z.string(), z.unknown()), duration_ms: z.number() })
  ),
  requires_human_approval: z.boolean(),
});
export type CopilotResult = z.infer<typeof CopilotSchema>;

export function copilotTriageAssist(note: string, lat: number, lon: number) {
  return apiRequest("/api/v1/copilot/triage-assist", {
    method: "POST",
    body: { note, incident_lat: lat, incident_lon: lon },
    schema: CopilotSchema,
  });
}

export const FacilitySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  tier: TierSchema,
  lat: z.number(),
  lon: z.number(),
  coords_verified: z.boolean(),
  specialties: z.array(z.string()),
  icu_available: z.number(),
  icu_staffed: z.number(),
  eta_minutes: z.number().nullable().optional(),
  // Provenance: DEMO (seeded), LIVE (staff/hospital feed, fresh), STALE (real but not refreshed).
  data_freshness: z.enum(["DEMO", "LIVE", "STALE"]).default("DEMO"),
  last_updated_at: z.string().nullable().optional(),
  data_is_simulated: z.boolean().optional(),
});
export type Facility = z.infer<typeof FacilitySchema>;

export function listFacilities(lat?: number, lon?: number) {
  const qs = lat !== undefined && lon !== undefined ? `?lat=${lat}&lon=${lon}&sort=eta` : "";
  return apiRequest(`/api/v1/facilities${qs}`, {
    schema: z.object({ items: z.array(FacilitySchema), total: z.number() }),
  });
}

export const ReservationSchema = z.object({
  reservation_id: z.string(),
  status: z.enum(["HELD", "CONFIRMED", "EN_ROUTE", "ADMITTED", "EXPIRED", "CANCELLED"]),
  hospital_id: z.string(),
  icu_resource_id: z.string().nullable().optional(),
  vent_resource_id: z.string().nullable().optional(),
  is_split_dispatch: z.boolean(),
  hold_expires_at: z.string(),
  version: z.number(),
  created_at: z.string().nullable().optional(),
  blood: z.array(
    z.object({
      source_facility_id: z.string().optional(),
      donor_blood_type: z.string(),
      recipient_blood_type: z.string(),
      units: z.number(),
      courier_eta_minutes: z.number().nullable(),
      status: z.string(),
    })
  ),
});
export type Reservation = z.infer<typeof ReservationSchema>;

export interface ReservationInput {
  hospital_id: string;
  needs_icu: boolean;
  needs_vent: boolean;
  blood?: { source_facility_id: string; blood_type: BloodGroup; units: number } | null;
  triage_request_id?: string | null;
}

export function createReservation(input: ReservationInput, idempotencyKey: string) {
  return apiRequest("/api/v1/reservations", {
    method: "POST",
    body: input,
    idempotencyKey,
    schema: ReservationSchema,
  });
}

export function transitionReservation(
  id: string,
  target: "CONFIRMED" | "EN_ROUTE" | "ADMITTED" | "CANCELLED"
) {
  return apiRequest(`/api/v1/reservations/${id}/transition`, {
    method: "POST",
    body: { target_status: target },
    schema: ReservationSchema,
  });
}

export function listReservations(status?: Reservation["status"]) {
  const qs = status ? `?status=${status}` : "";
  return apiRequest(`/api/v1/reservations${qs}`, {
    schema: z.object({ items: z.array(ReservationSchema), total: z.number() }),
  });
}

/* ---------------------------------------------------- facility console ---- */

const DataSourceSchema = z.enum(["SEED_DEMO", "STAFF", "FEED"]);
export const ResourceTypeSchema = z.enum(["ICU_BED", "VENTILATOR", "HDU_BED", "NICU_BED"]);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

export const HospitalResourceSchema = z.object({
  id: z.string(),
  resource_type: ResourceTypeSchema,
  total_physical_count: z.number(),
  staffed_capacity_count: z.number(),
  available_count: z.number(),
  data_source: DataSourceSchema,
  reported_at: z.string().nullable().optional(),
  version: z.number(),
  updated_at: z.string(),
});
export type HospitalResource = z.infer<typeof HospitalResourceSchema>;

export const BloodStockSchema = z.object({
  id: z.string(),
  blood_type: BloodGroupSchema,
  units_available: z.number(),
  units_reserved: z.number(),
  nearest_expiry_date: z.string().nullable(),
  data_source: DataSourceSchema,
  reported_at: z.string().nullable().optional(),
  version: z.number(),
  updated_at: z.string(),
});
export type BloodStock = z.infer<typeof BloodStockSchema>;

export const FacilityDetailSchema = FacilitySchema.extend({
  division: z.string(),
  district: z.string(),
  resources: z.array(HospitalResourceSchema),
  blood: z.array(BloodStockSchema),
});
export type FacilityDetail = z.infer<typeof FacilityDetailSchema>;

export function getFacility(id: string) {
  return apiRequest(`/api/v1/facilities/${id}`, { schema: FacilityDetailSchema });
}

export function updateResource(
  facilityId: string,
  type: ResourceType,
  body: { total_physical_count?: number; staffed_capacity_count?: number; available_count?: number; expected_version: number }
) {
  return apiRequest(`/api/v1/facilities/${facilityId}/resources/${type}`, {
    method: "PATCH",
    body,
    schema: HospitalResourceSchema,
  });
}

export function updateBlood(
  facilityId: string,
  group: BloodGroup,
  body: { units_available: number; nearest_expiry_date?: string | null; expected_version: number }
) {
  return apiRequest(`/api/v1/facilities/${facilityId}/blood/${encodeURIComponent(group)}`, {
    method: "PATCH",
    body,
    schema: BloodStockSchema,
  });
}

export const FeedKeySchema = z.object({
  id: z.string(),
  facility_id: z.string(),
  label: z.string(),
  scope: z.enum(["RESOURCES", "BLOOD", "ALL"]).default("ALL"),
  key_prefix: z.string(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
export type FeedKey = z.infer<typeof FeedKeySchema>;

export function listFeedKeys(facilityId: string) {
  return apiRequest(`/api/v1/facilities/${facilityId}/feed-keys`, {
    schema: z.object({ items: z.array(FeedKeySchema) }),
  });
}

export function createFeedKey(facilityId: string, label: string, scope?: FeedKey["scope"]) {
  return apiRequest(`/api/v1/facilities/${facilityId}/feed-keys`, {
    method: "POST",
    body: scope ? { label, scope } : { label },
    schema: FeedKeySchema.extend({ api_key: z.string() }),
  });
}

export function revokeFeedKey(facilityId: string, keyId: string) {
  return apiRequest(`/api/v1/facilities/${facilityId}/feed-keys/${keyId}`, {
    method: "DELETE",
    schema: FeedKeySchema,
  });
}

export const RaceLabStatusSchema = z.object({
  facility_id: z.string(),
  facility_code: z.string(),
  facility_name: z.string(),
  resource_id: z.string(),
  available_count: z.number(),
  staffed_capacity_count: z.number(),
  total_physical_count: z.number(),
  active_held_count: z.number(),
  active_reservation_id: z.string().nullable(),
  hold_expires_at: z.string().nullable(),
});
export type RaceLabStatus = z.infer<typeof RaceLabStatusSchema>;

export function racelabStatus() {
  return apiRequest("/api/v1/racelab/status", {
    schema: RaceLabStatusSchema,
  });
}

export function racelabReset() {
  return apiRequest("/api/v1/racelab/reset", {
    method: "POST",
    schema: z.object({ facility_id: z.string(), resource_id: z.string(), available_count: z.number() }),
  });
}

export const RaceAttemptSchema = z.object({
  attempt: z.number(),
  status: z.number(),
  detail: z.string(),
  ms: z.number(),
  started_offset_ms: z.number().optional(),
  finished_offset_ms: z.number().optional(),
});

export const RaceRunSchema = z.object({
  concurrency: z.number(),
  winners: z.number(),
  rejected: z.number(),
  errors: z.number(),
  db_available_after: z.number(),
  double_bookings: z.number(),
  wall_time_ms: z.number().optional(),
  winner_reservation_id: z.string().nullable().optional(),
  attempts: z.array(RaceAttemptSchema),
});
export type RaceRun = z.infer<typeof RaceRunSchema>;

export function racelabRun(concurrency: number) {
  return apiRequest("/api/v1/racelab/run", {
    method: "POST",
    body: { concurrency },
    schema: RaceRunSchema,
  });
}

/**
 * Client-side NEWS2 preview (RCP 2017, Scale 1) for the live badge while typing.
 * The server's PulseScore result is authoritative and is what CareMatch stores.
 */
export function previewNews2(v: VitalsInput): { score: number; acuity: News2["acuity"] } {
  const rr = v.respiration_rate <= 8 ? 3 : v.respiration_rate <= 11 ? 1 : v.respiration_rate <= 20 ? 0 : v.respiration_rate <= 24 ? 2 : 3;
  const sp = v.spo2 <= 91 ? 3 : v.spo2 <= 93 ? 2 : v.spo2 <= 95 ? 1 : 0;
  const o2 = v.on_oxygen ? 2 : 0;
  const bp = v.systolic_bp <= 90 ? 3 : v.systolic_bp <= 100 ? 2 : v.systolic_bp <= 110 ? 1 : v.systolic_bp <= 219 ? 0 : 3;
  const hr = v.pulse <= 40 ? 3 : v.pulse <= 50 ? 1 : v.pulse <= 90 ? 0 : v.pulse <= 110 ? 1 : v.pulse <= 130 ? 2 : 3;
  const cv = v.consciousness === "A" ? 0 : 3;
  const t = v.temperature_c <= 35 ? 3 : v.temperature_c <= 36 ? 1 : v.temperature_c <= 38 ? 0 : v.temperature_c <= 39 ? 1 : 2;
  const parts = [rr, sp, o2, bp, hr, cv, t];
  const score = parts.reduce((a, b) => a + b, 0);
  const acuity =
    score >= 7 ? "RED_CRITICAL" : score >= 5 ? "ORANGE_URGENT" : parts.includes(3) ? "YELLOW_ELEVATED" : "GREEN_STABLE";
  return { score, acuity };
}

export const CONSTRAINT_SHORT: Record<string, string> = {
  C_ICU: "ICU bed",
  C_VENT: "Ventilator",
  C_SPEC: "Specialty",
  C_BLOOD: "Blood",
  C_PUBLIC: "Public only",
  C_ETA: "Max ETA",
};

export const FARMGATE = { lat: 23.7572, lon: 90.39 };
