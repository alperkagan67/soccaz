import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications, teamMembers } from "@/db/schema";
import { tournaments } from "@/db/schema-league";
import { createTournament, joinAsPlayer, registerTeam, setOrganizer, setRosterComplete } from "@/server/tournaments";
import { setSetting } from "@/server/settings";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Zahlungen AUS: die Meldung "alle Teams vollzählig" richtet sich nach dem Preis (R-T422): Turnier OHNE Preis bekommt die Meldung ohne Zahlungstexte,
// ein Turnier MIT Preis (Altbestand) behält "Der Preis steht fest" (Typ payment), weil seine Seite im Kartenfluss bleibt.
afterAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

async function volleRunde(totalCents: number) {
  await setSetting(null, "payments_enabled", false);
  await setSetting(null, "card_payments_enabled", false);
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  const T0 = Date.now();
  const t = await createTournament(o.id, {
    name: "Meldungs-Cup", city: "Essen", startsAt: new Date(T0 + 5 * 86_400_000), registrationDeadline: new Date(T0 + 3 * 86_400_000),
    maxTeams: 4, durationMin: 120, hourlyCents: 8000,
  } as Parameters<typeof createTournament>[1]);
  await db.update(tournaments).set({ totalCents, hourlyCents: totalCents === 0 ? 0 : 8000 }).where(eq(tournaments.id, t.id)); // Preis unabhängig von der Anlege-Regel setzen
  let firstCaptain = "";
  for (let n = 0; n < 4; n++) {
    const captain = await makeUser("cap");
    firstCaptain ||= captain.id;
    const team = await makeTeam(captain.id, "Turnier");
    await registerTeam(captain.id, t.id, team.id);
    for (let i = 1; i < 5; i++) {
      const p = await makeUser("pl");
      await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
      await joinAsPlayer(p.id, t.id, team.id);
    }
    await setRosterComplete(captain.id, t.id, true);
  }
  return { tid: t.id, captain: firstCaptain };
}

describe("Meldung bei vollzähligen Teams im Modus Zahlungen AUS", () => {
  it("Turnier MIT Preis: weiter 'Der Preis steht fest' (payment)", async () => {
    const { tid, captain } = await volleRunde(16000);
    const rows = await db.select().from(notifications).where(and(eq(notifications.userId, captain), eq(notifications.url, `/turniere/${tid}`)));
    expect(rows.map((r) => [r.type, r.title])).toContainEqual(["payment", "Der Preis steht fest"]);
  });

  it("Turnier OHNE Preis: 'Alle Teams sind vollzählig' (system), kein Preis-Text", async () => {
    const { tid, captain } = await volleRunde(0);
    const rows = await db.select().from(notifications).where(and(eq(notifications.userId, captain), eq(notifications.url, `/turniere/${tid}`)));
    expect(rows.map((r) => [r.type, r.title])).toContainEqual(["system", "Alle Teams sind vollzählig"]);
    expect(rows.some((r) => r.title === "Der Preis steht fest")).toBe(false);
  });
});
