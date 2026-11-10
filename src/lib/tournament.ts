import { shareCents } from "@/lib/money";
// Turnierlogik als reine Funktionen: Spielpläne erzeugen, Tabellen berechnen, Sieger bestimmen.
// Die Datenbank-Schicht (server/tournaments.ts) speichert nur, was hier herauskommt.

export type Slot = { stage: string; round: number; slot: number };
export type Fixture = Slot & {
  a: string | null;
  b: string | null;
  /** In welches Spiel der Sieger wandert (K.-o.-Runden). */
  feeds?: Slot & { side: "a" | "b" };
};

export type Played = { a: string; b: string; scoreA: number; scoreB: number };
export type StandingRow = { teamId: string; played: number; wins: number; draws: number; losses: number; gf: number; ga: number; gd: number; points: number };

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 32;
export const MIN_GROUP_TEAMS = 6;

/** Jeder gegen jeden nach dem Kreisverfahren. Bei ungerader Zahl setzt pro Runde ein Team aus. */
export function roundRobin(teamIds: string[], stage = "round"): Fixture[] {
  const teams: (string | null)[] = [...teamIds];
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length;
  const fixtures: Fixture[] = [];
  for (let round = 1; round < n; round++) {
    let slot = 0;
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i];
      const b = teams[n - 1 - i];
      if (a && b) fixtures.push({ stage, round, slot: slot++, a, b });
    }
    // erstes Team bleibt, die anderen rücken eins weiter
    teams.splice(1, 0, teams.pop()!);
  }
  return fixtures;
}

/** Setzreihenfolge für ein K.-o.-Feld (1 gegen die Letzten, Favoriten treffen sich spät). Größe ist eine Zweierpotenz. */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const total = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, total - seed]);
  }
  return order;
}

const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(n, 2)));
export const koStage = (teamsInRound: number) => `ko:${teamsInRound}`;

/** Zufallszahl in [0, 1) aus dem Betriebssystem (Standard-Zufallsquelle der Auslosung). */
export const secureRandom = (): number => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/** Mischt eine Liste (Fisher-Yates), ohne die Eingabe zu ändern. Die Zufallsquelle ist austauschbar, damit Tests deterministisch sind. */
export function shuffle<T>(items: readonly T[], random: () => number = secureRandom): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** K.-o.-Baum für beliebig viele Teams (in Setzreihenfolge). Freilose rücken ohne Spiel eine Runde weiter. Immer n-1 Spiele. */
export function knockout(teamIds: string[]): Fixture[] {
  const n = teamIds.length;
  if (n < 2) return [];
  const size = nextPow2(n);
  const seeds = bracketOrder(size).map((s) => teamIds[s - 1] ?? null);

  // Spiele aller Runden anlegen, von der ersten bis zum Finale
  const rounds: Fixture[][] = [];
  for (let teamsInRound = size, round = 1; teamsInRound >= 2; teamsInRound /= 2, round++) {
    const count = teamsInRound / 2;
    rounds.push(Array.from({ length: count }, (_, slot) => ({ stage: koStage(teamsInRound), round, slot, a: null, b: null })));
  }
  rounds[0].forEach((f, i) => {
    f.a = seeds[2 * i];
    f.b = seeds[2 * i + 1];
  });
  for (let r = 0; r < rounds.length - 1; r++) {
    rounds[r].forEach((f, i) => {
      const next = rounds[r + 1][Math.floor(i / 2)];
      f.feeds = { stage: next.stage, round: next.round, slot: next.slot, side: i % 2 === 0 ? "a" : "b" };
    });
  }

  // Freilose: das einzige Team der Paarung rückt direkt vor
  const byes = rounds[0].filter((f) => !f.a || !f.b);
  for (const f of byes) {
    const team = f.a ?? f.b;
    const next = rounds[1]?.find((x) => x.stage === f.feeds!.stage && x.slot === f.feeds!.slot);
    if (team && next) next[f.feeds!.side] = team;
  }
  rounds[0] = rounds[0].filter((f) => f.a && f.b);
  return rounds.flat();
}

/** Gruppenphase: Anzahl Gruppen so, dass je Gruppe etwa vier Teams spielen und 2·Gruppen eine Zweierpotenz ist. */
export function groupCount(teamCount: number): number {
  if (teamCount >= 25) return 8;
  if (teamCount >= 12) return 4;
  return 2;
}

