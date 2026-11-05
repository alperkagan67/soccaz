// Füllt ein Turnier zum Ausprobieren (nur lokal): weitere Teams, Spieler im Kader, fast alle haben bezahlt.
// Aufruf: npx tsx --env-file=.env.local scripts/seed-tournament.mts [turnierId] [unbezahlt=2]   (ohne Angabe: das neueste Turnier)
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, teamMembers } from "../src/db/schema";
import { tournamentPlayers, tournamentTeams, tournaments } from "../src/db/schema-league";
import { creditWallet } from "../src/server/ledger";
import { createTeam } from "../src/server/teams";
import { joinAsPlayer, payEntry, registerTeam, reservationOf } from "../src/server/tournaments";

if (!["127.0.0.1", "localhost"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Nur gegen eine lokale Datenbank.");

const NAMES = ["Kevin Brandt", "Murat Yilmaz", "Jonas Keller", "Emre Demir", "Lukas Vogt", "Can Aydin", "Tim Hartmann", "Deniz Kaya", "Ali Öztürk", "Felix Neumann", "Yusuf Arslan", "Ben Schulz", "Omar Haddad", "Paul Richter", "Hakan Çelik", "Nico Braun"];
const TEAMS = [
  ["Moschee-Team Essen", "Essen"],
  ["Moschee-Team Köln", "Köln"],
  ["Moschee-Team Dortmund", "Dortmund"],
  ["Moschee-Team Duisburg", "Duisburg"],
  ["Moschee-Team Bochum", "Bochum"],
  ["Moschee-Team Gelsenkirchen", "Gelsenkirchen"],
  ["Moschee-Team Düsseldorf", "Düsseldorf"],
  ["Moschee-Team Münster", "Münster"],
];

const arg = process.argv[2];
const [t] = arg
  ? await db.select().from(tournaments).where(eq(tournaments.id, arg))
  : await db.select().from(tournaments).orderBy(tournaments.createdAt).limit(1000).then((r) => r.slice(-1));
if (!t) throw new Error("Kein Turnier gefunden.");
const unpaidWanted = Number(process.argv[3] ?? 2);
const reservation = reservationOf(t);
const existing = await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
const freeSlots = t.maxTeams - existing.length;
const tag = Date.now().toString(36);
let seq = 0;

async function person(name: string) {
  seq += 1;
  const [u] = await db
    .insert(users)
    .values({ email: `turnierfill-${tag}-${seq}@soccav2.local`, name, city: "Gelsenkirchen", position: "Flexibel", onboardedAt: new Date(), ageConfirmedAt: new Date(), termsAcceptedAt: new Date() })
    .returning();
  return u;
}
const fund = (userId: string) => db.transaction((tx) => creditWallet(tx, userId, { from: "clearing", amountCents: Math.max(reservation * 2, 2000), kind: "topup", idempotencyKey: `turnierfill-topup:${tag}:${userId}` }));

// zuerst die Spieler: bestehende Teams auffüllen, dann neue Teams anlegen; die letzten zwei Spieler bleiben unbezahlt
const plan: { teamId: string; userId: string; pay: boolean }[] = [];

// bestehende Teams (z. B. dein Team) auf mindestens 4 Spieler auffüllen
for (const e of existing) {
  const have = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.teamId, e.teamId));
  for (let i = have.length; i < 4; i++) {
    const u = await person(NAMES[(seq + i) % NAMES.length]);
    await db.insert(teamMembers).values({ teamId: e.teamId, userId: u.id, role: "player" }).onConflictDoNothing();
    await joinAsPlayer(u.id, t.id, e.teamId);
    plan.push({ teamId: e.teamId, userId: u.id, pay: true });
  }
}

const made: string[] = [];
for (const [name, city] of TEAMS.slice(0, freeSlots)) {
  const cap = await person(NAMES[seq % NAMES.length]);
  const team = await createTeam(cap.id, { name: `${name} ${tag.slice(-3)}`, city, strength: 3 });
  await registerTeam(cap.id, t.id, team.id);
  await fund(cap.id);
  await payEntry(cap.id, t.id);
  for (let i = 0; i < 4; i++) {
    const u = await person(NAMES[(seq + i) % NAMES.length]);
    await db.insert(teamMembers).values({ teamId: team.id, userId: u.id, role: "player" }).onConflictDoNothing();
    await joinAsPlayer(u.id, t.id, team.id);
    plan.push({ teamId: team.id, userId: u.id, pay: true });
  }
  made.push(name);
}

// alle bezahlen außer den letzten zwei (in verschiedenen Teams)
const unpaid = new Set<string>();
const byTeam = new Map<string, string[]>();
for (const p of plan) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p.userId]);
const teamIds = [...byTeam.keys()];
for (let i = 0; i < unpaidWanted && teamIds.length; i++) unpaid.add(byTeam.get(teamIds[(i * 3 + 1) % teamIds.length])![i % 2]);
for (const p of plan) {
  if (unpaid.has(p.userId)) continue;
  await fund(p.userId);
  await payEntry(p.userId, t.id);
}
// bestehende Mitglieder, die schon vor dem Skript im Kader waren, zahlen nicht automatisch: nur die neuen Spieler

const rows = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id));
console.log(`Turnier "${t.name}": ${made.length} neue Teams, ${rows.length} Spieler im Kader, ${rows.filter((r) => r.paidCents >= reservation).length} bezahlt, ${rows.filter((r) => r.paidCents < reservation).length} offen.`);
process.exit(0);
