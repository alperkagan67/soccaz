import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { matchParticipants, matches, paymentProfiles, teamMembers, teams, users } from "@/db/schema";
import { venueAccess, venues } from "@/db/schema-finance";
import { cleanupTestData } from "../cleanup";
import { currentRoundOf } from "@/server/evidence";
import { setReady } from "@/server/lobby";
import { runCharges } from "@/server/payments/charge-run";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { cardPaymentsEnabled, paymentsEnabled, setSetting } from "@/server/settings";
import { answerHallRequest, type HallAnswerOpts } from "@/server/veto";

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

/** Test-Abkürzung: Hallen-Antwort mit der aktuellen Runde (der Server verlangt die Runde der gesehenen Anfrage, R-T257 N1); eine ausdrücklich übergebene Runde bleibt. */
export async function answerHall(userId: string, matchId: string, venueId: string, accept: boolean, opts: Omit<HallAnswerOpts, "round"> & { round?: number | null } = {}) {
  const round = opts.round === undefined ? await currentRoundOf(db, matchId) : opts.round;
  return answerHallRequest(userId, matchId, venueId, accept, { ...opts, round });
}

/**
 * Fixture für den bezahlten Zustand OHNE Guthaben (012 M6b): setzt paid_cents/paid_at des Platzes auf den aktuellen Anteil (wie nach einer Abbuchung).
 * Ersetzt den Weg über payShare (Guthaben, entfernt). Kein Hauptbuch-Eintrag; wer den Geldweg prüfen will, nutzt die Karten-Tests (charge/refund).
 */
export async function seedShare(userId: string, matchId: string, cents?: number) {
  const { ensurePrice, shareToCharge } = await import("@/server/wallet");
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  let amount = cents;
  if (amount === undefined) {
    const { priceCents } = await db.transaction((tx) => ensurePrice(tx, match));
    amount = priceCents ? await shareToCharge(db, match, priceCents) : 0;
  }
  await db.update(matchParticipants).set({ paidCents: amount, paidAt: new Date() }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 012 M6b Kartenfixture: Spiele im KARTENMODELL aufbauen (Karte hinterlegt, Anteil fixiert, Abbuchung mit dem Fake-Provider), statt über das Guthaben (fund/payShare).
// Regeln: keine Hintergrundläufe (Abbuchung nur über chargeGame, Regel 24), Schalter pro Test (Regel 23: useCardMode im beforeEach, nie nur im beforeAll).
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------

let cardSeq = 0;
const cardId = (p: string) => `${p}_${Date.now().toString(36)}_${++cardSeq}`;

/** Zahlungsprofil mit Zahlungsmethode = "Karte hinterlegt". */
export async function giveCard(userId: string) {
  await db.insert(paymentProfiles).values({ userId, stripeCustomerId: cardId("cus_fx"), paymentMethodId: cardId("pm_fx") }).onConflictDoNothing();
}

/** Kartenmodell AN (payments_enabled + card_payments_enabled) mit frischem FakeProvider. Gibt den Provider und den Rückbau zurück (afterEach); restore() stellt die AUSGANGSWERTE wieder her (Regel 23). */
export async function useCardMode() {
  const before = { payments: await paymentsEnabled(), card: await cardPaymentsEnabled() };
  const provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "card_payments_enabled", true);
  return {
    provider,
    async restore() {
      setPaymentProviderForTests(null);
      await setSetting(null, "card_payments_enabled", before.card);
      await setSetting(null, "payments_enabled", before.payments);
    },
  };
}

export type CardGameOpts = { n?: number; price?: number; hoursAhead?: number; confirmed?: boolean; legacy?: boolean };
/**
 * Kartenspiel, abbuchungsbereit: n Spieler (beide Captains inklusive) mit Karte (card_ready), Anteil fixiert (aufgerundet Preis ÷ n), Status confirmed.
 * `confirmed: false` lässt die Bestätigung beider Captains weg (Spiel noch nicht fällig). Es fließt kein Geld, bis chargeGame läuft.
 */
export async function cardGame(o: CardGameOpts = {}) {
  const n = o.n ?? 6;
  const price = o.price ?? 6000;
  const m = await makeMatch({ hoursAhead: o.hoursAhead ?? 72, priceCents: price, costCents: price, legacy: o.legacy });
  const all = [m.adminA, m.adminB];
  while (all.length < n) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
  for (const p of all) await giveCard(p.id);
  await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, m.match.id));
  const confirmed = o.confirmed ?? true;
  await db
    .update(matches)
    .set({ homeFinalAt: confirmed ? new Date() : null, awayFinalAt: confirmed ? new Date() : null, finalShareCents: price > 0 ? Math.ceil(price / n) : 0, status: "confirmed" })
    .where(eq(matches.id, m.match.id));
  return { ...m, all, n, price };
}
export type CardGame = Awaited<ReturnType<typeof cardGame>>;

/** Alle Spieler (oder `who`) melden sich bereit; im Kartenmodell ist die Karte das Bereit-Gate (nichts wird bezahlt). */
export async function cardReadyAll(g: CardGame, who = g.all) {
  for (const p of who) await setReady(p.id, g.match.id, true);
}

/** Abbuchung des Spiels (Fake-Provider), direkt über runCharges (kein Hintergrundauslöser): jeder Platz wird genau einmal belastet. */
export async function chargeGame(g: { match: { id: string } }, now: Date = new Date()) {
  return runCharges(g.match.id, now);
}
