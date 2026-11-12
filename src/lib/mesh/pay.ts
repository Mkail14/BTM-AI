import { BARGE_ROUTE } from "@/lib/barge/catalog";
import { formatEuros } from "@/lib/wallet/limits";
import type { MeshTicket } from "./envelope";

/**
 * Tamilya Connect : un choix touché (billet, repas), dans un ordre sûr.
 *
 * 1. tout ce qui peut refuser d'avance (jour passé, plat disparu, adresse
 *    manquante) : le choix reste utilisable ;
 * 2. le code de paiement, puis la limite d'abus ;
 * 3. le choix marqué « utilisé » (spendAction, une seule fois même en
 *    parallèle), en DERNIER, juste avant la réponse : deux messages simultanés
 *    avec le même choix passent les étapes 1 et 2, mais un seul gagne l'étape 3.
 *    Rien ne peut plus échouer après : pas besoin de rendre le choix.
 *
 * Aucun débit n'est fait ici (démonstration) : la réponse le dit franchement.
 */

export type ActionKind = "barge" | "food";

export type PreparedAction =
  | { ok: false; text: string }
  | { ok: true; kind: ActionKind; text: (code: string) => string; tickets?: (code: string) => MeshTicket[] };

export type SettleSteps = {
  prepare: () => Promise<PreparedAction>;
  checkPin: () => Promise<string | null>;
  allow: (kind: ActionKind) => Promise<boolean>;
  spend: () => Promise<boolean>;
  code: () => string;
};

export const ALREADY_USED = "Ce choix a déjà été utilisé.";
const LIMITED: Record<ActionKind, string> = {
  barge: "Trop d'achats d'un coup : réessaie dans une heure.",
  food: "Trop de commandes d'un coup : réessaie dans une heure.",
};

export async function settleAction(steps: SettleSteps): Promise<{ ok: boolean; text: string; tickets?: MeshTicket[] }> {
  const prepared = await steps.prepare();
  if (!prepared.ok) return { ok: false, text: prepared.text };
  const pinProblem = await steps.checkPin();
  if (pinProblem) return { ok: false, text: pinProblem };
  if (!(await steps.allow(prepared.kind))) return { ok: false, text: LIMITED[prepared.kind] };
  if (!(await steps.spend())) return { ok: false, text: ALREADY_USED };
  const code = steps.code();
  const tickets = prepared.tickets?.(code);
  return tickets?.length ? { ok: true, text: prepared.text(code), tickets } : { ok: true, text: prepared.text(code) };
}

/** Billet de démonstration : rien n'est débité, aucun vrai billet n'est émis. */
export function bargeDemoText(o: { what: string; totalCents: number; code: string }): string {
  return `Billet de démonstration enregistré : rien n'est payé et aucun vrai billet n'est émis. ${o.what}, ${BARGE_ROUTE.from} → ${BARGE_ROUTE.to}, ${formatEuros(o.totalCents)}, sans date : valable jusqu'au scan. Code de démonstration : ${o.code}.`;
}

/**
 * Confirmations recopiées par Tamilya depuis la conversation (« Billet de démonstration
 * enregistré… Code… ») : seul le paiement avec le code les écrit, on les retire de sa réponse,
 * ainsi que les lignes « • choix » ajoutées par le serveur et reprises telles quelles.
 */
const FAKE_RECEIPT = /d[ée]monstration enregistr|code de d[ée]monstration|rien n'est pay[ée]|aucun vrai billet|aucun restaurant ne la re[çc]oit|valable jusqu'au scan|\bBTM-[A-Z0-9]{4}/i;

export function dropFakeReceipts(text: string): string {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((part) => !FAKE_RECEIPT.test(part) && !/^\s*•/.test(part))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Commande de démonstration : rien n'est débité, aucun restaurant ne la reçoit. */
export function foodDemoText(o: { item: string; restaurant: string; totalCents: number; line: string; commune: string; code: string }): string {
  return `Commande de démonstration enregistrée : rien n'est payé et aucun restaurant ne la reçoit. ${o.item} chez ${o.restaurant}, ${formatEuros(o.totalCents)}, pour ${o.line}, ${o.commune}. Code de démonstration : ${o.code}.`;
}
