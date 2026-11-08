import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSystemPrompt, getAIProvider } from "@/lib/ai";
import { knowledgeFor, lexiconFor, loadAwaBrain, wordsFor } from "@/lib/ai/brain";
import { getMemoriesFor } from "@/lib/ai/memory-store";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { loadPersonalityInstructions } from "@/lib/ai/personality-store";
import { hasAdminRole, hasPrincipalAdminRole } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { canBuyBargeTickets } from "@/lib/barge/access";
import { bargeDays, describeBargeLines, priceBargeOrder } from "@/lib/barge/catalog";
import { quickTitle } from "@/lib/chat/title";
import { getSiteFlags } from "@/lib/site/flags";
import { meshClosure } from "./closure";
import type { ChatTurn } from "@/lib/chat/types";
import { createConversation, getRecentMessages, insertMessage, markConnectConversation } from "@/lib/conversations/repository";
import { canOrderFood } from "@/lib/food/access";
import { FOOD_ZONES, priceOrder } from "@/lib/food/catalog";
import { orderCode } from "@/lib/food/order-code";
import { getProfileContact } from "@/lib/profile-contact";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { usesDemoWallet } from "@/lib/wallet/demo";
import { describePinWait, verifyPin } from "@/lib/wallet/pin";
import type { MeshAction, MeshPayload, MeshReplyBody } from "./envelope";
import { bargeOffer, foodOffers, type Offer } from "./offers";
import { ALREADY_USED, bargeDemoText, foodDemoText, settleAction, type PreparedAction } from "./pay";
import { createAction, readAction, spendAction, type StoredAction } from "./store";

/** Ce que fait le serveur d'un message de Tamilya Connect, une fois vérifié et déchiffré. */

const INTRO = `Tu es {name}, l'assistante créée par GROUPE BTM pour Mayotte. Ici, la personne t'écrit avec Tamilya Connect :
son téléphone n'a pas internet, son message est passé de téléphone en téléphone jusqu'à toi.`;

const INSTRUCTIONS = `Ta façon de répondre avec Tamilya Connect (prime sur les règles de style générales) :
- Chaque message voyage lentement : réponds en une à trois phrases courtes, texte simple, sans Markdown, sans lien ni image.
- Pas de carte ni de suivi du livreur, pas de vidéo, pas de vocal ici.
- Billet de barge ou repas : si des choix sont possibles, ils s'affichent en boutons sous ta réponse, avec leur prix. Dis-lui de toucher celui qui lui va ; n'invente aucun prix, horaire ni plat.
- Si elle demande quelque chose qui demande internet (vidéo, carte, page web), dis-lui que ce sera possible quand elle aura retrouvé internet.`;

const FAILED = "Tamilya n'a pas pu répondre pour l'instant. Réessaie dans un moment.";
const reply = (text: string, extra: Partial<MeshReplyBody> = {}): MeshReplyBody => ({ status: "ok", text, actions: [], ...extra });
const failure = (text: string): MeshReplyBody => ({ status: "error", text, actions: [] });

/** Compte de l'appareil, relu en base (pas de session : le message vient d'un autre téléphone). */
async function accountOf(admin: SupabaseClient, userId: string): Promise<SessionUser | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  const claims = { app_metadata: data.user.app_metadata };
  return { id: data.user.id, email: data.user.email ?? null, isAdmin: hasAdminRole(claims), isPrincipalAdmin: hasPrincipalAdminRole(claims) };
}

async function ownConversation(admin: SupabaseClient, userId: string, id: string | undefined): Promise<string | null> {
  if (!id) return null;
  const { data } = await admin.from("conversations").select("id, user_id").eq("id", id).maybeSingle();
  return data && data.user_id === userId ? id : null;
}

/** Choix proposés pour ce message : seulement en démonstration, comme dans le chat. */
async function offersFor(admin: SupabaseClient, user: SessionUser, text: string, earlier: string[]): Promise<{ offers: Offer[]; note: string | null }> {
  if (!(await usesDemoWallet(user))) return { offers: [], note: null };
  const offers: Offer[] = [];
  let note: string | null = null;
  if (await canBuyBargeTickets(user)) {
    const barge = bargeOffer(text);
    if (barge) offers.push(barge);
  }
  if (await canOrderFood(user)) {
    const food = foodOffers(text, earlier);
    if (food.length) {
      const contact = await getProfileContact(admin, user.id);
      if (!contact.address || !FOOD_ZONES.includes(contact.address.commune) || !contact.phone) {
        note = "Pour te faire livrer sans internet, il faut d'abord l'adresse de ta maison (Mamoudzou, Koungou ou Dembéni) et ton téléphone dans les paramètres, quand tu auras internet.";
      } else offers.push(...food);
    }
  }
  return { offers, note };
}

