import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { matchParticipants, matches, teamMembers, teams, users } from "@/db/schema";
import { venueAccess, venues } from "@/db/schema-finance";
import { cleanupTestData } from "../cleanup";

const run = randomUUID().slice(0, 8);
let seq = 0;
let pool: Pool | undefined;

function getPool() {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return pool;
}

export async function makeUser(tag = "u", role: "player" | "admin" | "owner" = "player") {
  seq += 1;
  // "owner" = Admin 1: role admin plus is_owner. Es gibt höchstens einen je Datenbank (Teilindex); cleanup() löscht alle @test.local-Nutzer, danach ist der Platz wieder frei.
  const [u] = await db
    .insert(users)
    .values({
      email: `${tag}${seq}-${run}@test.local`,
      name: `${tag} ${seq}`,
      role: role === "owner" ? "admin" : role,
      isOwner: role === "owner",
      city: "Essen",
      position: "Flexibel",
      onboardedAt: new Date(),
      ageConfirmedAt: new Date(),
      termsAcceptedAt: new Date(),
    })
    .returning();
  return u;
}

export async function makeTeam(adminId: string, name: string) {
  seq += 1;
  const [t] = await db.insert(teams).values({ name: `E2E ${name} ${seq} ${run}`, slug: `e2e-${seq}-${run}`, city: "Essen", createdBy: adminId }).returning();
  await db.insert(teamMembers).values({ teamId: t.id, userId: adminId, role: "admin" });
  return t;
}

/** Zwei Teams und ein Spiel in der Lobby (in `hoursAhead` Stunden), optional mit festem Preis. */
export async function makeMatch(opts: { ledgerModel?: "legacy" | "commission"; legacy?: boolean; hoursAhead?: number; durationMin?: number; priceCents?: number | null; costCents?: number | null } = {}) {
  const adminA = await makeUser("ha");
  const adminB = await makeUser("ga");
  const home = await makeTeam(adminA.id, "Heim");
  const away = await makeTeam(adminB.id, "Gast");
  // Lauf im Provisionsmodell (TEST_LEDGER_MODEL=commission): dieselben Suiten pruefen den Produktivpfad (Abbuchung/Erstattung/Streit auf venue_payable); das Spiel bekommt dann eine Halle
  const model = opts.ledgerModel ?? (process.env.TEST_LEDGER_MODEL === "commission" ? "commission" : "legacy");
  let venueId: string | null = null;
  if (model === "commission") {
    const [v] = await db.insert(venues).values({ name: `E2E Test Halle ${Math.random().toString(36).slice(2, 8)}`, city: "Essen", source: "manual", commissionPercent: "10" }).returning({ id: venues.id });
    venueId = v.id;
  }
  const [m] = await db
    .insert(matches)
    .values({
      venueId,
      homeTeamId: home.id,
      awayTeamId: away.id,
      startsAt: new Date(Date.now() + (opts.hoursAhead ?? 72) * 3_600_000),
      durationMin: opts.durationMin ?? 60,
      priceCents: opts.priceCents === undefined ? 8000 : opts.priceCents,
      costCents: opts.costCents === undefined ? 8000 : opts.costCents,
      // Buchungsmodell (Vertrag 009 M2): Standard der Tests bleibt das ALTE Modell (revenue), damit bestehende Tests unveraendert gelten; Tests der Provision setzen ledgerModel: "commission"
      ledgerModel: model,
      legacyShareModel: opts.legacy ?? false, // Standard: neues Modell (Preis ÷ Spielerzahl); legacy: true = Altspiel mit Reservierung
    })
    .returning();
  await db.insert(matchParticipants).values([
    { matchId: m.id, userId: adminA.id, teamId: home.id },
    { matchId: m.id, userId: adminB.id, teamId: away.id },
  ]);
  return { match: m, home, away, adminA, adminB };
}

/** Fügt einem Team einen Spieler hinzu und trägt ihn in die Lobby ein. */
export async function addPlayer(matchId: string, teamId: string, tag = "p") {
  const u = await makeUser(tag);
  await db.insert(teamMembers).values({ teamId, userId: u.id, role: "player" }).onConflictDoNothing();
  await db.insert(matchParticipants).values({ matchId, userId: u.id, teamId });
  return u;
}

export async function reloadMatch(id: string) {
  const [m] = await db.select().from(matches).where(eq(matches.id, id));
  return m;
}

export async function cleanup() {
  await cleanupTestData(getPool());
  await pool?.end();
  pool = undefined;
}

/** Test-Abkürzung: Betreiber-Zugang direkt aktiv setzen (statt Einladung und Login), mit Rückfall-Spalte wie die echten Pfade. */
export async function grantVenueAccess(venueId: string, userId: string) {
  await db.insert(venueAccess).values({ venueId, userId, status: "active", assignedAt: new Date() });
  await db.update(venues).set({ managerUserId: userId }).where(eq(venues.id, venueId));
}

/** Konto, auf das die Kartenabbuchung eines Spielanteils im aktuellen Testlauf fließt (revenue im alten Modell, venue_payable im Provisionsmodell, TEST_LEDGER_MODEL=commission). */
export const SHARE_ACCOUNT = process.env.TEST_LEDGER_MODEL === "commission" ? "venue_payable" : "revenue";
