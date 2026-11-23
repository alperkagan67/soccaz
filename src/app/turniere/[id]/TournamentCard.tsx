"use client";

// Turnier im Kartenmodell (Vertrag 012, M5-3): eigene Karte hinterlegen und "Anteil übernehmen" im eigenen Team. Es wird nichts bezahlt; abgebucht wird zur Frist (M5-4).
// Der Übernehmer kommt immer aus der Sitzung (Server-Aktion), nie vom Client; die Zustimmung erzwingt der Server noch einmal.
import { useState, useTransition } from "react";
import { AuthorizeButton } from "@/app/lobby/[id]/AuthorizeButton";
import { CardForm } from "@/app/lobby/[id]/CardForm";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { coverConsequence, coverDialogBody, type CoverAmounts } from "@/lib/cover-text";
import { fakeTournamentCardAction } from "@/server/payments/fake-card-actions";
import { releaseTournamentCoverAction, takeOverTournamentShareAction } from "@/server/tournament-actions";
import { ZP } from "@/lib/zahlungspflicht-texte";

export type TeamSeat = { userId: string; name: string; hasCard: boolean; covered: boolean };

export function TournamentCard({
  tournamentId,
  hasOwnCard,
  mandateText,
  coverMandateText,
  fake,
  teammates,
  coveringName,
  canCover,
  needsAuthorization = false,
  coverAmounts = null,
}: {
  tournamentId: string;
  hasOwnCard: boolean;
  mandateText: string;
  coverMandateText: string;
  fake: boolean;
  teammates: TeamSeat[];
  coveringName: string | null;
  canCover: boolean;
  needsAuthorization?: boolean;
  /** Betrag für den Dialog "Anteil übernehmen": nur wenn der Preis feststeht (dieselbe Rechnung wie die Abbuchung); sonst ohne Betrag. */
  coverAmounts?: CoverAmounts | null;
}) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const red = teammates.filter((m) => !m.hasCard && !m.covered);
  return (
    <section className="card space-y-3" data-testid="tournament-card">
      <h2 className="font-semibold">Deine Karte</h2>
      {hasOwnCard ? (
        <div className="space-y-1" data-testid="tournament-card-ready">
          <StatusBadge status="ok" label="Karte hinterlegt" viewer="self" />
          <p className="text-sm text-muted">Abgebucht wird erst zur Frist, nicht jetzt.</p>
        </div>
      ) : (
        <CardForm mandateText={mandateText} fake={fake} onFake={fakeTournamentCardAction} />
      )}
      {needsAuthorization && (
        <div className="space-y-2" data-testid="tournament-authorize">
          <p className="text-sm">Die Bank braucht deine Freigabe der Zahlung. Ohne Freigabe fällt das Turnier aus.</p>
          <AuthorizeButton target={{ tournamentId }} fake={fake} />
        </div>
      )}
      {canCover && red.length > 0 && !coveringName && (
        <div className="space-y-2" data-testid="tournament-cover-list">
          <p className="text-sm text-muted">Diese Mitspieler haben noch keine Karte. Du kannst ihren Anteil übernehmen.</p>
          <ul className="space-y-2">
            {red.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2">
                <span className="text-sm">{m.name}</span>
                <ConfirmDialog
                  trigger={{ label: ZP.coverTrigger, variant: "secondary", size: "sm" }}
                  title={`Anteil von ${m.name} übernehmen?`}
                  body={coverDialogBody(m.name)}
                  consequence={coverAmounts ? coverConsequence(m.name, coverAmounts) : undefined}
                  confirmLabel={ZP.coverConfirm}
                  consent={{ label: coverMandateText }}
                  onConfirmAction={async ({ consent }) => (await takeOverTournamentShareAction(tournamentId, m.userId, consent)) ?? { ok: true }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {coveringName && (
        <div className="space-y-2" data-testid="tournament-covering">
          <p className="text-sm">Du übernimmst den Anteil von <strong>{coveringName}</strong>. Er wird zur Frist zusätzlich von deiner Karte abgebucht.</p>
          <Button
            variant="secondary"
            size="sm"
            pending={pending}
            onClick={() => {
              setError(undefined);
              start(async () => {
                const r = await releaseTournamentCoverAction(tournamentId);
                if (r?.error) setError(r.error);
              });
            }}
            data-testid="tournament-cover-release"
          >
            Zurücknehmen
          </Button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
