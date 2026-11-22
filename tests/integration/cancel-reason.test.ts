import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { cancelMatch, cancelMatchTx } from "@/server/lobby";
import { cleanup, makeMatch } from "./helpers";

afterAll(async () => {
  await cleanup();
});
const row = async (id: string) => (await db.select().from(matches).where(eq(matches.id, id)))[0];

describe("Absagegrund wird am Spiel gespeichert", () => {
  it("Captain-Absage: Grund (getrimmt) steht in matches.cancel_reason, Status abgesagt", async () => {
    const m = await makeMatch({ hoursAhead: 100 });
    await cancelMatch(m.adminA.id, m.match.id, "  Halle fällt aus  ");
    const r = await row(m.match.id);
    expect(r.status).toBe("cancelled");
    expect(r.cancelReason).toBe("Halle fällt aus");
  });

  it("Captain-Text: höchstens 200 Zeichen und mindestens 3, nichts wird gespeichert", async () => {
    const m = await makeMatch({ hoursAhead: 100 });
    expect(() => cancelMatch(m.adminA.id, m.match.id, "x".repeat(201))).toThrow(/200/);
    expect(() => cancelMatch(m.adminA.id, m.match.id, "ab")).toThrow(/3 Zeichen/);
    const r = await row(m.match.id);
    expect(r.status).not.toBe("cancelled");
    expect(r.cancelReason).toBeNull();
  });

  it("System-/Job-Pfad (ohne Akteur): Grund wird gespeichert", async () => {
    const m = await makeMatch({ hoursAhead: 100 });
    await db.transaction(async (tx) => cancelMatchTx(tx, await row(m.match.id), null, "Zu wenige Spieler bereit"));
    expect((await row(m.match.id)).cancelReason).toBe("Zu wenige Spieler bereit");
  });

  it("Erstattungspfad: der schon gesetzte Grund bleibt (kein anderer Text überschreibt ihn)", async () => {
    const m = await makeMatch({ hoursAhead: 100 });
    await db.update(matches).set({ cancelReason: "Grund der Anfrage" }).where(eq(matches.id, m.match.id));
    const before = await row(m.match.id);
    // refund.ts ruft nach der Erstattung mit dem gespeicherten Grund auf (m.cancelReason ?? Standardtext)
    await db.transaction(async (tx) => cancelMatchTx(tx, before, null, before.cancelReason ?? "Das Spiel wurde abgesagt.", { afterRefund: true }));
    expect((await row(m.match.id)).cancelReason).toBe("Grund der Anfrage");
  });
});
