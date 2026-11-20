import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SimplePage } from "@/components/layout/SimplePage";

export const metadata: Metadata = { title: "Mentions légales" };

/*
 * Mentions obligatoires (loi pour la confiance dans l'économie numérique, art. 6).
 * Le prénom et le nom de l'entrepreneur ne sont pas encore donnés : tant que
 * OWNER_NAME est vide, la page n'existe pas (404) et aucun lien n'y mène.
 * Ne jamais inventer ces valeurs.
 */
const OWNER_NAME = "";
const ADDRESS = "25 boulevard Tsiveré, 97690 Koungou, Mayotte";
const SIREN = "939 208 385";
const EMAIL = "contact@btm.yt";

const strong = "font-medium text-fg";

export default function LegalNoticePage() {
  if (!OWNER_NAME) notFound();
  return (
    <SimplePage title="Mentions légales">
      <div className="space-y-6">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Éditeur</h2>
          <p>
            Le site tamilya.yt et le service BTM AI sont édités par <span className={strong}>{OWNER_NAME} EI</span>{" "}
            (entreprise individuelle), sous le nom commercial BTM IA (GROUPE BTM).
          </p>
          <p>
            Adresse : {ADDRESS}
            <br />
            SIREN : {SIREN}
            <br />
            Contact :{" "}
            <a href={`mailto:${EMAIL}`} className="font-medium text-accent hover:underline">
              {EMAIL}
            </a>
          </p>
          <p>Responsable de la publication : {OWNER_NAME}.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Hébergeur</h2>
          <p>
            Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis (vercel.com). Les données des comptes sont
            gardées par Supabase (supabase.com).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Intelligence artificielle</h2>
          <p>
            Tamilya est une intelligence artificielle, pas une personne. Ses réponses, écrites ou parlées, et sa voix sont
            produites automatiquement et peuvent contenir des erreurs.
          </p>
        </section>

        <p className="text-sm text-fg-muted">
          Voir aussi les{" "}
          <Link href="/conditions" className="font-medium text-accent hover:underline">
            conditions d&apos;utilisation
          </Link>{" "}
          et la page{" "}
          <Link href="/confidentialite" className="font-medium text-accent hover:underline">
            données et confidentialité
          </Link>
          .
        </p>
      </div>
    </SimplePage>
  );
}
