import { z } from "zod";
import { apiRequest } from "@/lib/api";

/** Mirrors CriticalCareInsightsOut (backend/app/schemas/critical_care.py). */
const CapacitySchema = z.object({
  physical: z.number(),
  staffed: z.number(),
  available: z.number(),
});

const BloodCellSchema = z.object({
  units: z.number(),
  reserved: z.number(),
  nearest_expiry_date: z.string().nullable(),
  expiring_soon: z.boolean(),
});

export const InsightFacilitySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  tier: z.enum(["PUBLIC", "PRIVATE", "BLOOD_HUB"]),
  data_freshness: z.enum(["DEMO", "LIVE", "STALE"]),
  last_updated_at: z.string().nullable(),
  icu: CapacitySchema,
  ventilator: CapacitySchema,
  blood: z.record(z.string(), BloodCellSchema),
});
export type InsightFacility = z.infer<typeof InsightFacilitySchema>;

export const InsightsSchema = z.object({
  window_days: z.number(),
  generated_at: z.string(),
  facilities: z.array(InsightFacilitySchema),
  icu_occupancy_pct: z.number(),
  icu_idle_unstaffed: z.number(),
  ventilators_available: z.number(),
  live_coverage_pct: z.number(),
  blood_units_by_group: z.record(z.string(), z.number()),
  scarce_blood_groups: z.array(z.string()),
  expiring_soon_units: z.number(),
  holds_by_status: z.record(z.string(), z.number()),
  hold_expiry_rate_pct: z.number().nullable(),
  carematch_runs: z.number(),
  carematch_infeasible: z.number(),
  carematch_median_ms: z.number().nullable(),
  news2_mean: z.number().nullable(),
});
export type Insights = z.infer<typeof InsightsSchema>;

export function getInsights(days: number) {
  return apiRequest(`/api/v1/critical-care/insights?days=${days}`, { schema: InsightsSchema });
}
