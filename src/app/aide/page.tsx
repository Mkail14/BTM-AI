import type { Metadata } from "next";
import Link from "next/link";
import { SimplePage } from "@/components/layout/SimplePage";
import { FAQ } from "@/lib/help/faq";

export const metadata: Metadata = { title: "Aide" };

export default function HelpPage() {
  return (
    <SimplePage title="Obtenir de l'aide">
      <div className="space-y-6">
        <p className="text-fg-muted">Les réponses aux questions les plus fréquentes. Clique sur une question pour la déplier. Pas de réponse ? Le rond d&apos;aide, en bas de l&apos;écran, te met en lien avec l&apos;assistant d&apos;aide ou l&apos;équipe.</p>
        {FAQ.map((topic) => (
          <section key={topic.title}>
            <h2 className="px-1 text-xs font-medium tracking-wide text-fg-muted uppercase">{topic.title}</h2>
            <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg">
              {topic.questions.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium hover:bg-bg-muted [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span aria-hidden="true" className="text-fg-muted transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="px-5 pb-4 text-sm leading-relaxed text-fg-muted">
                    {item.a}
                    {item.link ? (
                      <Link href={item.link.href} className="mt-2 block font-medium text-accent hover:underline">
                        {item.link.label} →
                      </Link>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </SimplePage>
  );
}
