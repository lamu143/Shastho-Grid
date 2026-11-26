"use client";

import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { PlaceKind, RadarPlace, RadarRoute } from "@/lib/careRadar";

export type RadarLayerStyle = "satellite3d" | "street3d" | "topdown";

interface RadarMap3DProps {
  places: RadarPlace[];
  userPos: { lat: number; lon: number };
  navPos: { lat: number; lon: number; bearing: number } | null;
  selectedId: string | null;
  route: RadarRoute | null;
  layerStyle: RadarLayerStyle;
  navigating: boolean;
  locale: "en" | "bn";
  onSelectPlace: (place: RadarPlace) => void;
  onMoveUser?: (pos: { lat: number; lon: number }) => void;
}

const KIND_COLOR: Record<PlaceKind, string> = {
  HOSPITAL: "#0F766E",
  BLOOD_BANK: "#BE123C",
  PHARMACY: "#047857",
};

const OPENFREEMAP_3D_STYLE = "https://tiles.openfreemap.org/styles/liberty";

function buildMapStyle(layerStyle: RadarLayerStyle): maplibregl.StyleSpecification | string {
  if (layerStyle === "street3d") {
    return OPENFREEMAP_3D_STYLE;
  }
  const isSat = layerStyle === "satellite3d";
  const sources: maplibregl.StyleSpecification["sources"] = isSat
    ? {
        esri: {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          attribution: "Esri World Imagery",
        },
        osmLabels: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap",
        },
      }
    : {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap",
        },
      };

  const layers: maplibregl.LayerSpecification[] = isSat
    ? [
        { id: "esri-sat", type: "raster", source: "esri" },
        { id: "osm-overlay", type: "raster", source: "osmLabels", paint: { "raster-opacity": 0.28 } },
      ]
    : [{ id: "osm-street", type: "raster", source: "osm" }];

  return { version: 8, sources, layers };
}

