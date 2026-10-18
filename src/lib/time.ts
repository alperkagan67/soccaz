// Alle Zeiten liegen in der DB als UTC. Eingabe und Anzeige sind immer deutsche Ortszeit.
export const TZ = "Europe/Berlin";

function offsetMinutes(utc: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(utc.getTime() / 1000) * 1000) / 60000);
}

/** "2026-11-05T20:00" (Berliner Ortszeit) -> UTC-Datum. Gibt null bei ungültiger Eingabe. */
export function parseBerlinLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(guess); // Date.UTC rechnet Überläufe still um (Monat 13 -> nächstes Jahr)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  let result = guess - offsetMinutes(new Date(guess)) * 60000;
  result = guess - offsetMinutes(new Date(result)) * 60000; // Sommer-/Winterzeit-Grenze
  const date = new Date(result);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Tagesgrenzen (UTC) für ein Berliner Datum "YYYY-MM-DD". */
export function berlinDayRange(day: string): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const from = parseBerlinLocal(`${day}T00:00`);
  if (!from) return null;
  const next = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + 1));
  const to = parseBerlinLocal(`${next.toISOString().slice(0, 10)}T00:00`);
  return to ? { from, to } : null;
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** Wert für <input type="datetime-local"> (Berliner Ortszeit). */
export function toBerlinInputValue(date: Date): string {
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
  return p.replace(" ", "T");
}

/** Grenzen (UTC) eines Berliner Kalendermonats "YYYY-MM". Ohne Angabe: der aktuelle Monat. */
export function berlinMonthRange(month?: string, now = new Date()): { month: string; from: Date; to: Date; label: string } {
  const valid = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const key = valid ? month : toBerlinInputValue(now).slice(0, 7);
  const y = +key.slice(0, 4);
  const m = +key.slice(5, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const from = parseBerlinLocal(`${key}-01T00:00`)!;
  const to = parseBerlinLocal(`${next}-01T00:00`)!;
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("de-DE", { timeZone: "UTC", month: "long", year: "numeric" });
  return { month: key, from, to, label };
}

/** Gleiche Berliner Uhrzeit n Tage später (über Sommer-/Winterzeit hinweg). */
export function addBerlinDays(date: Date, days: number): Date {
  const local = toBerlinInputValue(date); // "YYYY-MM-DDTHH:mm"
  const d = new Date(Date.UTC(+local.slice(0, 4), +local.slice(5, 7) - 1, +local.slice(8, 10) + days));
  return parseBerlinLocal(`${d.toISOString().slice(0, 10)}${local.slice(10)}`) ?? new Date(date.getTime() + days * 86_400_000);
}
