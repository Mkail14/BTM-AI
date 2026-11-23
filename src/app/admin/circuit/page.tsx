import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminIdleLock } from "@/components/admin/AdminIdleLock";
import { ADMIN_IDLE_MINUTES } from "@/server/services/admin/gate";
import { slotHealthId } from "@/server/services/ai";
import { loadAIChain, loadRemovedApis } from "@/server/services/ai/registry";
import { readAIChain } from "@/lib/ai/config";
import { AI_ERROR_LABELS, ORIGIN_NODES, VOICE_NODE } from "@/lib/ai/flow-events";
import { flowCutStop, loadFlowCuts } from "@/server/services/ai/flow-cuts";
import { canEncrypt } from "@/lib/ai/secret-box";
import { averageLatency, deriveModelStatus, freeDailyQuota, getHealth, requestsToday, type NodeStatus } from "@/lib/ai/health";
import { checkKey } from "@/server/services/ai/key-check";
import { getSharedState, refreshSharedStates } from "@/server/services/ai/api-status";
import { LANE_LABELS, planRoute } from "@/lib/ai/switch";
import { DEFAULT_IDENTITY, DEFAULT_RULES } from "@/lib/ai/system-prompt";
import { requireAdmin } from "@/server/middlewares/session";
import { loadRateLimitSettings } from "@/server/middlewares/rate-limit/settings";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { liveRelayUrl, liveTicketSecret } from "@/server/services/voice-live/ticket";
import { AIFlow } from "./AIFlow";
import type { ApiDetails, FlowEdge, FlowNode } from "./flow";

const CHARACTER_DEFAULTS = { identity: DEFAULT_IDENTITY, rules: DEFAULT_RULES };

export const metadata: Metadata = { title: "Circuit de Tamilya", robots: { index: false, follow: false } };

