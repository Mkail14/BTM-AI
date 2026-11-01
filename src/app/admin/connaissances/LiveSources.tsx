import type { ReactNode } from "react";
import type { JobsResult } from "@/lib/live/jobs";
import type { NewsItem } from "@/lib/live/news";

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Indian/Mayotte" });
const shortDate = (iso: string | null) => (iso ? day.format(new Date(iso)) : "");

function Badge({ tone, children }: { tone: "success" | "warning"; children: ReactNode }) {
  const style = tone === "success" ? "bg-success-soft text-success" : "bg-warning-soft text-warning";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${style}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function SourceCard({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  badge: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-3xl border border-border bg-bg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-fg-muted">{subtitle}</p>
        </div>
        {badge}
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </section>
  );
}

function Links({ items }: { items: { key: string; title: string; meta: string; href: string }[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.key}>
          <a
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="-mx-2 flex items-baseline gap-3 rounded-lg px-2 py-2 hover:bg-bg-muted"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
            <span className="shrink-0 text-xs text-fg-muted">{item.meta}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function JobsSource({ jobs }: { jobs: JobsResult }) {
  if (!jobs.configured) {
    return (
      <SourceCard title="Offres d'emploi" subtitle="France Travail · Mayotte (976)" badge={<Badge tone="warning">À brancher</Badge>}>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted">
          <li>
            Créer un compte gratuit sur{" "}
            <a href="https://francetravail.io" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              francetravail.io
            </a>
            .
          </li>
          <li>Créer une application et l&apos;abonner à l&apos;API « Offres d&apos;emploi v2 ».</li>
          <li>
            Mettre l&apos;identifiant et la clé secrète dans Vercel :{" "}
            <code className="font-mono text-xs">FRANCE_TRAVAIL_CLIENT_ID</code> et{" "}
            <code className="font-mono text-xs">FRANCE_TRAVAIL_CLIENT_SECRET</code>.
          </li>
        </ol>
      </SourceCard>
    );
  }
  return (
    <SourceCard
      title="Offres d'emploi"
      subtitle="France Travail · Mayotte (976)"
      badge={jobs.error ? <Badge tone="warning">En panne</Badge> : <Badge tone="success">Branché</Badge>}
    >
      {jobs.offers.length ? (
        <Links
          items={jobs.offers.slice(0, 12).map((o, i) => ({
            key: `${o.link}-${i}`,
            title: o.company ? `${o.title} — ${o.company}` : o.title,
            meta: [o.place, shortDate(o.date)].filter(Boolean).join(" · "),
            href: o.link,
          }))}
        />
      ) : (
        <p className="text-sm text-fg-muted">{jobs.error ? `France Travail ne répond pas (${jobs.error}).` : "Aucune offre pour l'instant."}</p>
      )}
    </SourceCard>
  );
}

function NewsSource({ news }: { news: NewsItem[] }) {
  return (
    <SourceCard
      title="Actualités de Mayotte"
      subtitle="Le Journal de Mayotte · Mayotte Hebdo · L'info Kwézi"
      badge={news.length ? <Badge tone="success">Branché</Badge> : <Badge tone="warning">Injoignable</Badge>}
    >
      {news.length ? (
        <Links
          items={news.slice(0, 12).map((n) => ({
            key: n.link,
            title: n.title,
            meta: [n.source, shortDate(n.date)].filter(Boolean).join(" · "),
            href: n.link,
          }))}
        />
      ) : (
        <p className="text-sm text-fg-muted">Les journaux ne répondent pas pour l&apos;instant.</p>
      )}
    </SourceCard>
  );
}

/** Sources lues en direct : Awa s'en sert quand on lui parle d'emploi ou d'actualité. */
export function LiveSources({ jobs, news }: { jobs: JobsResult; news: NewsItem[] }) {
  return (
    <section aria-labelledby="direct" className="flex min-h-0 flex-col gap-3">
      <div className="px-1">
        <h2 id="direct" className="font-semibold">
          En direct
        </h2>
        <p className="text-xs text-fg-muted">Awa les lit quand on lui parle d&apos;emploi ou d&apos;actualité.</p>
      </div>
      <NewsSource news={news} />
      <JobsSource jobs={jobs} />
    </section>
  );
}
