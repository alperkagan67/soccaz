import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { operator } from "@/lib/legal";

export const metadata: Metadata = { title: "Kontakt" };

export default async function ContactPage() {
  await connection();
  const op = operator();
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Kontakt</h1>
      <p className="text-muted">Fragen, Probleme oder Wünsche? Wir antworten so schnell wir können.</p>
      <section className="card space-y-2">
        <h2 className="font-semibold">E-Mail</h2>
        {op.email ? (
          <p>
            <a href={`mailto:${op.email}`} className="text-green underline">{op.email}</a>
          </p>
        ) : (
          <p className="text-coral">Die Kontaktadresse wird noch eingetragen (Einstellung OPERATOR_EMAIL).</p>
        )}
      </section>
      <section className="card space-y-1 text-sm text-muted">
        <h2 className="font-semibold text-ink">Dafür kannst du uns schreiben</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Auszahlung deines Guthabens</li>
          <li>Ein gesperrtes Konto oder eine Verwarnung, die du für einen Fehler hältst</li>
          <li>Ein strittiges Ergebnis, das du nicht über das Spiel klären konntest</li>
          <li>Turnier-Veranstalter werden oder dein Team als Profi-Team verifizieren lassen</li>
          <li>Sponsoring und Trikot-Partnerschaften</li>
        </ul>
        <p className="pt-2">Antworten auf häufige Fragen findest du unter <Link href="/hilfe" className="text-green underline">Hilfe und Fragen</Link>.</p>
      </section>
    </div>
  );
}
