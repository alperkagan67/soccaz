import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { formatEuro, reservationFor, shareFor } from "@/lib/money";
import { priceFor } from "@/server/pricing";
import { minPaidPlayers } from "@/server/settings";

export const metadata: Metadata = { title: "Hilfe und Fragen" };

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="card group">
      <summary className="cursor-pointer font-semibold">{q}</summary>
      <div className="mt-2 space-y-2 text-sm text-muted">{children}</div>
    </details>
  );
}

export default async function HelpPage() {
  const [p60, p90, minPaid] = await Promise.all([priceFor(db, null, 60), priceFor(db, null, 90), minPaidPlayers()]);
  const e = (c: number | undefined) => (c === undefined ? "–" : formatEuro(c));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Hilfe und Fragen</h1>
        <p className="text-muted">Alles in einfachen Worten. Fehlt etwas? Schreib uns über die <Link href="/kontakt" className="text-green underline">Kontaktseite</Link>.</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Der Anfang</h2>
        <Q q="Was ist Socaz?">
          <p>Eine Plattform für Hallenfußball unter Hobbyspielern in NRW. Du gründest ein Team, wir helfen dir, einen Gegner mit passender Stärke zu finden, und danach zählen wir Tore, Siege und Rangliste.</p>
        </Q>
        <Q q="Wie fange ich an?">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Mit Google anmelden (kein Passwort).</li>
            <li>Stadt, Position und Geburtsdatum angeben. Du musst mindestens 16 sein.</li>
            <li>Ein Team gründen <strong>oder</strong> den Einladungslink eines Teams öffnen.</li>
          </ol>
        </Q>
        <Q q="Wie lade ich meine Mitspieler ein?">
          <p>Auf eurer Teamseite erstellst du als Team-Admin einen Einladungslink und schickst ihn per WhatsApp. Der Link gilt 7 Tage. Ist er in falsche Hände geraten, kannst du alle Links widerrufen.</p>
        </Q>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ein Spiel ausmachen</h2>
        <Q q="Wie finde ich einen Gegner?">
          <p><strong>Matchmaking:</strong> Du gibst Stadt, Dauer und bis zu drei Zeitfenster an. Wir suchen ein Team mit ähnlicher Spielstärke und gemeinsamer Zeit. Wartet ihr länger, darf der Unterschied größer werden.</p>
          <p><strong>Spielsuche:</strong> Du legst selbst ein Spiel mit festem Termin an. Andere Teams sehen es und nehmen es an. Oder du forderst ein bestimmtes Team direkt heraus.</p>
        </Q>
        <Q q="Wo sehe ich, wer gerade einen Gegner sucht?">
          <p>Unter „Spielsuchen“ (oben) und im Matchmaking steht die Liste aller offenen Suchen: Team, Stadt, Dauer, Elo und Spielstärke, Kadergröße, gesuchte Stärke des Gegners, Zeitfenster und Hinweis. Passt eine Suche, nimmst du sie mit einem Klick an. Ihr legt euch dann auf die Zeitfenster dieser Suche fest, danach folgt das Hallen-Veto.</p>
        </Q>
        <Q q="Wer legt Termin und Ort fest?">
          <p><strong>Hallen-Veto:</strong> Wie bei Counter-Strike oder FACEIT. Wir stellen bis zu 7 Hallen zur Wahl (zuerst aus eurer Stadt, dann die nächstgelegenen in NRW). Ein Münzwurf entscheidet, wer anfängt. Abwechselnd bannt jedes Team eine Halle, die es nicht spielen will. Die letzte übrige Halle wird gespielt. Pro Zug habt ihr 2 Stunden, danach bannt das System zufällig für euch.</p>
          <p><strong>Termin:</strong> Danach machen wir Vorschläge aus euren Zeitfenstern. Ihr könnt eigene hinzufügen. Stimmen beide Teams für denselben, steht das Spiel. Einigt ihr euch nicht rechtzeitig, wird es abgesagt.</p>
          <p className="text-xs">Die Hallenliste stammt zunächst aus OpenStreetMap und ist nicht geprüft: Ob eine Halle frei und buchbar ist und was sie kostet, bestätigt die Buchung. Fehlt eine Halle, schreib uns über die Kontaktseite.</p>
        </Q>
        <Q q="Was ist die Lobby?">
          <p>Die Seite zu eurem Spiel. Dort trägt sich jeder Spieler ein und klickt „Bereit“. Fünf Spieler pro Team plus ein Ersatz. Sind in beiden Teams genug Spieler bereit, ist das Spiel bestätigt. Klappt das nicht, sagen wir es 24 Stunden vorher automatisch ab.</p>
        </Q>
        <Q q="Was ist, wenn bei uns jemand fehlt?">
          <p>Ist die Lobby öffentlich, können sich fremde Spieler als Ersatz eintragen. Ein Team-Admin weist sie dem Team zu. Auf der Seite „Mitspieler gesucht“ tragen sich Spieler für einen Tag ein, die Lust auf ein Spiel haben.</p>
        </Q>
        <Q q="Wie wird das Ergebnis eingetragen?">
          <p>Ein Team-Admin erfasst Tore und Karten direkt am Spielfeldrand auf dem Handy. Der Admin des Gegners bestätigt das Ergebnis. Widerspricht er, entscheidet die Plattform. Kommt keine Antwort, gilt das Ergebnis nach 48 Stunden.</p>
        </Q>
      </section>

      <section className="space-y-2" id="geld">
        <h2 className="text-lg font-semibold">Geld und Guthaben</h2>
        <Q q="Was kostet das?">
          <p>Die Anmeldung und alle Funktionen sind kostenlos. Bezahlt wird nur die Halle: <strong>{e(p60?.priceCents)}</strong> für 60 Minuten, <strong>{e(p90?.priceCents)}</strong> für 90 Minuten. Der Preis wird durch alle zahlenden Spieler geteilt.</p>
        </Q>
        <Q q="Wie viel zahle ich genau?">
          <p>Dein Anteil ist der Hallenpreis geteilt durch die Zahl der zahlenden Spieler. Beim Bereitmachen reservieren wir den höchsten möglichen Betrag ({minPaid} Spieler{p60 ? `, bei 60 Minuten ${e(reservationFor(p60.priceCents, minPaid))}` : ""}). Nach der Frist rechnen wir ab. Je mehr mitspielen, desto weniger zahlt jeder. Bei 12 Spielern sind es {p60 ? e(shareFor(p60.priceCents, 12)) : "–"}. Zu viel Reserviertes kommt zurück aufs Guthaben.</p>
        </Q>
        <Q q="Wie lade ich Guthaben auf?">
          <p>Unter „Guthaben“ (oben in der Leiste oder in „Mein Bereich“) wählst du einen Betrag zwischen 5 und 200 Euro und bezahlst per Karte oder PayPal. Rabattcodes gibst du dort ein. Einen Beleg als PDF bekommst du automatisch.</p>
        </Q>
        <Q q="Wann bekomme ich mein Geld zurück?">
          <ul className="list-disc space-y-1 pl-5">
            <li>Bis 24 Stunden vor Anstoß abmelden: sofort zurück aufs Guthaben.</li>
            <li>Später abmelden: Du bekommst es zurück, sobald ein Ersatzspieler deinen Platz bezahlt hat.</li>
            <li>Spiel abgesagt oder zu wenige Spieler: alle bekommen alles zurück.</li>
          </ul>
        </Q>
        <Q q="Kann ich mir Guthaben auszahlen lassen?">
          <p>Dein Guthaben verfällt nicht. Eine Auszahlung auf dein Konto machen wir auf Anfrage über die <Link href="/kontakt" className="text-green underline">Kontaktseite</Link>.</p>
        </Q>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Spielstärke und Ranglisten</h2>
        <Q q="Was ist Elo?">
          <p>Eine Zahl für die Spielstärke. Gewinnst du gegen ein stärkeres Team, steigt sie stark, gegen ein schwächeres nur wenig. Neue Teams starten mit einem Wert aus ihrer Selbsteinschätzung (1 bis 5). Auch Spieler haben eine eigene Zahl.</p>
        </Q>
        <Q q="Was bedeuten die Abzeichen und „Spieler des Spiels“?">
          <p>Abzeichen gibt es für Meilensteine wie das erste Tor oder einen Hattrick. Nach dem Spiel stimmen die Mitspieler 24 Stunden lang ab, wer Spieler des Spiels war.</p>
        </Q>
        <Q q="Was ist die Zuverlässigkeit?">
          <p>Ein privater Wert aus Teilnahme, Nichterscheinen und späten Abmeldungen. Nur du, deine Team-Admins und die Plattform sehen ihn.</p>
        </Q>
        <Q q="Was sind Ligen, Turniere und der Profi-Tag?">
          <p><strong>Ligen:</strong> Alle Spiele zwischen den Teams einer Liga zählen automatisch für die Tabelle. <strong>Turniere:</strong> von Veranstaltern, mit Startgeld, im Liga-, K.-o.- oder Gruppenmodus. <strong>Profi-Tag:</strong> Ein Profi-Team spielt gegen ausgeloste Amateur-Teams. <strong>Stadt-Challenge:</strong> Welche Stadt gewinnt im Monat mehr Spiele gegen andere Städte?</p>
        </Q>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Konto und Daten</h2>
        <Q q="Wer sieht mein Profil?">
          <p>Standardmäßig ist es öffentlich (Name, Stadt, Position, Statistik, Teams). In den Einstellungen kannst du es auf privat stellen. Dein Geburtsdatum und deine E-Mail sieht niemand.</p>
        </Q>
        <Q q="Wie lösche ich mein Konto?">
          <p>In den Einstellungen unter „Deine Daten“. Vorher muss dein Guthaben auf null sein, du darfst in keinem kommenden Spiel stehen und kein Team allein verwalten. Dort kannst du auch alle deine Daten herunterladen.</p>
        </Q>
        <Q q="Es funktioniert etwas nicht. Wen frage ich?">
          <p>Schreib uns über die <Link href="/kontakt" className="text-green underline">Kontaktseite</Link>.</p>
        </Q>
      </section>
    </div>
  );
}
