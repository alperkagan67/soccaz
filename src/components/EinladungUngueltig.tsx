import Link from "next/link";
import { TOKEN_UNGUELTIG_HINWEIS, TOKEN_UNGUELTIG_TEXT } from "@/lib/turnier-token";

/** Neutrale Seite für jedes Turnier, das der Betrachter nicht sehen darf (unbekannt, privat ohne gültigen Token): immer dieselbe Antwort, kein Turnierinhalt, kein Token in Links. */
export function EinladungUngueltig() {
  return (
    <section className="mx-auto mt-8 max-w-sm space-y-3 text-center" data-testid="einladung-ungueltig">
      <h1 className="text-2xl font-bold">Link ungültig</h1>
      <p className="text-muted">{TOKEN_UNGUELTIG_TEXT}</p>
      <p className="text-sm text-muted">{TOKEN_UNGUELTIG_HINWEIS}</p>
      <Link href="/turniere" className="btn btn-ghost">Zu den Turnieren</Link>
    </section>
  );
}
