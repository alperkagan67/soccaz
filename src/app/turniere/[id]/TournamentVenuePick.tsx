"use client";

// Partnerhalle waehlen (012 M5-1): fuer ein Turnier ohne Halle (z. B. bei ausgeschaltetem Kartenmodell angelegt, spaeter eingeschaltet). Nur Veranstalter, nur solange der Kader offen ist;
// der Server prueft das noch einmal (setTournamentVenue).
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { setTournamentVenueAction } from "@/server/tournament-actions";

export function TournamentVenuePick({ tournamentId, options, declinedCode }: { tournamentId: string; options: { id: string; label: string }[]; declinedCode?: string | null }) {
  const [venueId, setVenueId] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-2" data-testid="venue-pick">
      <h2 className="font-semibold">{declinedCode ? "Halle erneut oder andere Halle wählen" : "Partnerhalle wählen"}</h2>
      {declinedCode ? (
        <p className="text-sm text-muted" data-testid="venue-pick-declined">Die Halle hat dieses Turnier abgelehnt (Grund: {declinedCode}). Die Entscheidung ist endgültig: Wähle eine andere Halle oder dieselbe erneut, dann wird sie neu angefragt. Der Turniername ist für die Halle sichtbar.</p>
      ) : (
        <p className="text-sm text-muted">Für dieses Turnier ist noch keine Halle gewählt. Ohne Halle kann der Preis nicht festgelegt werden. Der Turniername ist für die Halle sichtbar.</p>
      )}
      {options.length === 0 && <p className="text-sm" role="status" data-testid="venue-pick-empty">Es gibt noch keine Partnerhalle. Bitte melde dich beim Admin.</p>}
      <label className="label" htmlFor="venue-pick-select">Partnerhalle</label>
      <select id="venue-pick-select" className="field" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
        <option value="">Halle wählen</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <Button
        variant="primary"
        pending={pending}
        disabled={!venueId}
        onClick={() => {
          setError(undefined);
          start(async () => {
            const r = await setTournamentVenueAction(tournamentId, venueId);
            if (r?.error) setError(r.error);
          });
        }}
        data-testid="venue-pick-save"
      >
        Halle speichern
      </Button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
