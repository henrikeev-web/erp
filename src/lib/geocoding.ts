interface GeoResult {
  lat: number;
  lon: number;
}

// In-memory cache keyed by CEP (8 digits). Nominatim rate limit: 1 req/sec — fine for checkout flow.
const cache = new Map<string, GeoResult | null>();

export async function geocodeCep(cep: string): Promise<GeoResult | null> {
  const key = cep.replace(/\D/g, "");
  if (cache.has(key)) return cache.get(key)!;

  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${key}&country=BR&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "BanguelasERP/1.0 (henrikeev@gmail.com)" },
      next: { revalidate: 86400 },
    });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      cache.set(key, null);
      return null;
    }
    const result: GeoResult = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
