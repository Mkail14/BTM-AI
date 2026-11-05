/**
 * Pastille qui indique sur quelle version du site on se trouve : sur son
 * ordinateur (pnpm dev), sur dev.tamilya.yt (branche develop, « Preview »
 * chez Vercel) ou sur tamilya.yt (branche main). En bas à droite, toute
 * petite et sans clic. Sur le site en ligne, elle n'apparaît pas.
 */
const ENVS = {
  local: { label: "Local", color: "#f59e0b" },
  develop: { label: "Développement", color: "#8b5cf6" },
  production: { label: "En ligne", color: "#22c55e" },
} as const;

function currentEnv(): keyof typeof ENVS {
  // VERCEL_ENV est posé par Vercel ; absent sur l'ordinateur.
  const vercel = process.env.VERCEL_ENV;
  if (vercel === "production") return "production";
  if (vercel) return "develop";
  return "local";
}

export function EnvBadge({ isAdmin }: { isAdmin: boolean }) {
  const env = currentEnv();
  // Sur le site en ligne, plus de pastille du tout (même pour les administrateurs).
  if (env === "production") return null;
  void isAdmin;
  const { label, color } = ENVS[env];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed right-2 bottom-[max(0.25rem,env(safe-area-inset-bottom))] z-[90] flex items-center gap-1.5 rounded-full border border-border bg-bg/85 px-2 py-0.5 text-[10px] leading-4 font-semibold tracking-wide text-fg-muted uppercase shadow-sm backdrop-blur"
    >
      <span className="size-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 0 3px ${color}33` }} />
      {label}
    </div>
  );
}
