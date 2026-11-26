"use client";

import React, { useMemo } from "react";
import type { Facility } from "@/lib/criticalCare";

interface DhakaMapProps {
  facilities: Facility[];
  incident: { lat: number; lon: number };
  hospitalId?: string | null;
  bloodSourceId?: string | null;
  className?: string;
}

const W = 640;
const H = 420;
const PAD = 48;

const TIER_COLOR: Record<string, string> = {
  PUBLIC: "#14B8A6",
  PRIVATE: "#A78BFA",
  BLOOD_HUB: "#F43F5E",
};

/**
 * Schematic Dhaka map: facilities plotted by real lat/lon on an equirectangular
 * projection fitted to the visible points. No tiles or keys; works offline.
 */
export function DhakaMap({ facilities, incident, hospitalId, bloodSourceId, className = "" }: DhakaMapProps) {
  const project = useMemo(() => {
    const lats = [incident.lat, ...facilities.map((f) => f.lat)];
    const lons = [incident.lon, ...facilities.map((f) => f.lon)];
    const minLat = Math.min(...lats) - 0.004;
    const maxLat = Math.max(...lats) + 0.004;
    const minLon = Math.min(...lons) - 0.004;
    const maxLon = Math.max(...lons) + 0.004;
    // Keep aspect ratio roughly true (1° lon ≈ 0.92 × 1° lat at 23.7°N).
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

  const elbow = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    `M${a.x} ${a.y} L ${a.x} ${(a.y + b.y) / 2} L ${b.x} ${(a.y + b.y) / 2} L ${b.x} ${b.y}`;

  const label = [
    hospital ? `Ambulance route to ${hospital.name}.` : "",
    source && hospital ? `Blood courier from ${source.name} to ${hospital.name}.` : "",
  ]
    .join(" ")
    .trim();

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`Dhaka facility map with ${facilities.length} facilities. ${label}`}
    >
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

      {h && <path d={elbow(inc, h)} fill="none" stroke="#60A5FA" strokeWidth="4" strokeLinecap="round" className="sg-route" />}
      {s && h && <path d={elbow(s, h)} fill="none" stroke="#22D3EE" strokeWidth="4" strokeLinecap="round" className="sg-route" />}

      {facilities.map((f) => {
        const p = project(f.lat, f.lon);
        const active = f.id === hospitalId || f.id === bloodSourceId;
        return (
          <g key={f.id}>
            {active && <circle cx={p.x} cy={p.y} r="30" fill="url(#dm-glow)" />}
            <circle
              cx={p.x}
              cy={p.y}
              r={active ? 11 : 8}
              fill={TIER_COLOR[f.tier] ?? "#91A2AB"}
              fillOpacity={active ? 1 : 0.8}
              stroke="#FFFFFF"
              strokeOpacity={active ? 1 : 0.4}
              strokeWidth={active ? 3 : 2}
            />
            <text
              x={p.x}
              y={p.y - 15}
              textAnchor="middle"
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
        x={inc.x}
        y={inc.y + 26}
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="#FECDD3"
        style={{ paintOrder: "stroke", stroke: "#042F2E", strokeWidth: 4 }}
      >
        Incident
      </text>

      <g fontSize="11" fontWeight="600" fill="#DCE6E9">
        {[
          ["Public", TIER_COLOR.PUBLIC],
          ["Private", TIER_COLOR.PRIVATE],
          ["Blood hub", TIER_COLOR.BLOOD_HUB],
        ].map(([name, color], i) => (
          <g key={name} transform={`translate(${16 + i * 92} ${H - 18})`}>
            <circle r="5" cx="5" cy="-4" fill={color} />
            <text x="15">{name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
