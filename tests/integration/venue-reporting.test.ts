import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { matches, users } from "@/db/schema";
import { tournaments, tournamentTeams } from "@/db/schema-league";
import { venueAccess, venues } from "@/db/schema-finance";
import { post } from "@/server/ledger";
import { standardMonths, listVenueBookings, listVenuePayouts } from "@/server/venue-reporting";
import { cleanup, grantVenueAccess, makeMatch, makeTeam, makeUser } from "./helpers";

// Vertrag 011 M3 (AC-5), Plan docs/design/plan-011-m3.md: Buchungen und Durchlaufgeld (vorgemerkt) für Hallenbetreiber, nur eigene Halle, keine Personendaten.

afterAll(async () => {
  await db.delete(venueAccess).where(sql`${venueAccess.venueId} in (select id from venues where name like 'E2E Rep%')`);
  await db.delete(tournamentTeams).where(sql`${tournamentTeams.tournamentId} in (select id from tournaments where name like 'E2E Rep%')`);
  // Turniere mit Beweisprotokoll (Zusage aus früheren Läufen) sind nicht löschbar: einzeln versuchen
  for (const t of await db.select({ id: tournaments.id }).from(tournaments).where(sql`${tournaments.name} like 'E2E Rep%'`)) await db.delete(tournaments).where(eq(tournaments.id, t.id)).catch(() => {});
  await cleanup();
  await db.delete(venues).where(sql`${venues.name} like 'E2E Rep%'`);
});

let seq = 0;
const venue = async () => (await db.insert(venues).values({ name: `E2E Rep ${++seq}-${Math.random().toString(36).slice(2, 6)}`, city: "Reportort", source: "manual" }).returning())[0];
const NOW = new Date("2027-03-15T12:00:00Z");

async function seed(venueId: string, startsAt: Date, share = 8000, commission = 800) {
  const g = await makeMatch({ ledgerModel: "commission" });
  await db.update(matches).set({ venueId, startsAt, costCents: share }).where(eq(matches.id, g.match.id));
  await post(db, { debit: { account: "bank" }, credit: { account: "venue_payable" }, amountCents: share, kind: "match_share", matchId: g.match.id, idempotencyKey: `rep:share:${g.match.id}` });
  if (commission > 0) await post(db, { debit: { account: "venue_payable" }, credit: { account: "commission" }, amountCents: commission, kind: "commission", matchId: g.match.id, idempotencyKey: `rep:com:${g.match.id}` });
  return g;
}

