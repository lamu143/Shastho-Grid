"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowUp,
  Bike,
  Building2,
  Car,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  Droplets,
  ExternalLink,
  Footprints,
  Layers,
  MapPin,
  Navigation,
  Pill,
  Play,
  Search,
  Square,
  Volume2,
  VolumeX,
  WifiOff,
} from "lucide-react";
import type { RadarLayerStyle } from "@/components/radar/RadarMap3D";
import {
  CURATED_RADAR_PLACES,
  FALLBACK_HOSPITALS,
  estimateEtaMin,
  fetchLiveOsmMedicalPlaces,
  fetchOsrmRoute,
  geocodeBangladeshPlace,
  haversineKm,
  mergeFacilitiesIntoRadar,
  reverseGeocodePlace,
  type GeoPlaceResult,
  type PlaceKind,
  type RadarPlace,
  type RadarRoute,
  type TravelMode,
} from "@/lib/careRadar";
import { FARMGATE, listFacilities } from "@/lib/criticalCare";
import { useI18n, type Locale } from "@/lib/i18n";

const RadarMap3D = dynamic(() => import("@/components/radar/RadarMap3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] w-full items-center justify-center rounded-2xl bg-fill/60 text-sm font-medium text-ink-3 sm:h-[540px]">
      Loading 3D CareRadar map…
    </div>
  ),
});

type Copy = Record<Locale, string>;
const c = (en: string, bn: string): Copy => ({ en, bn });

const QUICK_ZONES: { id: string; label: Copy; lat: number; lon: number }[] = [
  { id: "farmgate", label: c("Farmgate", "ফার্মগেট"), lat: FARMGATE.lat, lon: FARMGATE.lon },
  { id: "savar", label: c("Savar / Ashulia", "সাভার / আশুলিয়া"), lat: 23.8583, lon: 90.2667 },
  { id: "mirpur", label: c("Mirpur 10", "মিরপুর ১০"), lat: 23.8069, lon: 90.3687 },
  { id: "uttara", label: c("Uttara", "উত্তরা"), lat: 23.8759, lon: 90.3795 },
  { id: "dhanmondi", label: c("Dhanmondi", "ধানমন্ডি"), lat: 23.7461, lon: 90.3742 },
];

const NEED_CHIPS = ["24/7", "ICU", "O-", "WHO Access"] as const;

function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function TurnIcon({ modifier }: { modifier?: string }) {
  if (modifier?.includes("left")) return <CornerUpLeft className="h-7 w-7 shrink-0" aria-hidden="true" />;
  if (modifier?.includes("right")) return <CornerUpRight className="h-7 w-7 shrink-0" aria-hidden="true" />;
  return <ArrowUp className="h-7 w-7 shrink-0" aria-hidden="true" />;
}

