import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { tournaments } from "@/db/schema-league";
import { createTournament, isCaptainOfAnyTeam, registerTeam, setOrganizer } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// 013 M3 PR 2: "Team anmelden" in der Turnierliste ist nur für Captains sichtbar; der SERVER entscheidet (registerTeam), nicht die Oberfläche.

afterAll(cleanup);

const T0 = Date.now();
const base = { name: "Captain-Cup", city: "Essen", startsAt: new Date(T0 + 5 * 86_400_000), registrationDeadline: new Date(T0 + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 8000, entryFeeCents: 0 } as Parameters<typeof createTournament>[1];

async function openTournament() {
  const o = await makeUser("org");
  const admin = await makeUser("tadm", "admin");
  await setOrganizer(admin.id, o.id, true);
  return createTournament(o.id, base);
}

describe("Turnier-Anmeldung nur durch Captains (Server)", () => {
  it("ein einfaches Teammitglied kann das Team nicht anmelden, ein Team-Admin schon", async () => {
    const t = await openTournament();
    const captain = await makeUser("cap");
    const team = await makeTeam(captain.id, "Captains");
    const member = await makeUser("mem");
    await db.insert(teamMembers).values({ teamId: team.id, userId: member.id, role: "player" });
    await expect(registerTeam(member.id, t.id, team.id)).rejects.toThrow(/Team-Admin/);
    await registerTeam(captain.id, t.id, team.id);
  });

  it("ein Fremder (kein Mitglied) kann kein fremdes Team anmelden", async () => {
    const t = await openTournament();
    const captain = await makeUser("cap");
    const team = await makeTeam(captain.id, "Fremd");
    const stranger = await makeUser("str");
    await expect(registerTeam(stranger.id, t.id, team.id)).rejects.toThrow(/Team-Admin/);
  });

  it("bei geschlossener Anmeldung lehnt der Server auch den Captain ab", async () => {
    const t = await openTournament();
    await db.update(tournaments).set({ status: "payment" }).where(eq(tournaments.id, t.id));
    const captain = await makeUser("cap");
    const team = await makeTeam(captain.id, "Spaet");
    await expect(registerTeam(captain.id, t.id, team.id)).rejects.toThrow(/geschlossen/);
  });

  it("isCaptainOfAnyTeam (nur Anzeige): Admin eines aktiven Teams ja; Mitglied, Fremder und Admin eines archivierten Teams nein", async () => {
    const captain = await makeUser("cap");
    const team = await makeTeam(captain.id, "Anzeige");
    const member = await makeUser("mem");
    await db.insert(teamMembers).values({ teamId: team.id, userId: member.id, role: "player" });
    const stranger = await makeUser("str");
    expect(await isCaptainOfAnyTeam(captain.id)).toBe(true);
    expect(await isCaptainOfAnyTeam(member.id)).toBe(false);
    expect(await isCaptainOfAnyTeam(stranger.id)).toBe(false);
    await db.update(teams).set({ archivedAt: new Date() }).where(eq(teams.id, team.id));
    expect(await isCaptainOfAnyTeam(captain.id)).toBe(false);
  });
});
