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
  // Bewusst hasPendingResult false: die Liste kennt keine Ergebnis-Zeilen (myMatches liefert sie nicht). Der Zweig "pending" ("Ergebnis offen") ist hier unerreichbar; ein begonnenes Spiel ohne Endstand heisst "Laeuft", ein gespieltes "Gespielt". Beim Anschluss der Ergebnisdaten hier hasPendingResult uebergeben.
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
/** deadline: Ablauffrist der Herausforderung (Antwort bis); leer = ohne Frist (zählt nicht für die Dringlichkeit). */
export type StandChallenge = { id: string; fromTeam: string; toTeam: string; startsAt: Date; href?: string; deadline?: Date | null };
export type StandAction = { label: string; href: string };
/** Die zweite Zeile: der Eintrag, der nicht die Hauptaktion ist, bleibt sichtbar (nie verdeckt), mit ruhigem Knopf. */
export type Stand = { line: string; detail?: string; action: StandAction; second?: { line: string; action: StandAction } };

const DAY_MS = 24 * 3_600_000;
export const CHALLENGES_ANCHOR = "/app#herausforderungen";

function challengeEntry(incoming: readonly StandChallenge[], formatDate: (d: Date) => string): { line: string; detail: string; action: StandAction } {
  const sorted = [...incoming].sort((x, y) => (x.deadline?.getTime() ?? Infinity) - (y.deadline?.getTime() ?? Infinity)); // früheste Frist zuerst
  const c = sorted[0];
  const n = sorted.length;
  return {
    line: `Dein Team ist herausgefordert: ${c.fromTeam} gegen ${c.toTeam}`,
    detail: n > 1 ? `${n} Herausforderungen warten auf eure Antwort.` : c.href ? `Antwort bis ${formatDate(c.startsAt)} Uhr` : `${formatDate(c.startsAt)} Uhr`,
    action: n > 1 ? { label: `Herausforderungen ansehen (${n})`, href: CHALLENGES_ANCHOR } : { label: "Herausforderung ansehen", href: c.href ?? `/suche/${c.id}` },
  };
}

/**
 * „Dein Stand“ und die EINE Hauptaktion von `/app` (Umbauplan: Wo bin ich, was ist mein Stand, was ist der eine nächste Schritt).
 * Priorität nach DRINGLICHKEIT (Entscheid t2q 2026-11-24): Hauptaktion ist der Eintrag mit dem früheren Stichtag (Anstoß des nächsten eigenen Spiels gegen die Ablauffrist der eingehenden Herausforderung).
 * Gleichstand, Spiel innerhalb von 24 Stunden, Spiel ohne bekannte Uhrzeit-Konkurrenz oder Herausforderung ohne Frist: das SPIEL gewinnt ("Zur Lobby"); eine Spiel-Uhrzeit, die noch offen ist, hat keinen Stichtag.
 * Der andere Eintrag bleibt als zweite Zeile mit ruhigem Knopf sichtbar. Mehrere Herausforderungen: Plural mit Zahl. Dann: eigene offene Lobby, sonst ohne Team „Team gründen“, sonst „Spiel suchen“. Nie ein Guthaben, nie der Zahlstatus eines anderen.
 */
export function dashboardStand(input: { games: readonly StandGame[]; open: readonly StandOpen[]; teamCount: number; incoming?: readonly StandChallenge[]; now?: Date }, formatDate: (d: Date) => string): Stand {
  // Die Lobby, in der die Herausforderung selbst wartet (href), ist kein eigenes Spiel: sie steht nicht zusätzlich als "Nächstes Spiel" da
  const next = input.games.find((g) => !input.incoming?.some((c) => c.href === `/lobby/${g.id}`));
  // Abgelaufene Fristen (deadline <= jetzt) zählen nicht: sie wären sonst die dringendste Hauptaktion für etwas, das nicht mehr beantwortet werden kann
  const nowMs = (input.now ?? new Date()).getTime();
  const live = input.incoming?.filter((c) => !c.deadline || c.deadline.getTime() > nowMs) ?? [];
  const ch = live.length > 0 ? challengeEntry(live, formatDate) : null;
  const gameEntry = next
    ? {
        line: `Nächstes Spiel: #${next.number} ${next.home} gegen ${next.away}`,
        detail: `${next.timeOpen ? "Uhrzeit noch offen" : `${formatDate(next.startsAt)} Uhr`} · ${next.phase}`,
        action: { label: "Zur Lobby", href: `/lobby/${next.id}` },
      }
    : null;
  if (ch && gameEntry && next) {
    const now = nowMs;
    const gameAt = next.timeOpen ? null : next.startsAt.getTime();
    const deadline = Math.min(...live.map((c) => c.deadline?.getTime() ?? Infinity));
    const gameFirst = gameAt === null ? !Number.isFinite(deadline) : gameAt - now <= DAY_MS || !Number.isFinite(deadline) || gameAt <= deadline;
    if (gameFirst) return { ...gameEntry, second: { line: ch.line, action: ch.action } };
    return { ...ch, second: { line: gameEntry.line, action: gameEntry.action } };
  }
  if (ch) return ch;
  if (gameEntry) return gameEntry;
  const open = input.open[0];
  if (open) {
    return { line: `Eure Lobby #${open.number} (${open.team}) ist offen`, detail: "Sie wartet auf einen Gegner.", action: { label: "Zur Lobby", href: `/lobby/offen/${open.id}` } };
  }
  if (input.teamCount === 0) {
    return { line: "Du bist noch in keinem Team.", detail: "Gründe eins oder öffne den Einladungslink deines Teams.", action: { label: "Team gründen", href: "/app/teams/neu" } };
  }
  return { line: "Du hast gerade kein Spiel.", detail: "Such einen Gegner oder nimm eine Spielsuche an.", action: { label: "Spiel suchen", href: "/suche" } };
}