export default function CareRadarPage() {
  const { locale } = useI18n();
  const L = useCallback((x: Copy) => x[locale] ?? x.en, [locale]);

  const [userPos, setUserPos] = useState<{ lat: number; lon: number }>(FARMGATE);
  const [basePlaces, setBasePlaces] = useState<RadarPlace[]>([...FALLBACK_HOSPITALS, ...CURATED_RADAR_PLACES]);
  const [osmPlaces, setOsmPlaces] = useState<RadarPlace[]>([]);
  const [areaLabel, setAreaLabel] = useState<string | null>(null);
  const [areaSearch, setAreaSearch] = useState("");
  const [areaResults, setAreaResults] = useState<GeoPlaceResult[]>([]);
  const [scanningOsm, setScanningOsm] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"ALL" | PlaceKind>("ALL");
  const [needFilter, setNeedFilter] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("driving");
  const [layerStyle, setLayerStyle] = useState<RadarLayerStyle>("satellite3d");

  const [selectedId, setSelectedId] = useState<string | null>("hosp-evercare");
  const [route, setRoute] = useState<RadarRoute | null>(null);
  const [routingBusy, setRoutingBusy] = useState(false);

  const [navigating, setNavigating] = useState(false);
  const [navIdx, setNavIdx] = useState(0);
  const [navPos, setNavPos] = useState<{ lat: number; lon: number; bearing: number } | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const lastSpokenRef = useRef<string>("");

  // Load live facilities when backend is available; fallback list is always ready.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const sync = () => setIsOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    let active = true;
    listFacilities(userPos.lat, userPos.lon)
      .then((res) => {
        if (active && res.items.length > 0) {
          setBasePlaces(mergeFacilitiesIntoRadar(res.items));
        }
      })
      .catch(() => {
        // Public/offline fallback already populated.
      });
    return () => {
      active = false;
    };
  }, [userPos.lat, userPos.lon]);

  // Discover real OpenStreetMap pharmacies & hospitals around userPos + reverse geocode area name.
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setScanningOsm(true);
    });

    reverseGeocodePlace(userPos.lat, userPos.lon).then((label) => {
      if (active && label) setAreaLabel(label);
    });

    fetchLiveOsmMedicalPlaces(userPos.lat, userPos.lon, 5000)
      .then((liveOsm) => {
        if (active) setOsmPlaces(liveOsm);
      })
      .finally(() => {
        if (active) setScanningOsm(false);
      });

    return () => {
      active = false;
    };
  }, [userPos.lat, userPos.lon]);

  const places = useMemo(() => {
    const seen = new Set(basePlaces.map((p) => `${p.name.toLowerCase()}-${p.lat.toFixed(3)}-${p.lon.toFixed(3)}`));
    const merged = [...basePlaces];
    for (const o of osmPlaces) {
      const k = `${o.name.toLowerCase()}-${o.lat.toFixed(3)}-${o.lon.toFixed(3)}`;
      if (!seen.has(k)) {
        merged.push(o);
        seen.add(k);
      }
    }
    return merged;
  }, [basePlaces, osmPlaces]);

  const searchArea = async () => {
    const res = await geocodeBangladeshPlace(areaSearch);
    setAreaResults(res);
    if (res.length === 1) {
      setUserPos({ lat: res[0].lat, lon: res[0].lon });
      setAreaResults([]);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places
      .filter((p) => {
        if (kindFilter !== "ALL" && p.kind !== kindFilter) return false;
        if (needFilter && !p.services.some((s) => s.toLowerCase() === needFilter.toLowerCase()) && !(needFilter === "24/7" && p.open24h)) {
          return false;
        }
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.nameBn.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          p.services.some((s) => s.toLowerCase().includes(q))
        );
      })
      .map((p) => {
        const km = Number(haversineKm(userPos, p).toFixed(1));
        return { place: p, km, eta: estimateEtaMin(km, travelMode) };
      })
      .sort((a, b) => a.km - b.km);
  }, [places, kindFilter, needFilter, query, userPos, travelMode]);

  const selectedPlace = useMemo(
    () => places.find((p) => p.id === selectedId) ?? filtered[0]?.place ?? null,
    [places, selectedId, filtered]
  );

  // Fetch road route whenever origin, destination, or travelMode changes.
  useEffect(() => {
    if (!selectedPlace) return;
    let active = true;

    Promise.resolve().then(() => {
      if (!active) return;
      setRoutingBusy(true);
      setNavigating(false);
      setNavPos(null);
      setNavIdx(0);
    });

    fetchOsrmRoute(userPos, selectedPlace, travelMode, locale)
      .then((r) => {
        if (active) setRoute(r);
      })
      .finally(() => {
        if (active) setRoutingBusy(false);
      });
    return () => {
      active = false;
    };
  }, [userPos, selectedPlace, travelMode, locale]);

  // Live 3D turn-by-turn navigation simulation along the real road geometry.
  useEffect(() => {
    if (!navigating || !route || route.coordinates.length < 2) return;

    const coords = route.coordinates;
    const total = coords.length;
    const stepStride = Math.max(1, Math.floor(total / 80));

    const timer = window.setInterval(() => {
      setNavIdx((prev) => {
        const next = prev + stepStride;
        if (next >= total - 1) {
          setNavigating(false);
          const last = coords[total - 1];
          setNavPos({ lat: last[1], lon: last[0], bearing: 0 });
          return total - 1;
        }
        const cur = coords[next];
        const ahead = coords[Math.min(total - 1, next + stepStride)];
        const brg = bearingDeg({ lat: cur[1], lon: cur[0] }, { lat: ahead[1], lon: ahead[0] });
        setNavPos({ lat: cur[1], lon: cur[0], bearing: brg });
        return next;
      });
    }, 350);

    return () => window.clearInterval(timer);
  }, [navigating, route]);

  const currentStepIdx = useMemo(() => {
    if (!route || route.steps.length === 0) return 0;
    const progress = route.coordinates.length > 1 ? navIdx / (route.coordinates.length - 1) : 0;
    return Math.min(route.steps.length - 1, Math.floor(progress * route.steps.length));
  }, [route, navIdx]);

  const currentStep = route?.steps[currentStepIdx] ?? null;
  const nextStep = route && currentStepIdx + 1 < route.steps.length ? route.steps[currentStepIdx + 1] : null;

  // Optional Web Speech voice guidance when navigating.
  useEffect(() => {
    if (!navigating || !voiceOn || !currentStep || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (lastSpokenRef.current === currentStep.instruction) return;
    lastSpokenRef.current = currentStep.instruction;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(currentStep.instruction);
      utter.lang = locale === "bn" ? "bn-BD" : "en-US";
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore speech synthesis errors in restricted browsers.
    }
  }, [navigating, voiceOn, currentStep, locale]);

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGpsNotice(L(c("GPS is not supported in this browser.", "এই ব্রাউজারে GPS সমর্থিত নয়।")));
      return;
    }
    setGpsNotice(L(c("Locating your GPS…", "আপনার GPS অবস্থান খোঁজা হচ্ছে…")));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lon: Number(pos.coords.longitude.toFixed(5)),
        });
        setGpsNotice(null);
      },
      () => {
        setGpsNotice(L(c("Location permission denied; using selected zone.", "লোকেশন অনুমতি পাওয়া যায়নি; নির্বাচিত এলাকা ব্যবহৃত হচ্ছে।")));
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const progressRatio =
    navigating && route && route.coordinates.length > 1
      ? Math.max(0.05, 1 - navIdx / (route.coordinates.length - 1))
      : 1;
  const displayMin = route ? Math.max(1, Math.round(route.durationMin * progressRatio)) : 0;
  const displayKm = route ? Number((route.distanceKm * progressRatio).toFixed(1)) : 0;
  const speedKmh = navigating ? (travelMode === "driving" ? 34 : travelMode === "cycling" ? 28 : 5) : 0;

  return (
    <div className="space-y-5 pb-16 sm:pb-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink">
            <Navigation className="h-4 w-4" aria-hidden="true" />
            CareRadar · 3D Locator & Navigator
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {L(c("Find pharmacies, hospitals & blood banks in 3D", "৩ডি ম্যাপে ফার্মেসি, হাসপাতাল ও ব্লাড ব্যাংক খুঁজুন"))}
          </h1>
          <p className="text-sm text-ink-3">
            {L(
              c(
                "Search what you need, inspect live ICU or 24/7 pharmacy availability, and follow turn-by-turn 3D navigation.",
                "আপনার প্রয়োজনীয় সেবা খুঁজুন, লাইভ আইসিইউ বা ২৪/৭ ফার্মেসি দেখুন এবং ৩ডি টার্ন-বাই-টার্ন নেভিগেশন অনুসরণ করুন।"
              )
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={useMyLocation}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-brand-ink shadow-xs transition hover:border-brand/40 hover:bg-brand-soft"
        >
          <Crosshair className="h-4 w-4" aria-hidden="true" />
          {L(c("Use my GPS location", "আমার GPS অবস্থান ব্যবহার করুন"))}
        </button>
      </header>

      {gpsNotice && (
        <p role="status" className="rounded-xl border border-line bg-info-soft px-3.5 py-2 text-xs text-info-ink">
          {gpsNotice}
        </p>
      )}

      {!isOnline && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-warn/50 bg-warn-soft px-3.5 py-2 text-xs font-medium text-warn-ink">
          <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>
            {L(
              c(
                "Offline mode: showing cached Dhaka medical centers and estimated Haversine travel times. Live OSM discovery and OSRM road routing resume when online.",
                "অফলাইন মোড: সংরক্ষিত ঢাকার চিকিৎসা কেন্দ্র এবং আনুমানিক ভ্রমণ সময় দেখানো হচ্ছে। অনলাইনে এলে লাইভ OSM ও OSRM রুট চালু হবে।"
              )
            )}
          </span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,4.5fr)_minmax(0,7.5fr)]">
        {/* Left: Search, Filters & Nearby List */}
        <section aria-label={L(c("Search medical facilities", "চিকিৎসা কেন্দ্র খুঁজুন"))} className="mac-card flex flex-col gap-4 p-4 sm:p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={L(c("Search medical facilities", "চিকিৎসা কেন্দ্র খুঁজুন"))}
              placeholder={L(c("Search pharmacy, hospital, O- blood, ICU, Amoxicillin…", "ফার্মেসি, হাসপাতাল, O- রক্ত, আইসিইউ, অ্যামোক্সিসিলিন খুঁজুন…"))}
              className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-10 text-sm text-ink placeholder:text-ink-3 focus:border-brand"
            />
          </div>

          {/* Category Filter */}
          <div className="segmented grid grid-cols-4" role="group" aria-label={L(c("Facility type", "প্রতিষ্ঠানের ধরন"))}>
            {(
              [
                ["ALL", c("All", "সব")],
                ["HOSPITAL", c("Hospitals", "হাসপাতাল")],
                ["BLOOD_BANK", c("Blood", "রক্ত")],
                ["PHARMACY", c("Pharmacy", "ফার্মেসি")],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={kindFilter === k}
                onClick={() => setKindFilter(k)}
                className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                  kindFilter === k ? "bg-surface text-brand-ink shadow-xs" : "text-ink-2 hover:text-ink"
                }`}
              >
                {L(label)}
              </button>
            ))}
          </div>

          {/* Quick Need Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {NEED_CHIPS.map((chip) => {
              const active = needFilter === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setNeedFilter(active ? null : chip)}
                  className={`min-h-8 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    active
                      ? "border-brand/50 bg-brand-soft text-brand-ink"
                      : "border-line bg-surface/70 text-ink-2 hover:bg-surface"
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>

          {/* Jump to any area in Bangladesh + Quick Zone Switcher */}
          <div className="space-y-2 border-t border-line/70 pt-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void searchArea();
              }}
              className="flex gap-1.5"
            >
              <input
                type="text"
                value={areaSearch}
                onChange={(e) => setAreaSearch(e.target.value)}
                aria-label={L(c("Jump to area", "এলাকায় যান"))}
                placeholder={L(c("Jump to any area (e.g. Dhamrai, Savar, Banani)…", "যেকোনো এলাকায় যান (যেমন: ধামরাই, সাভার, বনানী)…"))}
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-3 focus:border-brand"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-strong"
              >
                {L(c("Go", "যান"))}
              </button>
            </form>

            {areaResults.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {areaResults.map((r) => (
                  <button
                    key={`${r.lat}-${r.lon}`}
                    type="button"
                    onClick={() => {
                      setUserPos({ lat: r.lat, lon: r.lon });
                      setAreaResults([]);
                    }}
                    className="min-h-8 rounded-lg border border-brand/30 bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-ink hover:brightness-95"
                  >
                    {r.displayName}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3">
                <MapPin className="h-3 w-3 text-danger-ink" aria-hidden="true" />
                {areaLabel ?? L(c("Your zone:", "আপনার এলাকা:"))}
              </span>
              {scanningOsm ? (
                <span className="rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-semibold text-info-ink">
                  {L(c("Scanning OSM POIs…", "আশেপাশের কেন্দ্র খোঁজা হচ্ছে…"))}
                </span>
              ) : osmPlaces.length > 0 ? (
                <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-ink">
                  {L(c(`${osmPlaces.length} live OSM nearby`, `${osmPlaces.length}টি লাইভ কেন্দ্র`))}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_ZONES.map((z) => {
                const isHere = Math.abs(userPos.lat - z.lat) < 0.004 && Math.abs(userPos.lon - z.lon) < 0.004;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setUserPos({ lat: z.lat, lon: z.lon })}
                    className={`min-h-8 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                      isHere ? "bg-info-soft text-info-ink" : "bg-fill text-ink-2 hover:text-ink"
                    }`}
                  >
                    {L(z.label)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results List */}
          <div
            role="region"
            className="max-h-[380px] space-y-2 overflow-y-auto pr-1"
            aria-label={L(c("Nearby places", "নিকটবর্তী স্থান"))}
          >
            {filtered.length === 0 ? (
              <p className="rounded-xl bg-fill/60 p-4 text-center text-xs text-ink-3">
                {L(c("No matching facilities found. Clear a filter or search another term.", "কোনো মিল পাওয়া যায়নি। ফিল্টার সরিয়ে আবার চেষ্টা করুন।"))}
              </p>
            ) : (
              filtered.map(({ place, km, eta }) => {
                const isSel = selectedPlace?.id === place.id;
                const KindIcon =
                  place.kind === "HOSPITAL" ? Building2 : place.kind === "BLOOD_BANK" ? Droplets : Pill;
                return (
                  <button
                    key={place.id}
                    type="button"
                    aria-pressed={isSel}
                    onClick={() => setSelectedId(place.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isSel
                        ? "border-brand bg-brand-soft/60 ring-1 ring-brand/40"
                        : "border-line bg-surface/80 hover:border-brand/30 hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <KindIcon className="h-3.5 w-3.5 shrink-0 text-brand-ink" aria-hidden="true" />
                          <span className="truncate text-sm font-bold text-ink">
                            {locale === "bn" ? place.nameBn : place.name}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-3">{place.address}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-fill px-2 py-0.5 font-mono text-[11px] font-bold text-ink tabular-nums">
                        {eta} min · {km} km
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {place.kind === "HOSPITAL" && (
                        <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand-ink">
                          ICU {place.icuAvailable ?? 0}/{place.icuStaffed ?? 0}
                        </span>
                      )}
                      {place.services.slice(0, 4).map((s) => (
                        <span key={s} className="rounded bg-fill px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">
                          {s}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Right: 3D Map + Turn-by-Turn Banner + Bottom Nav Sheet */}
        <section className="scroll-mt-24 space-y-3">
          {/* Top Turn-by-Turn Banner (Google Maps style in ShasthoGrid teal) */}
          {currentStep && selectedPlace && (
            <div className="overflow-hidden rounded-2xl bg-[#064E3B] text-white shadow-lg">
              <div className="flex items-center gap-3 px-4 py-3">
                <TurnIcon modifier={currentStep.modifier} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold sm:text-lg">{currentStep.instruction}</p>
                  <p className="text-xs text-[#A7F3D0]">
                    {currentStep.distanceM >= 1000
                      ? `${(currentStep.distanceM / 1000).toFixed(1)} km`
                      : `${currentStep.distanceM} m`}{" "}
                    · {locale === "bn" ? selectedPlace.nameBn : selectedPlace.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {navigating && (
                    <span className="rounded-xl bg-white/15 px-2.5 py-1 font-mono text-xs font-bold tabular-nums">
                      {speedKmh} km/h
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setVoiceOn((v) => !v)}
                    aria-label={L(c("Toggle voice guidance", "ভয়েস নির্দেশনা চালু/বন্ধ"))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                  >
                    {voiceOn ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              {nextStep && (
                <div className="flex items-center gap-2 border-t border-white/10 bg-[#042F2E]/70 px-4 py-1.5 text-xs text-[#CCFBF1]">
                  <span>{L(c("Then", "এরপর"))}</span>
                  <span className="truncate font-semibold">{nextStep.instruction}</span>
                </div>
              )}
            </div>
          )}

          {/* 3D Map Container + Floating Layer Switcher */}
          <div className="mac-card relative overflow-hidden p-1.5">
            <div className="absolute left-3.5 top-3.5 z-10 flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["satellite3d", c("3D Satellite", "৩ডি স্যাটেলাইট")],
                  ["street3d", c("3D Street", "৩ডি স্ট্রিট")],
                  ["topdown", c("2D", "২ডি")],
                ] as const
              ).map(([st, label]) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setLayerStyle(st)}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold shadow-md backdrop-blur-md transition ${
                    layerStyle === st
                      ? "bg-[#0F766E] text-white"
                      : "bg-white/90 text-[#0E1E25] hover:bg-white"
                  }`}
                >
                  <Layers className="h-3 w-3" aria-hidden="true" />
                  {L(label)}
                </button>
              ))}
            </div>

            <RadarMap3D
              places={filtered.map((f) => f.place)}
              userPos={userPos}
              navPos={navPos}
              selectedId={selectedPlace?.id ?? null}
              route={route}
              layerStyle={layerStyle}
              navigating={navigating}
              locale={locale}
              onSelectPlace={(p) => setSelectedId(p.id)}
              onMoveUser={(pos) => setUserPos(pos)}
            />
          </div>

          {/* Bottom Navigation Bar */}
          {selectedPlace && (
            <div className="mac-card flex flex-col gap-3 p-4 pr-4 sm:flex-row sm:items-center sm:justify-between xl:pr-20">
              <div className="space-y-1.5">
                <div className="segmented" role="group" aria-label={L(c("Travel mode", "যাত্রার ধরন"))}>
                  {(
                    [
                      ["driving", Car, c("Drive", "গাড়ি")],
                      ["cycling", Bike, c("Moto", "বাইক")],
                      ["foot", Footprints, c("Walk", "হাঁটা")],
                    ] as const
                  ).map(([m, Icon, label]) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={travelMode === m}
                      onClick={() => setTravelMode(m)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        travelMode === m ? "bg-surface text-brand-ink shadow-xs" : "text-ink-2 hover:text-ink"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {L(label)}
                    </button>
                  ))}
                </div>
                <p className="text-lg font-bold tabular-nums text-ink">
                  {routingBusy ? "…" : `${displayMin} min`}{" "}
                  <span className="text-sm font-medium text-ink-3">
                    ({displayKm} km · {route?.source === "osrm" ? "Road route" : "Direct"})
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (navigating) {
                      setNavigating(false);
                      setNavPos(null);
                    } else {
                      setNavIdx(0);
                      setNavigating(true);
                    }
                  }}
                  disabled={!route || route.coordinates.length < 2}
                  className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-md transition ${
                    navigating ? "bg-danger hover:opacity-95" : "bg-[#0F766E] hover:bg-[#115E59]"
                  }`}
                >
                  {navigating ? (
                    <>
                      <Square className="h-4 w-4" aria-hidden="true" />
                      {L(c("Stop navigation", "নেভিগেশন থামান"))}
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" aria-hidden="true" />
                      {L(c("Start 3D Navigation", "৩ডি নেভিগেশন শুরু"))}
                    </>
                  )}
                </button>

                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${userPos.lat},${userPos.lon}&destination=${selectedPlace.lat},${selectedPlace.lon}&travelmode=${travelMode === "foot" ? "walking" : "driving"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-brand-ink transition hover:bg-fill"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Google Maps
                </a>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
