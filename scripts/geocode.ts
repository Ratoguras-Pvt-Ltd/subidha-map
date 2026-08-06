import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type GeocodeResult = {
  address: string | null;
  municipality: string | null;
  district: string | null;
};

const CACHE_PATH = path.join(process.cwd(), "scripts", "geocode-cache.json");

/**
 * Nominatim's usage policy caps anonymous use at 1 request/second and requires a
 * User-Agent identifying the application and a contact address.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
const REQUEST_INTERVAL_MS = 1100;

type Cache = Record<string, GeocodeResult>;

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export async function loadCache(): Promise<Cache> {
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf8")) as Cache;
  } catch {
    return {};
  }
}

export async function saveCache(cache: Cache): Promise<void> {
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

const EMPTY: GeocodeResult = { address: null, municipality: null, district: null };

type NominatimAddress = {
  city?: string;
  town?: string;
  municipality?: string;
  village?: string;
  suburb?: string;
  county?: string;
  state_district?: string;
  district?: string;
};

async function fetchOne(lat: number, lng: number, contact: string): Promise<GeocodeResult> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: {
      "User-Agent": `SubidhaGasDealerLocator/1.0 (${contact})`,
      "Accept-Language": "en",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim responded ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    display_name?: string;
    address?: NominatimAddress;
  };
  const a = body.address ?? {};

  return {
    address: body.display_name ?? null,
    municipality: a.city ?? a.town ?? a.municipality ?? a.village ?? a.suburb ?? null,
    district: a.county ?? a.state_district ?? a.district ?? null,
  };
}

/**
 * Reverse-geocodes a batch, one request per 1.1 s, caching every result to disk so
 * re-imports are instant and work offline. A failed lookup yields empty fields and
 * is retried on the next run rather than being cached as a negative.
 */
export async function geocodeAll(
  points: { latitude: number; longitude: number }[],
  options: { contact: string; onProgress?: (done: number, total: number, cached: boolean) => void },
): Promise<Map<string, GeocodeResult>> {
  const cache = await loadCache();
  const results = new Map<string, GeocodeResult>();

  // Distinct coordinates only — co-located dealers share one lookup.
  const pending = [...new Set(points.map((p) => cacheKey(p.latitude, p.longitude)))];

  let done = 0;
  let dirty = false;
  let failures = 0;

  for (const key of pending) {
    done++;

    const hit = cache[key];
    if (hit) {
      results.set(key, hit);
      options.onProgress?.(done, pending.length, true);
      continue;
    }

    const [lat, lng] = key.split(",").map(Number);
    try {
      const result = await fetchOne(lat, lng, options.contact);
      cache[key] = result;
      results.set(key, result);
      dirty = true;
    } catch (error) {
      failures++;
      console.warn(`  ! geocode failed for ${key}: ${(error as Error).message}`);
      results.set(key, EMPTY);
    }

    options.onProgress?.(done, pending.length, false);

    // Flush periodically so an interrupted run keeps the work it already paid for.
    if (dirty && done % 25 === 0) {
      await saveCache(cache);
      dirty = false;
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
  }

  await saveCache(cache);

  if (failures > 0) {
    console.warn(`  ! ${failures} lookup(s) failed and were left blank; re-run to retry.`);
  }

  return results;
}

export { cacheKey };
