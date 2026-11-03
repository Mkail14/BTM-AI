import { renderEmailHtml, renderEmailText, type EmailContent, type EmailDetail } from "./layout";

/**
 * Les e-mails de BTM AI. Ton : celui d'une équipe qui écrit à quelqu'un,
 * pas d'un robot. Vouvoiement, phrases courtes, aucune formule toute faite.
 */

export type RenderedEmail = { subject: string; html: string; text: string };

/** Ce qu'on sait de l'appareil et du moment, pour les e-mails de sécurité. */
export type EmailContext = {
  origin: string;
  /** « Chrome sur Android », « Safari sur iPhone »… */
  device?: string;
  /** « Mamoudzou, France » : approximatif, d'après l'adresse IP. */
  place?: string;
  /** Moment de l'événement (affiché à l'heure de Mayotte). */
  at?: Date;
};

const when = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Indian/Mayotte",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/** « lundi 2 novembre à 14:05 » */
export function formatWhen(date: Date) {
  return when.format(date).replace(/ (\d{2}:\d{2})$/, " à $1").replace(/,? à à/, " à");
}

function contextDetails(ctx: EmailContext): EmailDetail[] {
  return [
    { label: "Quand", value: `${formatWhen(ctx.at ?? new Date())} (heure de Mayotte)` },
    ...(ctx.device ? [{ label: "Appareil", value: ctx.device }] : []),
    ...(ctx.place ? [{ label: "Lieu approximatif", value: ctx.place }] : []),
  ];
}

const render = (subject: string, content: EmailContent, origin: string): RenderedEmail => ({
  subject,
  html: renderEmailHtml(content, origin),
  text: renderEmailText(content),
});

const resetUrl = (origin: string) => `${origin}/auth/mot-de-passe-oublie`;

/** 1. Inscription : bienvenue et confirmation de l'adresse. */
export function welcomeEmail(confirmUrl: string, ctx: EmailContext) {
  return render(
    "Bienvenue sur BTM AI, plus qu'un clic",
    {
      preheader: "Confirmez votre adresse et Tamilya est à vous.",
      eyebrow: "Bienvenue",
      title: "Ravis de vous compter parmi nous",
      paragraphs: [
        "Bonjour,",
        "Merci d'avoir créé votre compte BTM AI. Il ne reste qu'une petite chose à faire : confirmer que cette adresse est bien la vôtre.",
      ],
      button: { label: "Confirmer mon adresse", url: confirmUrl },
      after: [
        "Ensuite, Tamilya vous attend. Démarches, vie quotidienne à Mayotte, une lettre à écrire ou une idée à creuser : posez-lui vos questions, en français ou en shimaoré. Vos conversations restent enregistrées et vous les retrouvez sur tous vos appareils.",
        "Pour votre sécurité, ce lien ne sert qu'une fois et expire au bout de quelque temps. Vous n'avez pas créé de compte ? Ignorez ce message, rien ne sera activé.",
      ],
      reason: "Vous recevez cet e-mail parce qu'un compte BTM AI vient d'être créé avec cette adresse.",
    },
    ctx.origin,
  );
}

/** 2. Mot de passe oublié : lien pour en choisir un nouveau. */
export function passwordResetEmail(resetLink: string, email: string, ctx: EmailContext) {
  return render(
    "Votre lien pour choisir un nouveau mot de passe",
    {
      preheader: "Un clic, un nouveau mot de passe, et vous revoilà.",
      eyebrow: "Mot de passe oublié",
      title: "Ça arrive à tout le monde",
      paragraphs: [
        "Bonjour,",
        `Vous avez demandé à changer le mot de passe du compte **${email}**. Pas d'inquiétude : choisissez-en un nouveau en cliquant ci-dessous.`,
      ],
      button: { label: "Choisir un nouveau mot de passe", url: resetLink },
      after: [
        "Ce lien ne fonctionne qu'une seule fois et pour une durée limitée.",
        "Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement ce message : votre mot de passe actuel reste valable et personne ne peut le changer sans ce lien.",
      ],
      reason: "Vous recevez cet e-mail parce qu'une réinitialisation de mot de passe a été demandée pour votre compte BTM AI.",
    },
    ctx.origin,
  );
}

/** 3. Nouveau mot de passe créé (après « mot de passe oublié »). */
export function passwordCreatedEmail(email: string, ctx: EmailContext) {
  return render(
    "Votre nouveau mot de passe est en place",
    {
      preheader: "C'est réglé : vous pouvez vous reconnecter.",
      eyebrow: "Sécurité du compte",
      title: "C'est réglé, vous revoilà",
      paragraphs: [
        "Bonjour,",
        `Le nouveau mot de passe du compte **${email}** est bien enregistré. Il remplace l'ancien sur tous vos appareils, dès maintenant.`,
      ],
      details: contextDetails(ctx),
      button: { label: "Retrouver Tamilya", url: ctx.origin },
      alert: {
        title: "Ce n'était pas vous ?",
        text: "Quelqu'un a peut-être accès à votre boîte mail. Changez son mot de passe, puis écrivez-nous à **contact@btm.yt** : nous sécuriserons votre compte avec vous.",
      },
      reason: "Vous recevez cet e-mail parce que le mot de passe de votre compte BTM AI vient d'être réinitialisé.",
    },
    ctx.origin,
  );
}

