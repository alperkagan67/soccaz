"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/** Großer Countdown bis zum Anstoß: Tage, Stunden, Minuten, Sekunden. */
export function KickoffCountdown({ startsAtIso }: { startsAtIso: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setLeft(new Date(startsAtIso).getTime() - Date.now());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startsAtIso]);

  if (left === null) return <div className="h-20" aria-hidden />;
  if (left <= 0) return <p className="text-center text-lg font-bold text-green" data-testid="kickoff-countdown">Anstoß!</p>;
  const total = Math.floor(left / 1000);
  const parts = [
    { value: Math.floor(total / 86400), label: "Tage" },
    { value: Math.floor((total % 86400) / 3600), label: "Std" },
    { value: Math.floor((total % 3600) / 60), label: "Min" },
    { value: total % 60, label: "Sek" },
  ];
  return (
    <div className="space-y-1 text-center" data-testid="kickoff-countdown" role="timer" aria-label="Countdown bis zum Anstoß">
      <p className="text-xs uppercase tracking-wide text-muted">Anstoß in</p>
      <div className="mx-auto grid max-w-sm grid-cols-4 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="rounded-lg border border-line bg-panel py-2">
            <p className="font-heading text-2xl font-extrabold tabular-nums">{pad(p.value)}</p>
            <p className="text-xs text-muted">{p.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
