import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { slotHealthId } from "@/lib/ai";
import { loadAIChain } from "@/lib/ai/registry";
import { AI_ERROR_LABELS } from "@/lib/ai/flow-events";
import { flowCutStop, loadFlowCuts } from "@/lib/ai/flow-cuts";
import { canEncrypt } from "@/lib/ai/secret-box";
import { deriveModelStatus, freeDailyQuota, getHealth, requestsToday, type NodeStatus } from "@/lib/ai/health";
import { checkKey } from "@/lib/ai/key-check";
import { DEFAULT_IDENTITY, DEFAULT_RULES } from "@/lib/ai/system-prompt";
import { requireAdmin } from "@/lib/auth/session";
import { loadRateLimitSettings } from "@/lib/rate-limit/settings";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { AIFlow } from "./AIFlow";
import type { ApiDetails, FlowEdge, FlowNode } from "./flow";

const CHARACTER_DEFAULTS = { name: "Awa", identity: DEFAULT_IDENTITY, rules: DEFAULT_RULES };

export const metadata: Metadata = { title: "Modèle d'IA", robots: { index: false, follow: false } };

/** Ce que le cerveau d'Awa contient réellement en base (null : illisible). */
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
      return { slot, config, status, api };
    }),
  );
}

export default async function AdminModelPage() {
  const { user } = await requireAdmin("/admin/modele-ia");
  const admin = getSupabaseAdminClient();
  const hasSalt = Boolean(process.env.RATE_LIMIT_SALT?.trim());

  const [models, limits, brain, cuts] = await Promise.all([
    readModels(),
    loadRateLimitSettings(),
    admin ? readBrainCounts(admin).catch((error: unknown) => (console.error("[admin] Cerveau illisible", error), null)) : null,
    loadFlowCuts(),
  ]);

  // Un fil coupé avant les API arrête tous les messages : aucune API ne répond.
  const stoppedAt = flowCutStop(cuts);
  // Même ordre que le secours automatique : la première API branchée, ni épuisée ni en panne, répond.
  const servingIndex = stoppedAt
    ? -1
    : models.findIndex((m) => !cuts.has(m.slot.id) && (m.status.status === "ok" || m.status.status === "unknown"));
  const unplugged: Pick<FlowNode, "status" | "statusLabel" | "reason"> = {
    status: "error",
    statusLabel: "Débranché",
    reason: "Lien coupé : les messages s'arrêtent ici, Awa ne répond plus.",
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
    { id: "personality", column: 2, icon: "sparkle", title: "Personnalité", status: "ok", statusLabel: "Active", href: "/admin/personnalites" },
    {
      id: "settings",
      column: 2,
      icon: "settings",
      title: "Caractère et règles",
      character: {
        saved: {
          name: brain?.settings?.name ?? CHARACTER_DEFAULTS.name,
          identity: brain?.settings?.identity ?? CHARACTER_DEFAULTS.identity,
          rules: brain?.settings?.rules ?? CHARACTER_DEFAULTS.rules,
        },
        defaults: CHARACTER_DEFAULTS,
      },
      ...brainState(Boolean(brain?.settings)),
    },
    {
      id: "knowledge",
      column: 2,
      icon: "book",
      title: "Connaissances",
      href: "/admin/connaissances",
      ...brainState((brain?.knowledge ?? 0) > 0),
    },
    {
      id: "lexicon",
      column: 2,
      icon: "language",
      title: "Lexique shimaoré",
      href: "/admin/lexique",
      ...brainState((brain?.lexicon ?? 0) > 0),
    },
    {
      id: "memory",
      column: 2,
      icon: "memory",
      title: "Mémoire",
      href: "/admin/memoire",
      ...(brain ? { status: "ok" as const, statusLabel: "Active" } : brainState(false)),
    },
  ];

  const nodes: FlowNode[] = [
    {
      id: "input",
      column: 0,
      icon: "message",
      title: "Message reçu",
      ...(cuts.has("input") ? unplugged : { status: "ok" as const, statusLabel: "Ouvert" }),
    },
    { id: "guard", column: 1, icon: "shield", title: "Quotas et sécurité", limits, ...guard },
    ...brainNodes.map((n) => (cuts.has(n.id) ? { ...n, ...unplugged } : n)),
    { id: "prompt", column: 3, icon: "prompt", title: "Message système", status: "ok", statusLabel: "Assemblé" },
    ...models.map(
      ({ slot, config, status, api }, index): FlowNode => ({
        api,
        id: `model-${slot.id}`,
        column: 4,
        icon: "chip",
        title: slot.label,
        subtitle: config?.model ?? "Non configurée",
        status: status.status,
        statusLabel: status.label,
        reason: status.reason,
        slot: slot.slot,
        apiId: slot.id,
        deletable: slot.source === "db",
        inService: index === servingIndex,
        ...(cuts.has(slot.id) && unpluggedApi),
      }),
    ),
    {
      id: "output",
      column: 5,
      icon: "reply",
      title: "Réponse d'Awa",
      status: servingIndex >= 0 ? "ok" : "error",
      statusLabel: servingIndex >= 0 ? "Disponible" : "Bloquée",
      ...(stoppedAt && { reason: "Un lien est coupé : rebranchez-le pour qu'Awa réponde de nouveau." }),
    },
  ];

  // Chaque lien se coupe (ceux d'un bloc du cerveau vont par deux) ; seul un
  // fil d'API coupé laisse passer les messages par les autres API.
  const flowing = !stoppedAt;
  const edges: FlowEdge[] = [
    { from: "input", to: "guard", live: flowing, cutId: "input", cut: cuts.has("input") },
    ...brainNodes.flatMap((n) => {
      const cut = cuts.has(n.id);
      const link = { live: flowing, muted: cut || n.status === "off", cutId: n.id, cut };
      return [
        { from: "guard", to: n.id, ...link },
        { from: n.id, to: "prompt", ...link },
      ];
    }),
    ...models.flatMap((m, index) => {
      const cut = cuts.has(m.slot.id);
      const link = {
        live: index === servingIndex,
        muted: cut || (m.status.status !== "ok" && m.status.status !== "unknown"),
        cutId: m.slot.id,
        cut,
      };
      return [
        { from: "prompt", to: `model-${m.slot.id}`, ...link },
        { from: `model-${m.slot.id}`, to: "output", ...link },
      ];
    }),
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle lg:h-dvh lg:overflow-hidden">
      <AdminHeader section="Modèle d'IA" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-[1600px] min-h-[32rem] flex-1 flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h1 className="sr-only">Modèle d&apos;IA</h1>
        <AIFlow nodes={nodes} edges={edges} canAddApi={Boolean(admin) && canEncrypt()} />
      </main>
    </div>
  );
}
