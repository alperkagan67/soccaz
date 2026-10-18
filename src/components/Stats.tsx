export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card text-center">
      <div className="font-heading text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

const OUTCOME_STYLE = { W: "bg-green-soft text-green", D: "bg-white/10 text-muted", L: "bg-pink/15 text-pink" } as const;
const OUTCOME_TEXT = { W: "Sieg", D: "Remis", L: "Niederlage" } as const;
const OUTCOME_LETTER = { W: "S", D: "U", L: "N" } as const;

export function OutcomeChip({ outcome }: { outcome: "W" | "D" | "L" }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${OUTCOME_STYLE[outcome]}`} title={OUTCOME_TEXT[outcome]}>
      {OUTCOME_LETTER[outcome]}
    </span>
  );
}
