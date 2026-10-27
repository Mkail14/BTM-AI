/**
 * Règles de l'inscription, partagées entre le formulaire et les tests.
 * Supabase applique ses propres règles côté serveur : configurez-les à
 * l'identique (Authentication → Policies → Password, voir README).
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_DISPLAY_NAME_LENGTH = 60;

export type PasswordCheck = { id: string; label: string; ok: boolean };

export function passwordChecks(password: string, email = ""): PasswordCheck[] {
  const localPart = email.split("@")[0]?.trim().toLowerCase() ?? "";
  return [
    {
      id: "length",
      label: `${MIN_PASSWORD_LENGTH} caractères minimum`,
      ok: password.length >= MIN_PASSWORD_LENGTH,
    },
    { id: "letter", label: "Au moins une lettre", ok: /\p{L}/u.test(password) },
    { id: "digit", label: "Au moins un chiffre", ok: /\d/.test(password) },
    {
      id: "email",
      label: "Différent de votre adresse e-mail",
      ok: password.length > 0 && !(localPart.length >= 3 && password.toLowerCase().includes(localPart)),
    },
  ];
}

export function isPasswordValid(password: string, email = ""): boolean {
  return passwordChecks(password, email).every((check) => check.ok);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeDisplayName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
}

/** Fournisseurs de messagerie les plus courants (métropole, Mayotte, international). */
const COMMON_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "outlook.fr",
  "live.fr",
  "live.com",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "gmx.fr",
];

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/**
 * Propose une correction quand le domaine ressemble fortement à un
 * fournisseur courant (« gmial.com » → « gmail.com »). Renvoie null sinon.
 */
export function suggestEmailCorrection(email: string): string | null {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 1) return null;
  const domain = normalized.slice(at + 1);
  if (!domain || COMMON_DOMAINS.includes(domain)) return null;

  // Les domaines courts (souvent ceux d'entreprises, ex. « bt.fr ») ne
  // tolèrent qu'une seule faute, pour éviter les fausses suggestions.
  const maxDistance = domain.length >= 9 ? 2 : 1;
  let best: { domain: string; distance: number } | null = null;
  for (const candidate of COMMON_DOMAINS) {
    const distance = editDistance(domain, candidate);
    if (distance > 0 && distance <= maxDistance && (!best || distance < best.distance)) {
      best = { domain: candidate, distance };
    }
  }
  return best ? `${normalized.slice(0, at)}@${best.domain}` : null;
}
