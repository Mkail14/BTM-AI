import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { FLOW_EVENT, FLOW_TOPIC, type FlowStep } from "./flow-events";

export type FlowTrace = { step(node: string, ok: boolean, reason?: string): void };

let channel: RealtimeChannel | null = null;

/**
 * Suit un message à travers le schéma. Les étapes partent en arrière-plan,
 * l'une après l'autre (l'ordre est conservé), sans jamais retarder la réponse ;
 * after() garde la fonction en vie jusqu'au dernier envoi.
 */
export function startFlowTrace(): FlowTrace {
  const admin = getSupabaseAdminClient();
  if (!admin) return { step() {} };
  channel ??= admin.channel(FLOW_TOPIC, { config: { private: true } });
  const target = channel;
  const trace = randomUUID();
  let seq = 0;
  let pending = Promise.resolve();
  let scheduled = false;

  return {
    step(node, ok, reason) {
      const event: FlowStep = { trace, seq: seq++, node, ok, ...(reason && { reason }) };
      pending = pending
        .then(() => target.httpSend(FLOW_EVENT, event, { timeout: 5_000 }))
        .then((result) => {
          if (!result.success) console.warn(`[flow] Étape non diffusée (${result.status}) : ${result.error}`);
        })
        .catch((error: unknown) => console.warn("[flow] Étape non diffusée", error));
      if (!scheduled) {
        scheduled = true;
        try {
          after(() => pending);
        } catch {
          // Hors requête (tests) : l'envoi continue sans attente.
        }
      }
    },
  };
}
