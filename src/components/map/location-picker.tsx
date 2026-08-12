"use client";

import { useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

import { NEPAL_BOUNDS } from "@/lib/geo";

/** Fallback view: Biratnagar, the centre of the dealer network. Matches dealer-map.tsx. */
const FALLBACK_CENTER: [number, number] = [26.4525, 87.2718];

const NEPAL_MAX_BOUNDS = L.latLngBounds(
  [NEPAL_BOUNDS.minLat, NEPAL_BOUNDS.minLng],
  [NEPAL_BOUNDS.maxLat, NEPAL_BOUNDS.maxLng],
);

function pinIcon(): L.DivIcon {
  return L.divIcon({
    className: "subidha-picker-pin",
    html: `<svg viewBox="0 0 24 32" width="30" height="40"
        style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))" aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12Z"
        fill="#dc2626" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4.5" fill="#fff"/>
    </svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
  });
}

type Props = {
  value: { lat: number; lng: number } | null;
  onChange: (lat: number, lng: number) => void;
};

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPicker({ value, onChange }: Props) {
  const position: [number, number] = value ? [value.lat, value.lng] : FALLBACK_CENTER;
  const icon = useMemo(() => pinIcon(), []);

  return (
    <MapContainer
      center={position}
      zoom={value ? 15 : 11}
      scrollWheelZoom
      className="size-full"
      minZoom={6}
      maxBounds={NEPAL_MAX_BOUNDS}
      maxBoundsViscosity={1}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <Marker
        position={position}
        icon={icon}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const marker = e.target as L.Marker;
            const { lat, lng } = marker.getLatLng();
            onChange(lat, lng);
          },
        }}
      />
      <ClickHandler onChange={onChange} />
    </MapContainer>
  );
}
