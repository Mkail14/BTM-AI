import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SimplePage } from "@/components/layout/SimplePage";
import { AWA_BIRTH_LABEL } from "@/lib/ai/awa-identity";
import { ANONYMOUS_DRAFT_TTL_MS } from "@/lib/chat/anonymous-draft";
import { formatEuros, WALLET_MAX_BALANCE } from "@/lib/wallet/limits";

export const metadata: Metadata = { title: "Données et confidentialité" };

const draftHours = ANONYMOUS_DRAFT_TTL_MS / 3_600_000;

/*
 * Cette page décrit ce que le code fait réellement. Toute nouvelle collecte
 * de données (table, service externe, mémoire…) doit être ajoutée ici.
 */

const SUMMARY = [
  { title: "Pas de publicité", text: "Vos données ne sont ni vendues, ni louées, ni utilisées pour vous montrer de la publicité." },
  {
    title: "Sans compte, presque rien chez nous",
    text: "La conversation reste dans votre navigateur ; seuls des compteurs anti-abus anonymes sont gardés 2 jours.",
  },
  { title: "Votre carte reste chez Stripe", text: "BTM ne voit et ne garde jamais votre numéro de carte." },
  { title: "Tout s'efface", text: "Conversations, souvenirs, compte : vous supprimez ce que vous voulez, quand vous voulez." },
];

