"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type ClockGame = { court: number; fun: boolean; matchId: string | null; nameA: string | null; nameB: string | null };
export type ClockBlock = { label: string; startIso: string; endIso: string; games: ClockGame[] };

const pad = (n: number) => String(n).padStart(2, "0");
const mmss = (ms: number) => {
  const s = Math.max(Math.ceil(ms / 1000), 0);
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

function Games({ games }: { games: ClockGame[] }) {
  return (
    <ul className="space-y-0.5 text-left text-xs">
      {games.map((g) => (
        <li key={g.court} className="flex gap-1.5">
          <span className="shrink-0 text-muted">Platz {g.court}</span>
          <span className="truncate">
            {g.fun ? "Just for fun: " : ""}
            {g.nameA && g.nameB ? (g.matchId ? <Link href={`/spiele/${g.matchId}`} className="text-green underline">{g.nameA} – {g.nameB}</Link> : `${g.nameA} – ${g.nameB}`) : "Verlierer der Halbfinals"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Anzeige über dem Finale, folgt dem Zeitplan: Countdown bis zum ersten Anstoß, dann pro Spielblock die Spielzeit mit
 * "Läuft gerade", in der Pause der Countdown bis zum nächsten Anstoß, am Ende "Turnier beendet".
 */
export function BoardClock({ blocks, slotMinutes, gapMinutes }: { blocks: ClockBlock[]; slotMinutes: number; gapMinutes: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);
  if (now === null) return <div className="h-24" aria-hidden />;

  const t = blocks.map((b) => ({ ...b, start: new Date(b.startIso).getTime(), end: new Date(b.endIso).getTime() }));
  const live = t.find((b) => now >= b.start && now < b.end);
  const upcoming = t.find((b) => b.start > now);

  if (live) {
    const elapsed = now - live.start;
    const pct = Math.min(100, Math.round((elapsed / (slotMinutes * 60_000)) * 100));
    return (
      <div className="w-full space-y-1.5 rounded-lg border border-green/60 bg-panel p-3 text-center" data-testid="board-clock" data-state="live">
        <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-green">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green" aria-hidden /> Läuft gerade · {live.label}
        </p>
        <p className="font-heading text-3xl font-extrabold tabular-nums" role="timer" aria-label="Spielzeit">
          {mmss(elapsed)}
          <span className="ml-1 text-sm font-normal text-muted">/ {slotMinutes}:00</span>
        </p>
        <div className="mx-auto h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full bg-green" style={{ width: `${pct}%` }} />
        </div>
        <Games games={live.games} />
      </div>
    );
  }
  if (upcoming) {
    const first = upcoming === t[0];
    return (
      <div className="w-full space-y-1.5 rounded-lg border border-line bg-panel p-3 text-center" data-testid="board-clock" data-state={first ? "before" : "pause"}>
        <p className="text-xs uppercase tracking-wide text-muted">{first ? "Anstoß in" : `Pause · neues Team wechselt ein (${gapMinutes} Min)`}</p>
        <p className="font-heading text-3xl font-extrabold tabular-nums" role="timer" aria-label="Countdown">
          {first && upcoming.start - now > 86_400_000 ? `${Math.floor((upcoming.start - now) / 86_400_000)} T ${mmss((upcoming.start - now) % 86_400_000)}` : mmss(upcoming.start - now)}
        </p>
        <p className="text-xs text-muted">Als Nächstes: {upcoming.label}</p>
        <Games games={upcoming.games} />
      </div>
    );
  }
  return (
    <div className="w-full rounded-lg border border-line bg-panel p-3 text-center text-sm" data-testid="board-clock" data-state="over">
      Alle Spiele sind angepfiffen. Die Hallenzeit ist vorbei.
    </div>
  );
}
