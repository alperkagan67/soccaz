import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { formatReport, venueAccessReport } from "../../scripts/lib/venue-access-report.mjs";
import { db } from "@/db";
import { matches, users } from "@/db/schema";
import { matchHallRequests } from "@/db/schema-matchmaking";
import { venues } from "@/db/schema-finance";
import { cleanup, grantVenueAccess, makeMatch, makeUser } from "./helpers";

// 011 M1 Migrationsbericht: nur lesend, nennt die Hallen ohne aktiven Zugang mit Grund und offenen Anfragen, nie E-Mail-Adressen.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await pool.end();
});

async function venue(name: string, managerId: string | null) {
  const [v] = await db.insert(venues).values({ name: `Bericht ${name} ${Math.random().toString(36).slice(2, 8)}`, city: "Essen", source: "manual", managerUserId: managerId }).returning();
  return v;
}
type Row = { id: string; geaendert: boolean };
const mine = (rows: Row[], ids: string[]) => rows.filter((r) => ids.includes(r.id));

describe("Migrationsbericht venue-access-report", () => {
  it("Gründe, aktiver Zugang, offene Anfragen; keine E-Mail im Text", async () => {
    const ok = await makeUser("rok");
    const adm = await makeUser("radm", "admin");
    const banned = await makeUser("rban");
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, banned.id));
    const gone = await makeUser("rgone");
    await db.update(users).set({ email: `geloescht-${gone.id}@geloescht.invalid` }).where(eq(users.id, gone.id));

    const vOk = await venue("ok", ok.id);
    await grantVenueAccess(vOk.id, ok.id);
    const vAdmin = await venue("admin", adm.id);
    const vGone = await venue("anon", gone.id);
    const vBanned = await venue("ban", banned.id);
    await grantVenueAccess(vBanned.id, banned.id);
    const vFree = await venue("frei", null);

    // offene Anfrage an die Admin-Halle
    const { match: m } = await makeMatch();
    await db.update(matches).set({ vetoStatus: "halls", status: "lobby" }).where(eq(matches.id, m.id));
    await db.insert(matchHallRequests).values({ matchId: m.id, venueId: vAdmin.id, position: 0, status: "pending" });

    const ids = [vOk.id, vAdmin.id, vGone.id, vBanned.id, vFree.id];
    const rows = mine(await venueAccessReport(pool), ids);
    const by = (id: string) => rows.find((r: Row) => r.id === id);
    expect(rows).toHaveLength(4); // Halle ohne Betreiber fehlt
    expect(by(vOk.id)).toMatchObject({ geaendert: false, aktiverZugang: true });
    expect(by(vAdmin.id)).toMatchObject({ geaendert: true, grund: "admin", offeneAnfragen: 1 });
    expect(by(vGone.id)).toMatchObject({ geaendert: true, grund: "anonymisiert" });
    expect(by(vBanned.id)).toMatchObject({ geaendert: false, grund: "gesperrt" }); // nur zur Information

    const text = formatReport(rows);
    expect(text).toContain(vAdmin.id);
    expect(text).toContain("Grund: admin");
    expect(text).toContain("Achtung: 1 offene Hallenanfrage");
    expect(text).toContain("gesperrtem Betreiber-Konto");
    expect(text).not.toContain("@"); // keine E-Mail-Adressen
    expect(text).not.toContain(vOk.id);
  });

  it("Vorhersage vor der Migration (predict): überspringt verwaist/anonymisiert/Admin", async () => {
    const adm = await makeUser("padm", "admin");
    const ok = await makeUser("pok");
    const vAdmin = await venue("padmin", adm.id);
    const vOk = await venue("pok", ok.id);
    const rows = mine(await venueAccessReport(pool, { predict: true }), [vAdmin.id, vOk.id]);
    expect(rows.find((r: Row) => r.id === vAdmin.id)?.geaendert).toBe(true);
    expect(rows.find((r: Row) => r.id === vOk.id)?.geaendert).toBe(false);
  });

  it("schreibt nichts: Sitzung READ ONLY", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin read only");
      await venueAccessReport(c);
      await expect(c.query("update venues set name = name")).rejects.toThrow(/read-only/i);
    } finally {
      await c.query("rollback").catch(() => {});
      c.release();
    }
  });
});
