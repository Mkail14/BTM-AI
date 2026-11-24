"use client";

import { useEffect, useState, useTransition } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { lostOk, orFallback } from "@/lib/safe-action";
import { COMMUNES } from "@/lib/entreprises/listing";
import type { ClaimableListing, MyClaim } from "@/server/services/entreprises/claims";
import { confirmClaimAction, requestClaimAction, searchListingsAction } from "./actions";

const input = "w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-[15px] outline-none focus:border-accent";

export function SignInToClaim() {
  const { openAuthDialog } = useAuth();
  return (
    <button
      type="button"
      onClick={() => openAuthDialog({ mode: "signup", next: "/entreprise", reason: "Un compte gratuit suffit pour tenir la fiche de votre entreprise." })}
      className="btn-rose h-11 rounded-full px-6 text-[15px] font-medium"
    >
      Créer mon compte gratuit
    </button>
  );
}

/** Code reçu par téléphone, pour une demande en cours. */
function CodeEntry({ claim }: { claim: MyClaim }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border p-4">
      <p className="font-medium">{claim.listingName}</p>
      <p className="text-sm text-fg-muted">
        {claim.codeSent ? "Notre équipe vous a donné un code au numéro de la fiche. Tapez-le ici." : "Notre équipe va vous appeler au numéro de la fiche pour vous donner un code."}
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setResult(await confirmClaimAction({ claimId: claim.id, code }).catch(lostOk)));
        }}
      >
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="6 chiffres"
          aria-label="Code à 6 chiffres"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className={`${input} max-w-40 font-mono tracking-[0.3em]`}
        />
        <button type="submit" disabled={pending || code.length !== 6} className="btn-rose h-11 rounded-full px-5 text-[15px] font-medium">
          Valider
        </button>
      </form>
      {result ? (
        <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-danger"}`}>
          {result.message}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Prendre la main sur sa fiche : la trouver, donner son SIRET et son nom, puis taper le
 * code que l'équipe donne au numéro de la fiche.
 */
export function ClaimFlow({ claims }: { claims: MyClaim[] }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ClaimableListing[] | null>(null);
  const [chosen, setChosen] = useState<ClaimableListing | null>(null);
  const [siret, setSiret] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  // Recherche pendant la frappe, 300 ms après la dernière lettre.
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => {
      searchListingsAction(query)
        .catch(orFallback([] as ClaimableListing[]))
        .then(setFound);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-col gap-6">
      {claims.length ? (
        <section>
          <h2 className="text-lg font-semibold">Vos demandes en cours</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {claims.map((c) => (
              <CodeEntry key={c.id} claim={c} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{claims.length ? "Une autre entreprise ?" : "Trouvez votre entreprise"}</h2>
        {chosen ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const outcome = await requestClaimAction({ listingId: chosen.id, siret, contactName: name }).catch(lostOk);
                setResult(outcome);
                if (outcome.ok) setChosen(null);
              });
            }}
          >
            <p className="text-sm">
              <span className="font-medium">{chosen.name}</span>
              {chosen.commune ? ` · ${COMMUNES[chosen.commune]}` : ""}{" "}
              <button type="button" onClick={() => setChosen(null)} className="ml-2 text-fg-muted underline underline-offset-4">
                changer
              </button>
            </p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">SIRET de l&apos;entreprise</span>
              <input required inputMode="numeric" placeholder="14 chiffres" value={siret} onChange={(e) => setSiret(e.target.value)} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Votre nom</span>
              <input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </label>
            <p className="text-xs text-fg-muted">Notre équipe appellera le numéro inscrit sur la fiche pour vous donner un code. C&apos;est ce qui prouve que l&apos;entreprise est bien à vous.</p>
            <button type="submit" disabled={pending} className="btn-rose h-11 self-start rounded-full px-6 text-[15px] font-medium">
              Demander mon code
            </button>
          </form>
        ) : (
          <>
            <input type="search" placeholder="Nom de l'entreprise ou SIRET" value={query} onChange={(e) => setQuery(e.target.value)} className={input} aria-label="Nom de l'entreprise ou SIRET" />
            {found && query.trim().length >= 2 ? (
              found.length ? (
                <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
                  {found.map((l) => (
                    <li key={l.id}>
                      <button type="button" onClick={() => setChosen(l)} className="flex w-full flex-col items-start px-4 py-3 text-left hover:bg-bg-muted/60">
                        <span className="font-medium">{l.name}</span>
                        <span className="text-xs text-fg-muted">{[l.category, l.commune ? COMMUNES[l.commune] : null].filter(Boolean).join(" · ") || "Mayotte"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-muted">
                  Pas encore de fiche à ce nom, ou elle est déjà tenue. Notre équipe peut l&apos;ajouter :{" "}
                  <a href="mailto:contact@btm.yt?subject=Fiche%20entreprise" className="text-fg underline underline-offset-4">
                    écrivez-nous
                  </a>
                  .
                </p>
              )
            ) : null}
          </>
        )}
        {result ? (
          <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-danger"}`}>
            {result.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
