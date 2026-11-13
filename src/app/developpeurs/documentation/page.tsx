import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { MAX_ACTIVE_KEYS } from "@/lib/developers/keys";
import { MAX_WIDGET_ORIGINS, MAX_WIDGETS } from "@/lib/developers/widgets";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { DocCode } from "../DocCode";
import { apiEndpoint, widgetScriptUrl } from "../endpoint";
import { DevShell } from "../ui";

export const metadata: Metadata = {
  title: "Documentation de l'API",
  description: "Tout pour utiliser gratuitement Tamilya dans votre application : code d'accès, requête, réponse, erreurs, limites et exemples.",
};

const SECTIONS = [
  ["presentation", "Présentation"],
  ["acces", "Accès : un engagement"],
  ["identite", "Identité et mission"],
  ["widget", "Widget : une ligne à coller"],
  ["demarrage", "API : démarrage rapide"],
  ["authentification", "Authentification"],
  ["requete", "La requête"],
  ["reponse", "La réponse"],
  ["conversation", "Conversations"],
  ["contexte", "Mission et contexte"],
  ["erreurs", "Erreurs"],
  ["limites", "Limites"],
  ["securite", "Sécurité"],
  ["exemples", "Exemples complets"],
  ["faq", "Questions fréquentes"],
] as const;

const rule = (policy: readonly { windowSeconds: number; limit: number }[], seconds: number) =>
  (policy.find((r) => r.windowSeconds === seconds)?.limit ?? 0).toLocaleString("fr-FR");

const ERRORS: [number, string, string, string][] = [
  [400, "invalid_request", "JSON illisible, champ inconnu, message vide ou trop long, plus de 40 messages, ou aucun message « user ».", "Corrigez la requête (voir « La requête »). Ne réessayez pas telle quelle."],
  [400, "missing_gemini_key", "L'en-tête X-Gemini-Key est absent.", "Ajoutez votre clé Gemini."],
  [401, "invalid_access_code", "Code d'accès absent, mal formé, faux ou supprimé.", "Vérifiez l'en-tête Authorization ou créez un nouveau code."],
  [403, "terms_not_accepted", "Vous n'avez pas encore pris l'engagement sur l'espace développeurs.", "Cochez l'engagement : l'accès s'ouvre aussitôt."],
  [403, "identity_violation", "La mission ou le contexte tente de changer le nom, le shimaoré ou la personnalité de Tamilya.", "Requête bloquée et accès suspendu : contactez BTM."],
  [403, "account_suspended", "Votre accès est suspendu (par exemple après une tentative de renommer Tamilya).", "Contactez BTM (contact@btm.yt)."],
  [401, "invalid_gemini_key", "Clé Gemini mal formée ou refusée par Google.", "Vérifiez la clé sur Google AI Studio."],
  [413, "invalid_request", "Corps de la requête au-delà de 64 Ko.", "Raccourcissez l'historique ou le contexte."],
  [429, "rate_limited", "Trop de questions pour ce code, ce compte ou cette adresse IP.", "Attendez le nombre de secondes donné par l'en-tête Retry-After."],
  [429, "gemini_quota", "Votre clé Gemini a épuisé son quota chez Google.", "Attendez, ou augmentez le quota de votre projet Google."],
  [499, "aborted", "Votre client a coupé la connexion avant la réponse.", "Laissez au moins 60 secondes à la requête."],
  [502, "provider_error", "Gemini a renvoyé une erreur ou une réponse vide.", "Réessayez après quelques secondes."],
  [502, "identity_protected", "La réponse se présentait sous un autre nom que Tamilya : elle n'est pas envoyée.", "Reformulez la question ; vérifiez votre mission."],
  [503, "unavailable", "Tamilya est momentanément arrêtée ou en maintenance.", "Réessayez plus tard."],
];

function curlExample(endpoint: string) {
  return `curl ${endpoint} \\
  -H "Authorization: Bearer $TAMILYA_CODE" \\
  -H "X-Gemini-Key: $GEMINI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "Comment on dit merci en shimaoré ?" }
    ]
  }'`;
}

function widgetExample(scriptUrl: string) {
  return `<!-- Juste avant </body>, sur chaque page où la bulle doit apparaître -->
<script src="${scriptUrl}" data-site="pub_votre_identifiant" async></script>`;
}

function widgetOptionsExample(scriptUrl: string) {
  return `<script
  src="${scriptUrl}"
  data-site="pub_votre_identifiant"
  data-color="#0e7490"
  data-position="left"
  async
></script>`;
}

