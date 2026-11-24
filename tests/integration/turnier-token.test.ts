import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { tournamentPlayers, tournamentTeams } from "@/db/schema-league";
import { TOKEN_UNGUELTIG_TEXT } from "@/lib/turnier-token";
import { createTournament, getTournament, joinAsPlayer, registerTeam, setOrganizer } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser, tokenOf } from "./helpers";

// PR 3 (Entscheid t2q 2026-11-27): privates Turnier + fehlender/falscher Token = NICHTS (Seite) und KEINE Anmeldung (Server). Gleiche Antwort für "gibt es nicht" und "falscher Token".
afterAll(cleanup);

const T0 = Date.now();
const base = { name: "Token-Cup", city: "Essen", startsAt: new Date(T0 + 5 * 86_400_000), registrationDeadline: new Date(T0 + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 0 };
async function organizer() {
  const o = await makeUser("tkorg");
  const admin = await makeUser("tkadm", "admin");
  await setOrganizer(admin.id, o.id, true);
  return { o, admin };
}
const teamsIn = async (tid: string) => (await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, tid))).length;

describe("Seite: getTournament", () => {
  it("privat: Gast und Fremde ohne/mit falschem/leerem/fremdem Token bekommen NICHTS, genau wie bei einem unbekannten Turnier", async () => {
    const { o } = await organizer();
    const t = await createTournament(o.id, { ...base, isPrivate: true });
    const anderes = await createTournament(o.id, { ...base, isPrivate: true });
    const fremd = await makeUser("tkfremd");
    const unbekannt = "11111111-2222-4333-8444-555555555555";
    const antworten: unknown[] = [];
    for (const viewer of [null, { id: fremd.id, role: "player" as const }]) {
      for (const token of [undefined, null, "", "falsch", "x".repeat(500), (await tokenOf(anderes.id)) ?? "", t.inviteToken!.slice(0, -1), t.inviteToken!.toUpperCase() === t.inviteToken ? "ZZ" : t.inviteToken!.toUpperCase()]) {
        antworten.push(await getTournament(t.id, viewer, token as string | null | undefined));
      }
      antworten.push(await getTournament(unbekannt, viewer, "falsch"));
      antworten.push(await getTournament("keine-uuid", viewer, "falsch"));
    }
    expect(antworten.every((a) => a === null)).toBe(true); // "falscher Token" und "gibt es nicht" sind nicht zu unterscheiden
  });

  it("privat: mit dem richtigen Token (Gast und Fremder), Veranstalter, Plattform-Admin und Mitglied eines angemeldeten Teams sehen es; der Token wird Gästen nicht zurückgegeben", async () => {
    const { o, admin } = await organizer();
    const t = await createTournament(o.id, { ...base, isPrivate: true });
    const fremd = await makeUser("tkfremd2");
    const cap = await makeUser("tkcap");
    const team = await makeTeam(cap.id, "Token");
    await registerTeam(cap.id, t.id, team.id, t.inviteToken);
    const mitglied = await makeUser("tkmit");
    await db.insert(teamMembers).values({ teamId: team.id, userId: mitglied.id, role: "player" });
    expect(await getTournament(t.id, null, t.inviteToken)).not.toBeNull();
    const fremdMitToken = await getTournament(t.id, { id: fremd.id, role: "player" }, t.inviteToken);
    expect(fremdMitToken).not.toBeNull();
    expect(fremdMitToken!.tournament.inviteToken).toBeNull(); // nicht zum Weitergeben
    expect((await getTournament(t.id, { id: o.id, role: "player" }))!.tournament.inviteToken).toBe(t.inviteToken);
    expect(await getTournament(t.id, { id: admin.id, role: "admin" })).not.toBeNull();
    expect(await getTournament(t.id, { id: cap.id, role: "player" })).not.toBeNull();
    expect(await getTournament(t.id, { id: mitglied.id, role: "player" })).not.toBeNull(); // Mitglied des angemeldeten Teams (ohne Token)
  });

  it("öffentliches Turnier: alle sehen es, auch mit falschem Token (der Token spielt keine Rolle)", async () => {
    const { o } = await organizer();
    const t = await createTournament(o.id, { ...base, isPrivate: false });
    expect(await getTournament(t.id, null)).not.toBeNull();
    expect(await getTournament(t.id, null, "falsch")).not.toBeNull();
  });
});

