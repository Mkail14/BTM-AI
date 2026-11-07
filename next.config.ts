import type { NextConfig } from "next";

// cacheComponents est volontairement désactivé : toutes les pages de BTM AI
// dépendent de la session (cookies) et sont rendues à la demande.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HTTPS imposé au navigateur pendant 2 ans, sous-domaines compris (ignoré en http://localhost).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    // microphone et geolocation=(self) : micro du chat et position GPS (adresse, livraison), pour le site lui-même uniquement.
    value: "camera=(), microphone=(self), geolocation=(self), payment=()",
  },
];

const modelCache = "public, max-age=604800, stale-while-revalidate=2592000";
const imageCache = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    // Un package-lock.json vide existe dans le dossier parent : on fixe la racine.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // Ancienne adresse de la page « Circuit d'Awa ».
    return [{ source: "/admin/modele-ia", destination: "/admin/circuit", permanent: true }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Moteur des cartes : l'adresse porte la version (?v=), le fichier ne change donc jamais à la même adresse.
      { source: "/maplibre/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // Modèles de voix (Silero 2,3 Mo, empreinte 6,7 Mo) : adresse sans version, donc pas d'« immutable ».
      // Gardés 7 jours sans même redemander au serveur (connexion lente à Mayotte), puis encore 30 jours
      // servis tout de suite pendant la vérification en arrière-plan. Changer de modèle = changer de nom de fichier.
      { source: "/vad/silero_vad.onnx", headers: [{ key: "Cache-Control", value: modelCache }] },
      // Moteur onnxruntime (≈ 15 Mo) : sa version est dans l'adresse (scripts/copy-vad.mjs), il ne change jamais à la même adresse.
      { source: "/vad/ort/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/voiceprint/:file*", headers: [{ key: "Cache-Control", value: modelCache }] },
      // Logos, fonds et photos de plats : un jour sans redemander, puis une semaine servis pendant la vérification.
      { source: "/brand/:file*", headers: [{ key: "Cache-Control", value: imageCache }] },
      { source: "/fond/:file*", headers: [{ key: "Cache-Control", value: imageCache }] },
      { source: "/food/:file*", headers: [{ key: "Cache-Control", value: imageCache }] },
    ];
  },
};

export default nextConfig;
