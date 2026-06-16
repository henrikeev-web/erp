import { NextRequest, NextResponse } from "next/server";
import { fetchCep } from "@/lib/cep";
import { prisma } from "@/lib/prisma";
import { geocodeCep } from "@/lib/geocoding";
import { haversineDistance, WAREHOUSE_LAT, WAREHOUSE_LNG } from "@/lib/haversine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cep = searchParams.get("cep");

  if (!cep) return NextResponse.json({ error: "CEP obrigatório" }, { status: 400 });

  const address = await fetchCep(cep);
  if (!address) return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 });

  const zones = await prisma.deliveryZone.findMany({
    where: { active: true },
    orderBy: { maxRadiusKm: "asc" },
  });

  let matchedZone: (typeof zones)[0] | null = null;

  // 1. Distance-based zones (maxRadiusKm set) — try geocoding first
  const distanceZones = zones.filter((z) => z.maxRadiusKm != null);
  if (distanceZones.length > 0) {
    const geo = await geocodeCep(cep);
    if (geo) {
      const distKm = haversineDistance(WAREHOUSE_LAT, WAREHOUSE_LNG, geo.lat, geo.lon);
      for (const zone of distanceZones) {
        if (distKm <= zone.maxRadiusKm!) {
          matchedZone = zone;
          break;
        }
      }
    }
  }

  // 2. Legacy neighborhood/city matching as fallback
  if (!matchedZone) {
    const legacyZones = zones.filter((z) => z.maxRadiusKm == null);
    for (const zone of legacyZones) {
      if (
        zone.neighborhoods.some(
          (n) => n.toLowerCase() === address.neighborhood.toLowerCase()
        ) ||
        zone.cities.some((c) => c.toLowerCase() === address.city.toLowerCase())
      ) {
        matchedZone = zone;
        break;
      }
    }
  }

  return NextResponse.json({ ...address, deliveryZone: matchedZone });
}