describe("Server: registerTeam braucht bei privaten Turnieren den Token", () => {
  it("ohne und mit falschem Token: dieselbe neutrale Meldung, es entsteht nichts; mit Token klappt es", async () => {
    const { o } = await organizer();
    const t = await createTournament(o.id, { ...base, isPrivate: true });
    const cap = await makeUser("tkcap2");
    const team = await makeTeam(cap.id, "TokenA");
    for (const token of [undefined, null, "", "falsch", (await tokenOf((await createTournament(o.id, { ...base, isPrivate: true })).id)) ?? ""]) {
      await expect(registerTeam(cap.id, t.id, team.id, token)).rejects.toThrow(TOKEN_UNGUELTIG_TEXT);
    }
    expect(await teamsIn(t.id)).toBe(0);
    await registerTeam(cap.id, t.id, team.id, t.inviteToken);
    expect(await teamsIn(t.id)).toBe(1);
  });

  it("kein Orakel: die Token-Prüfung kommt VOR allen anderen (voll, Team unbekannt, schon angemeldet, Anmeldeschluss) und liefert immer denselben Text", async () => {
    const { o } = await organizer();
    const t = await createTournament(o.id, { ...base, isPrivate: true, maxTeams: 4 });
    const cap = await makeUser("tkcap3");
    const team = await makeTeam(cap.id, "TokenB");
    await registerTeam(cap.id, t.id, team.id, t.inviteToken);
    const zweite = await makeTeam(cap.id, "TokenC");
    await expect(registerTeam(cap.id, t.id, team.id, "falsch")).rejects.toThrow(TOKEN_UNGUELTIG_TEXT); // schon angemeldet, aber falscher Token
    await expect(registerTeam(cap.id, t.id, zweite.id, "falsch")).rejects.toThrow(TOKEN_UNGUELTIG_TEXT);
    await expect(registerTeam(cap.id, t.id, "00000000-0000-4000-8000-000000000000", "falsch")).rejects.toThrow(TOKEN_UNGUELTIG_TEXT); // Team unbekannt
    // mit richtigem Token kommen die fachlichen Meldungen wie bisher
    await expect(registerTeam(cap.id, t.id, team.id, t.inviteToken)).rejects.toThrow(/schon angemeldet/);
  });

  it("Veranstalter und Plattform-Admin brauchen keinen Token; öffentliche Turniere keinen", async () => {
    const { o, admin } = await organizer();
    const priv = await createTournament(o.id, { ...base, isPrivate: true });
    const pub = await createTournament(o.id, { ...base, isPrivate: false });
    const teamO = await makeTeam(o.id, "TokenO");
    await registerTeam(o.id, priv.id, teamO.id); // Veranstalter mit eigenem Team
    const teamA = await makeTeam(admin.id, "TokenAd");
    await registerTeam(admin.id, priv.id, teamA.id); // Plattform-Admin
    const cap = await makeUser("tkcap4");
    const team = await makeTeam(cap.id, "TokenP");
    await registerTeam(cap.id, pub.id, team.id); // öffentlich, ohne Token
    expect(await teamsIn(priv.id)).toBe(2);
    expect(await teamsIn(pub.id)).toBe(1);
  });

  it("Mitspieler eines angemeldeten Teams treten dem Kader weiter ohne Token bei (Team-Mitgliedschaft ist die Berechtigung)", async () => {
    const { o } = await organizer();
    const t = await createTournament(o.id, { ...base, isPrivate: true });
    const cap = await makeUser("tkcap5");
    const team = await makeTeam(cap.id, "TokenD");
    await registerTeam(cap.id, t.id, team.id, t.inviteToken);
    const p = await makeUser("tkpl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, t.id, team.id);
    expect((await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.userId, p.id))).length).toBe(1);
  });
});