export default function RadarMap3D({
  places,
  userPos,
  navPos,
  selectedId,
  route,
  layerStyle,
  navigating,
  locale,
  onSelectPlace,
  onMoveUser,
}: RadarMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const styleRef = useRef<RadarLayerStyle>(layerStyle);
  // Created once with the first position/style; the effects below apply later changes
  // (setStyle, easeTo) instead of rebuilding the WebGL map.
  const initialPosRef = useRef({ lat: userPos.lat, lon: userPos.lon });
  const onSelectRef = useRef(onSelectPlace);
  const onMoveUserRef = useRef(onMoveUser);

  useEffect(() => {
    onSelectRef.current = onSelectPlace;
  }, [onSelectPlace]);

  useEffect(() => {
    onMoveUserRef.current = onMoveUser;
  }, [onMoveUser]);

  // Initialize MapLibre 3D WebGL map.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle(styleRef.current),
      center: [initialPosRef.current.lon, initialPosRef.current.lat],
      zoom: 13.2,
      pitch: styleRef.current === "topdown" ? 0 : 54,
      bearing: -12,
      antialias: true,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-left");

    map.on("click", (e) => {
      if (e.originalEvent && (e.originalEvent.target as HTMLElement)?.closest(".sg-radar-pin")) return;
      onMoveUserRef.current?.({
        lat: Number(e.lngLat.lat.toFixed(5)),
        lon: Number(e.lngLat.lng.toFixed(5)),
      });
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch 3D Satellite / 3D Street / 2D Top-Down cleanly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (styleRef.current !== layerStyle) {
      styleRef.current = layerStyle;
      map.setStyle(buildMapStyle(layerStyle));
    }
    map.easeTo({
      pitch: layerStyle === "topdown" ? 0 : 56,
      duration: 450,
    });
  }, [layerStyle]);

  // Render glowing 3D route polyline when route changes or style reloads.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawRoute = () => {
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: route
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: route.coordinates },
              },
            ]
          : [],
      };

      const existing = map.getSource("radar-route") as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(geojson);
      } else {
        map.addSource("radar-route", { type: "geojson", data: geojson });
        map.addLayer({
          id: "radar-route-casing",
          type: "line",
          source: "radar-route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#FFFFFF", "line-width": 9, "line-opacity": 0.9 },
        });
        map.addLayer({
          id: "radar-route-line",
          type: "line",
          source: "radar-route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#4F46E5", "line-width": 5.5, "line-opacity": 0.96 },
        });
      }
    };

    if (map.isStyleLoaded()) {
      drawRoute();
    }
    map.on("style.load", drawRoute);
    return () => {
      map.off("style.load", drawRoute);
    };
  }, [route]);

  // Fit bounds when a route is first selected (and not in active turn-by-turn follow mode).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || navigating || route.coordinates.length < 2) return;
    const bounds = new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0]);
    for (const pt of route.coordinates) bounds.extend(pt);
    map.fitBounds(bounds, {
      padding: { top: 90, bottom: 110, left: 60, right: 60 },
      pitch: layerStyle === "topdown" ? 0 : 52,
      maxZoom: 14.5,
      duration: 650,
    });
  }, [route, navigating, layerStyle]);

  // Render place markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const p of places) {
      const active = p.id === selectedId;
      const color = KIND_COLOR[p.kind];
      const badge =
        p.kind === "HOSPITAL"
          ? `ICU ${p.icuAvailable ?? 0}`
          : p.kind === "BLOOD_BANK"
            ? "BLOOD"
            : p.open24h
              ? "24/7"
              : "RX";

      const el = document.createElement("button");
      el.type = "button";
      el.className = "sg-radar-pin";
      el.style.cssText = `display:inline-flex;align-items:center;gap:4px;min-height:26px;padding:${active ? "5px 10px" : "4px 9px"};border-radius:9999px;background:${color};color:#fff;font:700 ${active ? "12px" : "11px"}/1.2 -apple-system,system-ui,sans-serif;white-space:nowrap;border:2px solid ${active ? "#FDE047" : "#FFFFFF"};box-shadow:0 6px 16px rgba(0,0,0,0.34);cursor:pointer;transform:scale(${active ? 1.08 : 1});transition:transform 120ms ease;`;
      el.innerHTML = `<span>${p.code}</span><span style="font-size:10px;font-weight:600;">${badge}</span><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;"> — ${p.name}</span>`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelectRef.current(p);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([p.lon, p.lat])
        .addTo(map);
      // MapLibre sets aria-label="Map marker" inside .addTo(map); let innerText supply the accessible name.
      el.removeAttribute("aria-label");
      markersRef.current.push(marker);
    }
  }, [places, selectedId]);

  // Render & animate the 3D directional user / ambulance beacon.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const pos = navPos ?? { lat: userPos.lat, lon: userPos.lon, bearing: 0 };

    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "sg-radar-user";
      el.innerHTML = `<div style="width:36px;height:36px;border-radius:9999px;background:#FFFFFF;border:3px solid #2563EB;box-shadow:0 0 0 6px rgba(37,99,235,0.25),0 6px 14px rgba(0,0,0,0.32);display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="#2563EB"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg></div>`;
      userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([pos.lon, pos.lat])
        .addTo(map);
      el.removeAttribute("aria-label");
      el.setAttribute("aria-hidden", "true");
    } else {
      userMarkerRef.current.setLngLat([pos.lon, pos.lat]);
    }

    const inner = userMarkerRef.current.getElement().firstElementChild as HTMLElement | null;
    if (inner) {
      inner.style.transform = `rotate(${pos.bearing}deg)`;
    }

    if (navigating && navPos) {
      map.easeTo({
        center: [navPos.lon, navPos.lat],
        bearing: navPos.bearing,
        pitch: layerStyle === "topdown" ? 0 : 62,
        zoom: 15.6,
        duration: 420,
      });
    }
  }, [userPos, navPos, navigating, layerStyle]);

  const recenterMap = () => {
    const map = mapRef.current;
    if (!map) return;
    if (route && route.coordinates.length >= 2) {
      const bounds = new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0]);
      for (const pt of route.coordinates) bounds.extend(pt);
      map.fitBounds(bounds, {
        padding: { top: 90, bottom: 110, left: 60, right: 60 },
        pitch: layerStyle === "topdown" ? 0 : 54,
        maxZoom: 14.5,
        duration: 500,
      });
    } else {
      map.flyTo({
        center: [userPos.lon, userPos.lat],
        zoom: 13.5,
        pitch: layerStyle === "topdown" ? 0 : 54,
        bearing: 0,
        duration: 500,
      });
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={recenterMap}
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1.5 text-xs font-bold text-[#0E1E25] shadow-md backdrop-blur-md transition hover:bg-white"
        aria-label={locale === "bn" ? "ম্যাপ রিসেন্টার করুন" : "Re-center map"}
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
        </svg>
        <span className="hidden sm:inline">{locale === "bn" ? "রিসেন্টার" : "Re-center"}</span>
      </button>
      <div
        ref={containerRef}
        className="h-[460px] w-full overflow-hidden rounded-2xl sm:h-[540px]"
        aria-label={locale === "bn" ? "CareRadar ৩ডি লাইভ ম্যাপ" : "CareRadar 3D live map"}
      />
    </div>
  );
}
