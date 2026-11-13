import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SimplePage } from "@/components/layout/SimplePage";
import { TAMILYA_BIRTH_LABEL } from "@/lib/ai/tamilya-identity";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { MAX_ACTIVE_KEYS } from "@/lib/developers/keys";
import { CANCEL_LEAD_MS } from "@/lib/food/cancel";
import { formatEuros, WALLET_MAX_BALANCE, WALLET_MAX_TOPUP, WALLET_MIN_TOPUP } from "@/lib/wallet/limits";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

/** Date de la dernière modification du texte : à mettre à jour à chaque changement de règle. */
const UPDATED_LABEL = "13 novembre 2026";
const cancelHours = CANCEL_LEAD_MS / 3_600_000;
const number = new Intl.NumberFormat("fr-FR");

/*
 * Cette page est le contrat entre BTM AI et la personne qui l'utilise. Elle
 * décrit les règles réellement appliquées par le code : toute nouvelle
 * fonctionnalité payante, tout nouveau partenaire ou toute nouvelle limite
 * doit être ajoutée ici, et la date ci-dessus mise à jour.
 */

const SUMMARY = [
  { title: "Gratuit, avec des limites", text: "Parler avec Tamilya ne coûte rien. Des quotas de messages gardent le service rapide pour tout le monde." },
  { title: "Une IA, pas une experte", text: "Tamilya peut se tromper. Elle ne remplace ni un médecin, ni un avocat, ni une administration." },
  { title: "Vos paiements, votre code", text: "Rien n'est payé sans votre code à 4 chiffres. Un paiement validé avec votre code est sous votre responsabilité." },
  { title: "Vous restez libre", text: "Vous pouvez supprimer vos conversations ou votre compte à tout moment, sans justification ni frais." },
];

