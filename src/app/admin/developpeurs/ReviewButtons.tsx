"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionStatus, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import type { ActionResult } from "@/server/middlewares/admin-auth";
import type { DeveloperStatus } from "@/server/services/developers/accounts";
import { lostOk } from "@/lib/safe-action";
import { messageDeveloperAction, reviewDeveloperAction } from "./actions";

/** Écrire au développeur (e-mail), le suspendre (motif envoyé par e-mail) ou rétablir son accès. */
export function ReviewButtons({ userId, status }: { userId: string; status: DeveloperStatus }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [writing, setWriting] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const suspend = status === "approved";

  const decide = () => {
    if (suspend && !window.confirm("Suspendre ce développeur ? Ses widgets et codes cesseront de répondre, et il recevra un e-mail.")) return;
    startTransition(async () => {
      const response = await reviewDeveloperAction({ userId, decision: suspend ? "suspended" : "approved", note }).catch(lostOk);
      setResult(response);
      if (response.ok) {
        setNote("");
        router.refresh();
      }
    });
  };

  const send = () =>
    startTransition(async () => {
      const response = await messageDeveloperAction({ userId, subject, body }).catch(lostOk);
      setResult(response);
      if (response.ok) {
        setSubject("");
        setBody("");
        setWriting(false);
      }
    });

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
      {writing ? (
        <div className="flex flex-col gap-2">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={120}
            placeholder="Objet"
            aria-label="Objet du message"
            className={inputClass}
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={4000}
            rows={5}
            placeholder="Votre message au développeur (il pourra répondre à contact@btm.yt)"
            aria-label="Message"
            className={inputClass}
          />
          <div className="flex gap-2">
            <button type="button" disabled={pending || !subject.trim() || !body.trim()} onClick={send} className={primaryButton}>
              Envoyer l&apos;e-mail
            </button>
            <button type="button" onClick={() => setWriting(false)} className={secondaryButton}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setWriting(true)} className={`${secondaryButton} self-start`}>
          Écrire au développeur
        </button>
      )}

      <div className="flex flex-col gap-2">
        {suspend ? (
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="Motif de la suspension (envoyé au développeur par e-mail)"
            aria-label="Motif"
            className={inputClass}
          />
        ) : null}
        <button type="button" disabled={pending} onClick={decide} className={`self-start ${suspend ? `${secondaryButton} text-danger` : primaryButton}`}>
          {suspend ? "Suspendre" : "Rétablir l'accès"}
        </button>
      </div>
      <ActionStatus result={result} />
    </div>
  );
}
