import "server-only";

/**
 * Réservation automatique de l'examen du code avec La Poste — EN ATTENTE DU
 * PARTENARIAT. Rien ici n'est encore branché : sans partenariat, une demande
 * est une réservation d'essai (simulation), aucune vraie place n'est prise.
 *
 * Quand La Poste aura donné son accès partenaire :
 *   1. LAPOSTE_PARTNER_KEY (et l'adresse de leur API) sur le serveur ;
 *   2. écrire reserveSeat() et fetchConvocation() avec leur API, appeler
 *      processBooking() depuis la route des demandes, puis passer
 *      PARTNER_IMPLEMENTED à true (la clé seule ne branche rien) ;
 *   3. appliquer la migration 20261115000000_code_exam_processing.sql ;
 *   4. processBooking() fait alors tout, dans cet ordre : place réservée chez
 *      La Poste → portefeuille débité → convocation envoyée au candidat.
 *      Si le débit échoue, la place est relâchée ; si la convocation échoue,
 *      la demande reste « réservée » et l'envoi est à retenter (la page
 *      d'administration du code a été retirée : à refaire avec le partenariat).
 */

/** Prix de l'examen du code facturé par La Poste (30 € TTC), débité du portefeuille. */
export const CODE_EXAM_FEE_CENTS = 3_000;

/**
 * Le code du partenariat est-il écrit ? Faux tant que reserveSeat(),
 * chargeCandidate() et sendConvocation() renvoient une erreur, que la
 * migration 20261115000000_code_exam_processing.sql n'est pas appliquée et
 * que la route des demandes n'appelle pas processBooking(). Sans ce verrou,
 * poser LAPOSTE_PARTNER_KEY suffirait à prendre des demandes « en attente »
 * que personne ne traite, et à afficher les anciennes simulations comme des
 * places confirmées (cloche, dossier de Tamilya). À passer à true seulement
 * quand ces trois étapes marchent avec l'API La Poste.
 */
export const PARTNER_IMPLEMENTED: boolean = false;

/** Le partenariat est-il branché ? (code écrit ET clé d'accès La Poste présente sur le serveur). */
export function codeExamPartnerReady(env: Record<string, string | undefined> = process.env, implemented = PARTNER_IMPLEMENTED): boolean {
  return implemented && Boolean(env.LAPOSTE_PARTNER_KEY?.trim());
}

export type CodeExamRequestRow = {
  id: string;
  user_id: string;
  center_id: string;
  center_name: string;
  starts_at: string;
  exam_type: string;
  civility: string;
  last_name: string;
  first_name: string;
  birth_date: string;
  city: string;
  phone: string;
  email: string;
  neph: string;
  snu: boolean;
  status: "pending" | "booked" | "cancelled";
  created_at: string;
  /** Colonnes de la migration 20261115000000 (absentes tant qu'elle n'est pas appliquée). */
  paid_at?: string | null;
  convocation_sent_at?: string | null;
  laposte_reference?: string | null;
};

export type StepResult = { ok: true; reference?: string } | { ok: false; reason: string };

const NOT_READY: StepResult = { ok: false, reason: "Partenariat La Poste pas encore branché : à traiter à la main." };

/** Étape 1 — réserver la place chez La Poste. À écrire avec leur API partenaire. */
export async function reserveSeat(request: CodeExamRequestRow): Promise<StepResult> {
  if (!codeExamPartnerReady()) return NOT_READY;
  void request;
  return { ok: false, reason: "reserveSeat() n'est pas encore écrite (API La Poste)." };
}

/**
 * Étape 2 — débiter le portefeuille du candidat (CODE_EXAM_FEE_CENTS), avec
 * spendFromWallet (src/lib/wallet) : rien n'est débité si le solde ne suffit pas.
 */
export async function chargeCandidate(request: CodeExamRequestRow): Promise<StepResult> {
  if (!codeExamPartnerReady()) return NOT_READY;
  void request;
  return { ok: false, reason: "chargeCandidate() sera activée avec le partenariat." };
}

/**
 * Étape 3 — envoyer la convocation La Poste au candidat : par e-mail (boîte
 * contact@btm.yt) et dans son compte, avec le PDF fourni par La Poste.
 */
export async function sendConvocation(request: CodeExamRequestRow): Promise<StepResult> {
  if (!codeExamPartnerReady()) return NOT_READY;
  void request;
  return { ok: false, reason: "sendConvocation() n'est pas encore écrite (convocation La Poste)." };
}

/** Les trois étapes, dans l'ordre ; s'arrête à la première qui échoue. */
export async function processBooking(request: CodeExamRequestRow): Promise<{ step: "seat" | "charge" | "convocation" | "done"; result: StepResult }> {
  const seat = await reserveSeat(request);
  if (!seat.ok) return { step: "seat", result: seat };
  const charge = await chargeCandidate(request);
  if (!charge.ok) return { step: "charge", result: charge };
  const convocation = await sendConvocation(request);
  if (!convocation.ok) return { step: "convocation", result: convocation };
  return { step: "done", result: { ok: true, reference: seat.reference } };
}
