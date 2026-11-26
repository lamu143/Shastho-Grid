"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Grid3X3, Map as MapIcon, MapPin } from "lucide-react";
import type { Facility } from "@/lib/criticalCare";

const LeafletDhakaMap = dynamic(() => import("./LeafletDhakaMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[340px] w-full items-center justify-center rounded-[1.1rem] bg-fill/60 text-xs font-medium text-ink-3 sm:h-[380px]">
      Loading Dhaka street map…
    </div>
  ),
});

interface DhakaMapProps {
  facilities: Facility[];
  incident: { lat: number; lon: number };
  hospitalId?: string | null;
  bloodSourceId?: string | null;
  className?: string;
  locale?: "en" | "bn";
  onIncidentChange?: (pos: { lat: number; lon: number }) => void;
}

const W = 640;
const H = 420;
const PAD = 48;

const TIER_COLOR: Record<string, string> = {
  PUBLIC: "#14B8A6",
  PRIVATE: "#A78BFA",
  BLOOD_HUB: "#F43F5E",
};

const TEXT = {
  en: {
    incident: "Incident",
    public: "Public",
    private: "Private",
    hub: "Blood hub",
    ambulance: "Ambulance",
    courier: "Blood courier",
    map: (n: number) => `Dhaka facility map with ${n} facilities.`,
    amb: (h: string) => `Ambulance route to ${h}.`,
    cour: (s: string, h: string) => `Blood courier from ${s} to ${h}.`,
  },
  bn: {
    incident: "ঘটনাস্থল",
    public: "সরকারি",
    private: "বেসরকারি",
    hub: "ব্লাড হাব",
    ambulance: "অ্যাম্বুলেন্স",
    courier: "রক্ত কুরিয়ার",
    map: (n: number) => `ঢাকার ${n}টি ফ্যাসিলিটির মানচিত্র।`,
    amb: (h: string) => `${h}-এ অ্যাম্বুলেন্সের পথ।`,
    cour: (s: string, h: string) => `${s} থেকে ${h}-এ রক্ত কুরিয়ার।`,
  },
};

/** Tier is shown by shape as well as colour (WCAG 1.4.1): circle, square, diamond. */
function Marker({ tier, x, y, r, fill, active }: { tier: string; x: number; y: number; r: number; fill: string; active: boolean }) {
  const common = {
    fill,
    fillOpacity: active ? 1 : 0.85,
    stroke: "#FFFFFF",
    strokeOpacity: active ? 1 : 0.5,
    strokeWidth: active ? 3 : 2,
  };
  if (tier === "PRIVATE") return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={2} {...common} />;
  if (tier === "BLOOD_HUB") {
    const d = r * 1.25;
    return <path d={`M${x} ${y - d} L${x + d} ${y} L${x} ${y + d} L${x - d} ${y} Z`} {...common} />;
  }
  return <circle cx={x} cy={y} r={r} {...common} />;
}

/**
 * Offline-safe tactical SVG projection of Dhaka facilities.
 */
