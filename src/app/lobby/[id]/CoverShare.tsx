"use client";

// "Anteil übernehmen" in der Lobby (Vertrag 012, M3c-3b): Knopf neben einem roten Platz (nur für berechtigte Mitspieler, die der SERVER bestimmt), Dialog mit Betrag, klarem Text und
// Zustimmung zum Mandatszusatz (ConfirmDialog mit consent, M2-3b) und "Zurücknehmen" bis zur Frist. Der Übernehmer kommt immer aus der Sitzung (Server-Aktion), nie vom Client;
// die Einwilligung erzwingt der Server noch einmal (takeOverShare). Eigene Datei, damit der Look-Umbau der Lobby (M3-3) die Seite ohne Konflikte anfassen kann.
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { coverConsequence, coverDialogBody, type CoverAmounts } from "@/lib/cover-text";
import { releaseCoverAction, takeOverShareAction } from "@/server/actions";

// Backlog 72: Nach erfolgreicher Übernahme verschwindet der Auslöser, die neue Statuskarte erscheint erst nach dem Neuladen der Seite durch die Server-Aktion. Der Fokus soll dann
// auf der Karte liegen (nicht verloren auf der Seite): der Knopf merkt sich den Erfolg, die Karte nimmt beim Erscheinen den Fokus. Nur wenn die Übernahme gerade hier erfolgt ist
// (ein Neuladen oder ein anderer Betrachter nimmt dem Nutzer den Fokus nie weg).
let focusCoveringCard = false;

/** Die Statuskarte "Du übernimmst den Anteil von …": Sprungziel mit tabIndex -1, bekommt nach einer Übernahme in dieser Sitzung den Fokus. */
export function CoverCoveringCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusCoveringCard) {
      focusCoveringCard = false;
      ref.current?.focus();
    }
  }, []);
  return (
    <div ref={ref} tabIndex={-1} className="space-y-2 outline-none" data-testid="cover-covering">
      {children}
    </div>
  );
}

export function CoverButton({ matchId, targetUserId, targetName, amounts, mandateText }: { matchId: string; targetUserId: string; targetName: string; amounts: CoverAmounts | null; mandateText: string }) {
  return (
    <ConfirmDialog
      trigger={{ label: "Anteil übernehmen", variant: "secondary", size: "sm" }}
      title={`Anteil von ${targetName} übernehmen?`}
      body={coverDialogBody(targetName)}
      consequence={amounts ? coverConsequence(targetName, amounts) : undefined}
      confirmLabel="Anteil übernehmen"
      consent={{ label: mandateText }}
      onConfirmAction={async ({ consent }) => {
        const result = await takeOverShareAction(matchId, targetUserId, consent);
        if (!result?.error) focusCoveringCard = true; // die Statuskarte erscheint gleich und übernimmt den Fokus
        return result ?? { ok: true };
      }}
    />
  );
}

/** "Zurücknehmen" (nur vor der Frist; der Server prüft es noch einmal). A fällt dann wieder auf rot. */
export function ReleaseCover({ matchId }: { matchId: string }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        size="sm"
        pending={pending}
        onClick={() => {
          setError(undefined);
          start(async () => {
            const result = await releaseCoverAction(matchId);
            if (result?.error) setError(result.error);
          });
        }}
        data-testid="cover-release"
      >
        Zurücknehmen
      </Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
