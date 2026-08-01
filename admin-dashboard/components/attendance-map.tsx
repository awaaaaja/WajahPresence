"use client";

import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";

import type { LogRow } from "@/utils/backend";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

const STATUS_COLOR: Record<string, string> = {
  success: "#16a34a",
  rejected: "#dc2626",
  suspicious: "#ca8a04",
};

export default function AttendanceMap({ items }: { items: LogRow[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-[70vh] w-full bg-gray-100" />;
  }

  const located = items.filter((l) => l.lat != null && l.lng != null);
  const center: [number, number] =
    located.length > 0 ? [located[0].lat!, located[0].lng!] : [-6.2088, 106.8456];

  return (
    <MapContainer
      center={center}
      zoom={11}
      scrollWheelZoom={false}
      className="h-[70vh] w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkerClusterGroup chunkedLoading>
        {located.map((l) => (
          <CircleMarker
            key={l.id}
            center={[l.lat!, l.lng!]}
            radius={5}
            pathOptions={{
              color: STATUS_COLOR[l.status] ?? "#6b7280",
              fillColor: STATUS_COLOR[l.status] ?? "#6b7280",
              fillOpacity: 0.8,
              weight: 1,
            }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">{l.nama ?? "—"}</p>
                <p>{new Date(l.timestamp).toLocaleString("id-ID")}</p>
                <p>Status: {l.status} · site {l.site ?? "—"}</p>
                <p>
                  {l.lat!.toFixed(5)}, {l.lng!.toFixed(5)}
                </p>
                {l.rejection_reason && <p className="text-amber-700">{l.rejection_reason}</p>}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
