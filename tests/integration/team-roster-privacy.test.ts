import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matchEvents, matches } from "@/db/schema";
import { getTeamProfile, getTeamRosterView } from "@/server/profiles";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

afterAll(cleanup);

/** Ein Team mit Admin, zwei weiteren Mitgliedern und einem gespielten öffentlichen Spiel, in dem ein Mitglied ein Tor schoss. */
async function teamWithHistory() {
  const { match, home, adminA } = await makeMatch();
  const p1 = await addPlayer(match.id, home.id, "kader");
  const p2 = await addPlayer(match.id, home.id, "kader");
  await db.update(matches).set({ status: "played", visibility: "public" }).where(eq(matches.id, match.id));
  await db.insert(matchEvents).values({ matchId: match.id, type: "goal", userId: p1.id, teamId: home.id });
  return { home, admin: adminA, p1, p2 };
}

describe("Kader-Namen auf der Teamseite: nur Mitglieder und eingeloggte Nutzer (Backlog B-b, AC-2)", () => {
  it("Gäste bekommen nur die Anzahl, keine Namen und keine IDs; eingeloggte Fremde und Mitglieder sehen den Kader", async () => {
    const { home, admin, p1, p2 } = await teamWithHistory();
    const stranger = await makeUser("fremd");

    const guest = await getTeamRosterView(home.id, null);
    expect(guest.count).toBe(3); // Spielerzahl bleibt sichtbar
    expect(guest.members).toEqual([]);
    const json = JSON.stringify(guest);
    for (const u of [admin, p1, p2]) {
      expect(json).not.toContain(u.name);
      expect(json).not.toContain(u.id);
    }

    for (const viewer of [stranger, p2, admin]) {
      const view = await getTeamRosterView(home.id, viewer.id);
      expect(view.count).toBe(3);
      expect(view.members.map((m) => m.userId).sort()).toEqual([admin.id, p1.id, p2.id].sort());
      expect(view.members.every((m) => m.name.length > 0)).toBe(true);
    }
  });

  it("Torjäger (Namen) stehen im Profil nur für eingeloggte Nutzer; Gäste und Aufrufe ohne Angabe bekommen keine; Team, Rang und Statistik bleiben gleich", async () => {
    const { home, p1 } = await teamWithHistory();
    const stranger = await makeUser("fremd");

    const asUser = await getTeamProfile(home.slug, null, stranger.id);
    expect(asUser!.topScorers.map((s) => s.id)).toEqual([p1.id]);

    for (const guest of [await getTeamProfile(home.slug, null, null), await getTeamProfile(home.slug)]) {
      expect(guest!.topScorers).toEqual([]);
      expect(JSON.stringify(guest!.topScorers)).not.toContain(p1.id);
      expect(guest!.team.name).toBe(asUser!.team.name); // Existenz, Name, Stadt wie bisher
      expect(guest!.team.city).toBe(asUser!.team.city);
      expect(guest!.stats).toEqual(asUser!.stats);
      expect(guest!.cityRank).toBe(asUser!.cityRank);
    }
  });
});