function TacticalSvgMap({
  facilities,
  incident,
  hospitalId,
  bloodSourceId,
  className = "",
  locale = "en",
}: Omit<DhakaMapProps, "onIncidentChange">) {
  const T = TEXT[locale];
  const project = useMemo(() => {
    const lats = [incident.lat, ...facilities.map((f) => f.lat)];
    const lons = [incident.lon, ...facilities.map((f) => f.lon)];
    const minLat = Math.min(...lats) - 0.004;
    const maxLat = Math.max(...lats) + 0.004;
    const minLon = Math.min(...lons) - 0.004;
    const maxLon = Math.max(...lons) + 0.004;
    const spanX = (maxLon - minLon) * 0.92;
    const spanY = maxLat - minLat;
    const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
    const offX = (W - spanX * scale) / 2;
    const offY = (H - spanY * scale) / 2;
    return (lat: number, lon: number) => ({
      x: offX + (lon - minLon) * 0.92 * scale,
      y: offY + (maxLat - lat) * scale,
    });
  }, [facilities, incident]);

  const inc = project(incident.lat, incident.lon);
  const hospital = facilities.find((f) => f.id === hospitalId);
  const source = facilities.find((f) => f.id === bloodSourceId);
  const h = hospital ? project(hospital.lat, hospital.lon) : null;
  const s = source ? project(source.lat, source.lon) : null;

  const labelPos = useMemo(() => {
    type Box = { x0: number; y0: number; x1: number; y1: number };
    const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const points = [
      ...facilities.map((f) => ({ id: f.id, text: f.code, ...project(f.lat, f.lon), r: 11 })),
      { id: "__incident", text: T.incident, ...project(incident.lat, incident.lon), r: 12 },
    ];
    const taken: Box[] = points.map((pt) => ({ x0: pt.x - pt.r, y0: pt.y - pt.r, x1: pt.x + pt.r, y1: pt.y + pt.r }));
    const out: Record<string, { x: number; y: number; anchor: "middle" | "start" | "end" }> = {};
    for (const pt of [...points].reverse()) {
      const w = pt.text.length * 7.6 + 6;
      const candidates = [
        { x: pt.x, y: pt.y - 15, anchor: "middle" as const, box: { x0: pt.x - w / 2, y0: pt.y - 15 - 11, x1: pt.x + w / 2, y1: pt.y - 15 + 4 } },
        { x: pt.x, y: pt.y + 25, anchor: "middle" as const, box: { x0: pt.x - w / 2, y0: pt.y + 25 - 11, x1: pt.x + w / 2, y1: pt.y + 25 + 4 } },
        { x: pt.x + 15, y: pt.y + 4, anchor: "start" as const, box: { x0: pt.x + 15, y0: pt.y + 4 - 11, x1: pt.x + 15 + w, y1: pt.y + 4 + 4 } },
        { x: pt.x - 15, y: pt.y + 4, anchor: "end" as const, box: { x0: pt.x - 15 - w, y0: pt.y + 4 - 11, x1: pt.x - 15, y1: pt.y + 4 + 4 } },
      ];
      const inBounds = (b: Box) => b.x0 >= 4 && b.x1 <= W - 4 && b.y0 >= 4 && b.y1 <= H - 34;
      const own = (b: Box) => taken.filter((t) => !(t.x0 === pt.x - pt.r && t.y0 === pt.y - pt.r)).some((t) => hit(t, b));
      const pick = candidates.find((cd) => inBounds(cd.box) && !own(cd.box)) ?? candidates[0];
      taken.push(pick.box);
      out[pt.id] = { x: pick.x, y: pick.y, anchor: pick.anchor };
    }
    return out;
  }, [facilities, incident, project, T.incident]);

  const elbow = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    `M${a.x} ${a.y} L ${a.x} ${(a.y + b.y) / 2} L ${b.x} ${(a.y + b.y) / 2} L ${b.x} ${b.y}`;

  const label = [
    hospital ? T.amb(hospital.name) : "",
    source && hospital ? T.cour(source.name, hospital.name) : "",
  ]
    .join(" ")
    .trim();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`${T.map(facilities.length)} ${label}`}>
      <defs>
        <linearGradient id="dm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#042F2E" />
          <stop offset="1" stopColor="#0C4A6E" />
        </linearGradient>
        <radialGradient id="dm-glow">
          <stop offset="0" stopColor="#2DD4BF" stopOpacity="0.5" />
          <stop offset="1" stopColor="#2DD4BF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} rx="22" fill="url(#dm-bg)" />
      <g stroke="#5EEAD4" strokeOpacity="0.08">
        {Array.from({ length: 12 }, (_, i) => (
          <line key={`v${i}`} x1={i * 56} y1="0" x2={i * 56} y2={H} />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 56} x2={W} y2={i * 56} />
        ))}
      </g>
      <path
        d={`M-10 ${H - 60} C 120 ${H - 100}, 220 ${H - 20}, 340 ${H - 55} S 560 ${H - 110}, ${W + 10} ${H - 70}`}
        fill="none"
        stroke="#38BDF8"
        strokeOpacity="0.22"
        strokeWidth="16"
      />
      {h && <path d={elbow(inc, h)} fill="none" stroke="#60A5FA" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
      {s && h && <path d={elbow(s, h)} fill="none" stroke="#22D3EE" strokeWidth="4" strokeLinecap="round" className="sg-route" />}
      {facilities.map((f) => {
        const p = project(f.lat, f.lon);
        const active = f.id === hospitalId || f.id === bloodSourceId;
        return (
          <g key={f.id}>
            {active && <circle cx={p.x} cy={p.y} r="30" fill="url(#dm-glow)" />}
            <Marker tier={f.tier} x={p.x} y={p.y} r={active ? 11 : 8} fill={TIER_COLOR[f.tier] ?? "#91A2AB"} active={active} />
            <text
              x={labelPos[f.id]?.x ?? p.x}
              y={labelPos[f.id]?.y ?? p.y - 15}
              textAnchor={labelPos[f.id]?.anchor ?? "middle"}
              fontSize="12"
              fontWeight="700"
              fill={active ? "#FFFFFF" : "#D1DEE3"}
              style={{ paintOrder: "stroke", stroke: "#042F2E", strokeWidth: 4 }}
            >
              {f.code}
            </text>
          </g>
        );
      })}
      <circle cx={inc.x} cy={inc.y} r="10" fill="#F43F5E" className="sg-ping" />
      <circle cx={inc.x} cy={inc.y} r="9" fill="#F43F5E" stroke="#FFF1F2" strokeWidth="3" />
      <text
        x={labelPos.__incident?.x ?? inc.x}
        y={labelPos.__incident?.y ?? inc.y + 26}
        textAnchor={labelPos.__incident?.anchor ?? "middle"}
        fontSize="12"
        fontWeight="700"
        fill="#FECDD3"
        style={{ paintOrder: "stroke", stroke: "#042F2E", strokeWidth: 4 }}
      >
        {T.incident}
      </text>
      <g fontSize="11" fontWeight="600" fill="#DCE6E9" aria-hidden="true">
        {(
          [
            ["PUBLIC", T.public],
            ["PRIVATE", T.private],
            ["BLOOD_HUB", T.hub],
          ] as const
        ).map(([tier, name], i) => (
          <g key={tier} transform={`translate(${16 + i * 86} ${H - 18})`}>
            <Marker tier={tier} x={5} y={-4} r={5} fill={TIER_COLOR[tier]} active={false} />
            <text x="15">{name}</text>
          </g>
        ))}
        <g transform={`translate(${16 + 3 * 86 + 8} ${H - 18})`}>
          <line x1="0" y1="-4" x2="20" y2="-4" stroke="#60A5FA" strokeWidth="3" strokeLinecap="round" />
          <text x="26">{T.ambulance}</text>
        </g>
        <g transform={`translate(${16 + 4 * 86 + 30} ${H - 18})`}>
          <line x1="0" y1="-4" x2="20" y2="-4" stroke="#22D3EE" strokeWidth="3" strokeDasharray="4 4" strokeLinecap="round" />
          <text x="26">{T.courier}</text>
        </g>
      </g>
    </svg>
  );
}

