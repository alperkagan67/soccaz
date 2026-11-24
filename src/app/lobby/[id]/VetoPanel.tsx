"use client";

import { ActionButton } from "@/components/ActionButton";
import { banHallAction } from "@/server/matchmaking-actions";

export type HallView = { venueId: string; name: string; city: string; website: string | null; verified: boolean; partner: boolean; bannedByTeam: string | null; bannedAuto: boolean; banOrder: number | null; picked: boolean };

/** Hallen-Veto wie die Map-Veto-Phase bei Counter-Strike und FACEIT: Abwechselnd Hallen bannen, die letzte übrige wird gespielt. */
export function VetoPanel({
  matchId,
  halls,
  teams,
  turnTeamId,
  myTeamId,
  deadlineText,
  done,
}: {
  matchId: string;
  halls: HallView[];
  teams: { id: string; name: string }[];
  turnTeamId: string | null;
  myTeamId: string | null;
  deadlineText: string;
  done: boolean;
}) {
  const nameOf = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "";
  const myTurn = !done && myTeamId !== null && myTeamId === turnTeamId;
  const left = halls.filter((h) => !h.bannedByTeam).length;
  const picked = halls.find((h) => h.picked);

  return (
    <section className="card space-y-3" aria-label="Hallen-Veto" data-testid="veto">
      <div>
        <h2 className="font-semibold">{done ? "Hallen-Veto abgeschlossen" : "Hallen-Veto"}</h2>
        {done ? (
          <p className="text-sm text-accent-fg" data-testid="veto-result">Gewählt: {picked?.name}{picked?.city ? ` (${picked.city})` : ""}</p>
        ) : (
          <p className="text-sm text-muted">
            Alle Hallen hier sind zum Termin frei oder ungeprüft. Abwechselnd bannt jedes Team Hallen, die es nicht spielen will. Die letzte Halle wird gespielt. Noch {left} Hallen im Rennen.
          </p>
        )}
        {!done && (
          <p className={`mt-1 text-sm font-semibold ${myTurn ? "text-accent-fg" : "text-ink"}`} data-testid="veto-turn">
            {myTurn ? "Du bist dran: banne eine Halle." : `${nameOf(turnTeamId)} ist dran.`}
            <span className="ml-2 text-sm font-normal text-muted">bis {deadlineText}, danach bannt das System zufällig</span>
          </p>
        )}
      </div>
      <ul className="grid gap-x-4 divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
        {halls.map((h) => {
          const banned = Boolean(h.bannedByTeam);
          return (
            <li key={h.venueId} className={`py-3 text-sm ${h.picked ? "border-l-4 border-accent bg-accent-soft pl-3" : banned ? "opacity-60" : ""}`} data-testid="hall" data-state={h.picked ? "picked" : banned ? "banned" : "open"}>
              <div className="flex items-start justify-between gap-2">
                <span>
                  <span className={`block font-semibold ${banned ? "line-through" : ""}`}>{h.name}</span>
                  <span className="block text-sm text-muted">
                    {h.city}
                    {h.partner ? " · Partner" : ""}
                    {!h.verified ? " · Angaben ungeprüft" : ""}
                  </span>
                  {h.website && (
                    <a href={h.website} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-accent-fg underline">
                      Webseite
                    </a>
                  )}
                </span>
                {h.picked ? (
                  <span className="text-sm font-semibold text-accent-fg">Gewählt</span>
                ) : banned ? (
                  <span className="text-right text-sm text-muted">
                    Bann {h.banOrder}
                    <span className="block">{nameOf(h.bannedByTeam)}{h.bannedAuto ? " (automatisch)" : ""}</span>
                  </span>
                ) : (
                  myTurn && <ActionButton action={banHallAction.bind(null, matchId, h.venueId)} label="Bannen" confirm={`${h.name} bannen?`} className="btn btn-danger text-sm" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
