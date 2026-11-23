import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { matchParticipants, matches } from "@/db/schema";
import { payments, pendingRefunds } from "@/db/schema-finance";
import { tournamentPlayers, tournaments } from "@/db/schema-league";
import { creditWallet } from "@/server/ledger";
import { evaluateGuard, historyInfo, readLegacyBalances } from "../../scripts/lib/legacy-balance-guard";
import { cleanup, makeMatch, makeTeam, makeUser } from "./helpers";

// Salden-Guard (012 M6b 1c-ii-b): liest rein lesend, zaehlt jeden Befund. Die Test-DB kann Seed-Daten enthalten: geprueft werden DIFFERENZEN zum Ausgangszustand.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
afterAll(async () => {
  await pool.end();
  await cleanup();
});

const counts = async () => {
  const r = await db.execute(sql`select (select count(*) from ledger_entries)::int as l, (select count(*) from audit_log)::int as a, (select coalesce(sum(paid_cents),0) from match_participants)::int as p`);
  return ((r as unknown as { rows?: Record<string, number>[] }).rows ?? (r as unknown as Record<string, number>[]))[0];
};

describe("Salden-Guard: lesen und zaehlen", () => {
  it("schreibt nichts (Hauptbuch, Protokoll, paid_cents unveraendert)", async () => {
    const before = await counts();
    await readLegacyBalances(pool);
    expect(await counts()).toEqual(before);
  });

  it("jeder Befund erhoeht genau seinen Zaehler", async () => {
    const base = await readLegacyBalances(pool);

    // 1) Guthaben-Saldo
    const u = await makeUser("gw");
    await creditWallet(db, u.id, { from: "clearing", amountCents: 500, kind: "topup", idempotencyKey: `lbg-${Math.random().toString(36).slice(2)}` });
    let f = await readLegacyBalances(pool);
    expect(f.walletUsers).toBe(base.walletUsers + 1);
    expect(f.walletNetCents).toBe(base.walletNetCents + 500);

    // 2) paid_cents im Spiel + 5) Altspiel mit Guthabenzahlung
    const g = await makeMatch({ legacy: true });
    await db.update(matchParticipants).set({ paidCents: 300 }).where(eq(matchParticipants.matchId, g.match.id));
    const players = (await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, g.match.id))).length;
    f = await readLegacyBalances(pool);
    expect(f.matchPaidRows).toBe(base.matchPaidRows + players);
    expect(f.matchPaidCents).toBe(base.matchPaidCents + 300 * players);
    expect(f.legacyGames + f.legacyManual).toBe(base.legacyGames + base.legacyManual + 1);

    // 4) pending_refunds
    await db.insert(pendingRefunds).values({ matchId: g.match.id, userId: g.adminA.id, amountCents: 100 });
    f = await readLegacyBalances(pool);
    expect(f.pendingRefundRows).toBe(base.pendingRefundRows + 1);
    expect(f.pendingRefundCents).toBe(base.pendingRefundCents + 100);

    // 3) paid_cents im Turnier
    const org = await makeUser("gto");
    const captain = await makeUser("gtc");
    const team = await makeTeam(captain.id, "GuardTeam");
    const [t] = await db.insert(tournaments).values({ organizerId: org.id, name: `Guard-Cup ${Date.now()}`, city: "Essen", startsOn: new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10), format: "knockout", maxTeams: 4, durationMin: 120 } as typeof tournaments.$inferInsert).returning();
    await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: team.id, userId: captain.id, paidCents: 700 });
    f = await readLegacyBalances(pool);
    expect(f.tournamentPaidRows).toBe(base.tournamentPaidRows + 1);
    expect(f.tournamentPaidCents).toBe(base.tournamentPaidCents + 700);

    // Entscheidung: mit den Fixtures nie erfuellt
    expect(evaluateGuard(f).ok).toBe(false);
  });

  it("Skript: Ausgang 1 bei Befund, Meldung ohne E-Mail-Adressen und ohne Nutzernamen; Ausgang 0 nur bei erfuelltem Guard", async () => {
    const u = await makeUser("gs");
    await creditWallet(db, u.id, { from: "clearing", amountCents: 250, kind: "topup", idempotencyKey: `lbg-s-${Math.random().toString(36).slice(2)}` });
    let code = 0;
    let out = "";
    try {
      out = execFileSync(process.execPath, ["scripts/legacy-balance-guard.mjs"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } }); // DATABASE_URL aus der Umgebung (setup.ts laedt .env.local, die CI setzt sie direkt): kein --env-file, laeuft in beiden Faellen
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? -1;
      out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    expect(code).toBe(1);
    expect(out).toMatch(/Guthaben-Salden/);
    expect(out).toMatch(/KEINE L.schung/);
    expect(out).not.toContain("@");
  });
});

