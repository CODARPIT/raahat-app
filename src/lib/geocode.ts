// Suggested pins for reports without a location, from OpenStreetMap Nominatim.
// Follows the Nominatim usage policy: at most one request per second, a descriptive
// User-Agent, results cached, searches limited to India. Server-side only.
// A suggestion is drawn dashed and never confirmed automatically.

export interface GeoSuggestion {
  lat: number;
  lng: number;
  label: string;
}

const UA = "Raahat/0.1 (disaster report triage, hackathon project; https://github.com/CODARPIT/raahat-app)";
const cache = new Map<string, GeoSuggestion | null>();
let nextSlot = 0;

/** Serialise requests one second apart across this instance. */
async function waitTurn() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + 1000;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

export async function geocodeHint(query: string, near?: { lat: number; lng: number } | null): Promise<GeoSuggestion | null> {
  const q = query.trim().slice(0, 120);
  if (q.length < 3) return null;
  const key = `${q.toLowerCase()}|${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ""}`;
  if (cache.has(key)) return cache.get(key)!;

  const params = new URLSearchParams({ q, format: "jsonv2", limit: "1", countrycodes: "in", "accept-language": "en,hi" });
  if (near) {
    // Prefer matches within ~50 km of the control room's other reports.
    const d = 0.5;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  await waitTurn();
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null; // don't cache failures; a later try may succeed
    const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    const out = hit ? { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name } : null;
    cache.set(key, out);
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return out;
  } catch {
    return null;
  }
}
