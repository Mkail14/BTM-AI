import type { Metadata } from "next";
import { SimplePage } from "@/components/layout/SimplePage";
import { ANONYMOUS_DRAFT_TTL_MS } from "@/lib/chat/anonymous-draft";

export const metadata: Metadata = { title: "Données et confidentialité" };

const draftHours = ANONYMOUS_DRAFT_TTL_MS / 3_600_000;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-bg p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <SimplePage title="Données et confidentialité">
      <div className="space-y-5">
        <p className="text-sm text-fg-muted">
          Cette page décrit le fonctionnement réel de cette version de BTM AI. Elle sera complétée par la politique de
          confidentialité officielle de GROUPE BTM.
        </p>

        <Section title="Comment vos messages sont traités">
          <p>
            Pour produire une réponse, votre message et l&apos;historique utile de la conversation sont transmis par nos
            serveurs au fournisseur du modèle d&apos;intelligence artificielle. Ce fournisseur traite les données selon
            ses propres conditions, qui peuvent prévoir une conservation temporaire. Nous ne pouvons donc pas garantir
            une confidentialité absolue : n&apos;écrivez pas d&apos;informations sensibles (mots de passe, données de
            santé, coordonnées bancaires…).
          </p>
        </Section>

        <Section title="Sans compte">
          <p>
            Vos messages ne sont pas enregistrés dans notre base de données. La conversation en cours est conservée
            uniquement dans votre navigateur, pendant {draftHours} heures au maximum, pour que vous puissiez la
            retrouver ou l&apos;enregistrer après inscription. « Nouvelle conversation » l&apos;efface de votre
            appareil.
          </p>
          <p>
            Pour limiter les abus, nous utilisons un cookie technique (identifiant aléatoire d&apos;appareil) et une
            empreinte chiffrée de votre adresse IP. L&apos;adresse IP n&apos;est pas stockée en clair ; les compteurs
            associés sont supprimés après deux jours au plus.
          </p>
        </Section>

        <Section title="Avec un compte">
          <p>
            Votre adresse e-mail et vos conversations (messages envoyés et réponses) sont enregistrés pour que vous
            puissiez les retrouver sur vos appareils. Elles ne sont accessibles qu&apos;à votre compte.
          </p>
          <p>
            Vous pouvez supprimer une conversation à tout moment depuis l&apos;historique : elle est alors effacée de
            notre base de données active. Les sauvegardes techniques de l&apos;hébergeur peuvent en conserver une copie
            pendant leur durée de rétention limitée.
          </p>
          <p>
            Une conversation commencée sans compte n&apos;est ajoutée à votre compte qu&apos;après votre accord
            explicite.
          </p>
        </Section>

        <Section title="Le shimaoré">
          <p>
            BTM AI vise à prendre en charge le shimaoré et le français. Sa maîtrise du shimaoré n&apos;a pas encore été
            vérifiée : les réponses dans cette langue peuvent contenir des erreurs.
          </p>
        </Section>
      </div>
    </SimplePage>
  );
}
