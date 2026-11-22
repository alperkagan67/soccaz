import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Vertrag 009 M1, E1b (docs/design/009-m1-plan.md Abschnitt 4): Ratsche gegen neue Rollenprüfungen außerhalb von roles.ts.
// Admin 1 trägt role = 'admin'; bisherige Prüfungen bleiben gültig. Neue Prüfungen auf users.role gehören in lib/roles.ts (isPlatformAdmin, isOwner, canUser).
// Die Liste unten friert den Stand ein (sie enthält auch Prüfungen der TEAM-Rolle, die denselben Text tragen). Sie darf nur kleiner werden:
// Wer eine Stelle entfernt, senkt die Zahl; wer eine neue Prüfung braucht, nutzt die Helfer statt die Liste zu erhöhen.
const PATTERN = /\brole (?:===|!==) "admin"|eq\(users\.role,|inArray\(users\.role,/g;
const FROZEN: Record<string, number> = {
  "app/app/page.tsx": 1,
  "app/app/turniere/neu/page.tsx": 1,
  "app/lobby/[id]/uebersicht/page.tsx": 1,
  "app/spieler/[id]/page.tsx": 2,
  "app/teams/[slug]/page.tsx": 2,
  "auth.ts": 1,
  "server/account.ts": 2,
  "server/admin.ts": 2,
  "server/booking.ts": 1,
  "server/challenges.ts": 1,
  "server/clips-actions.ts": 1,
  "server/content.ts": 1,
  "server/leagues.ts": 2,
  "server/lobby.ts": 4,
  "server/matchmaking.ts": 5,
  "server/media.ts": 3,
  "server/notifications.ts": 1,
  "server/payments/refund.ts": 1,
  "server/privategame.ts": 2,
  "server/pro-events.ts": 2,
  "server/profiles.ts": 2,
  "server/requests.ts": 1,
  "server/results.ts": 3,
  "server/roster.ts": 1,
  "server/scheduled.ts": 1,
  "server/session.ts": 1,
  "server/stats.ts": 1,
  "server/streams.ts": 1,
  "server/team-admin.ts": 3,
  "server/teams.ts": 1,
  "server/tournaments.ts": 5
};
const SRC = path.resolve(import.meta.dirname, "../../src");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });

describe("Rollenprüfungen außerhalb von roles.ts (Ratsche)", () => {
  const found: Record<string, number> = {};
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join("/");
    if (rel === "lib/roles.ts") continue;
    const n = (readFileSync(file, "utf8").match(PATTERN) ?? []).length;
    if (n > 0) found[rel] = n;
  }
  it("keine neue Datei und keine höhere Zahl als der eingefrorene Stand", () => {
    const grew = Object.entries(found).filter(([f, n]) => n > (FROZEN[f] ?? 0));
    expect(grew, `Neue oder zusätzliche Rollenprüfungen: ${JSON.stringify(grew)}. Helfer aus lib/roles.ts nutzen.`).toEqual([]);
  });
});
