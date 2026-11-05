/**
 * Qualité de la connexion affichée à la personne : hors ligne, faible ou normale.
 * (Tamilya Connect n'existe que dans l'app mobile : un site ne marche pas sans réseau.)
 */
export type ConnectionQuality = "offline" | "weak" | "good";

type NetworkInfo = EventTarget & { effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean };

/** Connexion faible d'après le navigateur (Chrome, Android ; l'iPhone ne le dit pas). */
export function isWeakNetwork(info: Pick<NetworkInfo, "effectiveType" | "rtt" | "downlink"> | undefined): boolean {
  if (!info) return false;
  if (info.effectiveType === "slow-2g" || info.effectiveType === "2g") return true;
  if (typeof info.rtt === "number" && info.rtt >= 1000) return true;
  return typeof info.downlink === "number" && info.downlink > 0 && info.downlink < 0.4;
}

export function readQuality(online: boolean, weak: boolean): ConnectionQuality {
  if (!online) return "offline";
  return weak ? "weak" : "good";
}

const network = () => (typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: NetworkInfo }).connection);

export function subscribeQuality(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  const info = network();
  info?.addEventListener("change", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
    info?.removeEventListener("change", callback);
  };
}

export const currentQuality = (): ConnectionQuality => readQuality(navigator.onLine, isWeakNetwork(network()));
