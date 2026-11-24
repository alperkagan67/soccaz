import type { Metadata } from "next";
import { connection } from "next/server";
import { LegalPage } from "@/components/LegalPage";
import { Platzhalter } from "@/components/LegalPlatzhalter";
import { ZAHLUNGEN_AUS_HINWEIS } from "@/lib/zahlungen-aus";
import { zahlungenAus } from "@/server/zahlungen-aus";

export const metadata: Metadata = { title: "AGB" };

export default async function AgbPage() {
  await connection();
  const aus = await zahlungenAus(); // Zahlungen AUS (Go-live): keine Zahlungs- und Erstattungsaussagen, nur der Hinweissatz (als ENTWURF markiert, bis der Nutzer ihn bestätigt)
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen">
      <section className="space-y-1">
        <h2>1. Leistung</h2>
        <p>Socaz vermittelt Hallenfußball-Spiele zwischen Teams, stellt Lobby, Ergebniserfassung, Statistiken und Ranglisten bereit{aus ? "" : " und wickelt auf Wunsch die Bezahlung der Hallenmiete ab"}. Socaz ist nicht Veranstalter der Spiele und haftet nicht für Verletzungen oder Sachschäden beim Spielen.</p>
      </section>
      <section className="space-y-1">
        <h2>2. Konto</h2>
        <p>Die Nutzung setzt ein Konto voraus. Nutzer müssen mindestens 16 Jahre alt sein. Angaben müssen wahrheitsgemäß sein. Jede Person darf nur ein Konto führen.</p>
      </section>
      <section className="space-y-1">
        {aus ? (
          <>
            <h2>3. Teilnahmegebühr</h2>
            <p>
              <Platzhalter>[ENTWURF, vom Betreiber zu bestätigen: Die Nutzung von Soccaz ist kostenlos.]</Platzhalter> {ZAHLUNGEN_AUS_HINWEIS}
            </p>
          </>
        ) : (
          <>
            <h2>3. Preise und Zahlung</h2>
            <p>Jeder Spieler zahlt seinen Anteil an der Hallenmiete selbst. Der Anteil ergibt sich aus dem Hallenpreis geteilt durch die Zahl der zahlenden Spieler. Er wird zur Frist abgerechnet. Alle Preise sind Bruttopreise.</p>
          </>
        )}
      </section>
      <section className="space-y-1">
        {aus ? (
          <>
            <h2>4. Absage und Abmeldung</h2>
            <p>Bis 24 Stunden vor Anstoß kann man sich abmelden. Sagt ein Team das Spiel ab oder kommt die Mindestzahl an Spielern nicht zusammen, findet das Spiel nicht statt. Gesetzliche Rechte bleiben unberührt.</p>
          </>
        ) : (
          <>
            <h2>4. Absage und Erstattung</h2>
            <p>Bis 24 Stunden vor Anstoß kann man sich kostenlos abmelden; es wird dann nichts berechnet. Sagt ein Team das Spiel ab oder kommt die Mindestzahl an Spielern nicht zusammen, wird ein bereits gezahlter Betrag vollständig erstattet. Gesetzliche Rechte bleiben unberührt.</p>
          </>
        )}
      </section>
      <section className="space-y-1">
        <h2>5. Regeln für Inhalte</h2>
        <p>Beleidigungen, Hetze, Werbung und rechtswidrige Inhalte sind verboten. Socaz darf Inhalte entfernen und Konten sperren; siehe Hausordnung.</p>
      </section>
      <section className="space-y-1">
        <h2>6. Haftung</h2>
        <p>Socaz haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper und Gesundheit. Bei leichter Fahrlässigkeit nur für die Verletzung wesentlicher Vertragspflichten und begrenzt auf den vorhersehbaren, typischen Schaden.</p>
      </section>
    </LegalPage>
  );
}