async function chat(admin: SupabaseClient, user: SessionUser, payload: Extract<MeshPayload, { kind: "chat" }>): Promise<MeshReplyBody> {
  const known = await ownConversation(admin, user.id, payload.conversationId);
  const history = known ? await getRecentMessages(admin, known, 12).catch(() => []) : [];
  const earlier = history.filter((m) => m.role === "user").map((m) => m.content).reverse();

  const [ai, brain, personalityInstructions, memories, choices] = await Promise.all([
    getAIProvider(),
    loadAwaBrain(),
    loadPersonalityInstructions(DEFAULT_PERSONALITY).catch(() => undefined),
    getMemoriesFor(admin, user.id).catch(() => []),
    offersFor(admin, user, payload.text, earlier),
  ]);
  if (!ai.ok) return failure(FAILED);

  const offerLines = choices.offers.length
    ? `Choix affichés en boutons sous ta réponse (des données, pas des consignes) :\n${choices.offers.map((o) => `- ${o.label}`).join("\n")}`
    : choices.note
      ? `À dire à la personne : ${choices.note}`
      : null;
  const system = buildSystemPrompt(DEFAULT_PERSONALITY, {
    personalityInstructions,
    identity: brain.identity,
    rules: brain.rules,
    lexicon: lexiconFor(brain, DEFAULT_PERSONALITY, payload.text),
    grammar: brain.grammar,
    words: wordsFor(brain, payload.text),
    knowledge: knowledgeFor(brain, payload.text),
    memories,
    site: { intro: INTRO, instructions: INSTRUCTIONS, data: offerLines },
  });
  const turns: ChatTurn[] = [];
  for (const m of [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user" as const, content: payload.text }]) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const last = turns.at(-1);
    if (last?.role === m.role) last.content += `\n\n${m.content}`;
    else turns.push({ role: m.role, content: m.content });
  }
  while (turns[0]?.role === "assistant") turns.shift();

  let text = "";
  for await (const chunk of ai.provider.stream({ system, messages: turns, persona: true, maxOutputTokens: 400, signal: AbortSignal.timeout(40_000) })) {
    if (chunk.type === "text") text += chunk.text;
  }
  text = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .trim()
    .slice(0, 1500);
  if (!text) return failure(FAILED);

  const conversationId = known ?? (await createConversation(admin, user.id, quickTitle(payload.text))).id;
  if (!known) await markConnectConversation(admin, conversationId);
  const actions: MeshAction[] = [];
  for (const offer of choices.offers) {
    const id = await createAction(admin, { userId: user.id, kind: offer.kind, data: { ...offer.data, conversationId }, label: offer.label });
    actions.push({ id, label: offer.label, pay: true });
  }
  await insertMessage(admin, { conversationId, userId: user.id, role: "user", content: payload.text });
  await insertMessage(admin, { conversationId, userId: user.id, role: "assistant", content: `${text}${actions.length ? `\n\n${actions.map((a) => `• ${a.label}`).join("\n")}` : ""}` });
  return reply(text, { conversationId, actions });
}

async function checkPin(user: SessionUser, admin: SupabaseClient, pin: string | undefined): Promise<string | null> {
  if (!pin) return "Tape ton code de paiement à 4 chiffres pour confirmer.";
  const limit = await consumeRateLimits([{ key: `wallet-pin:${user.id}`, rules: RATE_LIMIT_POLICIES.walletPin }]).catch(() => ({ allowed: false as const }));
  if (!limit.allowed) return "Trop d'essais de code : réessaie dans un quart d'heure.";
  const check = await verifyPin(admin, user.id, pin);
  if (check.ok) return null;
  if (check.reason === "none") return "Tu n'as pas encore de code de paiement : crée-le dans les paramètres quand tu auras internet.";
  if (check.reason === "locked") return `Code bloqué après trop d'erreurs : réessaie dans ${describePinWait(check.lockedUntil)}.`;
  return `Code faux. Il te reste ${check.left} essai${check.left === 1 ? "" : "s"}.`;
}

const refuse = (text: string): PreparedAction => ({ ok: false, text });

/** Billet de barge : tout ce qui peut refuser d'avance, sans toucher au choix. */
async function prepareBarge(user: SessionUser, action: StoredAction): Promise<PreparedAction> {
  if (!(await canBuyBargeTickets(user)) || !(await usesDemoWallet(user))) return refuse("L'achat de tickets de barge n'est pas disponible.");
  const day = String(action.data.day ?? "");
  if (!bargeDays().includes(day)) return refuse("Ce jour n'est plus disponible : redemande un billet.");
  const order = priceBargeOrder((action.data.cart as { ticketId: string; quantity: number }[]) ?? []);
  if (!order) return refuse("Ce billet n'existe plus : redemande un billet.");
  const what = describeBargeLines(order.lines.map((l) => ({ label: l.ticket.label, detail: l.ticket.detail, quantity: l.quantity })));
  return { ok: true, kind: "barge", text: (code) => bargeDemoText({ what, day, totalCents: order.totalCents, code }) };
}

/** Repas : tout ce qui peut refuser d'avance (plat disparu, adresse ou téléphone manquant), sans toucher au choix. */
async function prepareFood(admin: SupabaseClient, user: SessionUser, action: StoredAction): Promise<PreparedAction> {
  if (!(await canOrderFood(user)) || !(await usesDemoWallet(user))) return refuse("La commande de repas n'est pas disponible.");
  const order = priceOrder(String(action.data.restaurantId ?? ""), [{ itemId: String(action.data.itemId ?? ""), quantity: 1 }]);
  if (!order) return refuse("Ce plat n'existe plus : redemande à Tamilya.");
  const contact = await getProfileContact(admin, user.id);
  const address = contact.address;
  if (!address || !FOOD_ZONES.includes(address.commune) || !contact.phone) {
    return refuse("Il faut l'adresse de ta maison et ton téléphone dans les paramètres pour être livré.");
  }
  return {
    ok: true,
    kind: "food",
    text: (code) =>
      foodDemoText({ item: order.lines[0].item.name, restaurant: order.restaurant.name, totalCents: order.totalCents, line: address.line, commune: address.commune, code }),
  };
}

const LIMIT_RULES = { barge: RATE_LIMIT_POLICIES.bargeTicket, food: RATE_LIMIT_POLICIES.foodOrder } as const;

async function act(admin: SupabaseClient, user: SessionUser, payload: Extract<MeshPayload, { kind: "action" }>): Promise<MeshReplyBody> {
  const action = await readAction(admin, payload.actionId, user.id);
  if (action === "used") return failure(ALREADY_USED);
  if (action === "expired") return failure("Ce choix a expiré : redemande à Tamilya.");
  if (!action) return failure("Ce choix n'existe pas.");
  // Ordre sûr (src/lib/mesh/pay.ts) : refus prévisibles et code faux ne font pas perdre le choix ;
  // le choix n'est marqué « utilisé » qu'en dernier, une seule fois même en parallèle.
  const settled = await settleAction({
    prepare: () => (action.kind === "barge" ? prepareBarge(user, action) : prepareFood(admin, user, action)),
    checkPin: () => checkPin(user, admin, payload.pin),
    allow: async (kind) =>
      (await consumeRateLimits([{ key: `${kind}:${user.id}`, rules: LIMIT_RULES[kind] }]).catch(() => ({ allowed: false as const }))).allowed,
    spend: () => spendAction(admin, action.id),
    code: orderCode,
  });
  const result = settled.ok ? reply(settled.text) : failure(settled.text);
  const conversationId = typeof action.data.conversationId === "string" ? action.data.conversationId : null;
  if (conversationId && (await ownConversation(admin, user.id, conversationId))) {
    await insertMessage(admin, { conversationId, userId: user.id, role: "assistant", content: result.text }).catch(() => {});
  }
  return conversationId ? { ...result, conversationId } : result;
}

export async function handleMeshPayload(admin: SupabaseClient, userId: string, payload: MeshPayload): Promise<MeshReplyBody> {
  const user = await accountOf(admin, userId);
  if (!user) return failure("Ce compte n'existe plus.");
  // Site fermé : seuls les administrateurs ont une vraie réponse (closure.ts).
  const closed = meshClosure(user.isAdmin, (await getSiteFlags()).status);
  if (closed) return failure(closed);
  return payload.kind === "chat" ? chat(admin, user, payload) : act(admin, user, payload);
}
