import Link from "next/link";
import { KOMMT_BALD_TEXT } from "@/lib/turnier-only";

/** Ruhige Seite für gesperrte Bereiche (TURNIER_ONLY): Status 200, kein 404, nicht für Suchmaschinen; eine Aktion: zu den Turnieren. */
export function KommtBald() {
  return (
    <section className="mx-auto max-w-md space-y-4 py-10 text-center" data-testid="kommt-bald">
      <meta name="robots" content="noindex, nofollow" />
      <h1 className="text-3xl font-bold">Kommt bald</h1>
      <p className="text-muted">{KOMMT_BALD_TEXT}</p>
      <Link href="/turniere" className="btn btn-primary">Zu den Turnieren</Link>
    </section>
  );
}
