import { eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { db } from "@/db";
import { teams, users } from "@/db/schema";
import { tournaments, tournamentPlayers, tournamentTeams } from "@/db/schema-league";
// @ts-expect-error reine .mjs-Datei ohne Typen
import { lauf } from "../../scripts/staging-seed.mjs";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Staging-Seed gegen die echte Datenbank: ohne Marke, mit falscher Marke, mit Produktionsadresse und ohne Bestätigung wird NICHTS geschrieben; mit allem Erlaubten entstehen vier Teams mit erfundenen Konten.

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const OK_ENV = { APP_URL: "https://staging.example.org", STAGING_SEED_CONFIRM: "ja-staging-seed" };
let vorher: unknown = undefined;
const konten = async () => Number((await db.select({ n: sql<number>`count(*)::int` }).from(users).where(like(users.email, "%@staging.invalid")))[0].n);
const markeSetzen = async (v: unknown) => {
  if (v === null) await pool.query("delete from settings where key = 'environment'");
  else await pool.query("insert into settings (key, value) values ('environment', $1::jsonb) on conflict (key) do update set value = excluded.value", [JSON.stringify(v)]);
};

beforeAll(async () => {
  const r = await pool.query("select value from settings where key = 'environment'");
  vorher = r.rows.length ? r.rows[0].value : null;
  await markeSetzen(null);
  await lauf({ pool, env: { ...OK_ENV }, args: ["--clean"] }).catch(() => {}); // Reste früherer Läufe nur mit Marke; hier ohne Marke: kein Effekt
});
afterAll(async () => {
  await markeSetzen("staging");
  await lauf({ pool, env: { ...OK_ENV }, args: ["--clean"] });
  await markeSetzen(vorher);
  await db.delete(tournaments).where(sql`${tournaments.name} like 'E2E Seedprobe%'`);
  await cleanup();
  await pool.end();
});

describe("staging-seed: Verweigerungen schreiben nichts", () => {
  it("keine Marke, falsche Marke, Produktionsadresse (auch www/Port/Gross), fehlende APP_URL, keine Bestätigung", async () => {
    const start = await konten();
    await markeSetzen(null);
    await expect(lauf({ pool, env: { ...OK_ENV }, args: [] })).rejects.toThrow(/fehlt die Umgebungsmarke/);
    await markeSetzen("production");
    await expect(lauf({ pool, env: { ...OK_ENV }, args: [] })).rejects.toThrow(/nicht "staging"/);
    await markeSetzen("staging");
    for (const url of ["https://socaz.de", "https://WWW.SOCAZ.DE:443", "socaz.de."]) await expect(lauf({ pool, env: { ...OK_ENV, APP_URL: url }, args: [] })).rejects.toThrow(/Produktion/);
    await expect(lauf({ pool, env: { ...OK_ENV, AUTH_URL: "https://socaz.de" }, args: [] })).rejects.toThrow(/AUTH_URL/);
    await expect(lauf({ pool, env: { STAGING_SEED_CONFIRM: "ja-staging-seed" }, args: [] })).rejects.toThrow(/APP_URL/);
    await expect(lauf({ pool, env: { APP_URL: OK_ENV.APP_URL }, args: [] })).rejects.toThrow(/Bestätigung/);
    await expect(lauf({ pool, env: { ...OK_ENV }, args: ["--clean"] })).resolves.toBeDefined(); // erlaubt: zeigt, dass der Fehlerweg oben an der Sperre lag, nicht an der Umgebung
    expect(await konten()).toBe(start);
  });
});

describe("staging-seed: erlaubter Lauf", () => {
  it("legt vier Teams mit 20 erfundenen Konten an (zweimal ausgeführt: gleiche Zahl), --clean entfernt sie wieder", async () => {
    await markeSetzen("staging");
    const out = await lauf({ pool, env: { ...OK_ENV }, args: [] });
    expect(out.join(" ")).toContain("20 erfundene Konten");
    expect(await konten()).toBe(20);
    await lauf({ pool, env: { ...OK_ENV }, args: [] });
    expect(await konten()).toBe(20);
    expect((await db.select().from(teams).where(like(teams.slug, "staging-probe-%"))).length).toBe(4);
    const bereinigt = await lauf({ pool, env: { ...OK_ENV }, args: ["--clean"] });
    expect(bereinigt.join(" ")).toContain("4 Teams, 20 Konten");
    expect(await konten()).toBe(0);
  });
  it("--turnier: Gratis-Turnier bekommt vier bereite Teams; ein Turnier mit Preis, ein volles oder ein laufendes Turnier wird verweigert", async () => {
    await markeSetzen("staging");
    const org = await makeUser("seedorg");
    const mk = async (extra: Partial<typeof tournaments.$inferInsert>) =>
      (await db.insert(tournaments).values({ organizerId: org.id, name: "E2E Seedprobe " + Math.random().toString(36).slice(2, 6), city: "Essen", startsOn: "2027-02-01", format: "knockout", maxTeams: 16, ...extra }).returning())[0];
    const gratis = await mk({ totalCents: 0 });
    await lauf({ pool, env: { ...OK_ENV }, args: ["--turnier", gratis.id] });
    const tt = await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, gratis.id));
    expect(tt).toHaveLength(4);
    expect(tt.every((x) => x.readyAt !== null && x.paidReadyAt !== null && x.captainId !== null)).toBe(true);
    expect((await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, gratis.id))).length).toBe(20);
    await lauf({ pool, env: { ...OK_ENV }, args: ["--clean"] });
    const ohnePreis = await mk({});
    await expect(lauf({ pool, env: { ...OK_ENV }, args: ["--turnier", ohnePreis.id] })).rejects.toThrow(/kein Gratis-Turnier/); // null = Altturnier, nicht gratis
    const preis = await mk({ totalCents: 1000 });
    await expect(lauf({ pool, env: { ...OK_ENV }, args: ["--turnier", preis.id] })).rejects.toThrow(/kein Gratis-Turnier/);
    const klein = await mk({ maxTeams: 4, totalCents: 0 });
    await expect(lauf({ pool, env: { ...OK_ENV }, args: ["--turnier", klein.id] })).resolves.toBeDefined(); // genau 4 Plätze: passt
    await lauf({ pool, env: { ...OK_ENV }, args: ["--clean"] });
    const voll = await mk({ maxTeams: 4, totalCents: 0 });
    const fremd = await makeTeam(org.id, "SeedFremd");
    await db.insert(tournamentTeams).values({ tournamentId: voll.id, teamId: fremd.id, captainId: org.id });
    await expect(lauf({ pool, env: { ...OK_ENV }, args: ["--turnier", voll.id] })).rejects.toThrow(/Platz/);
    const vorher2 = await mk({ totalCents: 0 });
    const echt = await makeTeam(org.id, "SeedEcht");
    await db.insert(tournamentTeams).values({ tournamentId: vorher2.id, teamId: echt.id, captainId: org.id, readyAt: new Date() });
    await expect(lauf({ pool, env: { ...OK_ENV }, args: ["--turnier", vorher2.id] })).rejects.toThrow(/erst den Seed laufen lassen/); // Reihenfolge-Falle
    const laeuft = await mk({ status: "running", totalCents: 0 });
    await expect(lauf({ pool, env: { ...OK_ENV }, args: ["--turnier", laeuft.id] })).rejects.toThrow(/Anmeldung/);
    await expect(lauf({ pool, env: { ...OK_ENV }, args: ["--turnier", "keine-uuid"] })).rejects.toThrow(/UUID/);
    expect(await konten()).toBe(0);
  });
});
