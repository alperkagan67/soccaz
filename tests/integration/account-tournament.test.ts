import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentCharges, teamMembers, users } from "@/db/schema";
import { tournamentPlayers, tournaments } from "@/db/schema-league";
import { deleteAccount, exportCardData } from "@/server/account";
import { createTournament, joinAsPlayer, registerTeam, setOrganizer } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser, tokenOf } from "./helpers";

// 012 M5-5 (DSGVO): Loeschsperre bei offenem Turnier, Aufraeumen der Uebernahme-Einwilligung, Export nennt die Turnierzeilen.

afterAll(cleanup);

const T0 = Date.now();
const base = { name: "Konto-Cup", city: "Essen", startsAt: new Date(T0 + 5 * 86_400_000), registrationDeadline: new Date(T0 + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };

async function squadWithMember() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  const t = await createTournament(o.id, base);
  const captain = await makeUser("cap");
  const team = await makeTeam(captain.id, "Turnier");
  await registerTeam(captain.id, t.id, team.id, await tokenOf(t.id));
  const member = await makeUser("mem");
  await db.insert(teamMembers).values({ teamId: team.id, userId: member.id, role: "player" });
  await joinAsPlayer(member.id, t.id, team.id);
  const other = await makeUser("oth");
  await db.insert(teamMembers).values({ teamId: team.id, userId: other.id, role: "player" });
  await joinAsPlayer(other.id, t.id, team.id);
  return { t, captain, team, member, other };
}

describe("M5-5: Konto loeschen und Turniere", () => {
  it("ein Spieler in einem offenen Turnier (Anmeldung, Zahlungsphase, laeuft) kann das Konto nicht loeschen", async () => {
    for (const status of ["registration", "payment", "running"] as const) {
      const { t, member } = await squadWithMember();
      await db.update(tournaments).set({ status }).where(eq(tournaments.id, t.id));
      await expect(deleteAccount(member.id), status).rejects.toThrow(/Turnier/);
      const [u] = await db.select({ bannedAt: users.bannedAt, email: users.email }).from(users).where(eq(users.id, member.id));
      expect(u.email).toContain("@test.local"); // nicht anonymisiert
    }
  });

  it("nach Absage oder Ende geht die Loeschung; die Einwilligung zu 'Anteil uebernehmen' (Uebernehmer UND Platz) wird aufgeraeumt, die Zeilen bleiben anonymisiert", async () => {
    const { t, member, other } = await squadWithMember();
    // other uebernimmt den Anteil von member (Einwilligung gespeichert)
    await db.update(tournamentPlayers).set({ coveredByUserId: other.id, coverMandateText: "cover.mandate.v1.entwurf", coverAcceptedAt: new Date() }).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, member.id)));
    await db.update(tournaments).set({ status: "cancelled" }).where(eq(tournaments.id, t.id));
    await deleteAccount(member.id);
    const rows = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id));
    expect(rows.find((r) => r.userId === member.id)).toMatchObject({ coveredByUserId: null, coverMandateText: null, coverAcceptedAt: null });
    // als UEBERNEHMER: die zweite Einwilligung wird ebenfalls geloescht
    const { t: t2, member: m2, other: o2 } = await squadWithMember();
    await db.update(tournamentPlayers).set({ coveredByUserId: o2.id, coverMandateText: "cover.mandate.v1.entwurf", coverAcceptedAt: new Date() }).where(and(eq(tournamentPlayers.tournamentId, t2.id), eq(tournamentPlayers.userId, m2.id)));
    await db.update(tournaments).set({ status: "finished" }).where(eq(tournaments.id, t2.id));
    await deleteAccount(o2.id);
    const rows2 = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t2.id));
    expect(rows2.find((r) => r.userId === m2.id)).toMatchObject({ coveredByUserId: null, coverMandateText: null, coverAcceptedAt: null });
  });

  it("der Datenexport nennt Turnier-Abbuchungen mit tournamentId (als Platz) und keine fremden Zeilen", async () => {
    const { t, member, other } = await squadWithMember();
    await db.insert(paymentCharges).values({ tournamentId: t.id, userId: member.id, amountCents: 1000, idempotencyKey: `acct:${t.id}:${member.id}` });
    const mine = await exportCardData(member.id);
    expect(mine.charges.map((c) => c.tournamentId)).toEqual([t.id]);
    expect(mine.charges[0].matchId).toBeNull();
    expect((await exportCardData(other.id)).charges).toEqual([]);
  });
});