const SECTIONS = [
  { id: "objet", label: "Objet et acceptation" },
  { id: "service", label: "Le service" },
  { id: "acces", label: "Accès et âge" },
  { id: "compte", label: "Votre compte" },
  { id: "ia", label: "Tamilya est une IA" },
  { id: "regles", label: "Règles d'utilisation" },
  { id: "limites", label: "Limites et quotas" },
  { id: "contenus", label: "Vos contenus et les réponses" },
  { id: "memoire", label: "Mémoire et documents" },
  { id: "partenaires", label: "Services partenaires" },
  { id: "portefeuille", label: "Portefeuille et paiements" },
  { id: "api", label: "API développeurs" },
  { id: "propriete", label: "Propriété intellectuelle" },
  { id: "disponibilite", label: "Disponibilité et évolution" },
  { id: "responsabilite", label: "Responsabilité" },
  { id: "fin", label: "Suspension et fermeture" },
  { id: "donnees", label: "Données personnelles" },
  { id: "modifications", label: "Modifications" },
  { id: "droit", label: "Droit applicable et litiges" },
  { id: "contact", label: "Contact" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-border bg-bg p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="pt-1 text-sm font-semibold text-fg">{children}</h3>;
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
const link = "font-medium text-accent hover:underline";

export default function TermsPage() {
  return (
    <SimplePage title="Conditions d'utilisation">
      <div className="space-y-6">
        <div className="space-y-3 text-fg-muted">
          <p>
            Bienvenue sur BTM AI. Ces conditions décrivent les règles du jeu entre vous et GROUPE BTM quand vous parlez
            avec Tamilya, utilisez votre compte, votre portefeuille, les services de nos partenaires ou notre API. Elles
            sont écrites simplement, parce qu&apos;un contrat qu&apos;on ne comprend pas ne protège personne.
          </p>
          <p className="text-xs">Dernière mise à jour : {UPDATED_LABEL}.</p>
        </div>

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
          <ol className="mt-2 flex flex-wrap gap-x-1.5 gap-y-4">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="zone-appui relative inline-block rounded-full bg-bg-muted px-3 py-1 text-xs font-medium text-fg-muted hover:text-fg"
                >
                  {i + 1}. {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <Section id="objet" title="1. Objet et acceptation">
          <p>
            Les présentes conditions d&apos;utilisation (les « Conditions ») encadrent l&apos;accès et l&apos;usage du
            service <span className={strong}>BTM AI</span>, accessible sur btm.yt et dans ses déclinaisons (site, application
            installable, API). BTM AI est conçu et exploité par <span className={strong}>GROUPE BTM</span> (Bâtir la
            Technologie de Mayotte), à Mayotte, désigné ci-après « BTM » ou « nous ».
          </p>
          <p>
            En utilisant BTM AI, même sans compte, vous acceptez ces Conditions ainsi que nos{" "}
            <Link href="/confidentialite" className={link}>
              règles de confidentialité
            </Link>
            , qui en font partie intégrante. À la création d&apos;un compte, cette acceptation vous est demandée
            expressément. Si vous n&apos;êtes pas d&apos;accord avec une de ces règles, n&apos;utilisez pas le service.
          </p>
          <p>
            Ces Conditions s&apos;appliquent à toute personne qui utilise BTM AI : particulier, entreprise, association ou
            développeur. Certaines rubriques ne vous concernent que si vous utilisez la fonctionnalité correspondante
            (portefeuille, services partenaires, API).
          </p>
        </Section>

        <Section id="service" title="2. Le service">
          <p>
            <span className={strong}>Tamilya</span> est l&apos;assistante conversationnelle de BTM AI. Née le {TAMILYA_BIRTH_LABEL},
            elle répond en français, apprend le shimaoré et est pensée d&apos;abord pour les habitants et les entreprises de
            Mayotte. Vous pouvez lui écrire ou lui parler à voix haute.
          </p>
          <p>Au-delà de la conversation, BTM AI propose, selon votre compte et les ouvertures en cours :</p>
          <List
            items={[
              <>
                <span className={strong}>Un historique</span> de vos conversations, retrouvable sur tous vos appareils avec un
                compte.
              </>,
              <>
                <span className={strong}>Une mémoire</span> : Tamilya retient quelques informations que vous lui donnez pour
                mieux vous répondre la fois suivante.
              </>,
              <>
                <span className={strong}>Mes documents</span> : rangement de vos documents dans un dossier Tamilya de votre
                propre Google Drive, si vous reliez votre compte Google.
              </>,
              <>
                <span className={strong}>Des services partenaires</span> accessibles dans la conversation : réservation
                d&apos;un examen du code de la route, devis BTM, commande de repas auprès de restaurants partenaires.
              </>,
              <>
                <span className={strong}>Un portefeuille</span> prépayé pour régler ces services, et la possibilité de laisser
                Tamilya payer à votre place avec votre code.
              </>,
              <>
                <span className={strong}>Une API</span> pour intégrer Tamilya dans vos propres applications.
              </>,
            ]}
          />
          <p>
            BTM AI évolue vite. Certaines fonctionnalités sont présentées comme des <span className={strong}>essais</span> ou
            des démonstrations : elles sont signalées comme telles dans l&apos;application et ne produisent pas d&apos;effet
            réel (voir la rubrique Services partenaires).
          </p>
        </Section>

        <Section id="acces" title="3. Accès et âge">
          <Sub>Sans compte</Sub>
          <p>
            Vous pouvez parler avec Tamilya immédiatement, sans vous inscrire, dans la limite d&apos;un essai de{" "}
            {CHAT_LIMITS.guestTrialMessages} messages par appareil. Au-delà, un compte gratuit est nécessaire. Sans compte,
            vos conversations ne sont pas enregistrées chez nous et restent dans votre navigateur.
          </p>
          <Sub>Avec un compte</Sub>
          <p>
            Le compte est gratuit. Il se crée avec une adresse e-mail et un mot de passe, ou avec « Continuer avec Google ».
            Il donne accès à l&apos;historique, à la mémoire, aux documents, aux services partenaires et au portefeuille.
          </p>
          <Sub>Âge</Sub>
          <p>
            BTM AI est ouvert à tous. Toutefois, pour créer un compte, vous devez avoir au moins{" "}
            <span className={strong}>15 ans</span>, ou l&apos;accord d&apos;un parent ou d&apos;un responsable légal si vous êtes
            plus jeune. Le portefeuille, les paiements et la commande de services sont réservés aux{" "}
            <span className={strong}>personnes majeures</span> ou aux mineurs agissant avec l&apos;autorisation et sous la
            responsabilité de leurs parents. Un mineur de 15 ans peut faire réserver un examen du code (conduite accompagnée)
            par l&apos;intermédiaire d&apos;un adulte.
          </p>
          <Sub>Matériel et connexion</Sub>
          <p>
            L&apos;accès au service suppose un appareil et une connexion internet qui restent à votre charge. Le micro, la voix
            et certaines fonctions avancées dépendent des capacités de votre navigateur ; nous indiquons dans l&apos;Aide les
            navigateurs qui fonctionnent le mieux.
          </p>
        </Section>

        <Section id="compte" title="4. Votre compte">
          <List
            items={[
              <>
                <span className={strong}>Des informations exactes.</span> Le nom que vous affichez et votre adresse e-mail
                doivent être les vôtres. Il est interdit de se faire passer pour quelqu&apos;un d&apos;autre, pour une
                entreprise ou pour l&apos;équipe de BTM.
              </>,
              <>
                <span className={strong}>Un compte personnel.</span> Votre compte est à vous : ne le prêtez pas, ne le vendez
                pas, ne créez pas plusieurs comptes pour contourner les limites.
              </>,
              <>
                <span className={strong}>Votre mot de passe.</span> Choisissez-le solide (au moins 8 caractères, lettres et
                chiffres) et gardez-le secret. Tout ce qui est fait depuis votre compte est présumé fait par vous. Si vous
                pensez que quelqu&apos;un l&apos;utilise, changez-le immédiatement dans les Paramètres et prévenez-nous.
              </>,
              <>
                <span className={strong}>Le code à 4 chiffres</span> du portefeuille et l&apos;empreinte de voix sont des
                protections supplémentaires sous votre garde : ne donnez votre code à personne, pas même à quelqu&apos;un qui
                se présenterait comme BTM. Nous ne vous le demanderons jamais.
              </>,
              <>
                <span className={strong}>Suppression.</span> Vous pouvez supprimer votre compte à tout moment dans les
                Paramètres. Vos conversations, la mémoire de Tamilya et vos informations sont alors effacées. Pensez à
                dépenser ou à demander le remboursement de votre solde avant (voir Portefeuille).
              </>,
            ]}
          />
        </Section>

        <Section id="ia" title="5. Tamilya est une intelligence artificielle">
          <p>
            Tamilya génère ses réponses grâce à un modèle d&apos;intelligence artificielle. Elle est utile, rapide et de
            bonne volonté, mais elle <span className={strong}>peut se tromper</span>, inventer un détail, mal comprendre une
            question ou donner une information dépassée. Ses réponses sont fournies à titre d&apos;information et{" "}
            <span className={strong}>ne constituent jamais un conseil professionnel</span>.
          </p>
          <List
            items={[
              <>
                <span className={strong}>Santé</span> : Tamilya ne pose pas de diagnostic et ne remplace pas un médecin, un
                pharmacien ou les secours. En cas d&apos;urgence, appelez le 15, le 18 ou le 112.
              </>,
              <>
                <span className={strong}>Droit, argent, administration</span> : ses explications ne remplacent ni un avocat,
                ni un comptable, ni la réponse officielle d&apos;une administration (CAF, préfecture, impôts, ANTS…).
              </>,
              <>
                <span className={strong}>Emploi et actualité</span> : lorsqu&apos;elle lit des sources publiques (offres
                France Travail, journaux locaux), elle les résume ; la source fait foi.
              </>,
              <>
                <span className={strong}>Shimaoré</span> : sa maîtrise de la langue est en construction. Ses phrases en
                shimaoré peuvent contenir des erreurs ; ne les utilisez pas pour un document officiel sans relecture.
              </>,
            ]}
          />
          <p>
            Vérifiez toujours les informations importantes avant d&apos;agir, et relisez tout ce que Tamilya prépare pour
            vous (message, devis, document) avant de l&apos;envoyer ou de le signer. Vous restez seul responsable des
            décisions que vous prenez à partir de ses réponses.
          </p>
        </Section>

        <Section id="regles" title="6. Règles d'utilisation">
          <p>
            BTM AI est un espace de confiance, fait pour aider. En l&apos;utilisant, vous vous engagez à respecter la loi
            et les autres. Il est notamment interdit :
          </p>
          <List
            items={[
              <>
                d&apos;utiliser le service pour une activité <span className={strong}>illégale</span>, frauduleuse ou
                trompeuse, ou pour nuire à quelqu&apos;un ;
              </>,
              <>
                de produire ou diffuser des contenus{" "}
                <span className={strong}>haineux, discriminatoires, violents, de harcèlement</span> ou portant atteinte à la
                dignité d&apos;une personne ;
              </>,
              <>
                de produire ou rechercher des contenus <span className={strong}>sexuels impliquant des mineurs</span>, sous
                quelque forme que ce soit : ces faits sont signalés aux autorités ;
              </>,
              <>
                de chercher à obtenir des instructions pour fabriquer des armes, des explosifs, des substances dangereuses
                ou des logiciels malveillants ;
              </>,
              <>
                d&apos;usurper l&apos;identité d&apos;une personne, d&apos;une entreprise, d&apos;une administration ou de
                BTM, ou de faire croire qu&apos;un contenu généré par Tamilya a été écrit par une personne réelle quand cela
                peut tromper ;
              </>,
              <>
                de <span className={strong}>contourner les limites</span> du service : création de comptes multiples,
                automatisation de la conversation hors de l&apos;API prévue, manipulation des quotas, des paiements ou du
                code d&apos;autorisation ;
              </>,
              <>
                de tenter d&apos;accéder aux données d&apos;un autre compte, de sonder ou de perturber nos serveurs, de
                surcharger le service ou d&apos;en analyser le fonctionnement interne à des fins de contournement ;
              </>,
              <>
                d&apos;extraire massivement les réponses de Tamilya pour entraîner un autre modèle d&apos;intelligence
                artificielle ou construire un service concurrent ;
              </>,
              <>de modifier, décompiler ou revendre le service, ou d&apos;en retirer les mentions de BTM et de Tamilya ;</>,
              <>
                d&apos;utiliser les services partenaires (réservations, commandes) de manière abusive : fausses commandes,
                fausses identités, annulations répétées de mauvaise foi.
              </>,
            ]}
          />
          <p>
            Tamilya refuse d&apos;elle-même certaines demandes contraires à ces règles. Un refus n&apos;est pas une panne :
            c&apos;est le service qui fonctionne comme prévu.
          </p>
        </Section>

        <Section id="limites" title="7. Limites et quotas">
          <p>
            Parler avec Tamilya est <span className={strong}>gratuit</span>. Pour que le service reste rapide et gratuit pour
            tout le monde, chaque compte dispose de limites : un nombre de messages par jour et par minute, une taille
            maximale par message et un nombre maximal de messages par conversation.
          </p>
          <List
            items={[
              <>
                Un message fait au plus {number.format(CHAT_LIMITS.maxUserMessageChars)} caractères ; une conversation
                enregistrée compte au plus {number.format(CHAT_LIMITS.conversationMaxMessages)} messages (ouvrez-en une
                nouvelle ensuite).
              </>,
              <>
                Sans compte : {number.format(CHAT_LIMITS.anonymousMaxMessages)} messages par conversation et un essai de{" "}
                {CHAT_LIMITS.guestTrialMessages} messages par appareil.
              </>,
              <>
                Vos quotas du jour, l&apos;heure de remise à zéro et vos limites exactes sont affichés en temps réel sur la
                page{" "}
                <Link href="/utilisation" className={link}>
                  Utilisation
                </Link>
                .
              </>,
            ]}
          />
          <p>
            Ces limites peuvent être ajustées à tout moment selon la charge du service et le coût des modèles
            d&apos;intelligence artificielle. Nous nous réservons la possibilité de proposer plus tard des offres payantes
            avec des limites plus élevées ; rien ne vous sera jamais facturé sans votre accord explicite.
          </p>
        </Section>

        <Section id="contenus" title="8. Vos contenus et les réponses de Tamilya">
          <Sub>Ce que vous écrivez</Sub>
          <p>
            Vos messages, vos documents, vos avis et les informations que vous donnez à Tamilya restent{" "}
            <span className={strong}>les vôtres</span>. Vous nous autorisez seulement à les traiter, les stocker et les
            transmettre aux prestataires techniques décrits dans les règles de confidentialité, dans la stricte mesure
            nécessaire pour vous rendre le service. Nous ne les vendons pas et ne les utilisons pas pour la publicité.
          </p>
          <p>
            Vous garantissez avoir le droit de partager ce que vous envoyez (textes, photos, documents) et que ces contenus
            ne portent pas atteinte aux droits d&apos;un tiers.
          </p>
          <Sub>Ce que Tamilya répond</Sub>
          <p>
            Vous pouvez utiliser librement les réponses que Tamilya vous donne, y compris dans un cadre professionnel, sous
            votre responsabilité et dans le respect de la loi. Une même question peut produire une réponse semblable pour
            un autre utilisateur : nous ne garantissons aucune exclusivité sur un texte généré. Lorsque vous diffusez un
            texte généré, ne le présentez pas comme la parole officielle de BTM.
          </p>
          <Sub>Le shimaoré</Sub>
          <p>
            Lorsqu&apos;un de vos messages contient un mot shimaoré que Tamilya ne connaît pas, ce mot et un court extrait de
            la phrase sont transmis, sans votre nom, à l&apos;équipe de BTM pour être traduits. En utilisant Tamilya en
            shimaoré, vous acceptez de contribuer ainsi à son apprentissage ; ces mots enrichissent un vocabulaire qui
            appartient à BTM et profite à tous les utilisateurs.
          </p>
          <Sub>Votre avis</Sub>
          <p>
            Si vous publiez un avis sur Tamilya, vous nous autorisez à l&apos;afficher sur la page d&apos;accueil, signé de
            votre prénom et de l&apos;initiale de votre nom. Vous pouvez le retirer à tout moment. Nous pouvons retirer un
            avis injurieux, hors sujet ou contraire à ces Conditions.
          </p>
        </Section>

        <Section id="memoire" title="9. Mémoire et documents">
          <p>
            Avec un compte, Tamilya retient certaines informations que vous lui confiez (prénom, commune, travail,
            projets…) pour personnaliser ses réponses. Elle a l&apos;interdiction de retenir les informations sensibles.
            Vous pouvez lui demander d&apos;oublier à tout moment ; supprimer votre compte efface toute sa mémoire.
          </p>
          <p>
            Si vous reliez votre compte Google, vos documents sont rangés dans un dossier Tamilya de{" "}
            <span className={strong}>votre propre Google Drive</span>. Ils vous appartiennent, utilisent votre espace Google
            et restent à vous si vous quittez BTM AI. Tamilya n&apos;accède qu&apos;aux fichiers qu&apos;elle y a déposés.
            L&apos;usage de Google Drive est aussi soumis aux conditions de Google. Vous pouvez couper l&apos;accès à tout
            moment ; nous ne sommes pas responsables de la disponibilité de Google Drive ni des fichiers que vous modifiez
            ou supprimez directement dans votre Drive.
          </p>
        </Section>

        <Section id="partenaires" title="10. Services partenaires">
          <p>
            Tamilya donne accès, dans la conversation, à des services rendus par des{" "}
            <span className={strong}>entreprises partenaires</span> de Mayotte ou par GROUPE BTM lui-même. Pour chacun,
            Tamilya joue le rôle d&apos;intermédiaire : elle recueille votre demande, la transmet et vous tient informé. Le
            service lui-même (le repas, la prestation, le rendez-vous) est rendu par le partenaire, qui en reste
            responsable.
          </p>
          <Sub>Réservation de l&apos;examen du code de la route</Sub>
          <p>
            Tamilya vous aide à choisir une ville, un jour et une heure, puis recueille les informations nécessaires
            (identité, date de naissance, commune, téléphone, e-mail, numéro NEPH). Ces informations doivent être exactes :
            un dossier erroné peut empêcher le passage de l&apos;examen.{" "}
            <span className={strong}>Pour l&apos;instant, la réservation est un essai</span> : aucune vraie place n&apos;est
            prise et rien n&apos;est payé. Nous l&apos;indiquons clairement dans l&apos;application et vous préviendrons quand
            la réservation deviendra réelle.
          </p>
          <Sub>Devis BTM</Sub>
          <p>
            Un devis préparé par Tamilya pour GROUPE BTM est une proposition indicative. Il n&apos;engage BTM qu&apos;après
            confirmation par un membre de l&apos;équipe et, le cas échéant, signature d&apos;un devis définitif.
          </p>
          <Sub>Commande de repas</Sub>
          <p>
            Lorsque la commande de repas est ouverte à votre compte, vous commandez auprès d&apos;un restaurant partenaire et
            payez avec votre portefeuille. La commande est confirmée par un code que vous présentez au retrait ou à la
            livraison. Vous pouvez l&apos;annuler chez BTM jusqu&apos;à{" "}
            <span className={strong}>{cancelHours} heures avant le début de la préparation</span>, avec remboursement
            immédiat sur le moyen de paiement utilisé. Passé ce délai, BTM ne peut plus annuler : il faut voir directement
            avec le restaurant. Le restaurant est responsable de la qualité, de la composition (allergènes compris) et des
            horaires du repas ; signalez-nous tout problème pour que nous vous aidions à le régler.
          </p>
          <Sub>Partenaires et affichage</Sub>
          <p>
            La liste des partenaires et des services ouverts peut changer. Certains partenaires présentés sur la page{" "}
            <Link href="/partenaires" className={link}>
              Nos partenaires
            </Link>{" "}
            peuvent être des exemples de démonstration, indiqués comme tels. Les prix affichés par un partenaire sont fixés
            par lui ; en cas d&apos;écart entre le prix annoncé et le prix débité, le prix annoncé au moment de votre
            validation fait foi.
          </p>
        </Section>

        <Section id="portefeuille" title="11. Portefeuille et paiements">
          <Sub>Recharges</Sub>
          <p>
            Le portefeuille est un solde prépayé en euros qui sert à régler les services partenaires. Vous le rechargez par
            carte sur la page sécurisée de <span className={strong}>Stripe</span>, notre prestataire de paiement, de{" "}
            {formatEuros(WALLET_MIN_TOPUP)} à {formatEuros(WALLET_MAX_TOPUP)} par recharge. Le solde est plafonné à{" "}
            <span className={strong}>{formatEuros(WALLET_MAX_BALANCE)}</span> afin de limiter les risques en cas de vol du
            compte. Il n&apos;y a <span className={strong}>aucuns frais</span> : 10 € rechargés font 10 € de solde. Le solde
            ne produit pas d&apos;intérêts et n&apos;est pas un compte bancaire.
          </p>
          <p>
            Une recharge peut rester « En attente » quelques minutes avant d&apos;être créditée. Si elle est marquée
            « Échouée », rien n&apos;a été débité. BTM ne voit et ne conserve jamais votre numéro de carte.
          </p>
          <Sub>Paiements</Sub>
          <p>
            Chaque paiement depuis le portefeuille exige votre <span className={strong}>code à 4 chiffres</span>. Le montant,
            le bénéficiaire et l&apos;objet du paiement vous sont affichés avant la saisie du code : vérifiez-les à chaque
            fois. Un paiement validé avec votre code est définitif entre vous et BTM, sous réserve des règles
            d&apos;annulation propres à chaque service (par exemple le délai d&apos;annulation d&apos;un repas).
          </p>
          <Sub>Tamilya paie à votre place</Sub>
          <p>
            Vous pouvez autoriser Tamilya à déclencher des paiements à partir de ce que vous lui dites, à l&apos;écrit ou à la
            voix. Cette autorisation se donne <span className={strong}>une seule fois</span>, après un avertissement, et vaut
            pour tous les paiements suivants ; votre code reste demandé à chaque fois. Tamilya peut mal comprendre une
            demande : un paiement effectué avec votre autorisation et votre code juste est{" "}
            <span className={strong}>sous votre responsabilité</span>, même s&apos;il résultait d&apos;une erreur de
            compréhension. BTM ne le rembourse pas et ne garantit pas le résultat obtenu. Vous pouvez retirer cette
            autorisation à tout moment dans les Paramètres, rubrique Tamilya ; supprimer votre code la retire aussi.
          </p>
          <Sub>Empreinte de voix</Sub>
          <p>
            L&apos;empreinte de voix est une vérification facultative, qui s&apos;ajoute à votre code sans jamais le
            remplacer. Une voix peut être imitée : l&apos;empreinte réduit le risque, elle ne le supprime pas. Vous pouvez
            l&apos;effacer à tout moment.
          </p>
          <Sub>Remboursement du solde</Sub>
          <p>
            Votre solde reste disponible sans limite de durée tant que votre compte existe. Vous pouvez demander à tout
            moment le remboursement du solde non utilisé en écrivant à l&apos;adresse de contact ; il est reversé sur le moyen
            de paiement d&apos;origine, sous réserve des vérifications anti-fraude de Stripe, dans un délai raisonnable. En
            cas de suppression du compte, demandez ce remboursement avant, ou dans les 30 jours qui suivent en nous
            indiquant l&apos;adresse e-mail du compte.
          </p>
          <Sub>Contestation</Sub>
          <p>
            En cas de débit que vous ne reconnaissez pas, écrivez-nous sans délai avec la date et le montant. Nous
            examinons chaque contestation et bloquons le portefeuille si nécessaire. Toute fraude ou tentative de fraude
            entraîne la fermeture du compte et peut être signalée aux autorités.
          </p>
        </Section>

        <Section id="api" title="12. API développeurs">
          <p>
            L&apos;espace{" "}
            <Link href="/developpeurs" className={link}>
              Développeurs
            </Link>{" "}
            permet d&apos;intégrer Tamilya dans vos propres applications grâce à un code d&apos;accès personnel. En utilisant
            l&apos;API, vous acceptez en plus les règles suivantes :
          </p>
          <List
            items={[
              <>
                <span className={strong}>Gratuité.</span> L&apos;API ne coûte rien chez BTM. Elle fonctionne avec votre propre
                clé Gemini : la consommation et toute facturation éventuelle relèvent de votre contrat avec Google, pas de
                BTM.
              </>,
              <>
                <span className={strong}>Vos codes.</span> Vous disposez d&apos;au plus {MAX_ACTIVE_KEYS} codes actifs. Un code
                est personnel et secret : ne le publiez pas dans un dépôt public ni dans une application grand public côté
                client. Toute utilisation d&apos;un de vos codes est présumée faite par vous. Révoquez immédiatement un code
                compromis.
              </>,
              <>
                <span className={strong}>Limites.</span> Des limites de débit s&apos;appliquent par code, par compte et par
                adresse IP. Elles sont décrites dans la documentation et peuvent évoluer ; votre application doit gérer
                proprement la réponse « rate_limited » et réessayer après le délai indiqué.
              </>,
              <>
                <span className={strong}>Tamilya reste Tamilya.</span> Le champ de contexte permet de situer votre
                application ; il ne permet ni de renommer Tamilya, ni de changer sa personnalité, ni de lui faire contourner
                ses règles. Votre application doit indiquer à ses utilisateurs que les réponses viennent d&apos;une
                intelligence artificielle fournie par BTM AI.
              </>,
              <>
                <span className={strong}>Vos utilisateurs.</span> Vous êtes responsable de votre application, de ses
                utilisateurs et des données que vous leur demandez. Vous devez leur fournir vos propres règles de
                confidentialité et respecter la réglementation applicable (RGPD notamment).
              </>,
              <>
                <span className={strong}>Usages interdits.</span> Les règles d&apos;utilisation de la rubrique 6
                s&apos;appliquent à chaque appel de l&apos;API. Il est en outre interdit de revendre l&apos;accès à l&apos;API
                ou de l&apos;utiliser pour entraîner un modèle concurrent.
              </>,
              <>
                <span className={strong}>Évolutions.</span> L&apos;API est jeune : son format peut évoluer. Nous nous efforçons
                de prévenir sur la page Développeurs avant tout changement incompatible, sans pouvoir le garantir dans tous
                les cas.
              </>,
            ]}
          />
        </Section>

        <Section id="propriete" title="13. Propriété intellectuelle">
          <p>
            BTM AI, Tamilya, leurs noms, logos, visuels, textes, interfaces, voix, sons, le code du site et sa base de
            connaissances (vocabulaire shimaoré compris) appartiennent à GROUPE BTM ou à ses partenaires et sont protégés
            par le droit de la propriété intellectuelle. Ces Conditions ne vous transfèrent aucun droit sur ces éléments, en
            dehors du droit personnel d&apos;utiliser le service conformément aux présentes.
          </p>
          <p>
            Vous pouvez partager des captures d&apos;écran de vos conversations et parler de Tamilya librement, en évitant
            toute présentation qui laisserait croire à un partenariat officiel ou à une parole de BTM. Toute reproduction du
            site, de son identité visuelle ou de sa documentation à d&apos;autres fins nécessite notre accord écrit.
          </p>
          <p>
            Les contenus de tiers (offres France Travail, articles de presse, cartes OpenStreetMap, documents de nos
            partenaires) restent la propriété de leurs auteurs et sont soumis à leurs propres licences.
          </p>
        </Section>

        <Section id="disponibilite" title="14. Disponibilité et évolution du service">
          <p>
            Nous faisons de notre mieux pour que BTM AI soit disponible en permanence, mais nous ne pouvons pas le garantir.
            Le service peut être interrompu pour maintenance, en cas de panne chez un prestataire (hébergeur, base de
            données, modèle d&apos;intelligence artificielle, paiement), de surcharge, de coupure réseau ou de force majeure.
            Une page d&apos;attente vous l&apos;indique alors.
          </p>
          <p>
            BTM AI est en construction permanente. Nous pouvons à tout moment ajouter, modifier, suspendre ou retirer une
            fonctionnalité, changer les limites, ouvrir ou fermer un service partenaire, ou cesser le service. Dans la mesure
            du possible, nous vous prévenons dans l&apos;application ou par e-mail lorsqu&apos;un changement vous affecte
            directement, en particulier s&apos;il touche votre portefeuille.
          </p>
          <p>
            Les fonctionnalités signalées comme essai, démonstration ou bêta sont fournies telles quelles, pour découverte,
            et peuvent disparaître sans préavis.
          </p>
        </Section>

        <Section id="responsabilite" title="15. Responsabilité">
          <p>
            BTM AI est fourni « en l&apos;état », gratuitement pour la conversation. Dans les limites permises par la loi,
            GROUPE BTM ne garantit pas que les réponses de Tamilya soient exactes, complètes, à jour ou adaptées à votre
            situation, ni que le service soit sans erreur ou sans interruption.
          </p>
          <p>GROUPE BTM ne peut être tenu responsable :</p>
          <List
            items={[
              <>des décisions que vous prenez ou des actes que vous accomplissez à partir d&apos;une réponse de Tamilya ;</>,
              <>
                d&apos;un paiement que vous avez validé avec votre code, y compris lorsqu&apos;il résulte d&apos;une mauvaise
                compréhension de votre demande par Tamilya ;
              </>,
              <>
                de la prestation rendue par un partenaire (repas, rendez-vous, travaux…), qui en reste seul responsable, BTM
                vous aidant toutefois à obtenir une solution ;
              </>,
              <>des services de tiers que vous utilisez avec BTM AI (Google, Stripe, votre navigateur, votre opérateur) ;</>,
              <>
                d&apos;un usage de votre compte, de votre mot de passe ou de votre code par une personne à qui vous les auriez
                communiqués ou laissés accessibles ;
              </>,
              <>
                des dommages indirects : perte de chance, perte de données que vous n&apos;auriez pas sauvegardées, manque à
                gagner, préjudice d&apos;image.
              </>,
            ]}
          />
          <p>
            Lorsque la responsabilité de GROUPE BTM est engagée au titre d&apos;un service payant, elle est limitée, hors
            faute lourde ou intentionnelle, au montant que vous avez effectivement payé pour ce service. Rien dans ces
            Conditions ne limite les droits que la loi vous garantit en tant que consommateur, ni la responsabilité de BTM
            en cas de dommage corporel ou de faute intentionnelle.
          </p>
          <p>
            De votre côté, vous êtes responsable de l&apos;usage que vous faites du service, des contenus que vous envoyez et
            du respect de ces Conditions. Vous vous engagez à indemniser BTM de toute réclamation d&apos;un tiers qui
            résulterait d&apos;une violation de ces règles de votre part.
          </p>
        </Section>

        <Section id="fin" title="16. Suspension et fermeture">
          <Sub>Par vous</Sub>
          <p>
            Vous pouvez cesser d&apos;utiliser BTM AI quand vous voulez et supprimer votre compte dans les Paramètres, sans
            frais ni justification. Pensez d&apos;abord à votre solde (voir Portefeuille) et à conserver ce que vous souhaitez
            garder de vos conversations.
          </p>
          <Sub>Par BTM</Sub>
          <p>
            Nous pouvons limiter, suspendre ou fermer un compte, révoquer un code d&apos;API ou bloquer un appareil en cas de
            violation de ces Conditions, de fraude, d&apos;abus, d&apos;atteinte à la sécurité du service ou de demande
            d&apos;une autorité. Selon la gravité, nous vous prévenons avant ou juste après, en indiquant le motif, sauf si la
            loi ou la sécurité nous l&apos;interdisent. Vous pouvez contester cette décision à l&apos;adresse de contact.
          </p>
          <p>
            En cas de fermeture du compte par BTM, le solde du portefeuille non utilisé vous est remboursé, sauf en cas de
            fraude avérée ou de sommes dues à un partenaire. Un compte inactif pendant plus de trois ans peut être supprimé
            après un e-mail d&apos;avertissement resté sans réponse pendant 30 jours.
          </p>
        </Section>

        <Section id="donnees" title="17. Données personnelles">
          <p>
            La manière dont nous traitons vos données (messages, compte, mémoire, voix, paiements, documents) est décrite en
            détail dans nos{" "}
            <Link href="/confidentialite" className={link}>
              règles de confidentialité
            </Link>
            . Elles font partie de ces Conditions. En résumé : pas de publicité, pas de revente, le minimum nécessaire, et
            tout s&apos;efface à votre demande. GROUPE BTM est responsable de ces traitements au sens du RGPD.
          </p>
        </Section>

        <Section id="modifications" title="18. Modifications des conditions">
          <p>
            Ces Conditions peuvent évoluer, pour suivre le service, la loi ou nos partenaires. La date de dernière mise à
            jour figure en haut de la page. Pour un changement important (nouvelle règle de paiement, nouvelle limite,
            nouveau service engageant), nous vous informons dans l&apos;application ou par e-mail au moins{" "}
            <span className={strong}>15 jours</span> avant son entrée en vigueur, sauf urgence légale ou de sécurité.
          </p>
          <p>
            Si vous continuez à utiliser BTM AI après l&apos;entrée en vigueur des nouvelles Conditions, vous les acceptez. Si
            vous les refusez, vous pouvez supprimer votre compte avant cette date ; votre solde vous est alors remboursé
            selon les règles de la rubrique Portefeuille.
          </p>
        </Section>

        <Section id="droit" title="19. Droit applicable et litiges">
          <p>
            Ces Conditions sont soumises au <span className={strong}>droit français</span>, applicable à Mayotte. Elles sont
            rédigées en français ; en cas de traduction, la version française fait foi.
          </p>
          <p>
            En cas de désaccord, écrivez-nous d&apos;abord : la plupart des problèmes se règlent en quelques échanges. Nous
            nous engageons à répondre dans un délai raisonnable, au plus tard sous 30 jours.
          </p>
          <p>
            Si vous êtes consommateur et qu&apos;aucune solution n&apos;est trouvée, vous pouvez recourir gratuitement à un
            médiateur de la consommation, dont les coordonnées vous sont communiquées sur demande, ou utiliser la
            plateforme européenne de règlement en ligne des litiges (ec.europa.eu/consumers/odr). À défaut d&apos;accord, les
            tribunaux compétents sont ceux prévus par la loi ; pour un consommateur résidant à Mayotte, il s&apos;agit
            notamment des juridictions de Mamoudzou.
          </p>
          <p>
            Si une clause de ces Conditions était jugée invalide, les autres resteraient applicables. Le fait pour BTM de ne
            pas faire valoir une règle à un moment donné ne vaut pas renonciation à l&apos;appliquer ensuite.
          </p>
        </Section>

        <Section id="contact" title="20. Contact">
          <p>
            Pour toute question sur ces Conditions, une contestation, un remboursement ou un signalement, écrivez à GROUPE
            BTM :{" "}
            <a href="mailto:contact@btm.yt" className={link}>
              contact@btm.yt
            </a>
            . Vous pouvez aussi passer par la page{" "}
            <Link href="/aide" className={link}>
              Aide
            </Link>
            , qui transmet votre message à l&apos;équipe.
          </p>
          <p>Merci de faire confiance à Tamilya. Elle apprend chaque jour, et vous l&apos;aidez à grandir.</p>
        </Section>
      </div>
    </SimplePage>
  );
}
