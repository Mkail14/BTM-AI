/**
 * Adresses e-mail jetables (boîtes temporaires qui disparaissent après
 * quelques minutes) : refusées à l'inscription, à la réservation et au
 * changement d'adresse. La même liste est copiée dans la base
 * (supabase/migrations/20261112000000_address_contact_security.sql), qui
 * refuse elle-même la création du compte : un test vérifie que les deux
 * listes restent identiques.
 *
 * Pour en bloquer une nouvelle : ajoutez-la ici ET dans une nouvelle migration
 * (insert into private.blocked_email_domains).
 */
export const DISPOSABLE_EMAIL_DOMAINS = [
  "0-mail.com",
  "10minutemail.com",
  "10minutemail.net",
  "10minutemail.co.uk",
  "20minutemail.com",
  "33mail.com",
  "anonbox.net",
  "anonaddy.me",
  "burnermail.io",
  "byom.de",
  "chacuo.net",
  "crazymailing.com",
  "cuvox.de",
  "dayrep.com",
  "deadaddress.com",
  "discard.email",
  "discardmail.com",
  "disposableemailaddresses.com",
  "dispostable.com",
  "dropmail.me",
  "einrot.com",
  "email-fake.com",
  "emailfake.com",
  "emailondeck.com",
  "emailtemporanea.com",
  "emailtemporanea.net",
  "fakeinbox.com",
  "fakemail.net",
  "fakemailgenerator.com",
  "fleckens.hu",
  "getairmail.com",
  "getnada.com",
  "gishpuppy.com",
  "guerrillamail.biz",
  "guerrillamail.com",
  "guerrillamail.de",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "gustr.com",
  "harakirimail.com",
  "inboxbear.com",
  "inboxkitten.com",
  "incognitomail.org",
  "jetable.com",
  "jetable.fr.nf",
  "jetable.net",
  "jetable.org",
  "jourrapide.com",
  "kasmail.com",
  "linshiyouxiang.net",
  "mail-temp.com",
  "mail.tm",
  "mail1a.de",
  "mail7.io",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailinator.net",
  "mailinator2.com",
  "mailnesia.com",
  "mailnull.com",
  "mailpoof.com",
  "mailsac.com",
  "meltmail.com",
  "minutemail.com",
  "moakt.com",
  "mohmal.com",
  "mintemail.com",
  "monemail.fr.nf",
  "mvrht.com",
  "mytemp.email",
  "nada.email",
  "nospam.ze.tc",
  "nwytg.net",
  "one-time.email",
  "owlymail.com",
  "rhyta.com",
  "sharklasers.com",
  "spam4.me",
  "spambox.us",
  "spamgourmet.com",
  "spamex.com",
  "speed.1s.fr",
  "superrito.com",
  "teleworm.us",
  "temp-mail.io",
  "temp-mail.org",
  "temp-mail.ru",
  "tempail.com",
  "tempemail.net",
  "tempinbox.com",
  "tempmail.com",
  "tempmail.dev",
  "tempmail.net",
  "tempmail.plus",
  "tempmailo.com",
  "tempmailaddress.com",
  "tempr.email",
  "throwawaymail.com",
  "tmail.ws",
  "tmailor.com",
  "tmpmail.net",
  "tmpmail.org",
  "trash-mail.com",
  "trashmail.com",
  "trashmail.de",
  "trashmail.fr",
  "trashmail.io",
  "trashmail.me",
  "trashmail.net",
  "trbvm.com",
  "vomoto.com",
  "wegwerfmail.de",
  "wegwerfmail.net",
  "wegwerfmail.org",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "cool.fr.nf",
  "courriel.fr.nf",
  "moncourrier.fr.nf",
  "zetmail.com",
] as const;

const BLOCKED = new Set<string>(DISPOSABLE_EMAIL_DOMAINS);

/** Domaine de l'adresse, en minuscules (« Ali@YopMail.com » → « yopmail.com »). */
export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@").pop() ?? "";
}

/** Adresse jetable ? Les sous-domaines comptent aussi (« x.mailinator.com »). */
export function isDisposableEmail(email: string): boolean {
  const parts = emailDomain(email).split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (BLOCKED.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

export const DISPOSABLE_EMAIL_MESSAGE =
  "Les adresses e-mail temporaires ne sont pas acceptées : utilise ton adresse habituelle (Gmail, Outlook, Orange…).";
