"use client";

import { ExternalLink, Loader2, Mail, Phone, Send } from "lucide-react";
import { useState } from "react";
import { applyMailto, type ApplyInfo } from "@/lib/emploi/apply";
import type { JobOffer } from "@/lib/emploi/intent";

const PERSONA = "var(--persona,var(--accent))";
const pill = "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold";
const main = `${pill} text-accent-fg`;
const other = `${pill} border border-border hover:bg-bg-subtle`;

type State = { status: "idle" } | { status: "loading" } | { status: "ok"; apply: ApplyInfo } | { status: "error"; message: string };

/**
 * ESSAI ADMIN (fonctionnalité « candidatures ») : sous une offre Emploi Territorial, comment postuler,
 * lu sur la page de l'offre seulement quand on touche Postuler.
 */
export function JobApply({ offer }: { offer: JobOffer }) {
  const [state, setState] = useState<State>({ status: "idle" });

  function load() {
    setState({ status: "loading" });
    fetch(`/api/emploi/candidature?${new URLSearchParams({ lien: offer.link })}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { apply?: ApplyInfo; error?: string } | null;
        setState(body?.apply ? { status: "ok", apply: body.apply } : { status: "error", message: body?.error ?? "Indisponible : ouvre l'offre pour postuler." });
      })
      .catch(() => setState({ status: "error", message: "Vérifie ta connexion." }));
  }

  if (state.status === "idle" || state.status === "loading") {
    return (
      <button type="button" onClick={load} disabled={state.status === "loading"} className={`${main} disabled:opacity-70`} style={{ background: PERSONA }}>
        {state.status === "loading" ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <Send aria-hidden="true" className="size-3.5" />}
        Postuler
      </button>
    );
  }
  if (state.status === "error") return <p className="text-xs text-fg-muted">{state.message}</p>;

  const a = state.apply;
  const hasMain = a.emails.length || a.links.length || a.form;
  return (
    <div className="space-y-2">
      {a.postal ? <p className="text-xs whitespace-pre-line">{a.postal}</p> : null}
      {!hasMain && !a.postal ? <p className="text-xs text-fg-muted">Rien d&apos;indiqué : ouvre l&apos;offre pour voir comment postuler.</p> : null}
      <div className="flex flex-wrap gap-2">
        {a.emails.map((email) => (
          <a key={email} href={applyMailto(offer, email)} className={main} style={{ background: PERSONA }}>
            <Mail aria-hidden="true" className="size-3.5" /> Écrire à {email}
          </a>
        ))}
        {a.links.map((link) => (
          <a key={link} href={link} target="_blank" rel="noopener noreferrer" className={a.emails.length ? other : main} style={a.emails.length ? undefined : { background: PERSONA }}>
            <ExternalLink aria-hidden="true" className="size-3.5" /> Site de l&apos;employeur
          </a>
        ))}
        {a.form && !a.emails.length && !a.links.length ? (
          <a href={a.form} target="_blank" rel="noopener noreferrer" className={main} style={{ background: PERSONA }}>
            <Send aria-hidden="true" className="size-3.5" /> Postuler en ligne
          </a>
        ) : null}
        {a.phone ? (
          <a href={`tel:${a.phone.replace(/\s/g, "")}`} className={other}>
            <Phone aria-hidden="true" className="size-3.5" /> {a.phone}
          </a>
        ) : null}
      </div>
      {a.emails.length ? <p className="text-[11px] text-fg-muted">Le mail est prêt : il reste à joindre ton CV et ta lettre.</p> : null}
    </div>
  );
}
