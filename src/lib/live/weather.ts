import "server-only";

/**
 * Météo de Mayotte (Open-Meteo : gratuit, sans clé ni compte), pour le journal
 * parlé de Tamilya. Mamoudzou, Petite-Terre et le sud de Grande-Terre.
 * Gardée 30 minutes.
 */

const PLACES = [
  { name: "Mamoudzou", latitude: -12.78, longitude: 45.23 },
  { name: "Petite-Terre (Dzaoudzi)", latitude: -12.79, longitude: 45.28 },
  { name: "le sud (Bouéni)", latitude: -12.9, longitude: 45.08 },
] as const;

const CACHE_MS = 30 * 60_000;
let cache: { at: number; text: string } | null = null;

/** Codes météo de l'OMS (WMO) en mots simples. */
export function weatherWords(code: number): string {
  if (code === 0) return "grand soleil";
  if (code <= 2) return "soleil et quelques nuages";
  if (code === 3) return "ciel couvert";
  if (code === 45 || code === 48) return "brume";
  if (code >= 51 && code <= 57) return "bruine";
  if (code >= 61 && code <= 67) return code >= 65 ? "fortes pluies" : "pluie";
  if (code >= 80 && code <= 82) return code === 82 ? "grosses averses" : "averses";
  if (code >= 95) return "orages";
  return "temps variable";
}

type Forecast = {
  current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[]; weather_code?: number[] };
};

async function readPlace(place: (typeof PLACES)[number]): Promise<string | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&current=temperature_2m,weather_code,wind_speed_10m" +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=Indian%2FMayotte&forecast_days=1";
  const response = await fetch(url, { signal: AbortSignal.timeout(4_000), cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as Forecast;
  const now = data.current;
  const day = data.daily;
  if (!now || !day) return null;
  const round = (n: number | undefined) => (typeof n === "number" ? Math.round(n) : "?");
  return (
    `${place.name} : en ce moment ${round(now.temperature_2m)} °C, ${weatherWords(now.weather_code ?? -1)}, vent ${round(now.wind_speed_10m)} km/h ; ` +
    `aujourd'hui de ${round(day.temperature_2m_min?.[0])} à ${round(day.temperature_2m_max?.[0])} °C, ${weatherWords(day.weather_code?.[0] ?? -1)}, ` +
    `risque de pluie ${round(day.precipitation_probability_max?.[0])} %`
  );
}

/** Météo du jour à Mayotte, en quelques lignes (null si Open-Meteo ne répond pas). */
export async function getMayotteWeather(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.text;
  const lines = (await Promise.all(PLACES.map((p) => readPlace(p).catch(() => null)))).filter(Boolean);
  if (!lines.length) return cache?.text ?? null;
  const text = `Météo à Mayotte (Open-Meteo) :\n${lines.map((l) => `- ${l}`).join("\n")}`;
  cache = { at: Date.now(), text };
  return text;
}
