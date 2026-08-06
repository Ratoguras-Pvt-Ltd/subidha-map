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
 * Leaflet icons are raw HTML, outside Tailwind's reach — hence the hex values from
 * STATUS_PRESENTATION rather than utility classes.
 *
 * The cylinder count is printed inside the pin so the map answers "how many, where?"
 * without needing a click. The teardrop is a square rotated 45°, so the number lives
 * in a separate unrotated layer on top rather than being rotated with it.
 */
function pinIcon(dealer: PublicDealer, isSelected: boolean): L.DivIcon {
  const { hex } = STATUS_PRESENTATION[dealer.status];
  const size = isSelected ? 42 : 34;
  const shadow = isSelected
    ? "0 0 0 4px rgba(220,38,38,.35),0 2px 6px rgba(0,0,0,.4)"
    : "0 2px 5px rgba(0,0,0,.35)";

  const quantity = dealer.stockQuantity;
  // 1450 reads as "1.4k", not "1k" — rounding a four-figure delivery down to the
  // nearest thousand throws away the part the reader cares about.
  const label =
    quantity > 999 ? `${(quantity / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(quantity);
  // Shrink the digits rather than let a 3-4 digit count overflow the pin.
  const fontSize = label.length >= 4 ? 9 : label.length === 3 ? 10 : 12;

  return L.divIcon({
    className: "subidha-pin",
    html: `<span style="position:relative;display:block;width:${size}px;height:${size}px">
      <span style="position:absolute;inset:0;background:${hex};border:2.5px solid #fff;
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:${shadow}"></span>
      <span style="position:absolute;inset:0;display:flex;align-items:center;
        justify-content:center;padding-bottom:${Math.round(size * 0.12)}px;
        color:#fff;font-size:${fontSize}px;font-weight:700;line-height:1;
        font-variant-numeric:tabular-nums;text-shadow:0 1px 1px rgba(0,0,0,.35);
        pointer-events:none">${label}</span>
    </span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
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
          icon={pinIcon(dealer, dealer.id === selectedId)}
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
