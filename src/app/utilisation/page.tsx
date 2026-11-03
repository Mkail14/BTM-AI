import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { loadRateLimitPolicies } from "@/lib/rate-limit/settings";
import { SettingsFrame } from "../parametres/SettingsFrame";

export const metadata: Metadata = { title: "Utilisation" };

const DAY_MS = 86_400_000;
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });
const number = new Intl.NumberFormat("fr-FR");

/** Fenêtre du jour en cours (jour UTC), comme les compteurs du serveur. */
function currentDay() {
  const start = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  return { start: new Date(start), resetAt: new Date(start + DAY_MS) };
}

/**
 * Quota de messages de l'utilisateur. Les compteurs du serveur sont privés :
 * on compte ici ses messages enregistrés depuis le début de la fenêtre du jour
 * (même découpage que consume_rate_limit : jour UTC, soit 3 h à Mayotte).
 */
export default async function UsagePage() {
  const { supabase, user } = await requireUser("/utilisation");
  const { start: dayStart, resetAt } = currentDay();

  const [policies, today, total, conversations] = await Promise.all([
    loadRateLimitPolicies(),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "user")
      .gte("created_at", dayStart.toISOString()),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("role", "user"),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  const perDay = policies.user.find((r) => r.windowSeconds === 86_400)?.limit ?? 0;
  const perMinute = policies.user.find((r) => r.windowSeconds === 60)?.limit ?? 0;
  const used = Math.min(today.count ?? 0, perDay);
  const left = Math.max(0, perDay - used);
  const ratio = perDay ? used / perDay : 0;
  const tone = ratio >= 0.9 ? "var(--danger)" : ratio >= 0.7 ? "var(--warning)" : "var(--accent)";

  return (
    <SettingsFrame isAdmin={user.isAdmin} section="Utilisation">
      <div className="grid grid-cols-1 flex-1 content-start gap-5 md:min-h-0 md:overflow-y-auto md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* Quota du jour */}
        <section aria-labelledby="quota" className="rounded-3xl border border-border bg-bg p-6">
          <div className="flex items-center justify-between">
            <h2 id="quota" className="font-semibold">
              Messages aujourd&apos;hui
            </h2>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
              {user.isAdmin ? "Maître de Tamilya" : "Gratuit"}
            </span>
          </div>

          {user.isAdmin ? (
            <div className="mt-6 text-center">
              <p className="text-5xl font-semibold tracking-tight">∞</p>
              <p className="mt-2 text-sm text-fg-muted">Sans limite : tu enseignes à Tamilya.</p>
            </div>
          ) : (
            <>
              <div className="relative mx-auto mt-6 size-44">
                <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-muted)" strokeWidth="9" />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke={tone}
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={`${ratio * 263.9} 263.9`}
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-4xl font-semibold tracking-tight tabular-nums">{number.format(left)}</p>
                    <p className="text-xs text-fg-muted">restants</p>
                  </div>
                </div>
              </div>
              <p className="mt-5 text-center text-sm">
                <span className="font-medium tabular-nums">{number.format(used)}</span>
                <span className="text-fg-muted"> / {number.format(perDay)} messages utilisés</span>
              </p>
              <p className="mt-1 text-center text-xs text-fg-muted">Remis à zéro à {time.format(resetAt)} (heure de Mayotte)</p>
            </>
          )}
        </section>

        <div className="space-y-5">
          {/* Limites */}
          <section aria-labelledby="limites" className="rounded-3xl border border-border bg-bg p-6">
            <h2 id="limites" className="font-semibold">
              Tes limites
            </h2>
            <dl className="mt-3 divide-y divide-border text-sm">
              {[
                ["Messages par jour", user.isAdmin ? "Illimité" : number.format(perDay)],
                ["Messages par minute", user.isAdmin ? "Illimité" : number.format(perMinute)],
                ["Messages par conversation", user.isAdmin ? "Illimité" : number.format(CHAT_LIMITS.conversationMaxMessages)],
                ["Longueur d'un message", `${number.format(CHAT_LIMITS.maxUserMessageChars)} caractères`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-fg-muted">{label}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-fg-muted">
              Ces limites gardent Tamilya gratuite et rapide pour tout le monde. Quand tu atteins la limite, attends la remise à
              zéro ou ouvre une nouvelle conversation si celle-ci est pleine.
            </p>
          </section>

          {/* Depuis le début */}
          <section aria-labelledby="total" className="rounded-3xl border border-border bg-bg p-6">
            <h2 id="total" className="font-semibold">
              Depuis ton inscription
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-bg-subtle p-4">
                <p className="text-2xl font-semibold tabular-nums">{number.format(total.count ?? 0)}</p>
                <p className="text-xs text-fg-muted">messages envoyés</p>
              </div>
              <div className="rounded-2xl bg-bg-subtle p-4">
                <p className="text-2xl font-semibold tabular-nums">{number.format(conversations.count ?? 0)}</p>
                <p className="text-xs text-fg-muted">conversations</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-fg-muted">
              Tamilya répond avec le modèle Gemini de Google.{" "}
              <Link href="/aide" className="font-medium text-accent hover:underline">
                Besoin d&apos;aide ?
              </Link>
            </p>
          </section>
        </div>
      </div>
    </SettingsFrame>
  );
}
