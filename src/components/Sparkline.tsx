/** Kleiner Verlauf als SVG (z. B. Elo über die letzten Spiele). Ohne Daten oder mit nur einem Wert wird nichts gezeigt. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 240;
  const h = 56;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (values.length - 1);
  const y = (v: number) => h - pad - ((v - min) * (h - 2 * pad)) / span;
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const up = last >= values[0];
  return (
    <figure className="space-y-1" data-testid="sparkline">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full max-w-xs" role="img" aria-label={`${label}: von ${values[0]} auf ${last}`}>
        <polyline points={points} fill="none" stroke={up ? "var(--green)" : "var(--coral)"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(values.length - 1)} cy={y(last)} r="3" fill={up ? "var(--green)" : "var(--coral)"} />
      </svg>
      <figcaption className="text-xs text-muted">
        {label}: {values[0]} → {last} (Tief {min}, Hoch {max})
      </figcaption>
    </figure>
  );
}

const STYLE = { W: "bg-green-soft text-green", D: "bg-white/10 text-muted", L: "bg-pink/15 text-pink" } as const;
const LETTER = { W: "S", D: "U", L: "N" } as const;
const TEXT = { W: "Sieg", D: "Remis", L: "Niederlage" } as const;

/** Die letzten Spiele als Reihe: S Sieg, U Unentschieden, N Niederlage (neuestes links). */
export function FormChips({ form }: { form: ("W" | "D" | "L")[] }) {
  if (form.length === 0) return null;
  return (
    <p className="flex items-center gap-1" aria-label="Form der letzten Spiele" data-testid="form">
      {form.map((f, i) => (
        <span key={i} title={TEXT[f]} className={`grid size-6 place-items-center rounded text-xs font-bold ${STYLE[f]}`}>
          {LETTER[f]}
        </span>
      ))}
    </p>
  );
}