/**
 * Dual-mode Dhaka map: real interactive OpenStreetMap/CARTO street map via Leaflet
 * with automatic fallback to the offline-safe tactical SVG grid.
 */
export function DhakaMap(props: DhakaMapProps) {
  const { locale = "en", onIncidentChange, incident } = props;
  const [mapMode, setMapMode] = useState<"street" | "grid">("street");
  const [tilesOffline, setTilesOffline] = useState(false);

  const showStreet = mapMode === "street" && !tilesOffline;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-1">
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
          <MapPin className="h-3.5 w-3.5 text-danger-ink" aria-hidden="true" />
          <span className="font-mono text-[11px] text-ink-2">
            {incident.lat.toFixed(4)}, {incident.lon.toFixed(4)}
          </span>
          {onIncidentChange && showStreet && (
            <span className="hidden sm:inline">
              · {locale === "bn" ? "ম্যাপে ক্লিক বা পিন টেনে ঘটনাস্থল বদলান" : "Click map or drag pin to move incident"}
            </span>
          )}
        </span>

        <div className="segmented" role="tablist" aria-label={locale === "bn" ? "মানচিত্রের ধরন" : "Map mode"}>
          <button
            type="button"
            role="tab"
            aria-selected={showStreet}
            onClick={() => {
              setTilesOffline(false);
              setMapMode("street");
            }}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              showStreet ? "bg-surface text-brand-ink shadow-sm" : "text-ink-2 hover:text-ink"
            }`}
          >
            <MapIcon className="h-3 w-3" aria-hidden="true" />
            {locale === "bn" ? "রিয়েল ম্যাপ" : "Street Map"}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!showStreet}
            onClick={() => setMapMode("grid")}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              !showStreet ? "bg-surface text-brand-ink shadow-sm" : "text-ink-2 hover:text-ink"
            }`}
          >
            <Grid3X3 className="h-3 w-3" aria-hidden="true" />
            {locale === "bn" ? "গ্রিড" : "Tactical Grid"}
          </button>
        </div>
      </div>

      {showStreet ? (
        <LeafletDhakaMap
          facilities={props.facilities}
          incident={props.incident}
          hospitalId={props.hospitalId}
          bloodSourceId={props.bloodSourceId}
          locale={locale}
          onIncidentChange={onIncidentChange}
          onTileError={() => setTilesOffline(true)}
        />
      ) : (
        <TacticalSvgMap {...props} />
      )}
    </div>
  );
}
