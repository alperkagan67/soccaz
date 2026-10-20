"use client";

import { useEffect, useState } from "react";
import { minuteAt } from "@/lib/result-rules";

/** Spieluhr: aktuelle Spielminute seit dem Anstoß, mit Fortschrittsbalken und Nachspielzeit. */
export function MatchClock({ startsAtIso, durationMin }: { startsAtIso: string; durationMin: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);
  if (now === null) return <div className="h-14" aria-hidden />;

  const start = new Date(startsAtIso);
  const elapsedMs = now - start.getTime();
  if (elapsedMs < 0) return null;
  const minute = minuteAt(start, new Date(now), durationMin);
  const over = minute > durationMin;
  const seconds = Math.floor(elapsedMs / 1000) % 60;
  const pct = Math.min(100, Math.round((elapsedMs / (durationMin * 60_000)) * 100));
  return (
    <div className="space-y-1 text-center" data-testid="match-clock" role="timer" aria-label="Spielminute">
      <p className="font-heading text-3xl font-extrabold tabular-nums">
        {over ? `${durationMin}'+${minute - durationMin}` : `${minute}'`}
        <span className="ml-2 text-sm font-normal text-muted tabular-nums">{String(seconds).padStart(2, "0")} Sek</span>
      </p>
      <div className="mx-auto h-2 max-w-sm overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className={over ? "h-full bg-yellow" : "h-full bg-green"} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted">{over ? "Nachspielzeit: Die reguläre Spielzeit ist um." : `von ${durationMin} Minuten`}</p>
    </div>
  );
}