describe("Salden-Guard: offene gegen historische Zeilen, alte Aufladungen (Review w4)", () => {
  it("abgerechnetes/abgesagtes Spiel und beendetes Turnier mit paid_cents zaehlen NUR als Info, nicht als Befund; offene Plaetze zaehlen", async () => {
    const base = await readLegacyBalances(pool);
    const done = await makeMatch({});
    await db.update(matchParticipants).set({ paidCents: 200 }).where(eq(matchParticipants.matchId, done.match.id));
    await db.update(matches).set({ status: "played", settledAt: new Date() }).where(eq(matches.id, done.match.id));
    const cancelled = await makeMatch({});
    await db.update(matchParticipants).set({ paidCents: 200 }).where(eq(matchParticipants.matchId, cancelled.match.id));
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, cancelled.match.id));
    const n1 = (await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, done.match.id))).length + (await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, cancelled.match.id))).length;
    let f = await readLegacyBalances(pool);
    expect(f.matchPaidRows).toBe(base.matchPaidRows); // offen unveraendert
    expect(f.matchPaidCents).toBe(base.matchPaidCents);
    expect(f.matchPaidHistRows).toBe(base.matchPaidHistRows + n1);
    expect(historyInfo(f)).not.toBeNull();

    const org = await makeUser("hto");
    const cap = await makeUser("htc");
    const team = await makeTeam(cap.id, "HistTeam");
    const mk = async (status: "finished" | "payment") => {
      const [t] = await db.insert(tournaments).values({ organizerId: org.id, name: `Hist-Cup ${status} ${Date.now()}`, city: "Essen", startsOn: new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10), format: "knockout", maxTeams: 4, durationMin: 120, status } as typeof tournaments.$inferInsert).returning();
      return t;
    };
    const fin = await mk("finished");
    const cap2 = await makeUser("htd");
    await db.insert(tournamentPlayers).values({ tournamentId: fin.id, teamId: team.id, userId: cap.id, paidCents: 900 });
    f = await readLegacyBalances(pool);
    expect(f.tournamentPaidRows).toBe(base.tournamentPaidRows);
    expect(f.tournamentPaidHistRows).toBe(base.tournamentPaidHistRows + 1);
    const open = await mk("payment");
    await db.insert(tournamentPlayers).values({ tournamentId: open.id, teamId: team.id, userId: cap2.id, paidCents: 400 });
    f = await readLegacyBalances(pool);
    expect(f.tournamentPaidRows).toBe(base.tournamentPaidRows + 1);
    expect(f.tournamentPaidCents).toBe(base.tournamentPaidCents + 400);
  });

  it("payments: pending und erfolgreich ohne Hauptbucheintrag werden gezaehlt; mit Hauptbucheintrag (topup) nicht", async () => {
    const base = await readLegacyBalances(pool);
    const u = await makeUser("pay");
    const mkPay = (status: "pending" | "succeeded") => db.insert(payments).values({ userId: u.id, provider: "dev", amountCents: 1000, status, idempotencyKey: `lbg-pay-${status}-${Math.random().toString(36).slice(2)}` }).returning();
    const [pend] = await mkPay("pending");
    const [ok] = await mkPay("succeeded");
    let f = await readLegacyBalances(pool);
    expect(f.paymentsPending).toBe(base.paymentsPending + 1);
    expect(f.paymentsUnbooked).toBe(base.paymentsUnbooked + 1);
    // Hauptbucheintrag (topup) zur erfolgreichen Zahlung: nicht mehr ungebucht
    await creditWallet(db, u.id, { from: "clearing", amountCents: 1000, kind: "topup", paymentId: ok.id, idempotencyKey: `lbg-pay-book-${Math.random().toString(36).slice(2)}` });
    f = await readLegacyBalances(pool);
    expect(f.paymentsUnbooked).toBe(base.paymentsUnbooked);
    expect(f.paymentsPending).toBe(base.paymentsPending + 1);
    void pend;
  });
});
