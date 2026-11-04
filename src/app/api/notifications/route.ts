import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { EXAM_TYPES, type ExamType } from "@/lib/code-exam/candidate";
import { codeExamPartnerReady } from "@/lib/code-exam/partner";
import type { AppNotification } from "@/lib/notifications";
import { loadWallet } from "@/lib/wallet";
import { readDemoWallet, usesDemoWallet } from "@/lib/wallet/demo";
import { formatEuros } from "@/lib/wallet/limits";

/**
 * Historique de la cloche : opérations du portefeuille (fictif en mode démo)
 * et demandes de réservation du code, les plus récentes d'abord.
 */

const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json({ items: [] });

  const demo = await usesDemoWallet(user);
  const [wallet, code] = await Promise.all([
    demo ? readDemoWallet(user.id) : loadWallet(supabase, user.id, 30),
    // Filtré sur ce compte : un administrateur lit toutes les demandes avec la RLS.
    supabase
      .from("code_exam_requests")
      .select("id, starts_at, created_at, exam_type, center_name, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Sans partenariat La Poste (ou en démo), une place « réservée » n'est qu'une simulation.
  const simulated = demo || !codeExamPartnerReady();
  const items: AppNotification[] = [
    ...wallet.transactions
      .filter((t) => t.status !== "failed")
      .map((t): AppNotification => ({
        id: `wallet:${t.id}`,
        emoji: t.kind === "topup" ? "💳" : t.kind === "refund" ? "↩️" : "🧾",
        title:
          t.kind === "topup"
            ? `Recharge de ${formatEuros(t.amountCents)}`
            : t.kind === "refund"
              ? `Remboursement de ${formatEuros(t.amountCents)}`
              : `Paiement de ${formatEuros(t.amountCents)}`,
        subtitle: `${t.label}${t.status === "pending" ? " · en cours" : ""}${demo ? " · démo" : ""}`,
        at: t.createdAt,
        href: "/portefeuille",
      })),
    ...((code.data ?? []) as { id: string; starts_at: string; created_at: string; exam_type: ExamType; center_name: string; status: string }[]).map(
      (r): AppNotification => ({
        id: `code:${r.id}`,
        emoji: r.status === "cancelled" ? "✖️" : "🚗",
        title:
          r.status === "booked"
            ? simulated
              ? "Réservation d'essai du code (simulation)"
              : "Place du code confirmée"
            : r.status === "cancelled" ? "Réservation du code annulée" : "Demande de réservation du code envoyée",
        subtitle: `${EXAM_TYPES[r.exam_type] ?? r.exam_type} · ${day.format(new Date(r.starts_at))} · La Poste de ${r.center_name}`,
        at: r.created_at,
      }),
    ),
  ];
  items.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ items: items.slice(0, 40) }, { headers: { "Cache-Control": "no-store" } });
}