function widgetCommandsExample() {
  return `<button onclick="Tamilya.ask('Comment on dit merci en shimaoré ?')">
  Demander à Tamilya
</button>

<script>
  // Aussi : Tamilya.open() et Tamilya.close()
</script>`;
}

function conversationExample() {
  return `{
  "messages": [
    { "role": "user", "content": "Comment on dit merci en shimaoré ?" },
    { "role": "assistant", "content": "Merci se dit « Marahaba » !" },
    { "role": "user", "content": "Et pour répondre « de rien » ?" }
  ],
  "context": "Application de covoiturage à Mayotte."
}`;
}

function nodeExample(endpoint: string) {
  return `// tamilya.js : à utiliser uniquement côté serveur (Node 18 ou plus).
const ENDPOINT = "${endpoint}";

export async function askTamilya(messages, context, attempt = 1) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.TAMILYA_CODE}\`,
      "X-Gemini-Key": process.env.GEMINI_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages, context }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = await response.json();
  if (response.ok) return data.reply;

  // Trop de questions : on attend ce que demande Tamilya, puis on réessaie une fois.
  if (data.error === "rate_limited" && attempt === 1) {
    const seconds = Number(response.headers.get("Retry-After") ?? 5);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return askTamilya(messages, context, attempt + 1);
  }
  throw new Error(\`Tamilya : \${response.status} \${data.error}\`);
}

// Exemple
const reply = await askTamilya(
  [{ role: "user", content: "Que voir à Mayotte en une journée ?" }],
  "Site d'une agence de voyage.",
);
console.log(reply);`;
}

function proxyExample() {
  return `// app/api/tamilya/route.js (Next.js) : votre navigateur appelle CETTE route,
// et c'est votre serveur qui appelle Tamilya. Code et clé restent secrets.
import { askTamilya } from "@/lib/tamilya";

export async function POST(request) {
  const { messages } = await request.json();
  try {
    const reply = await askTamilya(messages, "Boutique en ligne de produits de Mayotte.");
    return Response.json({ reply });
  } catch {
    return Response.json({ error: "Tamilya ne répond pas pour le moment." }, { status: 502 });
  }
}`;
}

function pythonExample(endpoint: string) {
  return `# tamilya.py : à utiliser uniquement côté serveur.
import os, time, requests

ENDPOINT = "${endpoint}"

def ask_tamilya(messages, context=None, attempt=1):
    body = {"messages": messages}
    if context:
        body["context"] = context
    response = requests.post(
        ENDPOINT,
        headers={
            "Authorization": f"Bearer {os.environ['TAMILYA_CODE']}",
            "X-Gemini-Key": os.environ["GEMINI_KEY"],
        },
        json=body,
        timeout=60,
    )
    data = response.json()
    if response.ok:
        return data["reply"]
    if data.get("error") == "rate_limited" and attempt == 1:
        time.sleep(int(response.headers.get("Retry-After", 5)))
        return ask_tamilya(messages, context, attempt + 1)
    raise RuntimeError(f"Tamilya : {response.status_code} {data.get('error')}")

history = [{"role": "user", "content": "Comment on dit merci en shimaoré ?"}]
reply = ask_tamilya(history)
history.append({"role": "assistant", "content": reply})
print(reply)`;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border pt-10 first:border-t-0 first:pt-0">
      <h2 className="text-2xl font-[650] tracking-[-0.02em]">{title}</h2>
      <div className="mt-4 flex flex-col gap-3 text-[15px] leading-relaxed text-fg-muted [&_strong]:font-semibold [&_strong]:text-fg">
        {children}
      </div>
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 text-base font-semibold text-fg">{children}</h3>;
}

function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-fg/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-fg">{children}</code>;
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="my-2 overflow-x-auto rounded-2xl border border-border bg-bg">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="border-b border-border text-xs text-fg">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border align-top">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-[color-mix(in_oklab,var(--persona,var(--accent))_35%,transparent)] bg-[color-mix(in_oklab,var(--persona,var(--accent))_8%,transparent)] px-4 py-3 text-sm text-fg">
      {children}
    </p>
  );
}

