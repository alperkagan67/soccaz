"use client";

import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { proposeOptionAction, voteOptionAction, withdrawOptionAction } from "@/server/matchmaking-actions";

export type OptionView = { id: string; label: string; proposedBy: "system" | string; proposedByTeamId: string | null; votedTeamIds: string[] };

/** Wie bei FACEIT: Beide Teams wählen aus den Vorschlägen. Stimmen beide für dieselbe Option, steht Termin und Ort. */
export function SchedulingPanel({
  matchId,
  options,
  teams,
  myTeamId,
  deadlineText,
  minStart,
}: {
  matchId: string;
  options: OptionView[];
  teams: { id: string; name: string }[];
  myTeamId: string | null;
  deadlineText: string;
  minStart: string;
}) {
  const myVote = options.find((o) => myTeamId && o.votedTeamIds.includes(myTeamId))?.id;
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? "?";
  return (
    <section className="card space-y-3" aria-label="Tag und Uhrzeit wählen" data-testid="scheduling">
      <div>
        <h2 className="font-semibold">Tag und Uhrzeit wählen</h2>
        <p className="text-sm text-muted">
          Beide Teams wählen einen Vorschlag. Stimmen beide für denselben, steht der Termin. Danach fragen wir die Hallen an und ihr bannt per Veto, wo ihr nicht spielen wollt. Frist: {deadlineText}.
        </p>
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Vorschläge. Mach den ersten.</p>
      ) : (
        <ul className="space-y-2">
          {options.map((o) => (
            <li key={o.id} className={`rounded-lg border p-3 text-sm ${myVote === o.id ? "border-green" : "border-line"}`} data-testid="option">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-semibold">{o.label}</span>
                  <span className="block text-xs text-muted">{o.proposedBy === "system" ? "Vorschlag aus euren Zeitfenstern" : `Vorschlag von ${o.proposedBy}`}</span>
                </span>
                {myTeamId && (
                  <span className="flex items-center gap-2">
                    {myVote === o.id ? (
                      <span className="text-xs font-semibold text-green">Deine Wahl</span>
                    ) : (
                      <ActionButton action={voteOptionAction.bind(null, matchId, o.id)} label="Dafür stimmen" className="btn btn-primary !min-h-9 !px-3 text-xs" />
                    )}
                    {o.proposedByTeamId === myTeamId && <ActionButton action={withdrawOptionAction.bind(null, matchId, o.id)} label="Zurückziehen" />}
                  </span>
                )}
              </div>
              <p className="mt-2 flex flex-wrap gap-2 text-xs">
                {teams.map((t) => (
                  <span key={t.id} className={o.votedTeamIds.includes(t.id) ? "text-green" : "text-muted"}>
                    {o.votedTeamIds.includes(t.id) ? "✓" : "○"} {nameOf(t.id)}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}
      {myTeamId && (
        <ActionForm action={proposeOptionAction.bind(null, matchId)} submit="Vorschlag machen" className="space-y-2 border-t border-line pt-3" successText="Vorschlag gemacht.">
          <h3 className="text-sm font-semibold">Eigener Vorschlag</h3>
          <div>
            <div>
              <label className="label" htmlFor="opt-start">Anstoß (deutsche Zeit)</label>
              <input id="opt-start" name="startsAt" type="datetime-local" min={minStart} step={900} required className="field" />
            </div>
          </div>
        </ActionForm>
      )}
    </section>
  );
}
