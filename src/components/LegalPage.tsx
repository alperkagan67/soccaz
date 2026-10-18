import type { ReactNode } from "react";

/** Rahmen für Rechtstexte. Der Hinweis bleibt, bis eine Rechtsprüfung die Texte freigegeben hat. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="space-y-4 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-sm [&_p]:text-muted [&_li]:text-sm [&_li]:text-muted">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="card !text-coral" role="note">
        Entwurf. Dieser Text wurde noch nicht rechtlich geprüft und gilt erst nach Freigabe durch den Betreiber.
      </p>
      {children}
    </article>
  );
}
