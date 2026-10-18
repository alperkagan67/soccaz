import type { Metadata } from "next";
import { connection } from "next/server";
import { LegalPage } from "@/components/LegalPage";
import { operator } from "@/lib/legal";

export const metadata: Metadata = { title: "Impressum" };

export default async function ImpressumPage() {
  await connection();
  const op = operator();
  return (
    <LegalPage title="Impressum">
      <section className="space-y-1">
        <h2>Angaben gemäß § 5 DDG</h2>
        {op.complete ? (
          <>
            <p>{op.name}</p>
            <p className="whitespace-pre-line">{op.address}</p>
            <p>E-Mail: {op.email}</p>
          </>
        ) : (
          <p className="!text-coral">Die Betreiberangaben fehlen noch. Sie werden über OPERATOR_NAME, OPERATOR_ADDRESS und OPERATOR_EMAIL eingetragen.</p>
        )}
      </section>
      <section className="space-y-1">
        <h2>Verantwortlich für den Inhalt</h2>
        <p>Die oben genannte Person bzw. Stelle. Inhalte von Nutzern geben nicht die Meinung des Betreibers wieder.</p>
      </section>
      <section className="space-y-1">
        <h2>Streitbeilegung</h2>
        <p>Der Betreiber ist weder bereit noch verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      </section>
    </LegalPage>
  );
}