/** Ce que le cerveau de Tamilya contient réellement en base (null : illisible). */
async function readBrainCounts(admin: SupabaseClient) {
  const [settings, knowledge, lexicon, words] = await Promise.all([
    admin.from("awa_settings").select("name, identity, rules").eq("id", 1).maybeSingle(),
    admin.from("awa_knowledge").select("id", { count: "exact", head: true }).eq("is_active", true),
    admin.from("awa_lexicon").select("id", { count: "exact", head: true }).eq("is_active", true),
    admin.from("awa_words").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  for (const result of [settings, knowledge, lexicon]) if (result.error) throw result.error;
  return {
    settings: settings.data as { name: string; identity: string | null; rules: string | null } | null,
    knowledge: knowledge.count ?? 0,
    // Expressions et mots du dictionnaire (table absente : seulement les expressions).
    lexicon: (lexicon.count ?? 0) + (words.error ? 0 : (words.count ?? 0)),
  };
}

const dollars = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

function ago(at: number | null, now: number) {
  if (!at) return "jamais";
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `il y a ${hours} h` : `il y a ${Math.round(hours / 24)} j`;
}

/** La clé n'est jamais envoyée au navigateur : début reconnaissable et 4 derniers caractères. */
function maskKey(key: string) {
  const start = key.match(/^(sk-or-v1-|sk-ant-[a-z0-9]+-|sk-|gsk_)/i)?.[0] ?? "";
  return `${start}${"•".repeat(12)}${key.slice(-4)}`;
}

/** Temps restant avant minuit UTC, heure de remise à zéro des quotas gratuits d'OpenRouter. */
function untilUtcMidnight(now: number) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  const minutes = Math.ceil((next.getTime() - now) / 60_000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

/** État de chaque API : configuration, clé vérifiée sans coût, dernières réponses réelles. */
async function readModels() {
  const now = Date.now();
  return Promise.all(
    (await loadAIChain()).map(async (slot) => {
      const config = slot.result.ok ? slot.result.config : null;
      const keyCheck = config ? await checkKey(config) : null;
      const health = getHealth(config ? slotHealthId(slot.id, config) : "");
      const status = deriveModelStatus({
        configProblem: slot.result.ok ? null : slot.result.reason,
        keyCheck,
        health,
        now,
      });

      const credit = keyCheck?.ok ? keyCheck.credit : undefined;
      const quotaHit = health.lastFailure?.code === "quota" && status.status === "exhausted";
      const freeQuota = config
        ? freeDailyQuota({
            baseUrl: config.baseUrl,
            model: config.model,
            freeTier: credit?.freeTier ?? true,
            usedToday: requestsToday(health, now),
            exhausted: quotaHit,
          })
        : null;

      const api: ApiDetails = {
        connection: [
          { label: "Rôle", value: slot.slot === 1 ? "API principale" : `Secours n° ${slot.slot - 1}` },
          { label: "Modèle", value: config?.model ?? "—", masked: true },
          { label: "Clé API", value: config ? maskKey(config.apiKey) : "absente", masked: true },
        ],
        credit: credit
          ? {
              limit: credit.limit === null ? null : dollars.format(credit.limit),
              remaining: credit.remaining === null ? null : dollars.format(Math.max(credit.remaining, 0)),
              ratio: credit.limit ? Math.min(credit.usage / credit.limit, 1) : null,
            }
          : null,
        freeQuota: freeQuota ? { ...freeQuota, resetIn: untilUtcMidnight(now) } : null,
        activity: [
          { label: "Requêtes aujourd'hui", value: String(requestsToday(health, now)) },
          { label: "Dernière réussite", value: ago(health.lastSuccessAt, now) },
          ...(health.lastFailure
            ? [
                {
                  label: "Dernier échec",
                  value: `${AI_ERROR_LABELS[health.lastFailure.code] ?? health.lastFailure.code}, ${ago(health.lastFailure.at, now)}`,
                },
              ]
            : []),
        ],
      };
      return { slot, config, status, api, health };
    }),
  );
}

export default async function AdminCircuitPage() {
  await requireAdmin("/admin/circuit");
  const admin = getSupabaseAdminClient();
  const hasSalt = Boolean(process.env.RATE_LIMIT_SALT?.trim());

  const [models, limits, brain, cuts, removed] = await Promise.all([
    loadAIChain()
      .then((chain) => refreshSharedStates(chain.map((s) => s.id)))
      .catch(() => undefined)
      .then(readModels),
    loadRateLimitSettings(),
    admin ? readBrainCounts(admin).catch((error: unknown) => (console.error("[admin] Cerveau illisible", error), null)) : null,
    loadFlowCuts(),
    loadRemovedApis(),
  ]);
  // API du serveur retirées depuis cette page : proposées à la remise.
  const removedApis = readAIChain()
    .filter((s) => removed.has(s.id))
    .map((s) => s.label);

  // Un fil coupé avant les API arrête tous les messages : aucune API ne répond.
  const stoppedAt = flowCutStop(cuts);
  // Même choix que l'aiguillage des vrais messages (switch.ts) : la première API de son ordre
  // qui n'est ni épuisée ni en panne répond.
  const routable = models.flatMap((m) =>
    m.config && !cuts.has(m.slot.id) ? [{ healthId: slotHealthId(m.slot.id, m.config), slotId: m.slot.id, model: m }] : [],
  );
  const healthById = new Map(routable.map((r) => [r.healthId, r.model.health]));
  const route = planRoute(routable, { shared: getSharedState, health: (id) => healthById.get(id)! });
  const laneOfSlot = new Map(routable.map((r) => [r.slotId, route.lanes.get(r)!]));
  const serving = stoppedAt
    ? undefined
    : route.order.find((r) => r.model.status.status === "ok" || r.model.status.status === "unknown");
  const servingIndex = serving ? models.indexOf(serving.model) : -1;
  const laneCount = (lane: "ready" | "retest" | "paused") => [...laneOfSlot.values()].filter((l) => l === lane).length;
  const switchNode: FlowNode = {
    id: "switch",
    column: 5,
    icon: "switch",
    title: "Aiguillage",
    subtitle: `${laneCount("ready")} prête(s) · ${laneCount("retest") + laneCount("paused")} en attente`,
    status: stoppedAt ? "off" : serving ? "ok" : "error",
    statusLabel: stoppedAt
      ? "À l'arrêt"
      : serving
        ? `Vers ${serving.model.slot.label}${serving.model.slot.slot > 1 ? ` (secours ${serving.model.slot.slot - 1})` : ""}`
        : "Aucune API prête",
    reason:
      `Prêtes : ${laneCount("ready")} · À retester : ${laneCount("retest")} · En pause : ${laneCount("paused")}. ` +
      "Chaque message va direct à une API qui marche, la plus rapide d'abord. Les API épuisées ou en panne passent en dernier " +
      "et sont retestées seules en arrière-plan, puis reproposées dès qu'elles remarchent.",
  };
  const unplugged: Pick<FlowNode, "status" | "statusLabel" | "reason"> = {
    status: "error",
    statusLabel: "Débranché",
    reason: "Lien coupé : les messages s'arrêtent ici, Tamilya ne répond plus.",
  };
  const unpluggedApi: Pick<FlowNode, "status" | "statusLabel" | "reason"> = {
    status: "off",
    statusLabel: "Débranchée",
    reason: "Lien coupé : cette API n'est plus utilisée.",
  };

  const brainState = (filled: boolean): Pick<FlowNode, "status" | "statusLabel" | "reason"> =>
    !brain
      ? { status: "warning", statusLabel: "Par défaut", reason: "Base illisible : textes par défaut du code." }
      : filled
        ? { status: "ok", statusLabel: "Actif" }
        : { status: "off", statusLabel: "Vide" };

  const guard: { status: NodeStatus; statusLabel: string } =
    admin && hasSalt
      ? { status: "ok", statusLabel: "Actif" }
      : { status: admin ? "warning" : "error", statusLabel: admin ? "Partiel" : "En mémoire" };

  const brainNodes: FlowNode[] = [
    { id: "personality", column: 3, icon: "sparkle", title: "Caractère", status: "ok", statusLabel: "Active", href: "/admin/caractere" },
    {
      id: "settings",
      column: 3,
      icon: "settings",
      title: "Caractère et règles",
      character: {
        saved: {
          identity: brain?.settings?.identity ?? CHARACTER_DEFAULTS.identity,
          rules: brain?.settings?.rules ?? CHARACTER_DEFAULTS.rules,
        },
        defaults: CHARACTER_DEFAULTS,
      },
      ...brainState(Boolean(brain?.settings)),
    },
    {
      id: "knowledge",
      column: 3,
      icon: "book",
      title: "Connaissances",
      href: "/admin/connaissances",
      ...brainState((brain?.knowledge ?? 0) > 0),
    },
    {
      id: "lexicon",
      column: 3,
      icon: "language",
      title: "Lexique shimaoré",
      href: "/admin/lexique",
      ...brainState((brain?.lexicon ?? 0) > 0),
    },
    {
      id: "memory",
      column: 3,
      icon: "memory",
      title: "Mémoire",
      href: "/admin/memoire",
      ...(brain ? { status: "ok" as const, statusLabel: "Active" } : brainState(false)),
    },
  ];

  const voiceReady = Boolean(liveRelayUrl() && liveTicketSecret());
  const nodes: FlowNode[] = [
    // D'où vient la requête : la plateforme de Tamilya elle-même, ou une entreprise par l'API.
    {
      id: ORIGIN_NODES.platform,
      column: 0,
      icon: "platform",
      title: "Plateforme Tamilya",
      subtitle: "Chat et voix de BTM AI",
      status: "ok",
      statusLabel: "Ouverte",
      reason: "Messages écrits ou dits sur BTM AI, par ses utilisateurs.",
    },
    {
      id: ORIGIN_NODES.api,
      column: 0,
      icon: "company",
      title: "API des entreprises",
      subtitle: "Sites BTM, Orchestr, widgets, API v1",
      status: "ok",
      statusLabel: "Ouverte",
      reason: "Messages envoyés par un autre site ou une entreprise, de serveur à serveur.",
      href: "/admin/developpeurs",
    },
    {
      id: "input",
      column: 1,
      icon: "message",
      title: "Message reçu",
      ...(cuts.has("input") ? unplugged : { status: "ok" as const, statusLabel: "Ouvert" }),
    },
    { id: "guard", column: 2, icon: "shield", title: "Quotas et sécurité", limits, ...guard },
    ...brainNodes.map((n) => (cuts.has(n.id) ? { ...n, ...unplugged } : n)),
    { id: "prompt", column: 4, icon: "prompt", title: "Message système", status: "ok", statusLabel: "Assemblé" },
    switchNode,
    ...models.map(
      ({ slot, config, status, api, health }, index): FlowNode => ({
        api: laneOfSlot.has(slot.id)
          ? { ...api, activity: [...api.activity, { label: "Aiguillage", value: LANE_LABELS[laneOfSlot.get(slot.id)!] }] }
          : api,
        id: `model-${slot.id}`,
        column: 6,
        icon: "chip",
        title: slot.label,
        subtitle: config?.model ?? "Non configurée",
        status: status.status,
        statusLabel: status.label,
        reason: status.reason,
        slot: slot.slot,
        apiId: slot.id,
        fromServer: slot.source === "env",
        speed: { lastMs: health.lastLatencyMs, averageMs: averageLatency(health) },
        inService: index === servingIndex,
        ...(cuts.has(slot.id) && unpluggedApi),
      }),
    ),
    {
      id: VOICE_NODE,
      column: 6,
      icon: "chip",
      title: "Voix en direct",
      subtitle: process.env.AI_LIVE_MODEL?.trim() || "Gemini Live",
      status: voiceReady && !cuts.has(VOICE_NODE) ? "ok" : "off",
      statusLabel: !voiceReady ? "Non configurée" : cuts.has(VOICE_NODE) ? "Débranchée : micro caché partout" : "Prête",
      href: "/admin/voix",
    },
    {
      id: "output",
      column: 7,
      icon: "reply",
      title: "Réponse de Tamilya",
      status: servingIndex >= 0 ? "ok" : "error",
      statusLabel: servingIndex >= 0 ? "Disponible" : "Bloquée",
      ...(stoppedAt && { reason: "Un lien est coupé : rebranchez-le pour que Tamilya réponde de nouveau." }),
    },
  ];

  // Chaque lien se coupe (ceux d'un bloc du cerveau vont par deux) ; seul un
  // fil d'API coupé laisse passer les messages par les autres API.
  const flowing = !stoppedAt;
  const edges: FlowEdge[] = [
    { from: ORIGIN_NODES.platform, to: "input", live: flowing },
    { from: ORIGIN_NODES.api, to: "input", live: flowing },
    { from: "input", to: "guard", live: flowing, cutId: "input", cut: cuts.has("input") },
    ...brainNodes.flatMap((n) => {
      const cut = cuts.has(n.id);
      const link = { live: flowing, muted: cut || n.status === "off", cutId: n.id, cut };
      return [
        { from: "guard", to: n.id, ...link },
        { from: n.id, to: "prompt", ...link },
      ];
    }),
    // L'aiguillage reçoit tous les messages écrits et les envoie à l'API choisie.
    { from: "prompt", to: "switch", live: flowing && servingIndex >= 0, muted: !flowing },
    ...models.flatMap((m, index) => {
      const cut = cuts.has(m.slot.id);
      const link = {
        live: index === servingIndex,
        muted: cut || (m.status.status !== "ok" && m.status.status !== "unknown"),
        cutId: m.slot.id,
        cut,
      };
      return [
        { from: "switch", to: `model-${m.slot.id}`, ...link },
        { from: `model-${m.slot.id}`, to: "output", ...link },
      ];
    }),
    // Fil de la voix coupé : le micro disparaît partout (site, PWA, app Android).
    { from: "prompt", to: VOICE_NODE, muted: !voiceReady || cuts.has(VOICE_NODE), cutId: VOICE_NODE, cut: cuts.has(VOICE_NODE) },
    { from: VOICE_NODE, to: "output", muted: !voiceReady || cuts.has(VOICE_NODE), cutId: VOICE_NODE, cut: cuts.has(VOICE_NODE) },
  ];

  return (
    // Plein écran, sans la barre de l'admin : le schéma se déplace à la main (voir AIFlow).
    <div className="fixed inset-0 overflow-hidden bg-bg-subtle">
      <AdminIdleLock minutes={ADMIN_IDLE_MINUTES} />
      <main id="contenu" className="flex size-full flex-col">
        <h1 className="sr-only">Circuit de Tamilya</h1>
        <AIFlow nodes={nodes} edges={edges} canAddApi={Boolean(admin) && canEncrypt()} removedApis={removedApis} />
      </main>
    </div>
  );
}
