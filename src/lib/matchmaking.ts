// Matchmaking als reine Funktionen: Welche Teams passen zusammen, wann können beide, welche Termine schlagen wir vor?

export const MIN_LEAD_MS = 24 * 3_600_000; // Termine müssen mindestens 24 Stunden in der Zukunft liegen (Absagegrenze)
export const QUEUE_LIFETIME_MS = 48 * 3_600_000;
export const MAX_WINDOWS = 3;
export const MAX_WINDOW_DAYS_AHEAD = 14;
export const SUGGESTED_OPTIONS = 3;

export type Window = { from: Date; to: Date };
export type QueueEntry = { id: string; teamId: string; city: string; durationMin: number; elo: number; createdAt: Date; windows: Window[] };
export type Pair = { a: QueueEntry; b: QueueEntry; eloDiff: number; slots: Date[] };

/** Erlaubter Elo-Abstand: startet eng und wird mit der Wartezeit weiter (alle 5 Minuten +50, höchstens 600). */
export function eloRange(waitedMs: number): number {
  const steps = Math.floor(Math.max(0, waitedMs) / (5 * 60_000));
  return Math.min(100 + steps * 50, 600);
}

const quarter = 15 * 60_000;
const ceilQuarter = (ms: number) => Math.ceil(ms / quarter) * quarter;

/** Zeitfenster bereinigen: nur Zukunft (mit Vorlauf), ausreichend lang, zusammengeführt. */
export function usableWindows(windows: Window[], durationMin: number, now: Date): Window[] {
  const earliest = now.getTime() + MIN_LEAD_MS;
  const need = durationMin * 60_000;
  const cleaned = windows
    .map((w) => ({ from: Math.max(w.from.getTime(), earliest), to: w.to.getTime() }))
    .filter((w) => w.to - w.from >= need)
    .sort((x, y) => x.from - y.from);
  const merged: { from: number; to: number }[] = [];
  for (const w of cleaned) {
    const last = merged[merged.length - 1];
    if (last && w.from <= last.to) last.to = Math.max(last.to, w.to);
    else merged.push({ ...w });
  }
  return merged.map((w) => ({ from: new Date(w.from), to: new Date(w.to) }));
}

/** Gemeinsame Zeit zweier Teams (jeweils bereinigt), mindestens so lang wie das Spiel. */
export function overlap(a: Window[], b: Window[], durationMin: number): Window[] {
  const need = durationMin * 60_000;
  const out: Window[] = [];
  for (const x of a) {
    for (const y of b) {
      const from = Math.max(x.from.getTime(), y.from.getTime());
      const to = Math.min(x.to.getTime(), y.to.getTime());
      if (to - from >= need) out.push({ from: new Date(from), to: new Date(to) });
    }
  }
  return out.sort((p, q) => p.from.getTime() - q.from.getTime());
}

/** Startzeiten auf der Viertelstunde, in der gemeinsamen Zeit. Erst je ein Termin pro Tag (früheste zuerst), dann weitere. */
export function suggestSlots(common: Window[], durationMin: number, limit = SUGGESTED_OPTIONS): Date[] {
  const need = durationMin * 60_000;
  const all: number[] = [];
  for (const w of common) {
    for (let t = ceilQuarter(w.from.getTime()); t + need <= w.to.getTime(); t += 60 * 60_000) all.push(t);
  }
  const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
  const firstPerDay: number[] = [];
  const rest: number[] = [];
  const seen = new Set<string>();
  for (const t of all) {
    const key = dayKey(t);
    if (seen.has(key)) rest.push(t);
    else {
      seen.add(key);
      firstPerDay.push(t);
    }
  }
  return [...firstPerDay, ...rest].slice(0, limit).sort((x, y) => x - y).map((t) => new Date(t));
}

/**
 * Paart wartende Teams. Wer am längsten wartet, wird zuerst bedient und bekommt den passendsten Gegner:
 * gleiche Stadt und Dauer, Elo-Abstand innerhalb des Bereichs (es zählt der größere der beiden Bereiche), gemeinsame Zeit vorhanden.
 * Unter mehreren Kandidaten gewinnt der kleinste Elo-Abstand, dann der längere Wartende.
 */
export function findPairs(entries: QueueEntry[], now: Date): Pair[] {
  const free = [...entries].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
  const used = new Set<string>();
  const pairs: Pair[] = [];
  for (const a of free) {
    if (used.has(a.id)) continue;
    const aWindows = usableWindows(a.windows, a.durationMin, now);
    if (aWindows.length === 0) continue;
    let best: { b: QueueEntry; diff: number; slots: Date[] } | null = null;
    for (const b of free) {
      if (b.id === a.id || used.has(b.id) || b.teamId === a.teamId || b.city !== a.city || b.durationMin !== a.durationMin) continue;
      const diff = Math.abs(a.elo - b.elo);
      const range = Math.max(eloRange(now.getTime() - a.createdAt.getTime()), eloRange(now.getTime() - b.createdAt.getTime()));
      if (diff > range) continue;
      const slots = suggestSlots(overlap(aWindows, usableWindows(b.windows, b.durationMin, now), a.durationMin), a.durationMin);
      if (slots.length === 0) continue;
      if (!best || diff < best.diff) best = { b, diff, slots };
    }
    if (best) {
      used.add(a.id);
      used.add(best.b.id);
      pairs.push({ a, b: best.b, eloDiff: best.diff, slots: best.slots });
    }
  }
  return pairs;
}

/** Vorschläge aus Zeiten und Hallen kombinieren (höchstens `limit`), Zeiten abwechselnd mit den Hallen. */
export function combineOptions<V>(slots: Date[], venues: V[], limit = 6): { startsAt: Date; venue: V | null }[] {
  if (venues.length === 0) return slots.slice(0, limit).map((startsAt) => ({ startsAt, venue: null }));
  const out: { startsAt: Date; venue: V | null }[] = [];
  for (const [i, startsAt] of slots.entries()) {
    for (const venue of venues) {
      if (out.length < limit) out.push({ startsAt, venue });
    }
    if (i === 2) break;
  }
  return out;
}

/** Ein Vorschlag ist gültig, solange er noch genug Vorlauf hat. */
export const optionStillValid = (startsAt: Date, now: Date) => startsAt.getTime() >= now.getTime() + MIN_LEAD_MS;

/** Einigung: beide Teams haben für dieselbe Option gestimmt. */
export function agreedOption(votes: { teamId: string; optionId: string }[], homeTeamId: string, awayTeamId: string): string | null {
  const home = votes.find((v) => v.teamId === homeTeamId);
  const away = votes.find((v) => v.teamId === awayTeamId);
  return home && away && home.optionId === away.optionId ? home.optionId : null;
}
