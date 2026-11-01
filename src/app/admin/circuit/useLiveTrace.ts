"use client";

import { useEffect, useRef, useState } from "react";
import { FLOW_EVENT, FLOW_TOPIC, type FlowStep } from "@/lib/ai/flow-events";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { FlowEdge } from "./flow";

/** Durée d'un saut d'un bloc au suivant. */
export const HOP_MS = 650;
/** Temps pendant lequel un blocage reste affiché. */
const BLOCKED_MS = 6_000;

export type LivePath = { key: string; d: string; start: [number, number]; end: [number, number] };
/** Point en mouvement sur une arête, ou arrêté sur le bloc qui a bloqué le message. */
export type LiveDot = { id: string; node: string; d: string; at: [number, number]; blocked?: string };
export type LiveOutcome = { ok: boolean; node: string; reason?: string };
export type LiveStatus = "connecting" | "live" | "unavailable";

type Trace = { steps: FlowStep[]; cursor: string[]; running: boolean };
type Hop = [from: string, to: string];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Arêtes à parcourir pour aller des blocs déjà atteints jusqu'à `node` :
 * directement, ou en passant par une colonne intermédiaire (le cerveau),
 * en évitant les chemins coupés quand c'est possible.
 */
export function planHops(cursor: string[], node: string, edges: FlowEdge[]): Hop[][] {
  const direct = edges.filter((e) => cursor.includes(e.from) && e.to === node);
  if (direct.length > 0) return [direct.map((e) => [e.from, e.to])];
  const firsts = edges.filter((e) => cursor.includes(e.from) && edges.some((f) => f.from === e.to && f.to === node));
  const open = firsts.filter((e) => !e.muted);
  const via = open.length > 0 ? open : firsts;
  if (via.length === 0) return [];
  const middles = [...new Set(via.map((e) => e.to))];
  return [via.map((e) => [e.from, e.to]), middles.map((m) => [m, node])];
}

/**
 * Écoute le trajet des messages (canal privé réservé aux administrateurs) et
 * le rejoue sur le schéma : un point par arête parcourue, arrêté en rouge sur
 * le bloc où le message a été bloqué.
 */
export function useLiveTrace(edges: FlowEdge[], paths: LivePath[]) {
  const [dots, setDots] = useState<LiveDot[]>([]);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [outcome, setOutcome] = useState<LiveOutcome | null>(null);
  const edgesRef = useRef(edges);
  const pathsRef = useRef(new Map<string, LivePath>());

  useEffect(() => {
    edgesRef.current = edges;
    pathsRef.current = new Map(paths.map((p) => [p.key, p]));
  }, [edges, paths]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      queueMicrotask(() => setStatus("unavailable"));
      return;
    }
    const client = supabase;
    let cancelled = false;
    let channel: ReturnType<typeof client.channel> | null = null;
    const traces = new Map<string, Trace>();

    /** Point d'ancrage d'un bloc sans arête à parcourir (blocage dès l'entrée). */
    function anchor(node: string): [number, number] | null {
      for (const p of pathsRef.current.values()) {
        if (p.key.startsWith(`${node}->`)) return p.start;
        if (p.key.endsWith(`->${node}`)) return p.end;
      }
      return null;
    }

    function block(step: FlowStep, dots: LiveDot[]) {
      const at = dots[0]?.at ?? anchor(step.node);
      if (!at) return;
      const blocked: LiveDot = { id: `${step.trace}-${step.seq}-blocked`, node: step.node, d: "", at, blocked: step.reason ?? "erreur" };
      setDots((all) => [...all, blocked]);
      setTimeout(() => setDots((all) => all.filter((d) => d.id !== blocked.id)), BLOCKED_MS);
    }

    async function run(trace: Trace) {
      trace.running = true;
      while (trace.steps.length > 0 && !cancelled) {
        const step = trace.steps.shift()!;
        const stages = planHops(trace.cursor, step.node, edgesRef.current);
        let arrived: LiveDot[] = [];
        for (const stage of stages) {
          const moving = stage.flatMap(([from, to]): LiveDot[] => {
            const path = pathsRef.current.get(`${from}->${to}`);
            return path ? [{ id: `${step.trace}-${step.seq}-${from}-${to}`, node: to, d: path.d, at: path.end }] : [];
          });
          setDots((all) => [...all, ...moving]);
          await wait(HOP_MS);
          setDots((all) => all.filter((d) => !moving.includes(d)));
          arrived = moving;
        }
        if (step.ok) {
          trace.cursor = [step.node];
          if (step.node === "output") setOutcome({ ok: true, node: step.node });
        } else {
          // Le curseur reste en place : une API de secours repart du même bloc.
          block(step, arrived);
          setOutcome({ ok: false, node: step.node, reason: step.reason });
        }
      }
      trace.running = false;
    }

    function receive(step: FlowStep) {
      let trace = traces.get(step.trace);
      if (!trace) {
        trace = { steps: [], cursor: [], running: false };
        traces.set(step.trace, trace);
        setTimeout(() => traces.delete(step.trace), 5 * 60_000);
      }
      const index = trace.steps.findIndex((s) => s.seq > step.seq);
      trace.steps.splice(index === -1 ? trace.steps.length : index, 0, step);
      if (!trace.running) void run(trace);
    }

    void (async () => {
      // Jeton de la session : le canal privé vérifie le rôle administrateur.
      await client.realtime.setAuth();
      if (cancelled) return;
      channel = client
        .channel(FLOW_TOPIC, { config: { private: true } })
        .on("broadcast", { event: FLOW_EVENT }, ({ payload }) => receive(payload as FlowStep))
        .subscribe((state) => {
          if (state === "SUBSCRIBED") setStatus("live");
          else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") setStatus("unavailable");
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void client.removeChannel(channel);
    };
  }, []);

  return { dots, status, outcome };
}
