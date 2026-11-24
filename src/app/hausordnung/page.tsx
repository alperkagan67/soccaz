import type { Metadata } from "next";
import { connection } from "next/server";
import { LegalPage } from "@/components/LegalPage";
import { zahlungenAus } from "@/server/zahlungen-aus";

export const metadata: Metadata = { title: "Hausordnung" };

export default async function HausordnungPage() {
  await connection();
  const aus = await zahlungenAus(); // Zahlungen AUS: keine Aussage zu offenen Zahlungen
  return (
    <LegalPage title="Hausordnung">
      <section className="space-y-1">
        <h2>Fair bleiben</h2>
        <ul>
          <li>Kein Spieler wird beleidigt, bedroht oder diskriminiert – weder in der Halle noch in Kommentaren oder Bewertungen.</li>
          <li>Ergebnisse werden ehrlich gemeldet. Wer Ergebnisse fälscht, wird gesperrt.</li>
          <li>Wer zusagt, kommt – oder meldet sich rechtzeitig ab. Wiederholtes Fehlen wirkt sich auf die Zuverlässigkeit aus.</li>
        </ul>
      </section>
      <section className="space-y-1">
        <h2>Inhalte melden</h2>
        <p>Jeden Kommentar und jede Bewertung kannst du melden. Inhalte, die von mehreren Personen gemeldet werden, blenden wir vorläufig aus, bis ein Moderator sie geprüft hat.</p>
      </section>
      <section className="space-y-1">
        <h2>Folgen</h2>
        <p>Verwarnung, Entfernen von Inhalten, zeitweise oder dauerhafte Sperre. Bei einer Sperre werden offene {aus ? "" : "Zahlungen und "}Reservierungen ordnungsgemäß abgewickelt.</p>
      </section>
    </LegalPage>
  );
}
