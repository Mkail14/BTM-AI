import { dateFr, type AttestationFields } from "@/lib/attestation/fields";

type Signatures = { hebergeant?: string; heberge?: string };

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex gap-1.5">
      <span className="shrink-0 text-neutral-600">{label} :</span>
      <span className="min-w-0 font-medium break-words">{value}</span>
    </p>
  );
}

function SignatureBox({ title, name, url }: { title: string; name: string; url?: string }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold">{title}</p>
      <div className="mt-1 grid h-16 place-items-center rounded border border-dashed border-neutral-300 p-1">
        {url ? (
          // Image locale en data: : le composant Image de Next ne s'applique pas ici.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Signature : ${name}`} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-center text-[11px] text-neutral-500">À signer à la main</span>
        )}
      </div>
    </div>
  );
}

/**
 * Aperçu du document avant de l'enregistrer. Écrit en page web et non affiché depuis
 * le PDF : les téléphones et l'application n'affichent pas un PDF dans une page.
 * Toujours sur fond blanc, comme le papier, quel que soit le thème.
 */
export function AttestationPreview({ fields: f, signatures, names }: { fields: AttestationFields; signatures: Signatures; names: { hebergeant: string; heberge: string } }) {
  return (
    <article aria-label="Aperçu de l'attestation" className="space-y-3 rounded-xl border border-border bg-white p-4 text-xs leading-relaxed text-neutral-950 shadow-sm">
      <h3 className="text-center text-[13px] font-bold tracking-widest text-[#002b73]">ATTESTATION D&apos;HÉBERGEMENT</h3>

      <div>
        <p className="font-semibold">Je soussigné(e) :</p>
        <Line label="Nom" value={f.hebergeantNom} />
        <Line label="Prénom" value={f.hebergeantPrenom} />
        <Line label="Né(e) le" value={`${dateFr(f.hebergeantNaissanceDate)} à ${f.hebergeantNaissanceLieu}`} />
        <Line label="Demeurant" value={`${f.adresse}, ${f.codePostal} ${f.ville}`} />
      </div>

      <div>
        <p className="font-semibold">Déclare sur l&apos;honneur héberger à titre gratuit à mon domicile ci-dessus mentionné :</p>
        <Line label="Civilité" value={f.civilite} />
        <Line label="Nom" value={f.hebergeNom} />
        <Line label="Prénom" value={f.hebergePrenom} />
        <Line label="Né(e) le" value={`${dateFr(f.hebergeNaissanceDate)} à ${f.hebergeNaissanceLieu}`} />
        <Line label="Et ce, depuis" value={dateFr(f.depuis)} />
      </div>

      <p>
        Fait à <span className="font-medium">{f.faitA}</span>, le <span className="font-medium">{dateFr(f.faitLe)}</span>
      </p>

      <div className="grid grid-cols-2 gap-3">
        <SignatureBox title="Signature de l'hébergeant" name={names.hebergeant} url={signatures.hebergeant} />
        <SignatureBox title="Signature de l'hébergé(e)" name={names.heberge} url={signatures.heberge} />
      </div>
    </article>
  );
}
