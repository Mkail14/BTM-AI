/** « mi•••@gmail.com » : l'adresse n'apparaît en entier qu'à la demande (écran partagé, regard indiscret). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, Math.min(2, local.length))}•••@${domain}`;
}
