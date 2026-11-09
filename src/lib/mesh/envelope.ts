import { z } from "zod";

/** Enveloppes de Tamilya Connect (format partagé avec l'app Android). */

const base64 = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9+/]+={0,2}$/);

export const MESH_MAX_AGE_MS = 24 * 3_600_000;
/** Horloge du téléphone en avance : toléré jusqu'à 5 minutes. */
export const MESH_MAX_SKEW_MS = 5 * 60_000;
export const MESH_MAX_HOPS = 5;
export const MESH_MAX_BODY_BYTES = 16 * 1024;
export const MESH_MAX_TEXT = 1000;

export const requestEnvelopeSchema = z.strictObject({
  v: z.literal(1),
  type: z.literal("request"),
  id: z.uuid(),
  deviceId: z.uuid(),
  createdAt: z.number().int().positive(),
  hops: z.number().int().min(0).max(MESH_MAX_HOPS),
  keyId: z.string().regex(/^[0-9a-f]{16}$/),
  epk: base64(200),
  nonce: base64(24),
  ct: base64(12_000),
  sig: base64(200),
});
export type RequestEnvelope = z.infer<typeof requestEnvelopeSchema>;

const replyKey = base64(64);

/** Tickets choisis dans le tableau de barge de l'app (le prix est toujours recalculé par le serveur). */
const meshCart = z
  .array(z.strictObject({ ticketId: z.string().regex(/^[a-z0-9-]{1,20}$/), quantity: z.number().int().min(0).max(20) }))
  .min(1)
  .max(12);

export const payloadSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("chat"), text: z.string().trim().min(1).max(MESH_MAX_TEXT), conversationId: z.uuid().optional(), replyKey }),
  z.strictObject({
    kind: z.literal("action"),
    actionId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    pin: z.string().regex(/^\d{4}$/).optional(),
    cart: meshCart.optional(),
    replyKey,
  }),
  // SOS : position et batterie du téléphone au moment de l’envoi (chacune peut manquer).
  z.strictObject({
    kind: z.literal("sos"),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    accuracy: z.number().min(0).max(100_000).optional(),
    battery: z.number().int().min(0).max(100).optional(),
    at: z.number().int().positive().optional(),
    replyKey,
  }),
]);
export type MeshPayload = z.infer<typeof payloadSchema>;

export type MeshCartLine = { ticketId: string; quantity: number };

/**
 * Choix affiché sous la réponse. table « barge » : l'app dessine son tableau de tickets
 * (rangé dans l'APK, sans internet), rempli avec cart. Une ancienne app montre le bouton label.
 */
export type MeshAction = { id: string; label: string; pay: boolean; table?: "barge"; cart?: MeshCartLine[] };
export type MeshReplyBody = { status: "ok" | "error"; text: string; conversationId?: string; actions: MeshAction[] };
export type ReplyEnvelope = { v: 1; type: "reply"; id: string; nonce: string; ct: string };

/** Trop vieille, ou datée dans le futur. */
export function isStale(createdAt: number, now = Date.now()): boolean {
  return createdAt < now - MESH_MAX_AGE_MS || createdAt > now + MESH_MAX_SKEW_MS;
}
