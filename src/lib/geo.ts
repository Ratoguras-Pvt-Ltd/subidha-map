/** Nepal's bounding box — used to reject KML rows with swapped or corrupt coordinates. */
export const NEPAL_BOUNDS = {
  minLat: 26.0,
  maxLat: 31.0,
  minLng: 80.0,
  maxLng: 89.0,
} as const;

export function isWithinNepal(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= NEPAL_BOUNDS.minLat &&
    lat <= NEPAL_BOUNDS.maxLat &&
    lng >= NEPAL_BOUNDS.minLng &&
    lng <= NEPAL_BOUNDS.maxLng
  );
}

/** Great-circle distance in kilometres. */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

/** Deep-link to Google Maps turn-by-turn. A plain URL — no paid Maps API involved. */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
