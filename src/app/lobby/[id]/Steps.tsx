import { ZP } from "@/lib/zahlungspflicht-texte";
/** Die drei Schritte eines Spiels: 1 Uhrzeit, 2 Halle, 3 Bezahlen. Darunter getrennt, was jedes Team (der Captain) entschieden hat. */
export type StepDecision = { teamId: string; teamName: string; text: string; done: boolean; active?: boolean };

const STEPS = ["Uhrzeit", "Halle", "Bezahlen"];
const STEPS_AUS = ["Uhrzeit", "Halle", ZP.tournamentReadyFree]; // Zahlungen AUS: kein Bezahl-Text

export function Steps({ current, decisions, title, aus = false }: { current: 1 | 2 | 3 | 4; decisions: StepDecision[]; title: string; aus?: boolean }) {
  return (
    <section className="card space-y-3" aria-label="Ablauf" data-testid="steps" data-step={current}>
      <ol className="grid grid-cols-3 gap-2 text-center text-sm">
        {(aus ? STEPS_AUS : STEPS).map((label, i) => {
          const n = i + 1;
          const state = current > n ? "done" : current === n ? "current" : "todo";
          return (
            <li key={label} data-state={state} className={`rounded-lg border px-2 py-2 ${state === "current" ? "border-accent bg-accent-soft font-semibold text-accent-fg" : state === "done" ? "border-accent/40 text-accent-fg" : "border-line text-muted"}`}>
              <span className="mr-1">{state === "done" ? "✓" : n}</span>
              {label}
            </li>
          );
        })}
      </ol>
      {decisions.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-muted">{title}</p>
          <div className="grid gap-x-4 divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
            {decisions.map((d) => (
              <div key={d.teamId} className={`py-2 text-sm ${d.active ? "border-l-4 border-ink pl-3" : ""}`} data-testid="team-decision" data-done={d.done}>
                <p className="font-semibold">{d.teamName}</p>
                <p className={d.done ? "text-accent-fg" : "text-muted"}>
                  {d.done ? "✓ " : "○ "}
                  {d.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
