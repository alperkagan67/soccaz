/** Die drei Schritte eines Spiels: 1 Uhrzeit, 2 Halle, 3 Bezahlen. Darunter getrennt, was jedes Team (der Captain) entschieden hat. */
export type StepDecision = { teamId: string; teamName: string; text: string; done: boolean; active?: boolean };

const STEPS = ["Uhrzeit", "Halle", "Bezahlen"];

export function Steps({ current, decisions, title }: { current: 1 | 2 | 3 | 4; decisions: StepDecision[]; title: string }) {
  return (
    <section className="card space-y-3" aria-label="Ablauf" data-testid="steps" data-step={current}>
      <ol className="grid grid-cols-3 gap-2 text-center text-sm">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = current > n ? "done" : current === n ? "current" : "todo";
          return (
            <li key={label} data-state={state} className={`rounded-lg border px-2 py-2 ${state === "current" ? "border-green bg-green-soft font-semibold text-green" : state === "done" ? "border-green/40 text-green" : "border-line text-muted"}`}>
              <span className="mr-1">{state === "done" ? "✓" : n}</span>
              {label}
            </li>
          );
        })}
      </ol>
      {decisions.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-muted">{title}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {decisions.map((d) => (
              <div key={d.teamId} className={`rounded-lg border p-3 text-sm ${d.active ? "border-yellow" : d.done ? "border-green/50" : "border-line"}`} data-testid="team-decision" data-done={d.done}>
                <p className="font-semibold">{d.teamName}</p>
                <p className={d.done ? "text-green" : "text-muted"}>
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
