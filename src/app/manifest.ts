import type { MetadataRoute } from "next";
import { BRAND } from "@/components/brand/brand";

/**
 * Application installée (« Ajouter à l'écran d'accueil ») : nom et icônes au
 * « b » BTM AI (étincelles), crème sur noir comme l'écran de lancement.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.tagline,
    start_url: "/",
    display: "standalone",
    background_color: BRAND.colors.ink,
    theme_color: BRAND.colors.ink,
    lang: "fr",
    icons: [
      { src: "/brand/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
