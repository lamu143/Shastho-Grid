import type { Facility } from "@/lib/criticalCare";
import type { Locale } from "@/lib/i18n";

export type PlaceKind = "HOSPITAL" | "BLOOD_BANK" | "PHARMACY";
export type TravelMode = "driving" | "cycling" | "foot";

export interface RadarPlace {
  id: string;
  code: string;
  name: string;
  nameBn: string;
  kind: PlaceKind;
  tier: string;
  lat: number;
  lon: number;
  open24h: boolean;
  services: string[];
  icuAvailable?: number;
  icuStaffed?: number;
  address: string;
  freshness?: "LIVE" | "STALE" | "DEMO";
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
  durationS: number;
  type: string;
  modifier?: string;
}

export interface RadarRoute {
  coordinates: [number, number][]; // [lon, lat]
  distanceKm: number;
  durationMin: number;
  steps: RouteStep[];
  source: "osrm" | "fallback";
}

/** Curated pharmacies, blood banks, and hospitals across Dhaka, Savar & Ashulia. */
export const CURATED_RADAR_PLACES: RadarPlace[] = [
  {
    id: "ph-ashulia",
    code: "ASHULIA-RX",
    name: "Ashulia Union AWaRe Dispensary",
    nameBn: "আশুলিয়া ইউনিয়ন AWaRe ডিসপেন্সারি",
    kind: "PHARMACY",
    tier: "PUBLIC",
    lat: 23.8965,
    lon: 90.3248,
    open24h: false,
    services: ["WHO Access", "Amoxicillin", "Nitrofurantoin", "Doxycycline", "FEFO"],
    address: "Ashulia Bazar, Savar, Dhaka",
  },
  {
    id: "ph-dhamrai",
    code: "DHAMRAI-RX",
    name: "Dhamrai Community Dispensary",
    nameBn: "ধামরাই কমিউনিটি ডিসপেন্সারি",
    kind: "PHARMACY",
    tier: "PUBLIC",
    lat: 23.9122,
    lon: 90.2145,
    open24h: false,
    services: ["WHO Access", "Co-trimoxazole", "Cephalexin", "FEFO"],
    address: "Dhamrai Upazila Road, Dhaka",
  },
  {
    id: "ph-lazz-kalabagan",
    code: "LAZZ-24H",
    name: "Lazz Pharma Kalabagan (24/7)",
    nameBn: "লাজ ফার্মা কলাবাগান (২৪ ঘণ্টা)",
    kind: "PHARMACY",
    tier: "PRIVATE",
    lat: 23.7484,
    lon: 90.3812,
    open24h: true,
    services: ["24/7", "WHO Access", "Insulin", "Cold Chain", "Nebulizer"],
    address: "Mirpur Road, Kalabagan, Dhaka",
  },
  {
    id: "ph-tamanna-panthapath",
    code: "TAMANNA-RX",
    name: "Tamanna Pharmacy Panthapath (24/7)",
    nameBn: "তামান্না ফার্মেসি পান্থপথ (২৪ ঘণ্টা)",
    kind: "PHARMACY",
    tier: "PRIVATE",
    lat: 23.7528,
    lon: 90.3845,
    open24h: true,
    services: ["24/7", "WHO Access", "ICU Meds", "IV Fluids"],
    address: "West Panthapath, Farmgate, Dhaka",
  },
  {
    id: "ph-savar-model",
    code: "SAVAR-RX",
    name: "Savar Model Pharmacy (24/7)",
    nameBn: "সাভার মডেল ফার্মেসি (২৪ ঘণ্টা)",
    kind: "PHARMACY",
    tier: "PRIVATE",
    lat: 23.8482,
    lon: 90.2567,
    open24h: true,
    services: ["24/7", "WHO Access", "Amoxicillin", "ORS", "Emergency"],
    address: "Savar Bus Stand, N5 Highway, Dhaka",
  },
  {
    id: "ph-uttara-care",
    code: "UTTARA-RX",
    name: "Uttara Sector-7 Care Pharmacy",
    nameBn: "উত্তরা সেক্টর-৭ কেয়ার ফার্মেসি",
    kind: "PHARMACY",
    tier: "PRIVATE",
    lat: 23.8685,
    lon: 90.3982,
    open24h: true,
    services: ["24/7", "WHO Access", "Azithromycin", "Pediatric"],
    address: "Road 12, Sector 7, Uttara, Dhaka",
  },
  {
    id: "bb-sandhani-dmch",
    code: "SANDHANI",
    name: "Sandhani DMCH Blood Bank",
    nameBn: "সন্ধানী ঢামেক ব্লাড ব্যাংক",
    kind: "BLOOD_BANK",
    tier: "BLOOD_HUB",
    lat: 23.7259,
    lon: 90.3976,
    open24h: true,
    services: ["24/7", "O-", "O+", "A+", "B+", "AB+", "Platelets"],
    address: "Bakshibazar, Dhaka Medical Campus",
  },
  {
    id: "bb-quantum",
    code: "QUANTUM-BB",
    name: "Quantum Blood Bank Shantinagar",
    nameBn: "কোয়ান্টাম ব্লাড ব্যাংক শান্তিনগর",
    kind: "BLOOD_BANK",
    tier: "BLOOD_HUB",
    lat: 23.7392,
    lon: 90.4136,
    open24h: true,
    services: ["24/7", "O-", "O+", "A-", "A+", "B-", "AB-", "Plasma"],
    address: "Shantinagar, Dhaka",
  },
  {
    id: "hosp-evercare",
    code: "EVERCARE",
    name: "Evercare Hospital Dhaka",
    nameBn: "এভারকেয়ার হাসপাতাল ঢাকা",
    kind: "HOSPITAL",
    tier: "PRIVATE",
    lat: 23.81,
    lon: 90.4314,
    open24h: true,
    services: ["24/7", "ICU", "Ventilator", "CARDIAC", "NEURO", "TRAUMA"],
    icuAvailable: 4,
    icuStaffed: 16,
    address: "Plot 81, Block E, Bashundhara R/A, Dhaka",
  },
];