/** Teams der Reihe nach (Schlangenlinie) auf Gruppen verteilen, damit die Stärke gleich verteilt ist. */
export function drawGroups(teamIds: string[]): string[][] {
  const g = groupCount(teamIds.length);
  const groups: string[][] = Array.from({ length: g }, () => []);
  teamIds.forEach((id, i) => {
    const row = Math.floor(i / g);
    const col = i % g;
    groups[row % 2 === 0 ? col : g - 1 - col].push(id);
  });
  return groups;
}

export const groupName = (i: number) => String.fromCharCode(65 + i);

export function groupFixtures(teamIds: string[]): { groups: string[][]; fixtures: Fixture[] } {
  const groups = drawGroups(teamIds);
  const fixtures = groups.flatMap((ids, i) => roundRobin(ids, `group:${groupName(i)}`));
  return { groups, fixtures };
}

export function standings(teamIds: string[], results: Played[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(teamIds.map((teamId) => [teamId, { teamId, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0 }]));
  const apply = (id: string, gf: number, ga: number) => {
    const r = rows.get(id);
    if (!r) return;
    r.played += 1;
    r.gf += gf;
    r.ga += ga;
    r.gd = r.gf - r.ga;
    if (gf > ga) {
      r.wins += 1;
      r.points += 3;
    } else if (gf === ga) {
      r.draws += 1;
      r.points += 1;
    } else r.losses += 1;
  };
  for (const m of results) {
    apply(m.a, m.scoreA, m.scoreB);
    apply(m.b, m.scoreB, m.scoreA);
  }
  // Punkte, Tordifferenz, erzielte Tore; danach die Reihenfolge der Anmeldung (stabil und nachvollziehbar)
  const order = new Map(teamIds.map((id, i) => [id, i]));
  return [...rows.values()].sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || order.get(x.teamId)! - order.get(y.teamId)!);
}

/** Sieger eines K.-o.-Spiels. Bei Unentschieden zählt das Siebenmeterschießen. null, wenn noch offen. */
export function koWinner(m: { a: string; b: string; scoreA: number; scoreB: number; shootoutWinner?: string | null }): string | null {
  if (m.scoreA > m.scoreB) return m.a;
  if (m.scoreB > m.scoreA) return m.b;
  if (m.shootoutWinner === m.a || m.shootoutWinner === m.b) return m.shootoutWinner;
  return null;
}

/** K.-o.-Runde nach der Gruppenphase: Gruppensieger gegen Zweite einer anderen Gruppe. `tables` in Gruppenreihenfolge A, B, C … */
export function koFromGroups(tables: string[][]): Fixture[] {
  const g = tables.length;
  const winners = tables.map((t) => t[0]);
  const seconds = tables.map((t) => t[1]);
  // Paarungen wie A1-B2, C1-D2, B1-A2, D1-C2 (bei 2 Gruppen: A1-B2, B1-A2)
  const pairs: [string, string][] = [];
  for (let i = 0; i < g; i += 2) pairs.push([winners[i], seconds[i + 1]]);
  for (let i = 0; i < g; i += 2) pairs.push([winners[i + 1], seconds[i]]);

  const size = g * 2;
  const rounds: Fixture[][] = [];
  for (let teamsInRound = size, round = 1; teamsInRound >= 2; teamsInRound /= 2, round++) {
    rounds.push(Array.from({ length: teamsInRound / 2 }, (_, slot) => ({ stage: koStage(teamsInRound), round, slot, a: null, b: null })));
  }
  rounds[0].forEach((f, i) => {
    f.a = pairs[i][0];
    f.b = pairs[i][1];
  });
  for (let r = 0; r < rounds.length - 1; r++) {
    rounds[r].forEach((f, i) => {
      const next = rounds[r + 1][Math.floor(i / 2)];
      f.feeds = { stage: next.stage, round: next.round, slot: next.slot, side: i % 2 === 0 ? "a" : "b" };
    });
  }
  return rounds.flat();
}

export function validateTeamCount(format: "round_robin" | "knockout" | "groups_ko", count: number): string | null {
  if (count < MIN_TEAMS) return "Es braucht mindestens 2 Teams.";
  if (count > MAX_TEAMS) return `Höchstens ${MAX_TEAMS} Teams.`;
  if (format === "groups_ko" && count < MIN_GROUP_TEAMS) return `Gruppen mit K.-o.-Runde brauchen mindestens ${MIN_GROUP_TEAMS} Teams.`;
  return null;
}

