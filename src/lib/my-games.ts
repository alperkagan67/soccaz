import { phaseOf, PHASE_LABEL, type MatchPhase } from "./result-rules";

// 013 M3 PR 4 (/app, „Meine Spiele“): Gruppierung nach Spielart und Zustandswort je Spiel (rein rechnend, testbar ohne Datenbank).
// Gruppen nach Vertrag 007 AC-3: Teamspiele, Privatspiele, Turniere; leere Gruppen entfallen. Zustandswörter nach docs/design/begriffe.md.

export type MatchKind = "team" | "private" | "tournament";
export type MatchStatus = "lobby" | "confirmed" | "played" | "disputed" | "cancelled";

export type MyMatchRow = { id: string; kind: MatchKind; startsAt: Date; status: MatchStatus; durationMin: number; homeName: string; awayName: string };

export const KIND_LABEL: Record<MatchKind, string> = { team: "Teamspiele", private: "Privatspiele", tournament: "Turniere" };
const KIND_ORDER: MatchKind[] = ["team", "private", "tournament"];

export type MatchGroup<T extends { kind: MatchKind }> = { kind: MatchKind; label: string; rows: T[] };

/**
 * Gruppen in fester Reihenfolge (Teamspiele, Privatspiele, Turniere), leere entfallen. Innerhalb einer Gruppe stehen die kommenden Spiele zuerst
 * (nächster Anstoß zuerst), danach die vergangenen (jüngstes zuerst).
 */
export function groupByKind<T extends { kind: MatchKind; startsAt: Date }>(rows: readonly T[], now: Date = new Date()): MatchGroup<T>[] {
  const t = now.getTime();
  const ordered = (list: T[]) => {
    const upcoming = list.filter((r) => r.startsAt.getTime() > t).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const past = list.filter((r) => r.startsAt.getTime() <= t).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
    return [...upcoming, ...past];
  };
  return KIND_ORDER.map((kind) => ({ kind, label: KIND_LABEL[kind], rows: ordered(rows.filter((r) => r.kind === kind)) })).filter((g) => g.rows.length > 0);
}

export type BadgeTone = "ok" | "warn" | "danger" | "info" | "neutral";
export type MatchBadge = { tone: BadgeTone; label: string };

/** Zustandswort je Spiel: immer Wort (nie nur Farbe). „Spiel ist angesetzt“ = bestätigt (je Team mindestens 4 bereit; Wortlaut wie `mygame.ts`, PR 1), „Wartet auf Spieler“ = Lobby vor dem Anstoß. */
export function matchBadge(row: { status: MatchStatus; startsAt: Date }, now: Date = new Date()): MatchBadge {
  const phase: MatchPhase = phaseOf({ status: row.status, startsAt: row.startsAt, hasPendingResult: false, now });
  switch (phase) {
    case "upcoming":
      return row.status === "confirmed" ? { tone: "ok", label: "Spiel ist angesetzt" } : { tone: "warn", label: "Wartet auf Spieler" };
    case "live":
      return { tone: "info", label: PHASE_LABEL.live };
    case "pending":
      return { tone: "warn", label: "Ergebnis offen" };
    case "finished":
      return { tone: "neutral", label: "Gespielt" };
    case "disputed":
      return { tone: "danger", label: PHASE_LABEL.disputed };
    case "cancelled":
      return { tone: "neutral", label: PHASE_LABEL.cancelled };
    default:
      return phase satisfies never;
  }
}

/** Wohin führt eine Zeile? Kommende Spiele in der Lobby, alle anderen auf die Spielseite. */
export function matchHref(row: { id: string; status: MatchStatus; startsAt: Date }, now: Date = new Date()): string {
  const upcoming = phaseOf({ status: row.status, startsAt: row.startsAt, hasPendingResult: false, now }) === "upcoming";
  return upcoming && (row.status === "lobby" || row.status === "confirmed") ? `/lobby/${row.id}` : `/spiele/${row.id}`;
}

export type StandGame = { id: string; number: number; home: string; away: string; startsAt: Date; timeOpen: boolean; phase: string };
export type StandOpen = { id: string; number: number; team: string };
export type Stand = { line: string; detail?: string; action: { label: string; href: string } };

/**
 * „Dein Stand“ und die EINE Hauptaktion von `/app` (Umbauplan: Wo bin ich, was ist mein Stand, was ist der eine nächste Schritt).
 * Reihenfolge: nächstes Spiel, eigene offene Lobby, sonst ohne Team „Team gründen“, sonst „Spiel suchen“. Nie ein Guthaben, nie der Zahlstatus eines anderen.
 */
export function dashboardStand(input: { games: readonly StandGame[]; open: readonly StandOpen[]; teamCount: number }, formatDate: (d: Date) => string): Stand {
  const next = input.games[0];
  if (next) {
    return {
      line: `Nächstes Spiel: #${next.number} ${next.home} gegen ${next.away}`,
      detail: `${next.timeOpen ? "Uhrzeit noch offen" : `${formatDate(next.startsAt)} Uhr`} · ${next.phase}`,
      action: { label: "Zur Lobby", href: `/lobby/${next.id}` },
    };
  }
  const open = input.open[0];
  if (open) {
    return { line: `Eure Lobby #${open.number} (${open.team}) ist offen`, detail: "Sie wartet auf einen Gegner.", action: { label: "Zur Lobby", href: `/lobby/offen/${open.id}` } };
  }
  if (input.teamCount === 0) {
    return { line: "Du bist noch in keinem Team.", detail: "Gründe eins oder öffne den Einladungslink deines Teams.", action: { label: "Team gründen", href: "/app/teams/neu" } };
  }
  return { line: "Du hast gerade kein Spiel.", detail: "Such einen Gegner oder nimm eine Spielsuche an.", action: { label: "Spiel suchen", href: "/suche" } };
}