export const FALLBACK_HOSPITALS: RadarPlace[] = [
  {
    id: "hosp-bmu",
    code: "BMU",
    name: "BMU Super Specialised Hospital",
    nameBn: "বিএমইউ সুপার স্পেশালাইজড হাসপাতাল",
    kind: "HOSPITAL",
    tier: "PUBLIC",
    lat: 23.7389,
    lon: 90.3946,
    open24h: true,
    services: ["24/7", "ICU", "Ventilator", "OBSTETRIC", "NEURO"],
    icuAvailable: 2,
    icuStaffed: 20,
    address: "Shahbag, Dhaka",
  },
  {
    id: "hosp-square",
    code: "SQUARE",
    name: "Square Hospital",
    nameBn: "স্কয়ার হাসপাতাল",
    kind: "HOSPITAL",
    tier: "PRIVATE",
    lat: 23.7529,
    lon: 90.3818,
    open24h: true,
    services: ["24/7", "ICU", "Ventilator", "O-", "CARDIAC", "TRAUMA"],
    icuAvailable: 4,
    icuStaffed: 18,
    address: "18/F Bir Uttam Qazi Nuruzzaman Sarak, Panthapath",
  },
  {
    id: "hosp-dmch",
    code: "DMCH",
    name: "Dhaka Medical College Hospital",
    nameBn: "ঢাকা মেডিকেল কলেজ হাসপাতাল",
    kind: "HOSPITAL",
    tier: "PUBLIC",
    lat: 23.7254,
    lon: 90.3979,
    open24h: true,
    services: ["24/7", "ICU", "O-", "TRAUMA", "OBSTETRIC"],
    icuAvailable: 0,
    icuStaffed: 24,
    address: "Secretariat Rd, Dhaka",
  },
  {
    id: "hosp-nins",
    code: "NINS",
    name: "National Institute of Neurosciences",
    nameBn: "ন্যাশনাল ইনস্টিটিউট অব নিউরোসায়েন্সেস",
    kind: "HOSPITAL",
    tier: "PUBLIC",
    lat: 23.7736,
    lon: 90.3712,
    open24h: true,
    services: ["24/7", "ICU", "NEURO", "Ventilator"],
    icuAvailable: 1,
    icuStaffed: 14,
    address: "Sher-E-Bangla Nagar, Agargaon, Dhaka",
  },
  {
    id: "hosp-kurmitola",
    code: "KURMITOLA",
    name: "Kurmitola General Hospital",
    nameBn: "কুর্মিটোলা জেনারেল হাসপাতাল",
    kind: "HOSPITAL",
    tier: "PUBLIC",
    lat: 23.8204,
    lon: 90.4096,
    open24h: true,
    services: ["24/7", "ICU", "Ventilator", "TRAUMA"],
    icuAvailable: 3,
    icuStaffed: 12,
    address: "Airport Rd, Cantonment, Dhaka",
  },
  {
    id: "bb-bdrcs",
    code: "BDRCS-MPUR",
    name: "Red Crescent Blood Center Mohammadpur",
    nameBn: "রেড ক্রিসেন্ট ব্লাড সেন্টার মোহাম্মদপুর",
    kind: "BLOOD_BANK",
    tier: "BLOOD_HUB",
    lat: 23.7606,
    lon: 90.3623,
    open24h: true,
    services: ["24/7", "O-", "O+", "A+", "B+", "AB+"],
    address: "7/5 Aurongzeb Rd, Mohammadpur, Dhaka",
  },
];

