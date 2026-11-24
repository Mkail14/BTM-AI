"use client";

import { useMemo, useState } from "react";
import { IconExternal, IconMail, IconSend } from "@/components/ui/icons";
import { normalize } from "@/lib/live/intent";
import type { ApplyWay, OfferWithApply } from "@/server/services/live/emploi-territorial-candidature";

const LABELS: Record<ApplyWay | "toutes", string> = {
  toutes: "Toutes",
  mail: "Par mail",
  site: "Site de l'employeur",
  formulaire: "Bouton Emploi Territorial",
  courrier: "Par courrier",
  inconnu: "À voir sur l'offre",
};

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

/** Mail prêt à envoyer : la personne n'a plus qu'à joindre CV et lettre. */
function mailtoOf(offer: OfferWithApply, to: string) {
  const subject = `Candidature : ${offer.title}`;
  const body = [
    "Bonjour,",
    "",
    `Je vous adresse ma candidature au poste de ${offer.title}${offer.company ? ` (${offer.company})` : ""}, publié sur Emploi Territorial :`,
    offer.link,
    "",
    "Vous trouverez ci-joint mon CV et ma lettre de motivation.",
    "",
    "Je reste à votre disposition pour un entretien.",
    "",
    "Cordialement,",
  ].join("\n");
  return `mailto:${to}?${new URLSearchParams({ subject, body }).toString().replace(/\+/g, "%20")}`;
}

const button = "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium";

export function ApplyList({ offers }: { offers: OfferWithApply[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ApplyWay | "toutes">("toutes");
  const wayOf = (o: OfferWithApply): ApplyWay => o.apply?.way ?? "inconnu";

  const shown = useMemo(() => {
    const q = normalize(query.trim());
    return offers.filter((o) => (filter === "toutes" || wayOf(o) === filter) && (!q || normalize(`${o.title} ${o.company ?? ""} ${o.place ?? ""}`).includes(q)));
  }, [offers, query, filter]);

  const counts = Object.fromEntries((Object.keys(LABELS) as (ApplyWay | "toutes")[]).map((w) => [w, w === "toutes" ? offers.length : offers.filter((o) => wayOf(o) === w).length]));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg p-4">
        <input
          type="search"
          placeholder="Chercher un poste, un employeur, une commune"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LABELS) as (ApplyWay | "toutes")[])
            .filter((w) => w === "toutes" || counts[w] > 0)
            .map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={filter === w}
                onClick={() => setFilter(w)}
                className={`rounded-full border px-3 py-1 text-xs ${filter === w ? "border-accent bg-accent text-accent-fg" : "border-border hover:bg-bg-muted"}`}
              >
                {LABELS[w]} · {counts[w]}
              </button>
            ))}
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {shown.map((o) => {
          const a = o.apply;
          return (
            <li key={o.id} className="rounded-xl border border-border bg-bg p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold">{o.title}</h2>
                  <p className="text-sm text-fg-muted">
                    {[o.company, o.place, o.deadline ? `jusqu'au ${dayFormat.format(new Date(o.deadline))}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-border px-3 py-1 text-xs">{LABELS[wayOf(o)]}</span>
              </div>

              {a?.postal ? <p className="mt-2 whitespace-pre-line text-sm">{a.postal}</p> : null}
              {a?.note && !a.postal ? <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-fg-muted">{a.note}</p> : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {a?.emails.map((email) => (
                  <a key={email} href={mailtoOf(o, email)} className={`btn-rose ${button}`}>
                    <IconMail className="size-4" /> Écrire à {email}
                  </a>
                ))}
                {a?.links.map((link) => (
                  <a key={link} href={link} target="_blank" rel="noopener noreferrer" className={`${a.emails.length ? "border border-border" : "btn-rose"} ${button}`}>
                    <IconExternal className="size-4" /> Site de l&apos;employeur
                  </a>
                ))}
                {a?.form && !a.emails.length && !a.links.length ? (
                  <a href={a.form} target="_blank" rel="noopener noreferrer" className={`btn-rose ${button}`}>
                    <IconSend className="size-4" /> Postuler sur Emploi Territorial
                  </a>
                ) : null}
                {a?.phone ? (
                  <a href={`tel:${a.phone.replace(/\s/g, "")}`} className={`border border-border ${button}`}>
                    {a.phone}
                  </a>
                ) : null}
                <a href={o.link} target="_blank" rel="noopener noreferrer" className={`border border-border ${button}`}>
                  Voir l&apos;offre
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length ? null : <p className="text-sm text-fg-muted">Aucune offre ne correspond.</p>}
    </section>
  );
}
