import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "AGB" };

export default function AgbPage() {
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen">
      <section className="space-y-1">
        <h2>1. Leistung</h2>
        <p>Socaz vermittelt Hallenfußball-Spiele zwischen Teams, stellt Lobby, Ergebniserfassung, Statistiken und Ranglisten bereit und wickelt auf Wunsch die Bezahlung der Hallenmiete ab. Socaz ist nicht Veranstalter der Spiele und haftet nicht für Verletzungen oder Sachschäden beim Spielen.</p>
      </section>
      <section className="space-y-1">
        <h2>2. Konto</h2>
        <p>Die Nutzung setzt ein Konto voraus. Nutzer müssen mindestens 16 Jahre alt sein. Angaben müssen wahrheitsgemäß sein. Jede Person darf nur ein Konto führen.</p>
      </section>
      <section className="space-y-1">
        <h2>3. Preise und Zahlung</h2>
        <p>Jeder Spieler zahlt seinen Anteil an der Hallenmiete selbst. Der Anteil ergibt sich aus dem Hallenpreis geteilt durch die Zahl der zahlenden Spieler. Er wird beim Beitritt reserviert und nach dem Spiel endgültig abgerechnet; ein zu viel reservierter Betrag wird gutgeschrieben. Guthaben wird als Gutschrift geführt und kann ausschließlich für Spiele verwendet werden. Alle Preise sind Bruttopreise.</p>
      </section>
      <section className="space-y-1">
        <h2>4. Absage und Erstattung</h2>
        <p>Bis 24 Stunden vor Anstoß kann man sich kostenlos abmelden; der Betrag wird sofort gutgeschrieben. Danach wird der Anteil erst erstattet, sobald ein Ersatzspieler den Platz bezahlt hat. Sagt ein Team das Spiel ab oder kommt die Mindestzahl an Spielern nicht zusammen, wird allen Spielern der volle Betrag erstattet. Gesetzliche Rechte bleiben unberührt.</p>
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
