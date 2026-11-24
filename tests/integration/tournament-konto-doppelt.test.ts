import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { tournamentPlayers } from "@/db/schema-league";
import { createTournament, joinAsPlayer, registerTeam, setOrganizer } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser, tokenOf } from "./helpers";

// Turnier 12.12. (Paket b): ein KONTO darf in einem Turnier nur in EINEM Team spielen (PK Turnier + Nutzer, Server-Sperre unter der Turniersperre). Der Demo-Fund "gleicher Name in zwei Teams" sind zwei Konten (Seed nutzt Namen mehrfach, E-Mails sind eindeutig).
afterAll(cleanup);

const T0 = Date.now();
const base = { name: "Konto-Cup", city: "Essen", startsAt: new Date(T0 + 5 * 86_400_000), registrationDeadline: new Date(T0 + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };

async function tournament() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  return createTournament(o.id, base);
}
const rowsOf = (tid: string, userId: string) => db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tid), eq(tournamentPlayers.userId, userId)));

describe("Ein Konto, ein Team je Turnier", () => {
  it("Mitglied zweier angemeldeter Teams: das zweite Team wird mit klarer Meldung abgewiesen, der Kader des ersten bleibt", async () => {
    const t = await tournament();
    const capA = await makeUser("capa");
    const capB = await makeUser("capb");
    const teamA = await makeTeam(capA.id, "Konto A");
    const teamB = await makeTeam(capB.id, "Konto B");
    await registerTeam(capA.id, t.id, teamA.id, await tokenOf(t.id));
    await registerTeam(capB.id, t.id, teamB.id, await tokenOf(t.id));
    const doppelt = await makeUser("doppelt");
    await db.insert(teamMembers).values([{ teamId: teamA.id, userId: doppelt.id, role: "player" }, { teamId: teamB.id, userId: doppelt.id, role: "player" }]);
    await joinAsPlayer(doppelt.id, t.id, teamA.id);
    await expect(joinAsPlayer(doppelt.id, t.id, teamB.id)).rejects.toThrow(/in einem anderen Team dieses Turniers/);
    const rows = await rowsOf(t.id, doppelt.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].teamId).toBe(teamA.id);
  });

  it("Captain von Team A (spielt dort mit) kann nicht zugleich im angemeldeten Team B spielen", async () => {
    const t = await tournament();
    const capA = await makeUser("capa2");
    const capB = await makeUser("capb2");
    const teamA = await makeTeam(capA.id, "Konto A2");
    const teamB = await makeTeam(capB.id, "Konto B2");
    await registerTeam(capA.id, t.id, teamA.id, await tokenOf(t.id));
    await registerTeam(capB.id, t.id, teamB.id, await tokenOf(t.id));
    await db.insert(teamMembers).values({ teamId: teamB.id, userId: capA.id, role: "player" });
    await expect(joinAsPlayer(capA.id, t.id, teamB.id)).rejects.toThrow(/in einem anderen Team dieses Turniers/);
    expect(await rowsOf(t.id, capA.id)).toHaveLength(1);
  });

  it("Captain zweier Teams: das zweite Team kann nicht angemeldet werden (bestehend), und zweimal dasselbe Team bleibt 'schon im Turnier-Kader'", async () => {
    const t = await tournament();
    const cap = await makeUser("cap2x");
    const team1 = await makeTeam(cap.id, "Eins");
    const team2 = await makeTeam(cap.id, "Zwei");
    await registerTeam(cap.id, t.id, team1.id, await tokenOf(t.id));
    await expect(registerTeam(cap.id, t.id, team2.id, await tokenOf(t.id))).rejects.toThrow(/schon in einem anderen Team dieses Turniers/);
    await expect(joinAsPlayer(cap.id, t.id, team1.id)).rejects.toThrow(/schon im Turnier-Kader/);
  });

  it("zwei KONTEN mit gleichem Namen sind zwei Spieler und dürfen in zwei Teams spielen (Demo-Fund)", async () => {
    const t = await tournament();
    const capA = await makeUser("capa3");
    const capB = await makeUser("capb3");
    const teamA = await makeTeam(capA.id, "Konto A3");
    const teamB = await makeTeam(capB.id, "Konto B3");
    await registerTeam(capA.id, t.id, teamA.id, await tokenOf(t.id));
    await registerTeam(capB.id, t.id, teamB.id, await tokenOf(t.id));
    const x1 = await makeUser("gleich");
    const x2 = await makeUser("gleich");
    await db.update((await import("@/db/schema")).users).set({ name: "Deniz Kaya" }).where(eq((await import("@/db/schema")).users.id, x1.id));
    await db.update((await import("@/db/schema")).users).set({ name: "Deniz Kaya" }).where(eq((await import("@/db/schema")).users.id, x2.id));
    await db.insert(teamMembers).values([{ teamId: teamA.id, userId: x1.id, role: "player" }, { teamId: teamB.id, userId: x2.id, role: "player" }]);
    await joinAsPlayer(x1.id, t.id, teamA.id);
    await joinAsPlayer(x2.id, t.id, teamB.id);
    expect(await rowsOf(t.id, x1.id)).toHaveLength(1);
    expect(await rowsOf(t.id, x2.id)).toHaveLength(1);
  });
});
