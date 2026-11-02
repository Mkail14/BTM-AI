import {
  newDeviceEmail,
  passwordChangedEmail,
  passwordCreatedEmail,
  passwordResetEmail,
  welcomeEmail,
  type RenderedEmail,
} from "./templates";

/** Les cinq e-mails, remplis avec des exemples, pour l'aperçu de l'administration. */
export const EMAIL_SAMPLES = [
  { id: "bienvenue", label: "Bienvenue", when: "À l'inscription : confirmer l'adresse" },
  { id: "oubli", label: "Mot de passe oublié", when: "Demande de réinitialisation" },
  { id: "cree", label: "Nouveau mot de passe créé", when: "Après une réinitialisation" },
  { id: "modifie", label: "Mot de passe modifié", when: "Changé depuis les Paramètres" },
  { id: "appareil", label: "Nouvel appareil", when: "Connexion depuis un appareil inconnu" },
] as const;

export type EmailSampleId = (typeof EMAIL_SAMPLES)[number]["id"];

export const isEmailSampleId = (value: unknown): value is EmailSampleId =>
  EMAIL_SAMPLES.some((s) => s.id === value);

export function renderSample(id: EmailSampleId, origin: string, email: string): RenderedEmail {
  const ctx = { origin, device: "Safari sur iPhone", place: "Mamoudzou, Mayotte", at: new Date() };
  const link = `${origin}/auth/callback?exemple=1`;
  switch (id) {
    case "bienvenue":
      return welcomeEmail(link, ctx);
    case "oubli":
      return passwordResetEmail(link, email, ctx);
    case "cree":
      return passwordCreatedEmail(email, ctx);
    case "modifie":
      return passwordChangedEmail(email, ctx);
    case "appareil":
      return newDeviceEmail(email, ctx);
  }
}
