import { version } from "maplibre-gl/package.json";

/**
 * Moteur des cartes (MapLibre), chargé à une adresse fixe du site plutôt que
 * mélangé aux fichiers de Next : `/maplibre/maplibre-gl.mjs?v=6.16.0`.
 *
 * Pourquoi : l'app Android garde ces fichiers dans l'APK et les sert sans
 * internet quand la version demandée (`v`) est celle qu'elle a. Nouvelle
 * version sur le site : l'app la télécharge seule en arrière-plan, et la
 * sert dès la fois suivante. Dans un navigateur, le fichier est gardé un an
 * (l'adresse change à chaque version). Copiés par scripts/copy-vad.mjs.
 */

export const MAPLIBRE_VERSION = version;
const BASE = "/maplibre";

type MapLibre = typeof import("maplibre-gl");
let loading: Promise<MapLibre> | null = null;

/** Le moteur des cartes, chargé une seule fois (et déjà prêt si la carte a été préchargée). */
export function loadMapLibre(): Promise<MapLibre> {
  loading ??= (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${BASE}/maplibre-gl.mjs?v=${version}`) as Promise<MapLibre>).then((maplibre) => {
    // Le travail lourd (tuiles) se fait dans un worker, servi lui aussi par le site.
    maplibre.setWorkerUrl(`${BASE}/maplibre-gl-worker.mjs?v=${version}`);
    return maplibre;
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
