import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Bibliothèque de carte copiée telle quelle (fichier minifié, pas notre code).
    "public/maplibre/**",
    // Relais Cloudflare du vocal en direct : déployé à part (wrangler), types de Workers.
    "cloudflare/**",
  ]),
]);

export default eslintConfig;
