import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentChargeAttempts, paymentCharges, paymentDisputes, paymentRefunds, paymentSetupIntents } from "@/db/schema";
import { tournaments } from "@/db/schema-league";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// 012 M5-2a/2b: tournament_id an den Zahlungstabellen (Fremdschluessel OHNE cascade); ab 2b ist match_id nullable und genau eines von beiden gesetzt (XOR-CHECK).
// Kein Teamspiel-Pfad schreibt tournament_id.

afterAll(cleanup);

const TABLES = ["payment_charges", "payment_refunds", "payment_setup_intents", "payment_disputes"] as const;

async function tournament() {
  const org = await makeUser("t5org");
  const [t] = await db.insert(tournaments).values({ organizerId: org.id, name: "M5 Schema", city: "Berlin", startsOn: "2030-01-01", format: "knockout", maxTeams: 4 }).returning();
  return t;
}

async function tournamentCharge(over: Partial<typeof paymentCharges.$inferInsert> = {}) {
  const t = await tournament();
  const u = await makeUser("t5p");
  const [c] = await db.insert(paymentCharges).values({ tournamentId: t.id, userId: u.id, amountCents: 800, idempotencyKey: `m5t:${t.id}:${u.id}`, ...over }).returning();
  return { t, u, c };
}

describe("M5-2a/2b: Schema der Zahlungstabellen", () => {
  it("tournament_id ist an allen vier Tabellen vorhanden und nullable; match_id ist an charges und refunds ab 2b nullable", async () => {
    const r = await db.execute(sql`select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public' and column_name in ('tournament_id', 'match_id') and table_name in ('payment_charges', 'payment_refunds', 'payment_setup_intents', 'payment_disputes')`);
    const cols = new Map((r.rows as { table_name: string; column_name: string; is_nullable: string }[]).map((x) => [`${x.table_name}.${x.column_name}`, x.is_nullable]));
    for (const t of TABLES) expect(cols.get(`${t}.tournament_id`), t).toBe("YES");
    expect(cols.get("payment_charges.match_id")).toBe("YES");
    expect(cols.get("payment_refunds.match_id")).toBe("YES");
  });

  it("die Fremdschluessel auf tournaments sind NO ACTION (kein cascade): Zahlungsnachweise verschwinden nicht mit dem Turnier", async () => {
    const r = await db.execute(sql`select tc.table_name, rc.delete_rule from information_schema.table_constraints tc join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.constraint_schema join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name and k.constraint_schema = tc.constraint_schema where tc.constraint_type = 'FOREIGN KEY' and k.column_name = 'tournament_id' and tc.table_name in ('payment_charges', 'payment_refunds', 'payment_setup_intents', 'payment_disputes')`);
    const rules = new Map((r.rows as { table_name: string; delete_rule: string }[]).map((x) => [x.table_name, x.delete_rule]));
    for (const t of TABLES) expect(rules.get(t), t).toBe("NO ACTION");
  });

  it("ein Turnier mit Zahlungszeile laesst sich nicht loeschen; nach dem Entfernen der Zeile geht es", async () => {
    const { t, c } = await tournamentCharge();
    await expect(db.execute(sql`delete from tournaments where id = ${t.id}`)).rejects.toThrow();
    await db.delete(paymentCharges).where(sql`${paymentCharges.id} = ${c.id}`);
    await db.execute(sql`delete from tournaments where id = ${t.id}`);
  });

  it("XOR: eine Zeile mit match_id UND tournament_id oder mit keinem von beiden wird abgelehnt (charges und refunds)", async () => {
    const t = await tournament();
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    const u = await addPlayer(m.match.id, m.home.id, "t5x");
    await expect(db.insert(paymentCharges).values({ matchId: m.match.id, tournamentId: t.id, userId: u.id, amountCents: 800, idempotencyKey: `m5x1:${t.id}` })).rejects.toThrow();
    await expect(db.insert(paymentCharges).values({ userId: u.id, amountCents: 800, idempotencyKey: `m5x2:${t.id}` })).rejects.toThrow();
    const [ok] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: u.id, amountCents: 800, idempotencyKey: `m5x3:${t.id}` }).returning();
    await expect(db.insert(paymentRefunds).values({ chargeId: ok.id, matchId: m.match.id, tournamentId: t.id, userId: u.id, amountCents: 800, idempotencyKey: `m5x4:${t.id}` })).rejects.toThrow();
    await expect(db.insert(paymentRefunds).values({ chargeId: ok.id, userId: u.id, amountCents: 800, idempotencyKey: `m5x5:${t.id}` })).rejects.toThrow();
  });

  it("eine Turnier-Zeile hat keine Nachruecker-Kette und kein Platz-Team", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await expect(tournamentCharge({ slotTeamId: m.home.id })).rejects.toThrow();
  });

  it("alle vier Tabellen akzeptieren Turnier-Zeilen ohne match_id, und das Aufraeumen der Tests entfernt sie vor dem Turnier", async () => {
    const { t, u, c } = await tournamentCharge();
    await db.insert(paymentRefunds).values({ chargeId: c.id, tournamentId: t.id, userId: u.id, amountCents: 800, idempotencyKey: `m5r:${t.id}:${u.id}` });
    await db.insert(paymentDisputes).values({ disputeId: `dp_test_m5_${t.id}`, chargeId: c.id, tournamentId: t.id, payerUserId: u.id, amountCents: 800, currency: "eur", status: "needs_response" });
    await db.insert(paymentSetupIntents).values({ id: `seti_m5_${t.id}`, userId: u.id, tournamentId: t.id, mandateText: "m", mandateAcceptedAt: new Date() });
    await cleanup(); // muss die Zeilen vor dem Turnier entfernen, sonst scheitert das Loeschen des Turniers am Fremdschluessel
    const left = await db.execute(
      sql`select (select count(*) from payment_charges where tournament_id = ${t.id}) + (select count(*) from payment_refunds where tournament_id = ${t.id}) + (select count(*) from payment_disputes where tournament_id = ${t.id}) + (select count(*) from payment_setup_intents where tournament_id = ${t.id}) as n`,
    );
    expect(Number((left.rows[0] as { n: string }).n)).toBe(0);
    expect(await db.select({ id: tournaments.id }).from(tournaments).where(sql`${tournaments.id} = ${t.id}`)).toHaveLength(0);
  });

  it("eindeutig je (tournament_id, user_id); derselbe Nutzer darf in einem Spiel eine Zeile haben", async () => {
    const { t, u } = await tournamentCharge();
    await expect(db.insert(paymentCharges).values({ tournamentId: t.id, userId: u.id, amountCents: 800, idempotencyKey: `m5u2:${t.id}` })).rejects.toThrow();
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await db.insert(paymentCharges).values({ matchId: m.match.id, userId: u.id, amountCents: 800, idempotencyKey: `m5u3:${t.id}` });
  });

  it("neue Zeilen im Teamspiel-Pfad haben tournament_id NULL (der Standard); attempts haben keine eigene Spalte", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    const u = await addPlayer(m.match.id, m.home.id, "t5n");
    const [c] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: u.id, amountCents: 800, idempotencyKey: `m5n:${m.match.id}:${u.id}` }).returning();
    expect(c.tournamentId).toBeNull();
    expect(Object.keys(paymentChargeAttempts)).not.toContain("tournamentId");
  });
});

describe("M5-2b: kein Teamspiel-Pfad schreibt tournament_id", () => {
  it("im Zahlungsmodul kommt tournamentId/tournament_id nur im LESENDEN Kontext-Helfer vor", () => {
    const dir = "src/server/payments";
    const hits = readdirSync(dir).filter((f) => /tournament_?id/i.test(readFileSync(join(dir, f), "utf8")));
    expect(hits).toEqual(["charge-context.ts"]);
    expect(readFileSync(join(dir, "charge-context.ts"), "utf8")).not.toMatch(/\.(insert|update|set|delete)\(/);
  });

  it("die Migrationen legen die Fremdschluessel ohne cascade an", () => {
    const f = readdirSync("drizzle").find((n) => /^0046_.*\.sql$/.test(n));
    expect(f).toBeTruthy();
    const text = readFileSync(join("drizzle", f!), "utf8");
    expect(text.match(/tournament_id_tournaments_id_fk" FOREIGN KEY \("tournament_id"\) REFERENCES "public"\."tournaments"\("id"\) ON DELETE no action/g)).toHaveLength(4);
    expect(text).not.toMatch(/ON DELETE cascade/i);
  });
});