const SECTIONS = [
  { id: "awa", label: "Tamilya et GROUPE BTM" },
  { id: "messages", label: "Vos messages" },
  { id: "sans-compte", label: "Sans compte" },
  { id: "compte", label: "Avec un compte" },
  { id: "memoire", label: "La mémoire de Tamilya" },
  { id: "coordonnees", label: "Adresses, téléphone et avis" },
  { id: "shimaore", label: "Le shimaoré" },
  { id: "voix", label: "La voix" },
  { id: "services", label: "Réservations et portefeuille" },
  { id: "prestataires", label: "Nos prestataires" },
  { id: "securite", label: "Sécurité" },
  { id: "droits", label: "Vos droits" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-border bg-bg p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 pl-5 [&>li]:list-disc">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

const strong = "font-medium text-fg";

export default function PrivacyPage() {
  return (
    <SimplePage title="Données et confidentialité">
      <div className="space-y-6">
        <p className="text-fg-muted">
          Tamilya est une intelligence artificielle faite à Mayotte, pour Mayotte. Une IA à qui l&apos;on parle mérite qu&apos;on
          sache exactement ce qu&apos;elle garde. Cette page le dit simplement, sans jargon, et décrit le fonctionnement réel
          de BTM AI aujourd&apos;hui.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUMMARY.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-bg p-4">
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-fg-muted">{item.text}</p>
            </div>
          ))}
        </div>

        <nav aria-label="Sommaire" className="rounded-2xl border border-border bg-bg p-4">
          <p className="text-xs font-medium tracking-wide text-fg-muted uppercase">Sommaire</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-block rounded-full bg-bg-muted px-3 py-1 text-xs font-medium text-fg-muted hover:text-fg"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Section id="awa" title="Tamilya et GROUPE BTM">
          <p>
            <span className={strong}>Tamilya</span> est l&apos;assistante de BTM AI. Elle est née le {AWA_BIRTH_LABEL} et
            apprend chaque jour à parler shimaoré : notre ambition est qu&apos;elle soit la première IA à vraiment le parler.
          </p>
          <p>
            BTM AI est conçu et exploité par <span className={strong}>GROUPE BTM</span> (Bâtir la Technologie de
            Mayotte), à Mayotte. GROUPE BTM est responsable des données décrites sur cette page.
          </p>
          <p>
            Tamilya est une IA : elle peut se tromper. Elle ne remplace ni un médecin, ni un avocat, ni une administration.
            Vérifiez toujours les informations importantes.
          </p>
        </Section>

        <Section id="messages" title="Comment vos messages sont traités">
          <p>
            Pour répondre, votre message et le début utile de la conversation sont envoyés par nos serveurs au modèle
            d&apos;intelligence artificielle de <span className={strong}>Google (Gemini)</span>, qui rédige la réponse.
            Google les traite selon ses propres conditions, qui peuvent prévoir une conservation temporaire.
          </p>
          <p>
            Quand vous parlez d&apos;emploi ou d&apos;actualité, Tamilya lit aussi des sources publiques (offres France
            Travail de Mayotte, journaux locaux). Ces recherches ne contiennent aucune information sur vous.
          </p>
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-warning">
            N&apos;écrivez jamais de mot de passe, de code de carte bancaire ni d&apos;informations de santé dans la
            conversation.
          </p>
        </Section>

        <Section id="sans-compte" title="Sans compte">
          <List
            items={[
              <>
                Vos messages <span className={strong}>ne sont pas enregistrés</span> dans notre base de données.
              </>,
              <>
                La conversation en cours reste uniquement dans votre navigateur, {draftHours} heures au maximum, pour que
                vous puissiez la retrouver. « Nouvelle conversation » l&apos;efface.
              </>,
              <>
                Pour éviter les abus, nous utilisons un cookie technique (un identifiant d&apos;appareil tiré au hasard)
                et une empreinte chiffrée de votre adresse IP. L&apos;adresse IP n&apos;est jamais gardée en clair, et les
                compteurs sont effacés après deux jours au plus.
              </>,
            ]}
          />
        </Section>

        <Section id="compte" title="Avec un compte">
          <List
            items={[
              <>Votre adresse e-mail et le nom que vous choisissez.</>,
              <>
                Vos conversations (vos messages et les réponses de Tamilya), pour les retrouver sur tous vos appareils.
                Elles ne sont lisibles que par votre compte.
              </>,
              <>
                Une conversation commencée sans compte n&apos;est ajoutée à votre compte{" "}
                <span className={strong}>qu&apos;après votre accord</span>.
              </>,
              <>
                Vous supprimez une conversation quand vous voulez depuis l&apos;historique. Les sauvegardes techniques de
                notre hébergeur peuvent en garder une copie pendant leur courte durée de conservation.
              </>,
            ]}
          />
        </Section>

        <Section id="memoire" title="La mémoire de Tamilya">
          <p>
            Avec un compte, Tamilya retient quelques informations que vous lui donnez sur vous, à l&apos;écrit comme à la
            voix, pour mieux vous répondre la fois suivante : votre prénom, votre commune, votre travail, votre âge, vos
            goûts, vos projets, vos prochaines échéances et les corrections que vous lui apportez.
          </p>
          <p>
            Elle a l&apos;interdiction de retenir les informations sensibles : santé, religion, orientation sexuelle,
            opinions politiques, mots de passe, coordonnées bancaires, numéros de téléphone et adresses e-mail. Un
            contrôle automatique les écarte.
          </p>
          <p>
            Pour qu&apos;elle oublie, dites-le-lui simplement (« oublie où j&apos;habite »). Supprimer votre compte efface
            toute sa mémoire sur vous.
          </p>
        </Section>

        <Section id="coordonnees" title="Adresses, téléphone et avis">
          <List
            items={[
              <>
                <span className={strong}>Carnet d&apos;adresses.</span> Les adresses que vous enregistrez dans les Paramètres
                (maison, bureau…) servent aux livraisons et aux trajets. Vous les modifiez ou les supprimez quand vous
                voulez.
              </>,
              <>
                <span className={strong}>Numéro de téléphone.</span> Si vous l&apos;ajoutez, il sert aux commandes et
                aux réservations, par exemple pour qu&apos;un livreur puisse vous joindre. Il n&apos;est jamais affiché
                publiquement.
              </>,
              <>
                <span className={strong}>Votre avis.</span> Si vous publiez un avis, il est affiché sur la page
                d&apos;accueil, signé « Prénom N. » (votre prénom et l&apos;initiale de votre nom). Vous pouvez le
                retirer à tout moment.
              </>,
            ]}
          />
        </Section>

        <Section id="shimaore" title="Le shimaoré">
          <p>
            La maîtrise du shimaoré de Tamilya est encore en construction : ses réponses dans cette langue peuvent
            contenir des erreurs.
          </p>
          <p>
            Pour l&apos;aider à progresser, quand un message contient un mot shimaoré qu&apos;elle ne connaît pas, ce mot et
            un court extrait de la phrase sont transmis à l&apos;équipe de GROUPE BTM pour être traduits. Ces mots ne sont
            jamais rattachés à votre nom ni à votre compte.
          </p>
        </Section>

        <Section id="voix" title="La voix">
          <p>
            Le micro ne s&apos;allume que lorsque vous appuyez sur son bouton. La transcription de votre voix en texte est
            faite par votre navigateur (par exemple Google dans Chrome, Apple dans Safari), puis traitée comme un message
            écrit. BTM ne reçoit et ne garde aucun enregistrement audio.
          </p>
        </Section>

        <Section id="services" title="Réservations et portefeuille">
          <p>
            <span className={strong}>Examen du code de la route.</span> Quand vous demandez une réservation, nous
            enregistrons les informations nécessaires (identité, date de naissance, commune, téléphone, e-mail, numéro
            NEPH). Pour l&apos;instant, la réservation est un essai : aucune vraie place n&apos;est prise. Ces informations
            ne sont lisibles que par vous et l&apos;équipe de GROUPE BTM.
          </p>
          <p>
            <span className={strong}>Portefeuille.</span> Les recharges sont payées sur la page sécurisée de{" "}
            <span className={strong}>Stripe</span>. BTM ne voit jamais votre numéro de carte : nous gardons seulement
            votre solde, l&apos;historique de vos opérations et le type de moyen de paiement (par exemple « Visa •••• 4242 »).
            Le solde est plafonné à {formatEuros(WALLET_MAX_BALANCE)} pour limiter les risques.
          </p>
        </Section>

        <Section id="documents" title="Vos documents et Google Drive">
          <p>
            Si vous reliez votre compte Google, vos documents sont rangés dans un dossier Tamilya de votre propre Google
            Drive. Ils ne sont pas stockés sur nos serveurs : nous gardons seulement un jeton de connexion chiffré et
            l&apos;adresse de ce compte Google.
          </p>
          <p>
            Tamilya n&apos;accède qu&apos;aux fichiers qu&apos;elle a elle-même déposés, jamais au reste de votre Drive. Ces
            données servent uniquement à afficher et ranger vos documents : elles ne sont ni vendues, ni utilisées pour de
            la publicité, ni pour entraîner une intelligence artificielle.
          </p>
          <p>
            Vous pouvez couper l&apos;accès à tout moment dans Mes documents ou depuis votre compte Google. Vos fichiers
            restent alors dans votre Drive.
          </p>
        </Section>

        <Section id="prestataires" title="Nos prestataires">
          <p>Nous ne travaillons qu&apos;avec des services reconnus, chacun pour un rôle précis :</p>
          <List
            items={[
              <>
                <span className={strong}>Supabase</span> : base de données et comptes.
              </>,
              <>
                <span className={strong}>Vercel</span> : hébergement du site.
              </>,
              <>
                <span className={strong}>Google (Gemini)</span> : modèle d&apos;intelligence artificielle.
              </>,
              <>
                <span className={strong}>Google Drive</span> : vos documents, si vous reliez votre compte.
              </>,
              <>
                <span className={strong}>Stripe</span> : paiements du portefeuille.
              </>,
              <>
                <span className={strong}>OpenStreetMap</span> : retrouver une adresse sur la carte et calculer un trajet.
              </>,
            ]}
          />
          <p>Certains de ces services peuvent traiter des données hors de l&apos;Union européenne, dans le cadre prévu par le RGPD.</p>
        </Section>

        <Section id="securite" title="Sécurité">
          <List
            items={[
              <>Connexion chiffrée (HTTPS) sur tout le site.</>,
              <>Chaque compte ne peut lire que ses propres données : la règle est appliquée par la base de données elle-même.</>,
              <>Les clés techniques sont chiffrées et ne quittent jamais nos serveurs.</>,
              <>Le nombre de messages est limité pour empêcher les abus.</>,
            ]}
          />
        </Section>

        <Section id="droits" title="Vos droits">
          <p>
            Vous pouvez à tout moment consulter, corriger ou supprimer vos données. Le plus simple :{" "}
            <Link href="/parametres" className="font-medium text-accent hover:underline">
              Paramètres
            </Link>{" "}
            pour modifier votre nom ou supprimer votre compte ; la suppression efface vos conversations, la mémoire
            de Tamilya et vos informations.
          </p>
          <p>
            Pour toute autre demande, écrivez à GROUPE BTM :{" "}
            <a href="mailto:contact@btm.yt" className="font-medium text-accent hover:underline">
              contact@btm.yt
            </a>
            . Si vous estimez que vos droits ne sont pas respectés, vous
            pouvez saisir la CNIL (cnil.fr).
          </p>
        </Section>
      </div>
    </SimplePage>
  );
}