export function mergeFacilitiesIntoRadar(facilities: Facility[]): RadarPlace[] {
  const fromApi: RadarPlace[] = facilities.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    nameBn: f.name,
    kind: f.tier === "BLOOD_HUB" ? "BLOOD_BANK" : "HOSPITAL",
    tier: f.tier,
    lat: f.lat,
    lon: f.lon,
    open24h: true,
    services:
      f.tier === "BLOOD_HUB"
        ? ["24/7", "O-", "O+", "A+", "B+", "AB+"]
        : ["24/7", ...(f.icu_available > 0 ? ["ICU"] : []), ...f.specialties],
    icuAvailable: f.icu_available,
    icuStaffed: f.icu_staffed,
    address: f.tier === "BLOOD_HUB" ? "Dhaka Blood Hub" : "Dhaka Critical Care Network",
    freshness: f.data_freshness,
  }));

  const seenCodes = new Set(fromApi.map((p) => p.code));
  const merged = [...fromApi];
  for (const extra of [...FALLBACK_HOSPITALS, ...CURATED_RADAR_PLACES]) {
    if (!seenCodes.has(extra.code)) {
      merged.push(extra);
      seenCodes.add(extra.code);
    }
  }
  return merged;
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateEtaMin(km: number, mode: TravelMode): number {
  const speedKmh = mode === "driving" ? 22 : mode === "cycling" ? 28 : 4.8;
  return Math.max(1, Math.round((km / speedKmh) * 60));
}

function formatStepInstruction(step: {
  name?: string;
  maneuver?: { type?: string; modifier?: string };
}, locale: Locale): string {
  const m = step.maneuver ?? {};
  const type = m.type ?? "continue";
  const mod = (m.modifier ?? "").replaceAll("_", " ");
  const road = step.name?.trim();
  if (type === "arrive") {
    return locale === "bn" ? "আপনি গন্তব্যে পৌঁছেছেন" : "Arrive at destination";
  }
  if (type === "depart") {
    const dir = mod ? ` ${mod}` : "";
    return locale === "bn"
      ? `${road ? `${road} ধরে ` : ""}যাত্রা শুরু করুন`
      : `Head${dir}${road ? ` on ${road}` : ""}`;
  }
  if (type === "turn" || type === "end of road" || type === "fork") {
    const verb = mod ? `Turn ${mod}` : "Turn";
    return locale === "bn"
      ? `${mod.includes("left") ? "বামে" : mod.includes("right") ? "ডানে" : "সামনে"} ঘুরুন${road ? ` (${road})` : ""}`
      : `${verb}${road ? ` onto ${road}` : ""}`;
  }
  return locale === "bn"
    ? `${road ? `${road} ধরে ` : ""}সোজা চলুন`
    : `Continue${road ? ` on ${road}` : ""}`;
}

