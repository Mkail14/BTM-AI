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
import { bargeDays, BARGE_ROUTE, describeBargeLines, priceBargeOrder } from "@/lib/barge/catalog";
import { quickTitle } from "@/lib/chat/title";
import type { ChatTurn } from "@/lib/chat/types";
import { createConversation, getRecentMessages, insertMessage } from "@/lib/conversations/repository";
import { canOrderFood } from "@/lib/food/access";
import { FOOD_ZONES, priceOrder } from "@/lib/food/catalog";
import { orderCode } from "@/lib/food/order-code";
import { getProfileContact } from "@/lib/profile-contact";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { usesDemoWallet } from "@/lib/wallet/demo";
import { formatEuros } from "@/lib/wallet/limits";
import { verifyPin } from "@/lib/wallet/pin";
import type { MeshAction, MeshPayload, MeshReplyBody } from "./envelope";
import { bargeOffer, foodOffers, type Offer } from "./offers";
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
const DEMO_NOTE = "Démonstration : rien n'est vraiment payé.";
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
  if (check.reason === "locked") return "Code bloqué après 5 erreurs : réessaie dans 15 minutes.";
  return `Code faux. Il te reste ${check.left} essai${check.left === 1 ? "" : "s"}.`;
}

async function payBarge(user: SessionUser, action: StoredAction): Promise<MeshReplyBody> {
  if (!(await canBuyBargeTickets(user)) || !(await usesDemoWallet(user))) return failure("L'achat de tickets de barge n'est pas disponible.");
  const day = String(action.data.day ?? "");
  if (!bargeDays().includes(day)) return failure("Ce jour n'est plus disponible : redemande un billet.");
  const order = priceBargeOrder((action.data.cart as { ticketId: string; quantity: number }[]) ?? []);
  if (!order) return failure("Ce billet n'existe plus : redemande un billet.");
  const limit = await consumeRateLimits([{ key: `barge:${user.id}`, rules: RATE_LIMIT_POLICIES.bargeTicket }]).catch(() => ({ allowed: false as const }));
  if (!limit.allowed) return failure("Trop d'achats d'un coup : réessaie dans une heure.");
  const code = orderCode();
  const what = describeBargeLines(order.lines.map((l) => ({ label: l.ticket.label, detail: l.ticket.detail, quantity: l.quantity })));
  return reply(
    `Billet payé : ${what}, ${BARGE_ROUTE.from} → ${BARGE_ROUTE.to}, le ${day.split("-").reverse().join("/")}, ${formatEuros(order.totalCents)}. Ton code : ${code}. Montre-le à l'embarquement. ${DEMO_NOTE}`,
  );
}

async function payFood(admin: SupabaseClient, user: SessionUser, action: StoredAction): Promise<MeshReplyBody> {
  if (!(await canOrderFood(user)) || !(await usesDemoWallet(user))) return failure("La commande de repas n'est pas disponible.");
  const order = priceOrder(String(action.data.restaurantId ?? ""), [{ itemId: String(action.data.itemId ?? ""), quantity: 1 }]);
  if (!order) return failure("Ce plat n'existe plus : redemande à Tamilya.");
  const contact = await getProfileContact(admin, user.id);
  if (!contact.address || !FOOD_ZONES.includes(contact.address.commune) || !contact.phone) {
    return failure("Il faut l'adresse de ta maison et ton téléphone dans les paramètres pour être livré.");
  }
  const limit = await consumeRateLimits([{ key: `food:${user.id}`, rules: RATE_LIMIT_POLICIES.foodOrder }]).catch(() => ({ allowed: false as const }));
  if (!limit.allowed) return failure("Trop de commandes d'un coup : réessaie dans une heure.");
  const code = orderCode();
  const [low, high] = order.restaurant.etaMinutes;
  return reply(
    `Commande payée : ${order.lines[0].item.name} chez ${order.restaurant.name}, ${formatEuros(order.totalCents)}, livrée à ${contact.address.line}, ${contact.address.commune}. Arrivée dans ${low} à ${high} minutes environ. Ton code pour le livreur : ${code}. Le suivi sur la carte reviendra avec internet. ${DEMO_NOTE}`,
  );
}

async function act(admin: SupabaseClient, user: SessionUser, payload: Extract<MeshPayload, { kind: "action" }>): Promise<MeshReplyBody> {
  const action = await readAction(admin, payload.actionId, user.id);
  if (action === "used") return failure("Ce choix a déjà été utilisé.");
  if (action === "expired") return failure("Ce choix a expiré : redemande à Tamilya.");
  if (!action) return failure("Ce choix n'existe pas.");
  // Code vérifié avant de prendre le choix : un code faux ne le fait pas perdre.
  const pinProblem = await checkPin(user, admin, payload.pin);
  if (pinProblem) return failure(pinProblem);
  if (!(await spendAction(admin, action.id))) return failure("Ce choix a déjà été utilisé.");
  const result = action.kind === "barge" ? await payBarge(user, action) : await payFood(admin, user, action);
  const conversationId = typeof action.data.conversationId === "string" ? action.data.conversationId : null;
  if (conversationId && (await ownConversation(admin, user.id, conversationId))) {
    await insertMessage(admin, { conversationId, userId: user.id, role: "assistant", content: result.text }).catch(() => {});
  }
  return conversationId ? { ...result, conversationId } : result;
}

export async function handleMeshPayload(admin: SupabaseClient, userId: string, payload: MeshPayload): Promise<MeshReplyBody> {
  const user = await accountOf(admin, userId);
  if (!user) return failure("Ce compte n'existe plus.");
  return payload.kind === "chat" ? chat(admin, user, payload) : act(admin, user, payload);
}
