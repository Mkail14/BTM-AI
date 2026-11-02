"use client";

import { useState, useTransition } from "react";
import { IconSend } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import { sendSampleAction } from "./actions";

type Sample = { id: string; label: string; when: string; subject: string; html: string };

/** Liste des modèles à gauche, rendu réel à droite (dans un cadre isolé, comme dans une messagerie). */
export function EmailPreview({
  samples,
  from,
  smtpReady,
  hookReady,
}: {
  samples: Sample[];
  from: string;
  smtpReady: boolean;
  hookReady: boolean;
}) {
  const [activeId, setActiveId] = useState(samples[0]?.id);
  const [phone, setPhone] = useState(false);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [sending, startSending] = useTransition();
  const active = samples.find((s) => s.id === activeId) ?? samples[0];

  function sendTest() {
    setStatus(null);
    startSending(async () => setStatus(await sendSampleAction(active.id)));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-3 lg:w-80">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">E-mails</h1>
          <p className="text-sm text-fg-muted">
            Envoyés depuis <span className="font-medium text-fg">{from}</span>, aux couleurs du site.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
          {samples.map((s) => {
            const selected = s.id === active.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(s.id);
                    setStatus(null);
                  }}
                  aria-current={selected ? "true" : undefined}
                  className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                    selected ? "bg-bg shadow-sm ring-1 ring-border" : "hover:bg-bg-muted"
                  }`}
                >
                  <span className={`block text-sm font-medium ${selected ? "text-accent" : ""}`}>{s.label}</span>
                  <span className="hidden text-xs text-fg-muted sm:block">{s.when}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="hidden space-y-1.5 rounded-xl border border-border bg-bg p-3 text-xs lg:block">
          <Check ok={smtpReady} label="Boîte contact@btm.yt connectée" hint="SMTP_PASSWORD sur Vercel" />
          <Check ok={hookReady} label="E-mails de Supabase redirigés" hint="SEND_EMAIL_HOOK_SECRET + hook activé" />
        </div>
      </aside>

      <section aria-label="Aperçu" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-bg">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{active.subject}</p>
            <p className="truncate text-xs text-fg-muted">De : BTM AI &lt;{from}&gt;</p>
          </div>
          <div role="group" aria-label="Largeur d'aperçu" className="flex rounded-full bg-bg-muted p-1 text-xs font-medium">
            {[
              { value: false, label: "Ordinateur" },
              { value: true, label: "Téléphone" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setPhone(option.value)}
                aria-pressed={phone === option.value}
                className={`rounded-full px-3 py-1.5 ${phone === option.value ? "bg-bg text-fg shadow-sm" : "text-fg-muted"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={sendTest}
            disabled={sending}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
          >
            <IconSend width={15} height={15} />
            {sending ? "Envoi…" : "M'envoyer un exemple"}
          </button>
          {status ? (
            <p role={status.ok ? "status" : "alert"} className={`w-full text-xs ${status.ok ? "text-success" : "text-danger"}`}>
              {status.message}
            </p>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-hidden bg-[#F5EAD9] p-0 sm:p-4">
          <iframe
            key={active.id}
            title={`Aperçu : ${active.label}`}
            srcDoc={active.html}
            sandbox="allow-popups"
            className={`mx-auto block h-full w-full border-0 bg-[#F5EAD9] transition-[max-width] ${phone ? "max-w-[390px] rounded-2xl shadow-xl" : "max-w-none"}`}
          />
        </div>
      </section>
    </div>
  );
}

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <p className="flex items-start gap-2">
      <span aria-hidden="true" className={`mt-1 size-2 shrink-0 rounded-full ${ok ? "bg-success" : "bg-warning"}`} />
      <span>
        <span className="font-medium">{label}</span>
        {ok ? null : <span className="block text-fg-muted">À faire : {hint}</span>}
      </span>
    </p>
  );
}
