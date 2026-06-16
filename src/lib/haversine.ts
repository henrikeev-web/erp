const R = 6371; // Earth radius in km
const ROAD_FACTOR = 1.3; // crow-fly → estimated road distance

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const crowFly = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return crowFly * ROAD_FACTOR;
}

export const WAREHOUSE_LAT = parseFloat(process.env.WAREHOUSE_LAT ?? "-20.8189");
export const WAREHOUSE_LNG = parseFloat(process.env.WAREHOUSE_LNG ?? "-49.3750");
