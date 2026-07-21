"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

export type OperationalFeature = { geometry: { coordinates: [number, number] }; properties: { id: string; name: string; type: string; status: string; entityType: "ASSET" | "VESSEL" } };

export function OperationalMap({ features }: { features: OperationalFeature[] }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (!container.current || cancelled) return;
      map = new maplibregl.Map({ container: container.current, style: { version: 8, sources: {}, layers: [{ id: "ocean", type: "background", paint: { "background-color": "#0b2633" } }] }, center: [-40.3, -22.25], zoom: 7 });
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      for (const feature of features) {
        const color = feature.properties.entityType === "ASSET" ? "#27b3a9" : "#f6b35c";
        const popup = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = feature.properties.name;
        const detail = document.createElement("div");
        detail.textContent = `${feature.properties.type} · ${feature.properties.status}`;
        popup.append(title, detail);
        new maplibregl.Marker({ color }).setLngLat(feature.geometry.coordinates).setPopup(new maplibregl.Popup({ offset: 24 }).setDOMContent(popup)).addTo(map);
      }
      if (features.length > 1) map.fitBounds(features.reduce((bounds, feature) => bounds.extend(feature.geometry.coordinates), new maplibregl.LngLatBounds(features[0].geometry.coordinates, features[0].geometry.coordinates)), { padding: 70, maxZoom: 9 });
    });
    return () => { cancelled = true; map?.remove(); };
  }, [features]);
  return <div className="map" ref={container} aria-label="Operational map with assets and vessels" />;
}