/** Geld: Veranstalter bekommt den Rest nach der Provision (Cent, Provision wird abgerundet, also nie mehr als vereinbart). */
export function splitEntryFees(totalCents: number, commissionPercent: number): { commission: number; payout: number } {
  const pct = Math.min(Math.max(commissionPercent, 0), 100);
  const commission = Math.floor((totalCents * pct) / 100);
  return { commission, payout: totalCents - commission };
}

// ---------------------------------------------------------------------------------------------
// Hallenkosten des Turniers, geteilt durch alle Spieler
// ---------------------------------------------------------------------------------------------

/** Gesamtkosten: Preis pro Stunde mal Dauer in Minuten (auf den Cent gerundet). */
export function tournamentTotalCents(hourlyCents: number, durationMin: number): number {
  return Math.round((hourlyCents * durationMin) / 60);
}

/** Anteil pro Spieler nach der tatsächlichen Spielerzahl: gemeinsames Rechenmodul (aufgerundet, nie unterdeckt, keine Reservierung). */
export function finalSharePerPlayer(totalCents: number, players: number): number {
  return shareCents(totalCents, Math.max(players, 1));
}

/** Spanne des Anteils vor dem Start: von "alle Teams voll" bis "jedes Team nur mit dem Minimum" (nur Vorschau, verbindlich wird der Preis bei der Fixierung). */
export function shareRange(totalCents: number, teamCount: number, minPerTeam: number, maxPerTeam: number): { lowest: number; highest: number } {
  return { lowest: finalSharePerPlayer(totalCents, teamCount * maxPerTeam), highest: finalSharePerPlayer(totalCents, teamCount * minPerTeam) };
}

// ---------------------------------------------------------------------------------------------
// Zeitplan: zwei Plätze, feste Pause zwischen den Spielblöcken
// ---------------------------------------------------------------------------------------------

export const COURTS = 2;
/** Pause zwischen zwei Spielblöcken: neues Team einwechseln. */
export const GAP_MIN = 5;

export const roundTitle = (teamsInRound: number) => (teamsInRound === 2 ? "Finale" : teamsInRound === 4 ? "Halbfinale" : teamsInRound === 8 ? "Viertelfinale" : `Runde der letzten ${teamsInRound}`);

export type PlannedGame = { stage: string; slot: number; court: number; fun: boolean };
export type PlannedBlock = { index: number; label: string; startsAt: Date; endsAt: Date; games: PlannedGame[] };

/**
 * Verteilt die K.-o.-Runden auf die gebuchte Hallenzeit: Jede Runde wird in Blöcke zu je `courts` Spielen geteilt (zwei Plätze
 * laufen gleichzeitig). Zwischen den Blöcken liegt eine Pause von `gap` Minuten. Die Spielzeit ergibt sich aus der Buchung,
 * damit der letzte Block genau mit der Hallenzeit endet. Im Finale-Block bleibt Platz 2 frei: dort spielen die beiden
 * Halbfinal-Verlierer ein Spiel nur zum Spaß (`fun`).
 * `rounds` sind die Runden von der ersten bis zum Finale mit ihrer Spielzahl.
 */
export function planSchedule(rounds: { stage: string; games: number }[], startsAt: Date, durationMin: number, courts = COURTS, gap = GAP_MIN): { slotMinutes: number; blocks: PlannedBlock[] } {
  const raw: { stage: string; games: { stage: string; slot: number; court: number; fun: boolean }[] }[] = [];
  rounds.forEach((r, ri) => {
    const isFinal = ri === rounds.length - 1;
    const perBlock = isFinal ? 1 : courts;
    for (let first = 0; first < r.games; first += perBlock) {
      const games = Array.from({ length: Math.min(perBlock, r.games - first) }, (_, i) => ({ stage: r.stage, slot: first + i, court: i + 1, fun: false }));
      if (isFinal && rounds.length >= 2 && courts >= 2) games.push({ stage: r.stage, slot: -1, court: 2, fun: true });
      raw.push({ stage: r.stage, games });
    }
  });
  const count = Math.max(raw.length, 1);
  const slotMinutes = Math.max(Math.floor((durationMin - gap * (count - 1)) / count), 5);
  const blocks = raw.map((b, index) => {
    const start = new Date(startsAt.getTime() + index * (slotMinutes + gap) * 60_000);
    const n = Number(b.stage.slice(3));
    return { index, label: roundTitle(n), startsAt: start, endsAt: new Date(start.getTime() + slotMinutes * 60_000), games: b.games };
  });
  return { slotMinutes, blocks };
}
