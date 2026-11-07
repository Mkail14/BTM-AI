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
    ];
  },
};

export default nextConfig;
