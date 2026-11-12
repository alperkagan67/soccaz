"use client";

// Showcase für ConfirmDialog (Vertrag 013 M2-3b). Eigene Datei, damit die Showcase-Seite nur eine Einbindung ändert.
// Die Aktionen sind Client-Funktionen ohne Datenbank: "Lobby verlassen" scheitert absichtlich, damit der Fehler im Dialog zu sehen ist.
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ActionState } from "@/lib/validation";

const wait = () => new Promise((r) => setTimeout(r, 200));

export function ConfirmShowcase() {
  const [result, setResult] = useState("noch nichts bestätigt");
  const done = (what: string) => async (): Promise<ActionState> => {
    await wait();
    setResult(what);
    return { ok: true };
  };
  return (
    <section className="space-y-3" aria-labelledby="cfm" data-testid="confirm-demo">
      <h2 id="cfm" className="text-lg font-semibold">ConfirmDialog</h2>
      <div className="flex flex-wrap items-center gap-3">
        <ConfirmDialog
          danger
          trigger={{ label: "Spieler entfernen" }}
          title="Spieler entfernen?"
          body="Alex wird aus der Lobby genommen und bekommt eine Nachricht."
          confirmLabel="Spieler entfernen"
          onConfirmAction={done("Spieler entfernt")}
        />
        <ConfirmDialog
          trigger={{ label: "Preis bestätigen", variant: "primary" }}
          title="Preis bestätigen?"
          body="Danach steht der Anteil je Spieler fest."
          consequence="12,00 € pro Spieler werden abgebucht."
          confirmLabel="Preis bestätigen"
          onConfirmAction={done("Preis steht fest")}
        />
        <ConfirmDialog
          trigger={{ label: "Anteil übernehmen" }}
          title="Anteil von Alex übernehmen?"
          body="Du wirst zur Frist zusätzlich belastet, nicht sofort."
          consequence="Dein Anteil 6,00 € und der Anteil von Alex 6,00 €, zusammen 12,00 €."
          confirmLabel="Anteil übernehmen"
          consent={{ label: "Ich stimme zu." }} // bewusst kurz (eine Zeile auf 390 px): die Zeilenhöhe kommt vom Tippziel, nicht vom Text
          onConfirmAction={async ({ consent }) => {
            await wait();
            setResult(`Anteil übernommen (Zustimmung: ${consent ? "ja" : "nein"})`);
            return { ok: true };
          }}
        />
        <ConfirmDialog
          danger
          trigger={{ label: "Konto löschen" }}
          title="Konto löschen?"
          body="Alle deine Daten werden dauerhaft gelöscht."
          confirmLabel="Konto löschen"
          confirmText="LÖSCHEN"
          onConfirmAction={done("Konto gelöscht")}
        />
        <ConfirmDialog
          trigger={{ label: "Lobby verlassen" }}
          title="Lobby verlassen?"
          body="Dein Platz wird frei."
          confirmLabel="Lobby verlassen"
          onConfirmAction={async () => {
            await wait();
            return { error: "Verlassen ist jetzt nicht mehr möglich: Die Abbuchung hat begonnen." };
          }}
        />
      </div>
      <p className="text-sm" role="status" data-testid="confirm-result">Ergebnis: {result}</p>
    </section>
  );
}
