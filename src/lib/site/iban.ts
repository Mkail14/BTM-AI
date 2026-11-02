/** IBAN et BIC : nettoyage, contrôle (clé IBAN modulo 97) et affichage par blocs de 4. */

export const normalizeIban = (value: string) => value.replace(/[\s-]+/g, "").toUpperCase();

export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  // Les 4 premiers caractères passent à la fin, les lettres deviennent des nombres (A = 10…).
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
}

export const formatIban = (value: string) => normalizeIban(value).replace(/(.{4})(?=.)/g, "$1 ");

export const normalizeBic = (value: string) => value.replace(/\s+/g, "").toUpperCase();

export const isValidBic = (value: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(normalizeBic(value));