describe("Betreiber-Ansichten Buchungen und Durchlaufgeld (AC-5)", () => {
  it("Betreiber sieht nur seine Halle; fremde Halle, Spieler, Gast und Admin sehen nichts; ohne Namen", async () => {
    const vA = await venue();
    const vB = await venue();
    const opA = await makeUser("repa");
    const opB = await makeUser("repb");
    await grantVenueAccess(vA.id, opA.id);
    await grantVenueAccess(vB.id, opB.id);
    const a = await seed(vA.id, new Date("2027-03-20T17:00:00Z"));
    await seed(vB.id, new Date("2027-03-21T17:00:00Z"));

    const mine = await listVenueBookings(opA.id, { now: NOW });
    expect(mine.venues.map((v) => v.id)).toEqual([vA.id]);
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0]).toMatchObject({ kind: "teamspiel", matchId: a.match.id, venueId: vA.id, count: 2, countLabel: "Spieler", rentCents: 8000 });
    const json = JSON.stringify([mine, await listVenuePayouts(opA.id, { now: NOW })]);
    for (const u of [a.adminA, a.adminB]) {
      expect(json).not.toContain(u.email);
      expect(json).not.toContain(u.id);
      expect(json).not.toContain(u.name);
    }
    // fremde Halle per Parameter: wie keine Halle
    const fremd = await listVenueBookings(opA.id, { venueId: vB.id, now: NOW });
    expect(fremd.venues).toEqual([]);
    expect(fremd.rows).toEqual([]);
    expect((await listVenuePayouts(opA.id, { venueId: vB.id, now: NOW })).rows).toEqual([]);
    // Spieler (ohne Zugang), Gast
    expect((await listVenueBookings(a.adminA.id, { now: NOW })).rows).toEqual([]);
    expect((await listVenueBookings(null, { now: NOW })).rows).toEqual([]);
    // Admin: nie Betreiber
    const admin = await makeUser("repadm", "admin");
    expect((await listVenueBookings(admin.id, { now: NOW })).rows).toEqual([]);
  });

  it("Durchlaufgeld = Hauptbuch (Gutschrift minus Provision), Summe stimmt, Status vorgemerkt", async () => {
    const v = await venue();
    const op = await makeUser("repp");
    await grantVenueAccess(v.id, op.id);
    await seed(v.id, new Date("2027-03-10T17:00:00Z"), 8000, 800);
    await seed(v.id, new Date("2027-03-12T17:00:00Z"), 6000, 0);
    const r = await listVenuePayouts(op.id, { now: NOW });
    expect(r.rows.map((x) => [x.creditedCents, x.deductedCents, x.netCents, x.status])).toEqual([
      [8000, 800, 7200, "vorgemerkt"],
      [6000, 0, 6000, "vorgemerkt"],
    ]);
    expect(r.totalNetCents).toBe(13200);
    const [{ s }] = (await db.execute(sql`select coalesce(sum(case when credit_account='venue_payable' then amount_cents else -amount_cents end),0)::int as s from ledger_entries where match_id in (${sql.join(r.rows.map((x) => sql`${x.matchId}::uuid`), sql`, `)}) and (credit_account='venue_payable' or debit_account='venue_payable')`)).rows as { s: number }[];
    expect(r.totalNetCents).toBe(s);
  });

  it("Standard: aktueller Monat und Vormonat; Archiv per Monatsauswahl; ungültiger Monat = Standard", async () => {
    expect(standardMonths(new Date("2027-01-05T10:00:00Z"))).toEqual(["2027-01", "2026-12"]);
    expect(standardMonths(new Date("2027-02-28T23:30:00Z"))).toEqual(["2027-03", "2027-02"]); // Berlin: schon März
    const v = await venue();
    const op = await makeUser("repm");
    await grantVenueAccess(v.id, op.id);
    await seed(v.id, new Date("2027-03-05T17:00:00Z"));
    await seed(v.id, new Date("2027-02-05T17:00:00Z"));
    await seed(v.id, new Date("2026-11-05T17:00:00Z"));
    const std = await listVenueBookings(op.id, { now: NOW });
    expect(std.rows).toHaveLength(2);
    expect(std.monate).toEqual(["2027-03", "2027-02", "2026-11"]);
    const arch = await listVenueBookings(op.id, { now: NOW, monat: "2026-11" });
    expect(arch.rows).toHaveLength(1);
    expect(arch.monat).toBe("2026-11");
    const bad = await listVenueBookings(op.id, { now: NOW, monat: "2026-13'; drop" });
    expect(bad.rows).toHaveLength(2);
    expect(bad.monat).toBeNull();
  });

  it("Turnier: nur Turniername, Teamzahl, Termin; kein Veranstalter; Stand offen (Zusage schreibt Beweisprotokoll, dann nicht löschbar); Entzug wirkt sofort", async () => {
    const v = await venue();
    const op = await makeUser("rept");
    await grantVenueAccess(v.id, op.id);
    const org = await makeUser("reporg");
    const team = await makeTeam(org.id, "TurnierTeam");
    const [t] = await db.insert(tournaments).values({ organizerId: org.id, name: "E2E Rep Turnier", city: "Reportort", startsOn: "2027-03-27", format: "knockout", maxTeams: 4, venueId: v.id }).returning();
    await db.insert(tournamentTeams).values({ tournamentId: t.id, teamId: team.id, feeCents: 0 });
    const r = await listVenueBookings(op.id, { now: NOW });
    const row = r.rows.find((x) => x.tournamentId === t.id);
    expect(row).toMatchObject({ kind: "turnier", title: "E2E Rep Turnier", count: 1, countLabel: "Teams", hall: "offen" });
    const json = JSON.stringify(r);
    expect(json).not.toContain(org.email);
    expect(json).not.toContain(org.id);
    expect(json).not.toContain(org.name);
    // Entzug wirkt sofort (ohne neue Anmeldung)
    await db.update(venueAccess).set({ status: "revoked" }).where(eq(venueAccess.venueId, v.id));
    expect((await listVenueBookings(op.id, { now: NOW })).rows).toEqual([]);
    // gesperrtes Konto
    await db.update(venueAccess).set({ status: "active" }).where(eq(venueAccess.venueId, v.id));
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, op.id));
    expect((await listVenuePayouts(op.id, { now: NOW })).rows).toEqual([]);
  });

  it("Quelltext: eine Zugriffsquelle, keine Personenfelder, kein Veranstalter, keine Rechnungen", () => {
    const src = readFileSync(path.join(process.cwd(), "src/server/venue-reporting.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain("venueIdsOf");
    expect(src).not.toMatch(/organizer/i);
    expect(src).not.toMatch(/\bfrom users\b|\bjoin users\b|\.email\b|\bp\.user_id\b/);
    expect(src).not.toMatch(/invoice/i);
  });
});
