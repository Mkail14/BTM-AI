import type { ListingStats } from "@/server/services/entreprises/listings";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

function Tile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString("fr-FR")}</p>
      <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>
    </div>
  );
}

/**
 * Combien de fois Tamilya a donné la fiche : demandée par son nom, ou proposée dans une
 * liste (« un garage à Kawéni »). Les 30 derniers jours en barres, jour par jour.
 */
export function ListingStatsView({ stats }: { stats: ListingStats | null }) {
  if (!stats) return <p className="text-sm text-fg-muted">Les chiffres ne sont pas disponibles pour le moment.</p>;
  const max = Math.max(1, ...stats.days.map((d) => d.asked + d.listed));
  const listedTotal = stats.month.listed;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="7 derniers jours" value={stats.week.asked} hint="demandes de votre fiche" />
        <Tile label="30 derniers jours" value={stats.month.asked} hint="demandes de votre fiche" />
        <Tile label="Proposée dans une liste" value={listedTotal} hint="sur 30 jours" />
        <Tile label="Depuis le début" value={stats.total.asked + stats.total.listed} hint="fois au total" />
      </div>
      <figure className="rounded-2xl border border-border bg-bg p-4">
        <figcaption className="text-sm font-medium">Les 30 derniers jours</figcaption>
        <div className="mt-3 flex h-28 items-end gap-[3px]" role="img" aria-label={`${stats.month.asked + listedTotal} fois en 30 jours`}>
          {stats.days.map((d) => {
            const total = d.asked + d.listed;
            return (
              <div
                key={d.day}
                title={`${dayFormat.format(new Date(d.day))} : ${d.asked} demande${d.asked > 1 ? "s" : ""}, ${d.listed} dans une liste`}
                className="flex flex-1 flex-col justify-end"
                style={{ height: "100%" }}
              >
                <div className="rounded-t-sm bg-accent/35" style={{ height: `${(d.listed / max) * 100}%` }} />
                <div className={`bg-accent ${d.listed ? "" : "rounded-t-sm"}`} style={{ height: `${(d.asked / max) * 100}%`, minHeight: total ? 2 : 0 }} />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs text-fg-muted">
          <span>{dayFormat.format(new Date(stats.days[0].day))}</span>
          <span>aujourd&apos;hui</span>
        </div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-sm bg-accent" /> demandée par son nom
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-sm bg-accent/35" /> proposée dans une liste
          </span>
          <span>
            Par écrit {stats.byChannel.ecrit} · à la voix {stats.byChannel.vocal} · sur d&apos;autres sites {stats.byChannel.widget}
          </span>
        </p>
      </figure>
    </div>
  );
}
