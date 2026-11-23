import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, notifications } from "@/db/schema";
import { cleanup, makeMatch } from "./helpers";
import { closeLegacyGames, CLOSE_ACTION, CLOSE_REASON } from "../../scripts/lib/close-legacy-games";

// 012 M6 (F2): Altspiele mit Guthabenzahlung schließen. Trockenlauf Standard; apply schließt nur offene Altspiele MIT Geld; idempotent; keine Ledger-Buchung.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
afterAll(async () => {
  await pool.end();
  await cleanup();
});

async function ledgerCount(): Promise<number> {
  const r = await db.execute(sql`select count(*)::int as n from ledger_entries`);
  return ((r as unknown as { rows?: { n: number }[] }).rows ?? (r as unknown as { n: number }[]))[0].n;
}
const statusOf = async (id: string) => (await db.select().from(matches).where(eq(matches.id, id)))[0].status;
const markers = (ids: string[]) => db.select().from(auditLog).where(inArray(auditLog.entityId, ids)).then((r) => r.filter((a) => a.action === CLOSE_ACTION));

async function scenario() {
  const legacyPaid = await makeMatch({ legacy: true });
  const legacyFree = await makeMatch({ legacy: true }); // Altspiel ohne Zahlung
  const modern = await makeMatch({ legacy: false }); // neues Modell, auch mit Geld nicht betroffen
  const legacyDone = await makeMatch({ legacy: true }); // Altspiel, schon gespielt
  await db.update(matchParticipants).set({ paidCents: 2000 }).where(eq(matchParticipants.matchId, legacyPaid.match.id));
  await db.update(matchParticipants).set({ paidCents: 2000 }).where(eq(matchParticipants.matchId, modern.match.id));
  await db.update(matchParticipants).set({ paidCents: 2000 }).where(eq(matchParticipants.matchId, legacyDone.match.id));
  await db.update(matches).set({ status: "played" }).where(eq(matches.id, legacyDone.match.id));
  const ids = [legacyPaid.match.id, legacyFree.match.id, modern.match.id, legacyDone.match.id];
  return { legacyPaid, legacyFree, modern, legacyDone, ids };
}

describe("close-legacy-games (F2)", () => {
  it("Trockenlauf (Standard) listet nur das richtige Spiel und ändert nichts", async () => {
    const s = await scenario();
    const ledgerBefore = await ledgerCount();
    const r = await closeLegacyGames(pool, { only: s.ids });
    expect(r).toMatchObject({ apply: false, closed: 0, notified: 0 });
    expect(r.games.map((g) => g.matchId)).toEqual([s.legacyPaid.match.id]);
    expect(r.games[0]).toMatchObject({ participants: 2, paidParticipants: 2, paidCents: 4000 });
    for (const id of s.ids) expect(await statusOf(id)).toBe(id === s.legacyDone.match.id ? "played" : "lobby");
    expect(await markers(s.ids)).toHaveLength(0);
    expect(await ledgerCount()).toBe(ledgerBefore);
    expect(await db.select().from(notifications).where(eq(notifications.title, "Spiel geschlossen")).then((n) => n.filter((x) => x.url === `/lobby/${s.legacyPaid.match.id}`))).toHaveLength(0);
  });

  it("apply schließt nur das offene Altspiel mit Geld, markiert, benachrichtigt ohne Geldversprechen; Hauptbuch und paid_cents unverändert", async () => {
    const s = await scenario();
    const ledgerBefore = await ledgerCount();
    const r = await closeLegacyGames(pool, { apply: true, only: s.ids });
    expect(r).toMatchObject({ apply: true, closed: 1, notified: 2 });
    expect(await statusOf(s.legacyPaid.match.id)).toBe("cancelled");
    expect((await db.select().from(matches).where(eq(matches.id, s.legacyPaid.match.id)))[0].cancelReason).toBe(CLOSE_REASON);
    expect(await statusOf(s.legacyFree.match.id)).toBe("lobby");
    expect(await statusOf(s.modern.match.id)).toBe("lobby");
    expect(await statusOf(s.legacyDone.match.id)).toBe("played");
    expect(await markers(s.ids)).toHaveLength(1);
    expect(await ledgerCount()).toBe(ledgerBefore);
    const paid = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, s.legacyPaid.match.id));
    expect(paid.map((p) => p.paidCents)).toEqual([2000, 2000]); // Salden bleiben (Hauptbuch-Nullstellung erst mit M6b)
    const notes = (await db.select().from(notifications).where(eq(notifications.type, "match.cancelled"))).filter((n) => n.url === `/lobby/${s.legacyPaid.match.id}`);
    expect(notes).toHaveLength(2);
    for (const n of notes) {
      expect(n.body).toContain("Support");
      expect(n.body + n.title).not.toMatch(/erstattet|zurück|gutgeschrieben|ausgezahlt|€|Euro/i); // kein Geldversprechen
    }
  });

  it("Wiederholung ändert nichts (0 Spiele, keine zweite Mitteilung, kein zweiter Marker)", async () => {
    const s = await scenario();
    await closeLegacyGames(pool, { apply: true, only: s.ids });
    const again = await closeLegacyGames(pool, { apply: true, only: s.ids });
    expect(again).toMatchObject({ closed: 0, notified: 0 });
    expect(again.games).toHaveLength(0);
    expect(await markers(s.ids)).toHaveLength(1);
    const notes = (await db.select().from(notifications).where(eq(notifications.type, "match.cancelled"))).filter((n) => n.url === `/lobby/${s.legacyPaid.match.id}`);
    expect(notes).toHaveLength(2);
  });

  it("Spiel, das zwischen Auswahl und Anwenden schon geschlossen wurde, wird übersprungen (Sperre + erneute Prüfung)", async () => {
    const s = await scenario();
    const picked = await closeLegacyGames(pool, { only: s.ids });
    expect(picked.games).toHaveLength(1);
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, s.legacyPaid.match.id)); // jemand anderes war schneller
    const r = await closeLegacyGames(pool, { apply: true, only: s.ids });
    expect(r.closed).toBe(0);
    expect(await markers(s.ids)).toHaveLength(0);
  });
});
