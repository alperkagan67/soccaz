import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { operator } from "@/lib/legal";

export const metadata: Metadata = { title: "Datenschutz" };

export default async function DatenschutzPage() {
  await connection();
  const op = operator();
  return (
    <LegalPage title="Datenschutzerklärung">
      <section className="space-y-1">
        <h2>Verantwortlicher</h2>
        <p>{op.complete ? `${op.name}, ${op.address?.replace(/\n/g, ", ")}, ${op.email}` : "Die Betreiberangaben werden vor dem Start eingetragen."}</p>
      </section>
      <section className="space-y-1">
        <h2>Welche Daten wir verarbeiten</h2>
        <ul>
          <li>Konto: Name und E-Mail-Adresse aus der Google-Anmeldung, Stadt, Position, Geburtsdatum (nur zur Altersprüfung, nicht öffentlich).</li>
          <li>Spielbetrieb: Teams, Mitgliedschaften, Lobbys, Ergebnisse, Tore, Karten, Statistiken, Abzeichen und Bewertungen.</li>
          <li>Zahlungen: Guthaben, Buchungen, Belege. Zahlungsdaten (z. B. Kartennummern) verarbeitet ausschließlich der Zahlungsdienstleister Stripe, nicht wir.</li>
          <li>Technik: Sitzungs-Cookie für die Anmeldung, Server-Protokolle, Fehlerberichte (ohne Inhalte), bei Zustimmung Web-Push-Kennungen.</li>
        </ul>
      </section>
      <section className="space-y-1">
        <h2>Wofür und auf welcher Grundlage</h2>
        <p>Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO): Konto, Teams, Spiele, Zahlungen. Berechtigtes Interesse (lit. f): Sicherheit, Missbrauchsschutz, Fehlerbehebung. Einwilligung (lit. a): Push-Mitteilungen, E-Mail-Benachrichtigungen über das Nötige hinaus. Gesetzliche Pflicht (lit. c): Aufbewahrung von Belegen.</p>
      </section>
      <section className="space-y-1">
        <h2>Was öffentlich sichtbar ist</h2>
        <p>Dein Profil (Name, Stadt, Position, Statistik, Abzeichen, Teams, Ergebnisse) ist standardmäßig öffentlich. Du kannst es in den Einstellungen auf privat stellen. Deine Zuverlässigkeit sehen nur du, deine Team-Admins und die Plattform. Dein Geburtsdatum und deine E-Mail-Adresse sind nie öffentlich.</p>
      </section>
      <section className="space-y-1">
        <h2>Empfänger</h2>
        <p>Hosting-Anbieter, Google (Anmeldung), Stripe (Zahlungen), ein E-Mail-Dienst, ein Fehlerüberwachungsdienst. Mit allen Dienstleistern besteht oder wird ein Auftragsverarbeitungsvertrag geschlossen. Eine Weitergabe an Dritte zu Werbezwecken findet nicht statt.</p>
      </section>
      <section className="space-y-1">
        <h2>Eingebettete Streams</h2>
        <p>Bei manchen Spielen kann ein Live-Stream von Twitch, YouTube oder Kick eingebettet sein. Der Player wird erst nach deinem Klick geladen. Dabei werden Daten wie deine IP-Adresse an den jeweiligen Anbieter übertragen; dessen Datenschutzerklärung gilt.</p>
      </section>
      <section className="space-y-1">
        <h2>Speicherdauer</h2>
        <p>Solange das Konto besteht. Belege und Buchungen bewahren wir bis zu zehn Jahre auf, weil das Gesetz es verlangt. Beim Löschen des Kontos werden Name, E-Mail und Profilangaben entfernt; Spiele, Ergebnisse und Buchungen bleiben ohne Personenbezug erhalten.</p>
      </section>
      <section className="space-y-1">
        <h2>Deine Rechte</h2>
        <p>
          Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. Deine Daten kannst du jederzeit in den{" "}
          <Link href="/app/einstellungen" className="text-green underline">Einstellungen</Link> herunterladen oder dein Konto löschen. Du kannst dich außerdem bei einer Datenschutzaufsichtsbehörde beschweren.
        </p>
      </section>
    </LegalPage>
  );
}