function Toc() {
  return (
    <ol className="flex flex-col gap-0.5 text-sm">
      {SECTIONS.map(([id, label], i) => (
        <li key={id}>
          <a href={`#${id}`} className="flex gap-2 rounded-lg px-2 py-1.5 text-fg-muted transition hover:bg-fg/[0.05] hover:text-fg">
            <span className="w-5 shrink-0 font-mono text-xs leading-5 opacity-60">{String(i + 1).padStart(2, "0")}</span>
            {label}
          </a>
        </li>
      ))}
    </ol>
  );
}

/** Documentation complète de l'API publique de Tamilya (POST /api/v1/tamilya). */
export default async function DocumentationPage() {
  const [endpoint, scriptUrl] = await Promise.all([apiEndpoint(), widgetScriptUrl()]);
  const keyPolicy = RATE_LIMIT_POLICIES.developerKey;
  const widgetPolicy = RATE_LIMIT_POLICIES.developerWidget;
  const visitorPolicy = RATE_LIMIT_POLICIES.developerWidgetVisitor;

  return (
    <DevShell>
      <div className="mx-auto max-w-6xl px-5 pt-12 pb-24">
        <Link href="/developpeurs" className="text-sm text-fg-muted transition hover:text-fg">
          ← Espace développeurs
        </Link>
        <p className="landing-eyebrow mt-8">Documentation</p>
        <h1 className="mt-3 text-[clamp(2rem,4.5vw,3rem)] leading-tight font-[650] tracking-[-0.035em] text-balance">
          API de Tamilya
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">
          Tout ce qu&apos;il faut pour mettre Tamilya, gratuitement, dans votre site ou votre application.
        </p>

        <div className="mt-12 grid gap-12 lg:grid-cols-[13rem_1fr]">
          <nav aria-label="Sommaire" className="lg:sticky lg:top-20 lg:self-start">
            <details className="rounded-2xl border border-border bg-bg p-3 lg:hidden">
              <summary className="cursor-pointer px-2 text-sm font-medium">Sommaire</summary>
              <div className="mt-2">
                <Toc />
              </div>
            </details>
            <div className="hidden lg:block">
              <Toc />
            </div>
          </nav>

          <article className="flex min-w-0 max-w-3xl flex-col gap-10">
            <Section id="presentation" title="Présentation">
              <p>
                <strong>Tamilya</strong> est l&apos;assistante de GROUPE BTM pour Mayotte : elle parle shimaoré, connaît l&apos;île
                et répond avec le même savoir que sur BTM AI. Vous pouvez la mettre chez vous, <strong>gratuitement</strong>, de
                deux façons :
              </p>
              <Table
                head={["", "Widget", "API"]}
                rows={[
                  ["Pour qui", "Tout site web : HTML, WordPress, Wix, Shopify…", "Applications avec un serveur, robots, applis mobiles"],
                  ["Ce qu'il faut faire", "Coller une ligne dans votre page", "Écrire l'appel dans votre code serveur"],
                  ["Qui paie", "BTM (rien à fournir)", "Votre clé Gemini (quota gratuit chez Google)"],
                  ["Apparence", "Bulle de discussion prête à l'emploi", "Vous faites votre propre affichage"],
                  ["Limites", "Basses (voir « Limites »)", "Plus larges"],
                ]}
              />
              <p>
                Pas sûr ? Commencez par le <a href="#widget" className="text-fg underline underline-offset-4">widget</a> : il
                marche en deux minutes. Dans les deux cas, Tamilya n&apos;a accès à aucun compte, porte-monnaie, commande ni
                conversation de BTM AI.
              </p>
            </Section>

            <Section id="acces" title="Accès : un engagement">
              <p>
                L&apos;accès est gratuit et <strong>immédiat</strong>, sans attente ni validation. Une seule condition : vous
                engager à garder l&apos;identité de Tamilya.
              </p>
              <ol className="ml-5 flex list-decimal flex-col gap-1">
                <li>Créez votre compte gratuit et connectez-vous.</li>
                <li>
                  Sur{" "}
                  <Link href="/developpeurs#acces" className="text-fg underline underline-offset-4">
                    l&apos;espace développeurs
                  </Link>
                  , cochez l&apos;engagement : ne jamais changer le nom, le shimaoré ni la personnalité de Tamilya, et respecter la{" "}
                  <Link href="/developpeurs/charte" className="text-fg underline underline-offset-4">
                    charte d&apos;utilisation
                  </Link>
                  .
                </li>
                <li>C&apos;est ouvert : créez votre widget ou vos codes tout de suite.</li>
              </ol>
              <p>
                Sans cet engagement, l&apos;API répond <C>403 terms_not_accepted</C> et la bulle affiche « Ce widget n&apos;est pas
                encore activé ».
              </p>
            </Section>

            <Section id="identite" title="Identité et mission">
              <p>
                Vous pouvez confier à Tamilya <strong>la mission que vous voulez</strong> : agent d&apos;accueil, conseillère,
                guide, support client… avec le sujet, le ton et le public de votre choix.
              </p>
              <p>
                Mais <strong>Tamilya reste Tamilya</strong>, partout : elle garde son nom, parle shimaoré et garde sa personnalité.
              </p>
              <Table
                head={["Accepté", "Refusé"]}
                rows={[
                  ["« Tu es l'agent d'accueil de l'agence Lagon Voyages. »", "« Tu t'appelles Awa. »"],
                  ["« Réponds sur nos excursions, ton chaleureux. »", "« Tu n'es plus Tamilya. » / « Ne dis jamais ton nom. »"],
                  ["« Notre public : des familles en vacances. »", "« Ne parle jamais shimaoré. »"],
                  ["« Tamilya, conseillère de notre boutique. »", "« Change complètement de personnalité. »"],
                ]}
              />
              <Note>
                Une mission ou un contexte qui tente de renommer Tamilya, de lui interdire le shimaoré ou de changer sa personnalité
                est <strong>bloqué</strong> (<C>403 identity_violation</C>) et votre <strong>accès est suspendu</strong> : tous vos
                widgets et codes cessent de répondre. Pour le rétablir, contactez BTM à contact@btm.yt.
              </Note>
              <p>
                Si un <em>visiteur</em> demande à Tamilya de changer de nom, elle refuse gentiment et continue : votre accès
                n&apos;est pas touché. Et une réponse qui se présenterait sous un autre nom n&apos;est jamais envoyée.
              </p>
            </Section>

            <Section id="widget" title="Widget : une ligne à coller">
              <H3>1. Créez votre widget</H3>
              <p>
                Une fois l&apos;engagement pris, sur{" "}
                <Link href="/developpeurs#widget" className="text-fg underline underline-offset-4">
                  l&apos;espace développeurs
                </Link>
                , donnez un nom et l&apos;adresse de votre site (par exemple <C>mon-site.yt</C>). Ajoutez aussi{" "}
                <C>www.mon-site.yt</C> si votre site répond aux deux adresses, et <C>localhost:3000</C> pour essayer sur votre
                ordinateur ({MAX_WIDGET_ORIGINS} adresses au plus, {MAX_WIDGETS} widgets par compte). Indiquez si vous voulez la{" "}
                <a href="#identite" className="text-fg underline underline-offset-4">
                  mission
                </a>{" "}
                de Tamilya sur votre site ; elle reste modifiable ensuite.
              </p>
              <H3>2. Collez la balise</H3>
              <p>Copiez la balise affichée sous votre widget et collez-la juste avant <C>&lt;/body&gt;</C> :</p>
              <DocCode title="index.html" lang="shell" code={widgetExample(scriptUrl)} />
              <p>
                C&apos;est tout : une bulle apparaît en bas à droite. Le visiteur clique, écrit, Tamilya répond. La conversation
                reste dans son navigateur le temps de sa visite ; rien n&apos;est enregistré chez nous.
              </p>
              <H3>Où coller la balise ?</H3>
              <Table
                head={["Votre site", "Où la coller"]}
                rows={[
                  ["HTML", <>Dans chaque page, juste avant <C key="b">&lt;/body&gt;</C></>],
                  ["WordPress", "Extension « WPCode » (ou équivalent) → Pied de page, ou dans footer.php de votre thème"],
                  ["Wix", "Paramètres → Code personnalisé → Ajouter, « Corps – fin », toutes les pages"],
                  ["Shopify", <>Thème → Modifier le code → theme.liquid, avant <C key="b">&lt;/body&gt;</C></>],
                  ["React, Next.js, Vue…", <>Dans le gabarit HTML principal, ou avec le composant Script de votre framework</>],
                ]}
              />
              <H3>Options</H3>
              <p>Toutes facultatives, en attributs de la balise :</p>
              <Table
                head={["Attribut", "Effet", "Par défaut"]}
                rows={[
                  [<C key="s">data-site</C>, "Identifiant de votre widget (obligatoire)", "—"],
                  [<C key="c">data-color</C>, "Couleur de la bulle et des boutons (ex. #0e7490)", "Rose BTM"],
                  [<C key="p">data-position</C>, "right ou left", "right"],
                  [<C key="o">data-open</C>, "true : fenêtre ouverte dès le chargement", "fermée"],
                ]}
              />
              <DocCode title="index.html" lang="shell" code={widgetOptionsExample(scriptUrl)} />
              <p>
                Le nom, le message d&apos;accueil et la mission ne se règlent pas dans la balise : la bulle s&apos;appelle toujours
                Tamilya, et la mission se règle sur l&apos;espace développeurs, où elle est vérifiée.
              </p>
              <H3>Commandes JavaScript</H3>
              <p>Pour ouvrir la bulle depuis vos propres boutons :</p>
              <DocCode title="index.html" lang="shell" code={widgetCommandsExample()} />
              <H3>Ça ne s&apos;affiche pas ?</H3>
              <ul className="ml-5 flex list-disc flex-col gap-1">
                <li>
                  « Ce site n&apos;est pas autorisé » : l&apos;adresse exacte de la page (avec ou sans www, http ou https) doit
                  figurer dans votre widget.
                </li>
                <li>Pas de bulle du tout : ouvrez la console du navigateur (F12), un message « [Tamilya] » explique le problème.</li>
                <li>
                  « Beaucoup de questions d&apos;un coup » : une limite est atteinte (voir « Limites ») ; pour plus, passez à
                  l&apos;API avec votre clé Gemini.
                </li>
              </ul>
            </Section>

            <Section id="demarrage" title="API : démarrage rapide">
              <p>
                L&apos;API s&apos;appelle <strong>depuis votre serveur</strong> : vous envoyez une conversation en JSON, Tamilya
                renvoie sa réponse en texte. Les réponses sont produites avec <strong>votre propre clé Gemini</strong> (gratuite
                chez Google, avec son propre quota).
              </p>
              <Table
                head={["", ""]}
                rows={[
                  ["Adresse", <C key="e">POST {endpoint}</C>],
                  ["Format", "JSON en entrée et en sortie (UTF-8)"],
                  ["Authentification", "Code d'accès Tamilya + clé Gemini, dans les en-têtes"],
                  ["Mémoire", "Aucune : vous renvoyez l'historique à chaque question"],
                ]}
              />
              <ol className="ml-5 flex list-decimal flex-col gap-2">
                <li>
                  Une fois l&apos;<a href="#acces" className="text-fg underline underline-offset-4">engagement pris</a>, créez un{" "}
                  <strong>code d&apos;accès</strong> sur{" "}
                  <Link href="/developpeurs#code" className="text-fg underline underline-offset-4">
                    l&apos;espace développeurs
                  </Link>
                  . Copiez-le : il n&apos;est montré qu&apos;une fois.
                </li>
                <li>
                  Créez une <strong>clé Gemini</strong> sur{" "}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-fg underline underline-offset-4">
                    Google AI Studio
                  </a>
                  .
                </li>
                <li>Rangez les deux dans les variables d&apos;environnement de votre serveur :</li>
              </ol>
              <DocCode title=".env" lang="shell" code={`TAMILYA_CODE=tml_votre_code_ici\nGEMINI_KEY=votre_cle_gemini_ici`} />
              <p>Puis posez votre première question :</p>
              <DocCode title="terminal" lang="shell" code={curlExample(endpoint)} />
              <p>Réponse :</p>
              <DocCode title="200 OK" lang="json" code={`{\n  "reply": "Merci se dit « Marahaba » !"\n}`} />
            </Section>

            <Section id="authentification" title="Authentification">
              <p>Chaque requête porte deux secrets, dans deux en-têtes différents.</p>
              <H3>Le code d&apos;accès Tamilya</H3>
              <p>
                Il dit à Tamilya que c&apos;est vous. Format : <C>tml_</C> suivi de 32 caractères. Envoyez-le dans l&apos;en-tête{" "}
                <C>Authorization: Bearer tml_…</C>.
              </p>
              <ul className="ml-5 flex list-disc flex-col gap-1">
                <li>Un code par application : {MAX_ACTIVE_KEYS} codes actifs au plus par compte.</li>
                <li>Il n&apos;est affiché qu&apos;à sa création ; nous ne gardons que son empreinte et ne pouvons pas le retrouver.</li>
                <li>Perdu ou divulgué ? Supprimez-le sur l&apos;espace développeurs et créez-en un autre : l&apos;ancien cesse aussitôt de marcher.</li>
                <li>L&apos;espace développeurs affiche la date de dernière utilisation de chaque code.</li>
              </ul>
              <H3>La clé Gemini</H3>
              <p>
                Elle paie les réponses. Envoyez-la dans l&apos;en-tête <C>X-Gemini-Key</C>. Elle sert à la seule réponse en cours :
                elle n&apos;est <strong>ni enregistrée ni journalisée</strong>. Tamilya utilise le même modèle Gemini que sur BTM AI
                (par défaut <C>gemini-2.5-flash</C>) ; la consommation apparaît dans votre projet Google.
              </p>
            </Section>

            <Section id="requete" title="La requête">
              <DocCode title="requête" lang="shell" code={`POST /api/v1/tamilya\nAuthorization: Bearer tml_…\nX-Gemini-Key: …\nContent-Type: application/json`} />
              <H3>En-têtes</H3>
              <Table
                head={["En-tête", "Obligatoire", "Valeur"]}
                rows={[
                  [<C key="a">Authorization</C>, "Oui", <>Bearer suivi de votre code d&apos;accès</>],
                  [<C key="g">X-Gemini-Key</C>, "Oui", "Votre clé Gemini"],
                  [<C key="c">Content-Type</C>, "Conseillé", <C key="j">application/json</C>],
                ]}
              />
              <H3>Corps (JSON)</H3>
              <Table
                head={["Champ", "Type", "Règles"]}
                rows={[
                  [<C key="m">messages</C>, "tableau, obligatoire", "De 1 à 40 messages, du plus ancien au plus récent."],
                  [<C key="r">messages[].role</C>, "texte", <>« user » (la personne) ou « assistant » (une réponse de Tamilya)</>],
                  [<C key="t">messages[].content</C>, "texte", "De 1 à 4 000 caractères (espaces de début et de fin retirés)."],
                  [<C key="n">mission</C>, "texte, facultatif", "Jusqu'à 2 000 caractères. Le rôle confié à Tamilya. Voir « Mission et contexte »."],
                  [<C key="x">context</C>, "texte, facultatif", "Jusqu'à 8 000 caractères. Ce que fait votre application."],
                ]}
              />
              <p>
                Le corps entier ne doit pas dépasser <strong>64 Ko</strong>. Tout autre champ est refusé (
                <C>400 invalid_request</C>) : vérifiez l&apos;orthographe des noms.
              </p>
            </Section>

            <Section id="reponse" title="La réponse">
              <p>
                En cas de succès, code <C>200</C> et un seul champ, <C>reply</C> :
              </p>
              <DocCode title="200 OK" lang="json" code={`{\n  "reply": "Merci se dit « Marahaba » !"\n}`} />
              <ul className="ml-5 flex list-disc flex-col gap-1">
                <li>
                  <strong>Texte simple</strong>, sans titres ni tableaux : affichable tel quel. Des retours à la ligne sont possibles.
                </li>
                <li>Réponses plutôt brèves : 1 024 jetons Gemini au plus.</li>
                <li>La réponse arrive en une fois, en général en quelques secondes (40 secondes au maximum côté Gemini).</li>
                <li>
                  Les réponses ne sont jamais mises en cache (<C>Cache-Control: no-store</C>).
                </li>
              </ul>
              <p>En cas d&apos;erreur, vous recevez un autre code HTTP et un seul champ <C>error</C> :</p>
              <DocCode title="erreur" lang="json" code={`{\n  "error": "rate_limited"\n}`} />
            </Section>

            <Section id="conversation" title="Conversations">
              <p>
                L&apos;API <strong>ne garde rien</strong> d&apos;une question à l&apos;autre. Pour une vraie conversation, gardez
                l&apos;historique de votre côté et renvoyez-le à chaque fois : ajoutez la réponse reçue en <C>assistant</C>, puis
                la nouvelle question en <C>user</C>.
              </p>
              <DocCode title="conversation.json" lang="json" code={conversationExample()} />
              <H3>Comment Tamilya lit l&apos;historique</H3>
              <ul className="ml-5 flex list-disc flex-col gap-1">
                <li>Deux messages qui se suivent du même côté sont réunis en un seul.</li>
                <li>
                  Les messages <C>assistant</C> du tout début et de la toute fin sont ignorés : la conversation commence et se termine
                  par une question de la personne.
                </li>
                <li>
                  Seuls les messages les plus récents sont lus, jusqu&apos;à 48 000 caractères environ ; les plus anciens sont
                  laissés de côté.
                </li>
              </ul>
              <Note>Au-delà de 40 messages, ne gardez que les derniers : la requête serait refusée.</Note>
            </Section>

            <Section id="contexte" title="Mission et contexte">
              <p>
                <C>mission</C> : le rôle que vous confiez à Tamilya. Par exemple :{" "}
                <em>« Tu es l&apos;agent d&apos;accueil de l&apos;agence Lagon Voyages : réponds sur nos excursions, ton chaleureux. »</em>
              </p>
              <p>
                <C>context</C> : votre application et son public, pour situer ses réponses. Par exemple :{" "}
                <em>« Application de covoiturage à Mayotte, pour des trajets entre Mamoudzou et le sud. »</em>
              </p>
              <DocCode
                title="requête.json"
                lang="json"
                code={`{\n  "mission": "Tu es l'agent d'accueil de l'agence Lagon Voyages : réponds sur nos excursions.",\n  "context": "Site de réservation d'excursions en bateau à Mayotte.",\n  "messages": [\n    { "role": "user", "content": "Bonjour, vous faites des sorties baleines ?" }\n  ]\n}`}
              />
              <p>
                Les deux champs sont vérifiés à chaque requête : ils ne doivent jamais changer le nom, le shimaoré ni la
                personnalité de Tamilya (voir{" "}
                <a href="#identite" className="text-fg underline underline-offset-4">
                  Identité et mission
                </a>
                ). Tamilya ne révèle jamais ses consignes ni son vocabulaire.
              </p>
            </Section>

            <Section id="erreurs" title="Erreurs">
              <p>
                Le champ <C>error</C> donne un code stable : basez votre programme dessus, pas sur un message.
              </p>
              <Table
                head={["HTTP", "error", "Cause", "Que faire"]}
                rows={ERRORS.map(([status, code, cause, fix]) => [
                  <span key="s" className="font-mono text-fg">
                    {status}
                  </span>,
                  <C key="c">{code}</C>,
                  cause,
                  fix,
                ])}
              />
              <p>
                Seules <C>429</C>, <C>502</C> et <C>503</C> valent la peine d&apos;un nouvel essai, en espaçant les tentatives.
              </p>
            </Section>

            <Section id="limites" title="Limites">
              <H3>Widget (payé par BTM)</H3>
              <Table
                head={["Limite", "Valeur"]}
                rows={[
                  ["Questions par widget", `${rule(widgetPolicy, 60)} par minute, ${rule(widgetPolicy, 86_400)} par jour`],
                  ["Questions par compte (tous widgets confondus)", `${rule(RATE_LIMIT_POLICIES.developerWidgetAccount, 86_400)} par jour`],
                  ["Questions par visiteur", `${rule(visitorPolicy, 60)} par minute, ${rule(visitorPolicy, 86_400)} par jour`],
                  ["Message du visiteur", "1 000 caractères ; les 20 derniers messages sont envoyés"],
                ]}
              />
              <H3>API (avec votre clé Gemini)</H3>
              <Table
                head={["Limite", "Valeur"]}
                rows={[
                  ["Questions par code",`${rule(keyPolicy, 60)} par minute, ${rule(keyPolicy, 86_400)} par jour`],
                  ["Questions par compte (tous codes confondus)", `${rule(RATE_LIMIT_POLICIES.developerAccount, 86_400)} par jour`],
                  ["Questions par adresse IP", `${rule(RATE_LIMIT_POLICIES.developerIp, 60)} par minute`],
                  ["Codes actifs par compte", String(MAX_ACTIVE_KEYS)],
                  ["Codes créés par jour", rule(RATE_LIMIT_POLICIES.developerKeyCreate, 86_400)],
                  ["Taille du corps", "64 Ko"],
                  ["Messages par requête", "40"],
                  ["Caractères par message", "4 000"],
                  ["Caractères du contexte", "8 000"],
                  ["Durée d'une requête", "60 secondes au plus"],
                ]}
              />
              <p>
                Une limite atteinte renvoie <C>429 rate_limited</C> avec l&apos;en-tête <C>Retry-After</C> (en secondes). Votre clé
                Gemini a aussi ses propres limites chez Google (<C>429 gemini_quota</C>). Besoin de plus ?{" "}
                <a href="mailto:contact@btm.yt?subject=API%20de%20Tamilya" className="text-fg underline underline-offset-4">
                  Écrivez-nous
                </a>
                .
              </p>
            </Section>

            <Section id="securite" title="Sécurité">
              <Note>
                N&apos;appelez jamais l&apos;API depuis le navigateur ou une application mobile : votre code et votre clé Gemini
                seraient visibles par tous.
              </Note>
              <ul className="ml-5 flex list-disc flex-col gap-1">
                <li>Gardez code et clé dans des variables d&apos;environnement, jamais dans le code ni dans Git.</li>
                <li>Faites passer les questions de vos visiteurs par une route de votre serveur, qui appelle Tamilya.</li>
                <li>Limitez vous-même le nombre de questions par visiteur, pour qu&apos;un seul ne consomme pas tout votre quota.</li>
                <li>Code divulgué : supprimez-le aussitôt. Clé Gemini divulguée : supprimez-la dans Google AI Studio.</li>
              </ul>
              <p>Exemple de route intermédiaire avec Next.js :</p>
              <DocCode title="app/api/tamilya/route.js" lang="js" code={proxyExample()} />
            </Section>

            <Section id="exemples" title="Exemples complets">
              <H3>JavaScript (Node.js)</H3>
              <p>Avec gestion des erreurs et un nouvel essai après <C>rate_limited</C> :</p>
              <DocCode title="tamilya.js" lang="js" code={nodeExample(endpoint)} />
              <H3>Python</H3>
              <p>
                Avec la bibliothèque <C>requests</C> (<C>pip install requests</C>), et une conversation qui se poursuit :
              </p>
              <DocCode title="tamilya.py" lang="python" code={pythonExample(endpoint)} />
            </Section>

            <Section id="faq" title="Questions fréquentes">
              <H3>Est-ce vraiment gratuit ?</H3>
              <p>
                Oui. Le widget est offert par BTM, dans la limite des quotas. L&apos;API ne coûte rien non plus ; seule votre clé
                Gemini consomme, et Google offre un quota gratuit. Au-delà, c&apos;est Google qui facture votre projet.
              </p>
              <H3>L&apos;identifiant du widget (pub_…) est visible dans ma page : est-ce grave ?</H3>
              <p>
                Non, il est fait pour être public. Les navigateurs n&apos;acceptent la bulle que sur les adresses que vous avez
                déclarées, et des limites par visiteur protègent votre quota. En cas d&apos;abus, supprimez le widget et créez-en
                un autre.
              </p>
              <H3>Quelles données gardez-vous ?</H3>
              <p>
                Ni votre clé Gemini, ni les conversations (API ou widget). Nous gardons vos codes (sous forme d&apos;empreinte) et
                widgets, leurs noms, adresses autorisées, dates de création et de dernière utilisation, et des compteurs pour les
                limites. Voir{" "}
                <Link href="/confidentialite" className="text-fg underline underline-offset-4">
                  Données et confidentialité
                </Link>
                .
              </p>
              <H3>Puis-je recevoir la réponse mot à mot (streaming) ?</H3>
              <p>Pas pour le moment : la réponse arrive en une fois.</p>
              <H3>Puis-je changer le nom ou la personnalité de Tamilya ?</H3>
              <p>
                Non. Vous pouvez lui confier n&apos;importe quelle mission, mais son nom, son shimaoré et sa personnalité ne changent
                jamais. Une tentative bloque la requête et suspend votre accès ; il faut alors contacter BTM.
              </p>
              <H3>Pourquoi un engagement ?</H3>
              <p>
                Tamilya parle au nom de GROUPE BTM : partout où elle apparaît, elle doit rester elle-même. C&apos;est la seule
                condition pour qu&apos;elle reste gratuite et ouverte à tous, sans attente.
              </p>
              <H3>Ça ne marche pas : par où commencer ?</H3>
              <p>
                Regardez le champ <C>error</C> et le tableau des erreurs. Testez d&apos;abord avec l&apos;exemple curl ci-dessus :
                s&apos;il marche, le problème vient de votre code. Sinon,{" "}
                <a href="mailto:contact@btm.yt?subject=API%20de%20Tamilya" className="text-fg underline underline-offset-4">
                  écrivez-nous
                </a>{" "}
                en donnant le code HTTP, le champ error et l&apos;heure de l&apos;appel (jamais votre code ni votre clé).
              </p>
            </Section>
          </article>
        </div>
      </div>
    </DevShell>
  );
}
