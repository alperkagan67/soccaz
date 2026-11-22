import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { setSetting } from "@/server/settings";
import { assignSubstitute, joinAsSubstitute, unassignParticipant } from "@/server/lobby";
import { cleanup, makeMatch, makeUser } from "./helpers";

// Server prüft dieselben Sperren wie die Oberfläche (security-review Lobby-Logik): Direktaufruf nach der Frist wird abgelehnt, davor geht es.
beforeEach(async () => {
  await setSetting(null, "payments_enabled", true);
});
afterAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

/** Frist erreicht: vor 5 Tagen angelegt, Anstoß in 30 Stunden (langer Vorlauf, 48-h-Frist vorbei). */
const closeIt = (id: string) => db.update(matches).set({ createdAt: new Date(Date.now() - 5 * 24 * 3_600_000), startsAt: new Date(Date.now() + 30 * 3_600_000) }).where(eq(matches.id, id));
const LOCKED = /gesperrt/;

describe("joinAsSubstitute", () => {
  it("vor der Frist ok, nach der Frist abgelehnt", async () => {
    const m = await makeMatch({ hoursAhead: 100 });
    const a = await makeUser("s1");
    await joinAsSubstitute(a.id, m.match.id);
    await closeIt(m.match.id);
    const b = await makeUser("s2");
    await expect(joinAsSubstitute(b.id, m.match.id)).rejects.toThrow(LOCKED);
  });
});

describe("assignSubstitute", () => {
  it("vor der Frist ok, nach der Frist abgelehnt", async () => {
    const m = await makeMatch({ hoursAhead: 100 });
    const a = await makeUser("a1");
    const b = await makeUser("a2");
    await joinAsSubstitute(a.id, m.match.id);
    await joinAsSubstitute(b.id, m.match.id);
    await assignSubstitute(m.adminA.id, m.match.id, a.id, m.home.id);
    await closeIt(m.match.id);
    await expect(assignSubstitute(m.adminA.id, m.match.id, b.id, m.home.id)).rejects.toThrow(LOCKED);
  });
});

describe("unassignParticipant (Privatspiel)", () => {
  it("in den Pool: vor 48 Stunden ok, danach abgelehnt", async () => {
    const m = await makeMatch({ hoursAhead: 100 });
    await db.update(matches).set({ kind: "private" }).where(eq(matches.id, m.match.id));
    await unassignParticipant(m.adminA.id, m.match.id, m.adminB.id);
    await db.update(matches).set({ startsAt: new Date(Date.now() + 30 * 3_600_000) }).where(eq(matches.id, m.match.id));
    await expect(unassignParticipant(m.adminA.id, m.match.id, m.adminA.id)).rejects.toThrow(LOCKED);
  });
});
