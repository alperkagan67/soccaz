import type { Metadata } from "next";
import { connection } from "next/server";
import { LegalPage } from "@/components/LegalPage";
import { Feld, Platzhalter } from "@/components/LegalPlatzhalter";
import { operatorFelder, PLATZHALTER } from "@/lib/legal";

export const metadata: Metadata = { title: "Impressum" };

export default async function ImpressumPage() {
  await connection();
  const op = operatorFelder();
  return (
    <LegalPage title="Impressum">
      <section className="space-y-1">
        <h2>Angaben gemäß § 5 DDG</h2>
        <p><Feld {...op.name} /></p>
        <p className="whitespace-pre-line"><Feld {...op.address} /></p>
        <p>E-Mail: <Feld {...op.email} /></p>
        <p>Umsatzsteuer-Identifikationsnummer: <Platzhalter>{PLATZHALTER.steuerId}</Platzhalter></p>
        {!op.complete && (
          <p className="!text-ink" data-testid="platzhalter-hinweis">
            Hinweis für den Betreiber: Die markierten Platzhalter in eckigen Klammern verschwinden, sobald OPERATOR_NAME, OPERATOR_ADDRESS und OPERATOR_EMAIL gesetzt sind. Alle anderen Platzhalter ersetzt der Betreiber nach Rechtsprüfung.
          </p>
        )}
      </section>
      <section className="space-y-1">
        <h2>Verantwortlich für den Inhalt</h2>
        <p>Die oben genannte Person bzw. Stelle. Inhalte von Nutzern geben nicht die Meinung des Betreibers wieder.</p>
      </section>
      <section className="space-y-1">
        <h2>Streitbeilegung</h2>
        <p><Platzhalter>{PLATZHALTER.streit}</Platzhalter></p>
      </section>
    </LegalPage>
  );
}
