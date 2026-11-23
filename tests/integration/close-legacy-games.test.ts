import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, notifications, paymentCharges } from "@/db/schema";
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
    // jemand anderes war schneller: nach der Auswahl, vor der Transaktion wird das Spiel abgesagt
    const r = await closeLegacyGames(pool, { apply: true, only: s.ids, afterSelect: async () => void (await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, s.legacyPaid.match.id))) });
    expect(r.closed).toBe(0);
    expect(await markers(s.ids)).toHaveLength(0);
  });

  // Review R-F2: Spiele, die cancelMatchTx nicht still absagen wuerde, werden nicht geschlossen, sondern als "manuell" gelistet
  async function paidLegacy() {
    const m = await makeMatch({ legacy: true });
    await db.update(matchParticipants).set({ paidCents: 2000 }).where(eq(matchParticipants.matchId, m.match.id));
    return m;
  }
  const manualCase = async (prepare: (m: Awaited<ReturnType<typeof paidLegacy>>) => Promise<void>, reason: RegExp) => {
    const m = await paidLegacy();
    await prepare(m);
    const dry = await closeLegacyGames(pool, { only: [m.match.id] });
    expect(dry.games).toHaveLength(0);
    expect(dry.manual.map((g) => g.matchId)).toEqual([m.match.id]);
    expect(dry.manual[0].manualReason).toMatch(reason);
    const r = await closeLegacyGames(pool, { apply: true, only: [m.match.id] });
    expect(r.closed).toBe(0);
    expect(await statusOf(m.match.id)).toBe("lobby");
    expect(await markers([m.match.id])).toHaveLength(0);
  };

  it("Abbuchungszeile, die erst nach der Auswahl entsteht, verhindert das Schliessen (erneute Pruefung unter der Sperre)", async () => {
    const m = await paidLegacy();
    const r = await closeLegacyGames(pool, { apply: true, only: [m.match.id], afterSelect: async () => void (await db.insert(paymentCharges).values({ matchId: m.match.id, userId: m.adminA.id, amountCents: 800, status: "pending", idempotencyKey: `f2late:${m.match.id}` })) });
    expect(r.closed).toBe(0);
    expect(await statusOf(m.match.id)).toBe("lobby");
  });

  it("Altspiel mit Abbuchungszeile (payment_charges) wird nicht geschlossen, sondern als manuell gelistet", async () => {
    await manualCase(async (m) => {
      await db.insert(paymentCharges).values({ matchId: m.match.id, userId: m.adminA.id, amountCents: 800, status: "pending", idempotencyKey: `f2:${m.match.id}` });
    }, /Abbuchung/);
  });

  it("Altspiel mit Provisionsbuchung im Hauptbuch wird nicht geschlossen (manuell)", async () => {
    await manualCase(async (m) => {
      const [le] = (await pool.query("select id from ledger_entries limit 1")).rows;
      await pool.query("insert into match_commissions (match_id, venue_id, rate_percent, base_cents, commission_cents, ledger_entry_id) select $1, (select id from venues limit 1), 10, 1000, 100, $2", [m.match.id, le.id]);
    }, /Provision/);
  });

  it("Altspiel mit offenem Buchungsauftrag wird nicht geschlossen (manuell); ein zurueckgezogener blockiert nicht", async () => {
    await manualCase(async (m) => {
      await pool.query("insert into booking_jobs (match_id, status) values ($1, 'open')", [m.match.id]);
    }, /Buchungsauftrag/);
    const ok = await paidLegacy();
    await pool.query("insert into booking_jobs (match_id, status) values ($1, 'withdrawn')", [ok.match.id]);
    expect((await closeLegacyGames(pool, { only: [ok.match.id] })).games).toHaveLength(1);
  });

  it("Turnierspiele (kind tournament) werden nie geschlossen", async () => {
    const m = await paidLegacy();
    await db.update(matches).set({ kind: "tournament" }).where(eq(matches.id, m.match.id));
    const r = await closeLegacyGames(pool, { apply: true, only: [m.match.id] });
    expect(r.games).toHaveLength(0);
    expect(r.manual).toHaveLength(0);
    expect(await statusOf(m.match.id)).toBe("lobby");
  });
});