/** 4. Mot de passe modifié (depuis les Paramètres, en étant connecté). */
export function passwordChangedEmail(email: string, ctx: EmailContext) {
  return render(
    "Le mot de passe de votre compte a été modifié",
    {
      preheader: "Si c'est vous, tout est en ordre.",
      eyebrow: "Sécurité du compte",
      title: "Votre mot de passe a changé",
      paragraphs: [
        "Bonjour,",
        `Le mot de passe du compte **${email}** vient d'être modifié. Voici ce que nous savons de ce changement :`,
      ],
      details: contextDetails(ctx),
      after: ["Si c'est vous, tout est en ordre : vous n'avez rien à faire."],
      alert: {
        title: "Vous ne reconnaissez pas ce changement ?",
        text: "Reprenez la main tout de suite en réinitialisant votre mot de passe, puis prévenez-nous à **contact@btm.yt**.",
        link: { label: "Réinitialiser mon mot de passe", url: resetUrl(ctx.origin) },
      },
      reason: "Vous recevez cet e-mail parce que le mot de passe de votre compte BTM AI a été modifié.",
    },
    ctx.origin,
  );
}

/** 5. Connexion depuis un appareil inconnu. */
export function newDeviceEmail(email: string, ctx: EmailContext) {
  return render(
    "Nouvelle connexion à votre compte BTM AI",
    {
      preheader: ctx.device ? `Connexion depuis ${ctx.device}. C'est bien vous ?` : "Une connexion depuis un nouvel appareil. C'est bien vous ?",
      eyebrow: "Sécurité du compte",
      title: "C'est bien vous ?",
      paragraphs: [
        "Bonjour,",
        `Quelqu'un vient de se connecter au compte **${email}** depuis un appareil que nous ne connaissions pas encore. Un nouveau téléphone, un autre navigateur ? Voici les détails :`,
      ],
      details: contextDetails(ctx),
      after: ["C'est vous ? Parfait, il n'y a rien à faire. Nous retiendrons cet appareil."],
      alert: {
        title: "Ce n'est pas vous ?",
        text: "Changez votre mot de passe sans attendre : la personne sera déconnectée. Si quelque chose vous paraît anormal, écrivez-nous à **contact@btm.yt**.",
        link: { label: "Changer mon mot de passe", url: resetUrl(ctx.origin) },
      },
      reason: "Vous recevez cet e-mail pour protéger votre compte BTM AI à chaque connexion depuis un nouvel appareil.",
    },
    ctx.origin,
  );
}

/** Autres e-mails de Supabase (lien de connexion, changement d'adresse, code) : même habillage. */
export function genericLinkEmail(kind: "magiclink" | "email_change" | "invite", link: string, ctx: EmailContext) {
  const copy = {
    magiclink: {
      subject: "Votre lien de connexion à BTM AI",
      title: "Votre lien de connexion",
      text: "Cliquez ci-dessous pour vous connecter à BTM AI, sans mot de passe.",
      label: "Me connecter",
    },
    email_change: {
      subject: "Confirmez votre nouvelle adresse e-mail",
      title: "Confirmez votre nouvelle adresse",
      text: "Vous avez demandé à changer l'adresse e-mail de votre compte BTM AI. Confirmez ce changement en cliquant ci-dessous.",
      label: "Confirmer l'adresse",
    },
    invite: {
      subject: "Vous êtes invité sur BTM AI",
      title: "Une place vous attend",
      text: "Vous êtes invité à rejoindre BTM AI, l'assistante de GROUPE BTM pour Mayotte. Acceptez l'invitation pour créer votre compte.",
      label: "Accepter l'invitation",
    },
  }[kind];
  return render(
    copy.subject,
    {
      preheader: copy.text,
      eyebrow: "BTM AI",
      title: copy.title,
      paragraphs: ["Bonjour,", copy.text],
      button: { label: copy.label, url: link },
      after: ["Ce lien ne sert qu'une fois et expire au bout de quelque temps. Vous n'avez rien demandé ? Ignorez ce message."],
      reason: "Vous recevez cet e-mail suite à une demande faite sur BTM AI avec cette adresse.",
    },
    ctx.origin,
  );
}

/** Code à usage unique (réauthentification). */
export function codeEmail(code: string, ctx: EmailContext) {
  return render(
    `Votre code BTM AI : ${code}`,
    {
      preheader: `Votre code : ${code}`,
      eyebrow: "Code de vérification",
      title: code,
      paragraphs: ["Bonjour,", "Voici votre code de vérification. Saisissez-le dans BTM AI pour continuer."],
      after: ["Il n'est valable que quelques minutes. Ne le communiquez à personne, pas même à quelqu'un qui dirait travailler pour BTM."],
      reason: "Vous recevez cet e-mail parce qu'un code de vérification a été demandé pour votre compte BTM AI.",
    },
    ctx.origin,
  );
}
