import type { ReactNode } from "react";

// 013 M3 PR 5b: "Für Captains" bündelt, was nur Team-Admins, Veranstalter und Plattform-Admins sehen: Stand je Team, Abbuchungsfehler mit je EINEM Schritt, Einladung.
// Reine Darstellung ohne eigene Datenabfrage: die Seite entscheidet serverseitig, wer die Leiste und die Fehlerzeilen bekommt (cardDisplays/card-visibility); hier wird nur gerendert, was sie liefert.
// Im Seitenfluss, keine feste Leiste (Entscheid TM). Der Schritt je Fehlerzeile ist der bestehende "Anteil übernehmen"-Knopf (`step`, nur wo der Server ihn erlaubt), sonst steht die Frist des Spielers da.
export type CaptainTeamStand = { id: string; name: string; count: number; ready: number; cardsReady: boolean | null };
export type CaptainFailure = { userId: string; name: string; text: string; until: string | null; authorizing: boolean; step: ReactNode | null };

/** Wer die Leiste bekommt: Veranstalter (canManage), Team-Admins und Plattform-Admins, nur solange das Spiel läuft. Spieler ohne Captain-Rolle, Gäste und Hallenbetreiber bekommen sie nie. */
export function captainBarAllowed(r: { active: boolean; canManage: boolean; adminTeams: number; platformAdmin: boolean }): boolean {
  return r.active && (r.canManage || r.adminTeams > 0 || r.platformAdmin);
}

/** Die Seite reicht Rolle und Inhalt durch; ohne Berechtigung wird NICHTS gerendert (kein Name, keine Fehlerzeile, keine Einladung im HTML). */
export function LobbyCaptainBarFor({ role, ...props }: { role: Parameters<typeof captainBarAllowed>[0] } & Parameters<typeof LobbyCaptainBar>[0]) {
  if (!captainBarAllowed(role)) return null;
  return <LobbyCaptainBar {...props} />;
}

export function LobbyCaptainBar({ teams, failures, children }: { teams: CaptainTeamStand[]; failures: CaptainFailure[]; children?: ReactNode }) {
  return (
    <section className="card space-y-3" aria-label="Für Captains" data-testid="captain-bar">
      <h2 className="font-semibold">Für Captains</h2>
      {teams.length > 0 && (
        <ul className="space-y-1 text-sm" data-testid="captain-team-stand">
          {teams.map((t) => (
            <li key={t.id}>
              <strong>{t.name}</strong>: {t.ready} von {t.count} bereit{t.cardsReady === null ? "" : t.cardsReady ? ", alle Karten hinterlegt" : ", nicht alle Karten hinterlegt"}
            </li>
          ))}
        </ul>
      )}
      {failures.length > 0 && (
        <div className="space-y-2" role="alert" aria-label="Abbuchung fehlgeschlagen" data-testid="charge-failed-captain">
          <h3 className="font-semibold">Abbuchung fehlgeschlagen</h3>
          <ul className="space-y-3 text-sm">
            {failures.map((f) => (
              <li key={f.userId} className="space-y-2" data-testid="charge-failed-player">
                <p>
                  <strong>{f.name}</strong>: {f.text}{" "}
                  {f.step ? "Nächster Schritt: den Anteil übernehmen." : f.until ? `Der Spieler hat ${f.until} Zeit${f.authorizing ? " (die Bank braucht eine Freigabe)" : ""}.` : "Der Platz wird neu vergeben."}
                </p>
                {f.step}
              </li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </section>
  );
}
