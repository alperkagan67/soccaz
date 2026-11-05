// Füllt ein Turnier zum Ausprobieren (nur lokal).
//   npx tsx --env-file=.env.local scripts/seed-tournament.mts fill [turnierId]
//     legt die fehlenden Teams an, füllt alle Kader auf mindestens 4 Spieler und meldet alle Demo-Teams "vollzählig"
//     (dein eigenes Team bleibt offen: du drückst selbst "Team ist vollzählig", danach steht der Preis fest)
//   npx tsx --env-file=.env.local scripts/seed-tournament.mts pay [turnierId] [unbezahlt=2]
//     in der Zahlungsphase: alle Demo-Spieler zahlen ihren Anteil, bis auf die letzten `unbezahlt` Spieler
// Ohne Turnier-ID gilt das neueste Turnier.
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../src/db";
import { teamMembers, users } from "../src/db/schema";
import { tournamentPlayers, tournamentTeams, tournaments } from "../src/db/schema-league";
import { creditWallet } from "../src/server/ledger";
import { createTeam } from "../src/server/teams";
import { joinAsPlayer, payEntry, registerTeam, setRosterComplete } from "../src/server/tournaments";

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

const mode = process.argv[2] === "pay" ? "pay" : "fill";
const arg = process.argv[3];
const [t] = arg ? await db.select().from(tournaments).where(eq(tournaments.id, arg)) : (await db.select().from(tournaments).orderBy(asc(tournaments.createdAt))).slice(-1);
if (!t) throw new Error("Kein Turnier gefunden.");
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

if (mode === "fill") {
  const existing = await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
  const demo: string[] = [];
  // bestehende Teams auf mindestens 4 Spieler auffüllen
  for (const e of existing) {
    const have = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.teamId, e.teamId));
    for (let i = have.length; i < 4; i++) {
      const u = await person(NAMES[(seq + i) % NAMES.length]);
      await db.insert(teamMembers).values({ teamId: e.teamId, userId: u.id, role: "player" }).onConflictDoNothing();
      await joinAsPlayer(u.id, t.id, e.teamId);
    }
  }
  // neue Teams mit 5 Spielern
  for (const [name, city] of TEAMS.slice(0, t.maxTeams - existing.length)) {
    const cap = await person(NAMES[seq % NAMES.length]);
    const team = await createTeam(cap.id, { name: `${name} ${tag.slice(-3)}`, city, strength: 3 });
    await registerTeam(cap.id, t.id, team.id);
    for (let i = 0; i < 4; i++) {
      const u = await person(NAMES[(seq + i) % NAMES.length]);
      await db.insert(teamMembers).values({ teamId: team.id, userId: u.id, role: "player" }).onConflictDoNothing();
      await joinAsPlayer(u.id, t.id, team.id);
    }
    demo.push(cap.id);
    await setRosterComplete(cap.id, t.id, true);
  }
  // alle Demo-Teams (Captain mit turnierfill-Adresse) melden vollzählig; fremde Teams bleiben dir überlassen
  for (const e of await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id))) {
    if (e.readyAt || !e.captainId) continue;
    const [cap] = await db.select({ email: users.email }).from(users).where(eq(users.id, e.captainId));
    if (cap?.email.startsWith("turnierfill-")) await setRosterComplete(e.captainId, t.id, true);
  }
  const teamsNow = await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
  const players = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id));
  console.log(`Turnier "${t.name}": ${teamsNow.length} Teams, ${players.length} Spieler, ${teamsNow.filter((x) => x.readyAt).length} Teams vollzählig. Drücke bei deinem Team "Team ist vollzählig".`);
} else {
  const [fresh] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
  if (fresh.status !== "payment") throw new Error(`Das Turnier ist in der Phase "${fresh.status}". Bezahlt wird erst, wenn alle Teams vollzählig sind.`);
  const unpaidWanted = Number(process.argv[4] ?? 2);
  const share = fresh.finalShareCents ?? 0;
  const players = await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.paidCents, 0)));
  // nur Demo-Spieler (turnierfill-Adressen) zahlen, echte Konten bleiben dir überlassen
  const demoIds = new Set((await db.select({ id: users.id, email: users.email }).from(users).where(ne(users.email, ""))).filter((u) => u.email.startsWith("turnierfill-")).map((u) => u.id));
  const demo = players.filter((p) => demoIds.has(p.userId));
  const skip = new Set((unpaidWanted > 0 ? demo.slice(-unpaidWanted) : []).map((p) => p.userId));
  for (const p of demo) {
    if (skip.has(p.userId)) continue;
    await db.transaction((tx) => creditWallet(tx, p.userId, { from: "clearing", amountCents: Math.max(share * 2, 2000), kind: "topup", idempotencyKey: `turnierfill-topup:${tag}:${p.userId}` }));
    await payEntry(p.userId, t.id);
  }
  const rows = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id));
  console.log(`Preis pro Spieler ${(share / 100).toFixed(2)} €: ${rows.filter((r) => r.paidCents >= share).length} von ${rows.length} bezahlt, ${rows.filter((r) => r.paidCents < share).length} offen.`);
}
process.exit(0);
