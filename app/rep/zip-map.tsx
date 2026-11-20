"use client";

import { useEffect, useRef } from "react";

export interface Pin {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** Build a Google Maps directions deep-link (routes from the user's current
 *  location). Prefers the exact Place ID, then coordinates, then the address. */
export function directionsUrl(p: Pin): string {
  const base = "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=";
  if (p.placeId) return `${base}${encodeURIComponent(p.name)}&destination_place_id=${encodeURIComponent(p.placeId)}`;
  if (p.latitude != null && p.longitude != null) return `${base}${p.latitude},${p.longitude}`;
  const addr = [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
  return `${base}${encodeURIComponent(addr || p.name)}`;
}

// Load the Maps JS API once per page.
let mapsPromise: Promise<unknown> | null = null;
function loadMaps(key: string): Promise<unknown> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as unknown as { google?: { maps?: unknown } };
  if (w.google?.maps) return Promise.resolve(w.google);
  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
      s.async = true;
      s.onload = () => resolve((window as unknown as { google: unknown }).google);
      s.onerror = () => reject(new Error("maps failed to load"));
      document.head.appendChild(s);
    });
  }
  return mapsPromise;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

const BOX: React.CSSProperties = {
  height: 260,
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--divider)",
  overflow: "hidden",
};

function Fallback({ note }: { note: string }) {
  return (
    <div style={{ ...BOX, display: "grid", placeItems: "center", background: "var(--neutral-100)", padding: 16 }}>
      <span style={{ fontSize: 13, color: "var(--neutral-700)", textAlign: "center" }}>{note}</span>
    </div>
  );
}

export function ZipMap({ pins, apiKey }: { pins: Pin[]; apiKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const hasCoords = pins.some((p) => p.latitude != null && p.longitude != null);

  useEffect(() => {
    if (!apiKey || !ref.current) return;
    const located = pins.filter((p) => p.latitude != null && p.longitude != null);
    if (located.length === 0) return;
    let cancelled = false;

    loadMaps(apiKey)
      .then((google) => {
        if (cancelled || !ref.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = google as any;
        const map = new g.maps.Map(ref.current, {
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        const bounds = new g.maps.LatLngBounds();
        const info = new g.maps.InfoWindow();
        for (const p of located) {
          const pos = { lat: p.latitude as number, lng: p.longitude as number };
          const marker = new g.maps.Marker({ position: pos, map, title: p.name });
          bounds.extend(pos);
          marker.addListener("click", () => {
            info.setContent(
              `<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.4">` +
                `<strong>${escapeHtml(p.name)}</strong><br/>` +
                `<a href="${directionsUrl(p)}" target="_blank" rel="noopener">Directions ↗</a></div>`,
            );
            info.open(map, marker);
          });
        }
        map.fitBounds(bounds);
        const once = g.maps.event.addListenerOnce(map, "idle", () => {
          if (map.getZoom() > 15) map.setZoom(15);
        });
        void once;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [apiKey, pins]);

  if (!apiKey) {
    return <Fallback note="Map appears here once NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is configured." />;
  }
  if (!hasCoords) {
    return <Fallback note="No mapped locations for these results yet — coordinates come from the enriched import." />;
  }
  return <div ref={ref} style={BOX} />;
}
