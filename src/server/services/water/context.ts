import "server-only";
import { buildWaterMap, namedSpots, waterSummary } from "@/lib/water/map";
import { loadWater } from "./store";

/** Pour la conversation : ce que Tamilya sait de l'eau maintenant, et le lieu sur lequel ouvrir la carte. */
export async function waterContext(message: string): Promise<{ place: string; summary: string }> {
  const { planning, alerts } = await loadWater();
  const map = buildWaterMap(planning, alerts);
  return { place: namedSpots(map, message)[0]?.name ?? "", summary: waterSummary(map, message) };
}
