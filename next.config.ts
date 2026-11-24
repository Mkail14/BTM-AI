import type { NextConfig } from "next";

// cacheComponents est volontairement désactivé : toutes les pages de BTM AI
// dépendent de la session (cookies) et sont rendues à la demande.
/**
 * Bouclier contre les scripts piégés (CSP). Volontairement large sur les connexions, images et cadres
 * (Supabase, voix en direct, cartes, photos des restaurants) pour ne rien casser ; strict là où une
 * attaque passe : aucun script venu d'un autre site (sauf la connexion Google), aucun plugin,
 * aucune balise <base> détournée, aucun formulaire envoyé ailleurs, aucun affichage du site
 * dans le cadre d'un autre site. 'unsafe-eval' et 'wasm-unsafe-eval' : moteur de voix (onnxruntime).
 * blob: : les cartes (maplibre) lancent leurs calculs dans un « worker » créé par le site.
 */
const contentSecurityPolicy = (frameAncestors: string) =>
  [
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://accounts.google.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    "upgrade-insecure-requests",
  ].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy("'none'") },
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
  // Lecture de texte des villages des tours d'eau (Tesseract) : lancé tel quel par Node, avec son
  // moteur (fichiers .wasm chargés à l'exécution, à joindre aux deux pages qui lisent la SMAE).
  serverExternalPackages: ["tesseract.js", "tesseract.js-core"],
  outputFileTracingIncludes: {
    "/api/cron/eau": ["./node_modules/tesseract.js/**", "./node_modules/.pnpm/tesseract.js*/**", "./node_modules/.pnpm/node_modules/tesseract.js-core/**"],
    "/admin/eau": ["./node_modules/tesseract.js/**", "./node_modules/.pnpm/tesseract.js*/**", "./node_modules/.pnpm/node_modules/tesseract.js-core/**"],
  },
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
    // Ancienne adresse de la page « Circuit de Tamilya ».
    return [{ source: "/admin/modele-ia", destination: "/admin/circuit", permanent: true }];
  },
  async rewrites() {
    // Ancienne adresse de la route des sites partenaires : gardée tant que btm.yt et BTM Market l'appellent encore.
    return [{ source: "/api/awa", destination: "/api/tamilya" }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Aperçu de la conversation : affiché dans le téléphone de l'accueil, donc dans un cadre du site lui-même (et de lui seul).
      { source: "/apercu/:path*", headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy("'self'") },
        ] },
      // Moteur des cartes : l'adresse porte la version (?v=), le fichier ne change donc jamais à la même adresse.
      { source: "/maplibre/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // Lecteur de PDF (livres) : la version est dans l'adresse (scripts/copy-vad.mjs).
      { source: "/pdfjs/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // Modèles de voix (Silero 2,3 Mo, empreinte 6,7 Mo) : adresse sans version, donc pas d'« immutable ».
      // Gardés 7 jours sans même redemander au serveur (connexion lente à Mayotte), puis encore 30 jours
      // servis tout de suite pendant la vérification en arrière-plan. Changer de modèle = changer de nom de fichier.
      { source: "/vad/silero_vad.onnx", headers: [{ key: "Cache-Control", value: modelCache }] },
      // Moteur onnxruntime (≈ 15 Mo) : sa version est dans l'adresse (scripts/copy-vad.mjs), il ne change jamais à la même adresse.
      { source: "/vad/ort/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/voiceprint/:file*", headers: [{ key: "Cache-Control", value: modelCache }] },
      // Widget de Tamilya collé sur d'autres sites : adresse fixe, donc une heure seulement (une correction arrive vite partout).
      { source: "/tamilya.js", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
      // Logos, fonds et photos de plats : un jour sans redemander, puis une semaine servis pendant la vérification.
      { source: "/brand/:file*", headers: [{ key: "Cache-Control", value: imageCache }] },
      { source: "/fond/:file*", headers: [{ key: "Cache-Control", value: imageCache }] },
      { source: "/food/:file*", headers: [{ key: "Cache-Control", value: imageCache }] },
      // Banque de sons de la lecture : un son ne change pas sans changer de nom ; gardé une semaine, puis vérifié en arrière-plan.
      { source: "/sons/:file*", headers: [{ key: "Cache-Control", value: modelCache }] },
      // Musiques de fond de la lecture (~105 Ko chacune) : même règle que les bruitages (sans en-tête, redemandées à chaque histoire).
      { source: "/musique/:file*", headers: [{ key: "Cache-Control", value: modelCache }] },
    ];
  },
};

export default nextConfig;
