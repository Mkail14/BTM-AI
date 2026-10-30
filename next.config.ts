import type { NextConfig } from "next";

// cacheComponents est volontairement désactivé : toutes les pages de BTM AI
// dépendent de la session (cookies) et sont rendues à la demande.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // microphone=(self) : le micro du chat (leçons de shimaoré), pour le site lui-même uniquement.
    value: "camera=(), microphone=(self), geolocation=(), payment=()",
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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
