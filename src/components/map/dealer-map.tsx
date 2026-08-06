"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap, ZoomControl } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

import type { PublicDealer } from "@/lib/dealers";
import { STATUS_PRESENTATION } from "@/lib/stock";

type Props = {
  dealers: PublicDealer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  userLocation: { lat: number; lng: number } | null;
};

/** Fallback view: Biratnagar, the centre of the dealer network. */
const FALLBACK_CENTER: [number, number] = [26.4525, 87.2718];

/**
 * An LPG cylinder — valve, collar, body — filled with the status colour and carrying
 * the count. Reads as "gas available here" at a glance in a way a generic map pin
 * does not.
 *
 * Leaflet icons are raw markup, outside Tailwind's reach, hence the hex values from
 * STATUS_PRESENTATION and the inline attributes. The white outline keeps the shape
 * legible against both the green and the built-up parts of the basemap.
 */
function cylinderIcon(dealer: PublicDealer, isSelected: boolean): L.DivIcon {
  const { hex } = STATUS_PRESENTATION[dealer.status];
  const height = isSelected ? 46 : 36;
  const width = Math.round(height * 0.7);

  const quantity = dealer.stockQuantity;
  // 1450 reads as "1.4k", not "1k" — rounding a four-figure delivery down to the
  // nearest thousand throws away the part the reader cares about.
  const label =
    quantity > 999 ? `${(quantity / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(quantity);
  // Shrink the digits rather than let a 3-4 character count overflow the body.
  const fontSize = label.length >= 4 ? 9 : label.length === 3 ? 11 : 13;

  const shadow = isSelected
    ? "drop-shadow(0 0 3px rgba(220,38,38,.85)) drop-shadow(0 2px 3px rgba(0,0,0,.45))"
    : "drop-shadow(0 2px 3px rgba(0,0,0,.4))";

  return L.divIcon({
    className: "subidha-pin",
    html: `<svg viewBox="0 0 28 40" width="${width}" height="${height}"
        style="filter:${shadow};display:block" aria-hidden="true">
      <g fill="${hex}" stroke="#fff" stroke-width="${isSelected ? 2 : 1.6}"
         stroke-linejoin="round">
        <rect x="11.4" y="0.9" width="5.2" height="5" rx="1.4"/>
        <rect x="8" y="4.6" width="12" height="4.6" rx="2"/>
        <rect x="2.6" y="8" width="22.8" height="30.6" rx="7"/>
      </g>
      <text x="14" y="24.6" text-anchor="middle" dominant-baseline="middle"
        fill="#fff" font-size="${fontSize}" font-weight="700"
        style="font-family:var(--font-sans,system-ui);font-variant-numeric:tabular-nums"
      >${label}</text>
    </svg>`,
    iconSize: [width, height],
    // The cylinder stands on the dealer's location, so anchor at the base.
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height],
  });
}

function userIcon(): L.DivIcon {
  return L.divIcon({
    className: "subidha-user-pin",
    html: `<span style="display:block;width:16px;height:16px;background:#2563eb;
      border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 6px rgba(37,99,235,.25)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/** Frames the whole network once, then pans to whichever dealer is selected. */
function ViewController({
  dealers,
  selectedId,
}: {
  dealers: PublicDealer[];
  selectedId: string | null;
}) {
  const map = useMap();
  const hasFitted = useRef(false);

  useEffect(() => {
    if (hasFitted.current || dealers.length === 0) return;
    hasFitted.current = true;
    map.fitBounds(
      L.latLngBounds(dealers.map((d) => [d.latitude, d.longitude] as [number, number])),
      { padding: [40, 40] },
    );
  }, [dealers, map]);

  useEffect(() => {
    if (!selectedId) return;
    const dealer = dealers.find((d) => d.id === selectedId);
    if (!dealer) return;
    map.flyTo([dealer.latitude, dealer.longitude], Math.max(map.getZoom(), 15), {
      duration: 0.6,
    });
  }, [selectedId, dealers, map]);

  return null;
}

export default function DealerMap({ dealers, selectedId, onSelect, userLocation }: Props) {
  const markers = useMemo(
    () =>
      dealers.map((dealer) => (
        <Marker
          key={dealer.id}
          position={[dealer.latitude, dealer.longitude]}
          icon={cylinderIcon(dealer, dealer.id === selectedId)}
          // Re-render the icon when selection changes — Leaflet won't diff it for us.
          eventHandlers={{ click: () => onSelect(dealer.id) }}
          title={`${dealer.dealerName} — ${dealer.stockQuantity} cylinder${dealer.stockQuantity === 1 ? "" : "s"} today`}
          alt={`${dealer.dealerName}, ${dealer.stockQuantity} cylinders`}
          zIndexOffset={dealer.id === selectedId ? 1000 : 0}
        />
      )),
    [dealers, selectedId, onSelect],
  );

  return (
    <MapContainer
      center={FALLBACK_CENTER}
      zoom={11}
      zoomControl={false}
      scrollWheelZoom
      className="size-full"
      // Nepal-ish clamp so users can't pan into empty ocean.
      minZoom={6}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <ZoomControl position="bottomright" />

      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={55}
        spiderfyOnMaxZoom
        showCoverageOnHover={false}
      >
        {markers}
      </MarkerClusterGroup>

      {userLocation ? (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon()} />
      ) : null}

      <ViewController dealers={dealers} selectedId={selectedId} />
    </MapContainer>
  );
}
