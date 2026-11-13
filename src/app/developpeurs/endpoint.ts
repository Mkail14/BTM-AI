import "server-only";
import { headers } from "next/headers";
import { siteOrigin } from "@/lib/email/device";

/** Adresse publique du site, d'après le domaine de la requête (localhost en http). */
export async function publicOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  return siteOrigin(`${host.startsWith("localhost") ? "http" : "https"}://${host}`);
}

/** Adresse de l'API (appel de serveur à serveur). */
export async function apiEndpoint(): Promise<string> {
  return `${await publicOrigin()}/api/v1/tamilya`;
}

/** Adresse du script du widget, à coller sur un site. */
export async function widgetScriptUrl(): Promise<string> {
  return `${await publicOrigin()}/tamilya.js`;
}
