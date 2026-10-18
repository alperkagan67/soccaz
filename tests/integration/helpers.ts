import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { matchParticipants, matches, teamMembers, teams, users } from "@/db/schema";
import { cleanupTestData } from "../cleanup";

const run = randomUUID().slice(0, 8);
let seq = 0;
let pool: Pool | undefined;

function getPool() {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return pool;
}

export async function makeUser(tag = "u", role: "player" | "admin" | "finance" | "booking" | "moderator" = "player") {
  seq += 1;
  const [u] = await db
    .insert(users)
    .values({
      email: `${tag}${seq}-${run}@test.local`,
      name: `${tag} ${seq}`,
      role,
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
export async function makeMatch(opts: { hoursAhead?: number; durationMin?: number; priceCents?: number | null; costCents?: number | null } = {}) {
  const adminA = await makeUser("ha");
  const adminB = await makeUser("ga");
  const home = await makeTeam(adminA.id, "Heim");
  const away = await makeTeam(adminB.id, "Gast");
  const [m] = await db
    .insert(matches)
    .values({
      homeTeamId: home.id,
      awayTeamId: away.id,
      startsAt: new Date(Date.now() + (opts.hoursAhead ?? 72) * 3_600_000),
      durationMin: opts.durationMin ?? 60,
      priceCents: opts.priceCents === undefined ? 8000 : opts.priceCents,
      costCents: opts.costCents === undefined ? 8000 : opts.costCents,
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
