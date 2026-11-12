"use client";

// "Anteil übernehmen" in der Lobby (Vertrag 012, M3c-3b): Knopf neben einem roten Platz (nur für berechtigte Mitspieler, die der SERVER bestimmt), Dialog mit Betrag, klarem Text und
// Zustimmung zum Mandatszusatz (ConfirmDialog mit consent, M2-3b) und "Zurücknehmen" bis zur Frist. Der Übernehmer kommt immer aus der Sitzung (Server-Aktion), nie vom Client;
// die Einwilligung erzwingt der Server noch einmal (takeOverShare). Eigene Datei, damit der Look-Umbau der Lobby (M3-3) die Seite ohne Konflikte anfassen kann.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { coverConsequence, coverDialogBody, type CoverAmounts } from "@/lib/cover-text";
import { releaseCoverAction, takeOverShareAction } from "@/server/actions";

export function CoverButton({ matchId, targetUserId, targetName, amounts, mandateText }: { matchId: string; targetUserId: string; targetName: string; amounts: CoverAmounts | null; mandateText: string }) {
  return (
    <ConfirmDialog
      trigger={{ label: "Anteil übernehmen", variant: "secondary", size: "sm" }}
      title={`Anteil von ${targetName} übernehmen?`}
      body={coverDialogBody(targetName)}
      consequence={amounts ? coverConsequence(targetName, amounts) : undefined}
      confirmLabel="Anteil übernehmen"
      consent={{ label: mandateText }}
      onConfirmAction={async ({ consent }) => (await takeOverShareAction(matchId, targetUserId, consent)) ?? { ok: true }}
    />
  );
}

/** "Zurücknehmen" (nur vor der Frist; der Server prüft es noch einmal). A fällt dann wieder auf rot. */
export function ReleaseCover({ matchId, targetUserId }: { matchId: string; targetUserId: string }) {
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
            const result = await releaseCoverAction(matchId, targetUserId);
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