export async function fetchOsrmRoute(
  origin: { lat: number; lon: number },
  dest: { lat: number; lon: number },
  mode: TravelMode,
  locale: Locale = "en"
): Promise<RadarRoute> {
  const profile = mode === "driving" ? "driving" : mode === "cycling" ? "cycling" : "foot";
  const url = `https://router.project-osrm.org/route/v1/${profile}/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) throw new Error("OSRM HTTP error");
    const data = await res.json();
    const route = data?.routes?.[0];
    const coords: [number, number][] = route?.geometry?.coordinates ?? [];
    if (coords.length < 2) throw new Error("Empty route geometry");

    const rawSteps = route?.legs?.[0]?.steps ?? [];
    const steps: RouteStep[] = rawSteps.map(
      (s: { distance?: number; duration?: number; name?: string; maneuver?: { type?: string; modifier?: string } }) => ({
        instruction: formatStepInstruction(s, locale),
        distanceM: Math.round(s.distance ?? 0),
        durationS: Math.round(s.duration ?? 0),
        type: s.maneuver?.type ?? "continue",
        modifier: s.maneuver?.modifier,
      })
    );

    const distanceKm = Number(((route.distance ?? 0) / 1000).toFixed(1));
    // Public OSRM demo server uses car speeds for all profiles; scale realistically per mode.
    const rawMin = Math.round((route.duration ?? 0) / 60);
    const durationMin =
      mode === "driving"
        ? Math.max(2, Math.round(rawMin * 1.45))
        : mode === "cycling"
          ? Math.max(1, Math.round(rawMin * 1.15))
          : estimateEtaMin(distanceKm, "foot");

    return {
      coordinates: coords,
      distanceKm,
      durationMin,
      steps:
        steps.length > 0
          ? steps
          : [
              {
                instruction: locale === "bn" ? "গন্তব্যের দিকে এগিয়ে যান" : "Head toward destination",
                distanceM: Math.round(distanceKm * 1000),
                durationS: durationMin * 60,
                type: "depart",
              },
            ],
      source: "osrm",
    };
  } catch {
    const km = Number(haversineKm(origin, dest).toFixed(1));
    const min = estimateEtaMin(km, mode);
    const midLat = (origin.lat + dest.lat) / 2;
    const midLon = (origin.lon + dest.lon) / 2;
    return {
      coordinates: [
        [origin.lon, origin.lat],
        [midLon, midLat],
        [dest.lon, dest.lat],
      ],
      distanceKm: km,
      durationMin: min,
      steps: [
        {
          instruction: locale === "bn" ? "নির্দেশিত পথে এগিয়ে যান" : "Head toward destination",
          distanceM: Math.round(km * 1000),
          durationS: min * 60,
          type: "depart",
        },
        {
          instruction: locale === "bn" ? "আপনি গন্তব্যে পৌঁছেছেন" : "Arrive at destination",
          distanceM: 0,
          durationS: 0,
          type: "arrive",
        },
      ],
      source: "fallback",
    };
  }
}

/** Query real OpenStreetMap pharmacies & hospitals around any GPS coordinate via fast Nominatim viewbox search. */
export async function fetchLiveOsmMedicalPlaces(
  lat: number,
  lon: number,
  radiusMeters = 4500
): Promise<RadarPlace[]> {
  const delta = radiusMeters / 111000;
  const viewbox = `${(lon - delta).toFixed(4)},${(lat + delta).toFixed(4)},${(lon + delta).toFixed(4)},${(lat - delta).toFixed(4)}`;

  async function queryNominatim(term: string, kind: PlaceKind): Promise<RadarPlace[]> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=bd&bounded=1&viewbox=${viewbox}&limit=15&q=${encodeURIComponent(term)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const rows = await res.json();
      if (!Array.isArray(rows)) return [];
      const out: RadarPlace[] = [];
      for (const r of rows) {
        const pLat = Number(r.lat);
        const pLon = Number(r.lon);
        const rawName = String(r.name || r.display_name || "").split(",")[0].trim();
        if (!rawName || !Number.isFinite(pLat) || !Number.isFinite(pLon)) continue;
        const shortCode = rawName
          .replace(/[^A-Za-z0-9 ]/g, "")
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .join("-")
          .toUpperCase()
          .slice(0, 10);
        out.push({
          id: `osm-nom-${r.osm_type ?? "n"}-${r.osm_id ?? `${pLat}-${pLon}`}`,
          code: shortCode || (kind === "HOSPITAL" ? "HOSP" : "RX"),
          name: rawName,
          nameBn: rawName,
          kind,
          tier: rawName.toLowerCase().includes("government") || rawName.toLowerCase().includes("upazila") ? "PUBLIC" : "PRIVATE",
          lat: pLat,
          lon: pLon,
          open24h: false,
          services: kind === "HOSPITAL" ? ["Hospital", "Emergency"] : ["Pharmacy", "WHO Access"],
          address: String(r.display_name || "").split(",").slice(1, 3).join(", ").trim() || "OpenStreetMap Live POI",
          freshness: "LIVE",
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  const [pharmacies, hospitals] = await Promise.all([
    queryNominatim("pharmacy", "PHARMACY"),
    queryNominatim("hospital", "HOSPITAL"),
  ]);

  const seen = new Set<string>();
  const combined: RadarPlace[] = [];
  for (const item of [...pharmacies, ...hospitals]) {
    const key = `${item.name.toLowerCase()}-${item.lat.toFixed(3)}-${item.lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(item);
  }
  return combined;
}

export interface GeoPlaceResult {
  displayName: string;
  lat: number;
  lon: number;
}

/** Search any neighborhood, road, upazila, or landmark in Bangladesh via Nominatim. */
export async function geocodeBangladeshPlace(query: string): Promise<GeoPlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=bd&limit=5&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r: { display_name?: string; lat?: string; lon?: string }) => ({
        displayName: String(r.display_name ?? "").split(",").slice(0, 3).join(", "),
        lat: Number(r.lat),
        lon: Number(r.lon),
      }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
  } catch {
    return [];
  }
}

/** Reverse-geocode coordinates into a concise Bangladesh neighborhood/upazila label. */
export async function reverseGeocodePlace(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = (data?.address ?? {}) as Record<string, string>;
    const parts = [addr.suburb || addr.neighbourhood || addr.town || addr.village || addr.road, addr.city || addr.state_district].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  } catch {
    return null;
  }
}
