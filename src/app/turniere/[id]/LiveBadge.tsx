"use client";

import { useEffect, useState } from "react";

/** "LIVE" mit Spielminute, solange das Spiel nach Zeitplan läuft. Sonst unsichtbar. */
export function LiveBadge({ startIso, endIso }: { startIso: string; endIso: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);
  if (now === null) return null;
  const start = new Date(startIso).getTime();
  if (now < start || now >= new Date(endIso).getTime()) return null;
  return (
    <span className="flex items-center gap-1 rounded-full bg-green/15 px-2 py-0.5 text-[11px] font-bold uppercase text-green" data-testid="live-badge" role="status">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green" aria-hidden />
      Live {Math.floor((now - start) / 60_000) + 1}&apos;
    </span>
  );
}
