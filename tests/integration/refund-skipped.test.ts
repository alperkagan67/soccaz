import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { cancelMatch, leaveLobby } from "@/server/lobby";
import { addPlayer, cleanup, makeMatch, seedShare } from "./helpers";

// 012 M6b (Review R-T298/security C): Gibt es keinen Guthaben-Erstattungsweg mehr, wird bezahltes Geld bei Absage/Austritt NICHT still verschluckt: Protokolleintrag wallet.refund_skipped
// (Anzahl und Summe, keine Personendaten).
afterAll(cleanup);
const skipped = (matchId: string) => db.select().from(auditLog).where(and(eq(auditLog.entity, "match"), eq(auditLog.entityId, matchId), eq(auditLog.action, "wallet.refund_skipped")));

describe("wallet.refund_skipped", () => {
  it("Absage eines Spiels mit bezahlten Anteilen schreibt den Eintrag mit Anzahl und Summe, ohne Personendaten", async () => {
    const m = await makeMatch({ legacy: true, priceCents: 8000, costCents: 8000 });
    const p = await addPlayer(m.match.id, m.home.id);
    await seedShare(m.adminA.id, m.match.id, 800);
    await seedShare(p.id, m.match.id, 800);
    await cancelMatch(m.adminA.id, m.match.id, "Test");
    const rows = await skipped(m.match.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].after).toMatchObject({ participants: 2, amountCents: 1600 });
    expect(JSON.stringify(rows[0].after)).not.toContain(p.id);
  });
  it("Austritt mit bezahltem Anteil schreibt den Eintrag, ohne bezahlten Anteil nicht", async () => {
    const m = await makeMatch({ legacy: true, priceCents: 8000, costCents: 8000 });
    const a = await addPlayer(m.match.id, m.home.id);
    const b = await addPlayer(m.match.id, m.home.id);
    await seedShare(a.id, m.match.id, 800);
    await leaveLobby(b.id, m.match.id);
    expect(await skipped(m.match.id)).toHaveLength(0);
    await leaveLobby(a.id, m.match.id);
    expect(await skipped(m.match.id)).toHaveLength(1);
  });
  it("Absage ohne bezahlte Anteile schreibt nichts", async () => {
    const m = await makeMatch({ legacy: true, priceCents: 8000, costCents: 8000 });
    await cancelMatch(m.adminA.id, m.match.id, "Test");
    expect(await skipped(m.match.id)).toHaveLength(0);
  });
});
