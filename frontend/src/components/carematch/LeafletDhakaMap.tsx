"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Facility } from "@/lib/criticalCare";

interface LeafletDhakaMapProps {
  facilities: Facility[];
  incident: { lat: number; lon: number };
  hospitalId?: string | null;
  bloodSourceId?: string | null;
  locale?: "en" | "bn";
  onIncidentChange?: (pos: { lat: number; lon: number }) => void;
  onTileError?: () => void;
}

const TIER_HEX: Record<string, string> = {
  PUBLIC: "#0F766E",
  PRIVATE: "#7C3AED",
  BLOOD_HUB: "#E11D48",
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isDarkTheme(): boolean {
  if (typeof document === "undefined") return false;
  const t = document.documentElement.dataset.theme;
  return t === "dark" || t === "ocean";
}

export default function LeafletDhakaMap({
  facilities,
  incident,
  hospitalId,
  bloodSourceId,
  locale = "en",
  onIncidentChange,
  onTileError,
}: LeafletDhakaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const onIncidentRef = useRef(onIncidentChange);
  const onTileErrorRef = useRef(onTileError);
  const fittedRef = useRef(false);
  // The map is created once; it starts centred on the first incident. Later moves are
  // handled by the marker/route effect below, so the map is never torn down and rebuilt.
  const initialCenterRef = useRef<[number, number]>([incident.lat, incident.lon]);

  useEffect(() => {
    onIncidentRef.current = onIncidentChange;
  }, [onIncidentChange]);

  useEffect(() => {
    onTileErrorRef.current = onTileError;
  }, [onTileError]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: initialCenterRef.current,
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    const dark = isDarkTheme();
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: dark ? "brightness-90 contrast-105 invert hue-rotate-180" : "",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    let tileErrors = 0;
    tiles.on("tileerror", () => {
      tileErrors += 1;
      if (tileErrors >= 4) {
        onTileErrorRef.current?.();
      }
    });
    tiles.addTo(map);

    const group = L.layerGroup().addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onIncidentRef.current?.({
        lat: Number(e.latlng.lat.toFixed(5)),
        lon: Number(e.latlng.lng.toFixed(5)),
      });
    });

    mapRef.current = map;
    tileLayerRef.current = tiles;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      layerGroupRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  // Re-render markers, incident pin, and route polylines whenever data changes.
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const hospital = facilities.find((f) => f.id === hospitalId);
    const source = facilities.find((f) => f.id === bloodSourceId);

    // Draw ambulance & courier route lines underneath markers.
    if (hospital) {
      L.polyline(
        [
          [incident.lat, incident.lon],
          [hospital.lat, hospital.lon],
        ],
        {
          color: "#2563EB",
          weight: 4,
          opacity: 0.9,
        }
      ).addTo(group);
    }

    if (source && hospital) {
      L.polyline(
        [
          [source.lat, source.lon],
          [hospital.lat, hospital.lon],
        ],
        {
          color: "#0891B2",
          weight: 4,
          dashArray: "8 8",
          opacity: 0.92,
        }
      ).addTo(group);
    }

    // Facility markers with live ICU pill & Google Maps Directions popup.
    for (const f of facilities) {
      const active = f.id === hospitalId || f.id === bloodSourceId;
      const color = TIER_HEX[f.tier] ?? "#0F766E";
      const badge = f.tier === "BLOOD_HUB" ? "BLOOD" : `ICU ${f.icu_available}`;
      const icon = L.divIcon({
        className: "sg-leaflet-marker",
        html: `<div style="display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:9999px;background:${color};color:#fff;font:700 11px/1.2 -apple-system,system-ui,sans-serif;white-space:nowrap;border:2px solid ${active ? "#FDE047" : "#FFFFFF"};box-shadow:0 4px 12px rgba(0,0,0,0.28);transform:translate(-50%,-50%);cursor:pointer;"><span>${escapeHtml(f.code)}</span><span style="opacity:0.85;font-weight:600;font-size:10px;">${escapeHtml(badge)}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${incident.lat},${incident.lon}&destination=${f.lat},${f.lon}&travelmode=driving`;
      const etaLabel = f.eta_minutes !== null && f.eta_minutes !== undefined ? `${f.eta_minutes} min` : "—";
      const popupHtml = `
        <div style="min-width:190px;font-family:-apple-system,system-ui,sans-serif;font-size:12px;line-height:1.45;">
          <strong style="display:block;font-size:13px;color:#0E1E25;">${escapeHtml(f.name)}</strong>
          <div style="margin-top:2px;color:#475569;">${escapeHtml(f.tier)} · ${escapeHtml(f.data_freshness)} · ETA ${escapeHtml(etaLabel)}</div>
          <div style="margin-top:4px;color:#0F766E;font-weight:600;">${f.tier === "BLOOD_HUB" ? (locale === "bn" ? "ব্লাড হাব" : "Regional Blood Hub") : `ICU: ${f.icu_available} / ${f.icu_staffed}`}</div>
          <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;padding:4px 8px;border-radius:6px;background:#0F766E;color:#fff;text-decoration:none;font-weight:600;font-size:11px;">
            ${locale === "bn" ? "Google Maps-এ দিকনির্দেশনা →" : "Google Maps Directions →"}
          </a>
        </div>
      `;

      L.marker([f.lat, f.lon], { icon }).bindPopup(popupHtml).addTo(group);
    }

    // Draggable Incident marker (pill anchored above exact GPS point to prevent cluster overlap).
    const incIcon = L.divIcon({
      className: "sg-leaflet-incident",
      html: `<div style="position:relative;transform:translate(-50%,-50%);cursor:grab;"><div style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:9999px;background:#E11D48;color:#fff;font:700 11px/1.2 -apple-system,system-ui,sans-serif;white-space:nowrap;border:2px solid #FFF1F2;box-shadow:0 4px 12px rgba(0,0,0,0.3);">● ${locale === "bn" ? "ঘটনাস্থল" : "Incident"}</div><div style="width:14px;height:14px;border-radius:9999px;background:#E11D48;border:2.5px solid #FFF1F2;box-shadow:0 0 0 4px rgba(225,29,72,0.28);"></div></div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    const incMarker = L.marker([incident.lat, incident.lon], {
      icon: incIcon,
      zIndexOffset: 1000,
      draggable: Boolean(onIncidentRef.current),
    }).addTo(group);

    incMarker.on("dragend", () => {
      const pos = incMarker.getLatLng();
      onIncidentRef.current?.({
        lat: Number(pos.lat.toFixed(5)),
        lon: Number(pos.lng.toFixed(5)),
      });
    });

    // Fit bounds once when facilities first arrive, or when a route is selected.
    if (facilities.length > 0 && (!fittedRef.current || hospital)) {
      const pts: L.LatLngExpression[] = [[incident.lat, incident.lon]];
      if (hospital) {
        pts.push([hospital.lat, hospital.lon]);
        if (source) pts.push([source.lat, source.lon]);
      } else {
        for (const f of facilities) pts.push([f.lat, f.lon]);
      }
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(pts), { padding: [64, 64], maxZoom: 13 });
      fittedRef.current = true;
    }
  }, [facilities, incident, hospitalId, bloodSourceId, locale]);

  return (
    <div
      ref={containerRef}
      className="h-[340px] w-full rounded-[1.1rem] sm:h-[380px]"
      aria-label={locale === "bn" ? "ঢাকা লাইভ স্ট্রিট ম্যাপ" : "Dhaka live street map"}
    />
  );
}
