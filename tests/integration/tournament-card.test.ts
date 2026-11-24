import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentProfiles, teamMembers } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { setSetting } from "@/server/settings";
import { createTournament, joinAsPlayer, leavePlayer,  registerTeam, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { getTournamentCardDisplays, releaseTournamentCover, takeOverTournamentShare, tournamentCardMode, tournamentTeamCardsReady } from "@/server/tournament-card";
import { exportCardData } from "@/server/account";
import { paymentCharges } from "@/db/schema";
import { getTournament } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Kartenmodell UND Zahlungen EIN (Produktivzustand); "Zahlungen AUS" = Gratis ist in payments-off-free.test.ts abgedeckt.
beforeAll(() => setSetting(null, "payments_enabled", true));
afterAll(() => setSetting(null, "payments_enabled", false));

// 012 M5-3: Turnier im Kartenmodell. "Bereit" = Karte hinterlegt, "Anteil uebernehmen" nur im eigenen Team, nichts wird bezahlt oder abgebucht, das Bracket entsteht nicht.

let hall = ""; // Partnerhalle: im Kartenmodell Pflicht (M5-1)
beforeAll(async () => {
  await setSetting(null, "card_payments_enabled", true);
  const [v] = await db.insert(venues).values({ name: `E2E Halle TC ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
  hall = v.id;
});
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const T0 = Date.now();
const base = { name: "Karten-Cup", city: "Essen", startsAt: new Date(T0 + 5 * 86_400_000), registrationDeadline: new Date(T0 + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };

async function organizer() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  return o;
}

async function squad(tid: string, size = 4, complete = false) {
  const captain = await makeUser("cap");
  const team = await makeTeam(captain.id, "Turnier");
  await registerTeam(captain.id, tid, team.id);
  const players = [captain];
  for (let i = 1; i < size; i++) {
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, tid, team.id);
    players.push(p);
  }
  if (complete) await setRosterComplete(captain.id, tid, true);
  return { captain, team, players };
}

let n = 0;
/** Der Spieler hat eine Karte hinterlegt (Profil mit Zahlungsmittel). */
async function giveCard(userId: string) {
  n += 1;
  await db.insert(paymentProfiles).values({ userId, stripeCustomerId: `cus_tc_${userId}_${n}`, paymentMethodId: `pm_tc_${n}`, cardBrand: "visa", cardLast4: "4242" }).onConflictDoUpdate({ target: paymentProfiles.userId, set: { paymentMethodId: `pm_tc_${n}` } });
}

/** Vier Teams zu je 4 Spielern, alle vollzaehlig: der Preis steht fest (Status payment). */
async function paymentPhase() {
  const o = await organizer();
  const t = await createTournament(o.id, { ...base, venueId: hall });
  const squads = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id, 4, true));
  return { o, t, squads };
}

const stateOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];
const teamOf = async (tid: string, teamId: string) => (await db.select().from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tid), eq(tournamentTeams.teamId, teamId))))[0];
const playerOf = async (tid: string, userId: string) => (await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tid), eq(tournamentPlayers.userId, userId))))[0];
const MANDATE = true;

describe("M5-3: Kartenmodell im Turnier", () => {
  it("der Preis steht fest, und Spieler haben noch nichts bezahlt (kein Guthabenweg mehr, 012 M6b)", async () => {
    const { t, squads } = await paymentPhase();
    expect((await stateOf(t.id)).status).toBe("payment");
    expect((await playerOf(t.id, squads[0].players[1].id)).paidCents).toBe(0);
  });

  it("Bereit des Captains geht erst, wenn jeder Spieler des Teams eine Karte hat; danach ohne Zahlung und ohne Bracket", async () => {
    const { t, squads } = await paymentPhase();
    const s = squads[0];
    await giveCard(s.captain.id);
    await expect(setPaidReady(s.captain.id, t.id)).rejects.toThrow(/Karte/);
    expect((await teamOf(t.id, s.team.id)).paidReadyAt).toBeNull();
    for (const p of s.players.slice(1)) await giveCard(p.id);
    await setPaidReady(s.captain.id, t.id);
    expect((await teamOf(t.id, s.team.id)).paidReadyAt).not.toBeNull();
    expect((await playerOf(t.id, s.players[1].id)).paidCents).toBe(0);
  });

  it("sind ALLE Teams bereit, entsteht im Kartenmodell trotzdem kein Bracket (das kommt erst nach der Abbuchung, M5-4)", async () => {
    const { t, squads } = await paymentPhase();
    for (const s of squads) for (const p of s.players) await giveCard(p.id);
    for (const s of squads) await setPaidReady(s.captain.id, t.id);
    const st = await stateOf(t.id);
    expect(st.status).toBe("payment");
    expect(st.bracketGeneratedAt).toBeNull();
  });

  it("Anteil uebernehmen: B (mit Karte) deckt A (ohne Karte) im selben Team; das Team ist dann bereit", async () => {
    const { t, squads } = await paymentPhase();
    const s = squads[0];
    for (const p of [s.captain, s.players[1], s.players[2]]) await giveCard(p.id);
    const a = s.players[3];
    expect(await tournamentTeamCardsReady(db, t.id, s.team.id)).toBe(false);
    await takeOverTournamentShare(s.captain.id, t.id, a.id, MANDATE);
    const row = await playerOf(t.id, a.id);
    expect(row.coveredByUserId).toBe(s.captain.id);
    expect(row.coverMandateText).toBeTruthy();
    expect(row.coverAcceptedAt).not.toBeNull();
    expect(await tournamentTeamCardsReady(db, t.id, s.team.id)).toBe(true);
    await setPaidReady(s.captain.id, t.id);
    expect((await teamOf(t.id, s.team.id)).paidReadyAt).not.toBeNull();
  });

  it("Uebernahme abgelehnt: ohne Zustimmung, ohne eigene Karte, fuer sich selbst, fuer einen Spieler mit Karte, aus einem anderen Team, doppelt, zweiter Platz je Uebernehmer", async () => {
    const { t, squads } = await paymentPhase();
    const s = squads[0];
    const other = squads[1];
    await giveCard(s.captain.id);
    await giveCard(s.players[1].id);
    await giveCard(other.captain.id);
    const [, , a, b] = s.players;
    await expect(takeOverTournamentShare(s.captain.id, t.id, a.id, false)).rejects.toThrow(/Mandat/);
    await expect(takeOverTournamentShare(s.players[2].id, t.id, b.id, MANDATE)).rejects.toThrow(/Karte/); // Uebernehmer ohne Karte
    await expect(takeOverTournamentShare(s.captain.id, t.id, s.captain.id, MANDATE)).rejects.toThrow();
    await expect(takeOverTournamentShare(s.captain.id, t.id, s.players[1].id, MANDATE)).rejects.toThrow(); // Ziel hat eine Karte
    await expect(takeOverTournamentShare(other.captain.id, t.id, a.id, MANDATE)).rejects.toThrow(); // anderes Team
    await takeOverTournamentShare(s.captain.id, t.id, a.id, MANDATE);
    await expect(takeOverTournamentShare(s.players[1].id, t.id, a.id, MANDATE)).rejects.toThrow(/schon übernommen/);
    await expect(takeOverTournamentShare(s.captain.id, t.id, b.id, MANDATE)).rejects.toThrow(/schon einen Anteil/);
  });

  it("Uebernahme zuruecknehmen: das Bereit des Teams faellt weg, wenn es dadurch nicht mehr vollstaendig ist", async () => {
    const { t, squads } = await paymentPhase();
    const s = squads[0];
    for (const p of s.players.slice(0, 3)) await giveCard(p.id);
    const a = s.players[3];
    await takeOverTournamentShare(s.captain.id, t.id, a.id, MANDATE);
    await setPaidReady(s.captain.id, t.id);
    expect((await teamOf(t.id, s.team.id)).paidReadyAt).not.toBeNull();
    expect(await releaseTournamentCover(s.captain.id, t.id)).toBe(a.id);
    expect((await playerOf(t.id, a.id)).coveredByUserId).toBeNull();
    expect((await teamOf(t.id, s.team.id)).paidReadyAt).toBeNull();
    await expect(releaseTournamentCover(s.captain.id, t.id)).rejects.toThrow(/keinen Anteil/);
  });

  it("verlaesst der Uebernehmer oder der Platz-Spieler den Kader, endet die Uebernahme (Einwilligung gilt nur fuer diese Konstellation)", async () => {
    const { t, squads } = await paymentPhase();
    const s = squads[0];
    for (const p of s.players.slice(0, 3)) await giveCard(p.id);
    const a = s.players[3];
    await takeOverTournamentShare(s.players[1].id, t.id, a.id, MANDATE);
    // Kader sind gesperrt (Preis fix): der Veranstalter oeffnet nicht, also testen wir direkt ueber leavePlayer vor dem Fixieren in einem eigenen Turnier
    const o = await organizer();
    const t2 = await createTournament(o.id, { ...base, venueId: hall });
    const s2 = await squad(t2.id, 4, false);
    for (const p of s2.players.slice(0, 3)) await giveCard(p.id);
    await takeOverTournamentShare(s2.players[1].id, t2.id, s2.players[3].id, MANDATE);
    await leavePlayer(s2.players[1].id, t2.id, s2.players[1].id);
    expect((await playerOf(t2.id, s2.players[3].id)).coveredByUserId).toBeNull();
    expect((await playerOf(t.id, a.id)).coveredByUserId).toBe(s.players[1].id); // das andere Turnier ist unberuehrt
  });

  it("Sichtbarkeit: Spieler sich selbst, Captain und Plattform-Admin den echten Stand, Mitspieler des Teams nur die neutrale Ampel, andere Teams und der Veranstalter nichts", async () => {
    const { o, t, squads } = await paymentPhase();
    const s = squads[0];
    await giveCard(s.captain.id);
    await giveCard(s.players[1].id);
    const noCard = s.players[2];
    const admin = await makeUser("vadm", "admin");
    const as = (id: string | null, platformAdmin = false) => getTournamentCardDisplays(t.id, { id, platformAdmin });

    const self = await as(noCard.id);
    expect(self[noCard.id]).toEqual({ status: "none", reason: null });
    expect(self[s.captain.id]?.status).toBe("card_ready"); // Mitspieler: nur der Stand, nie ein Grund
    expect(self[s.captain.id]?.reason).toBeNull();

    const cap = await as(s.captain.id);
    expect(cap[noCard.id]).toEqual({ status: "none", reason: null });
    expect(cap[s.players[1].id]?.status).toBe("card_ready");

    const mate = await as(s.players[1].id);
    expect(mate[noCard.id]).toEqual({ status: "open", reason: null }); // "Zahlung ausstehend", ohne Grund
    expect(mate[noCard.id]?.reason).toBeNull();

    const sup = await as(admin.id, true);
    expect(sup[noCard.id]).toEqual({ status: "none", reason: null });

    const foreign = await as(squads[1].players[1].id); // Spieler eines anderen Teams
    expect(foreign[noCard.id]).toBeUndefined();
    expect(foreign[s.captain.id]).toBeUndefined();

    const orgView = await as(o.id); // Veranstalter ohne Geldrechte
    expect(Object.keys(orgView)).toHaveLength(0);
    expect(Object.keys(await as(null))).toHaveLength(0); // Gast
  });

  it("uebernommene Plaetze sehen Mitspieler als gedeckt (ohne Namen des Uebernehmers), der Captain mit Markierung", async () => {
    const { t, squads } = await paymentPhase();
    const s = squads[0];
    for (const p of s.players.slice(0, 3)) await giveCard(p.id);
    const a = s.players[3];
    await takeOverTournamentShare(s.players[1].id, t.id, a.id, MANDATE);
    const mate = await getTournamentCardDisplays(t.id, { id: s.players[2].id, platformAdmin: false });
    expect(mate[a.id]).toEqual({ status: "card_ready", reason: null, covered: true });
    const cap = await getTournamentCardDisplays(t.id, { id: s.captain.id, platformAdmin: false });
    expect(cap[a.id]?.covered).toBe(true);
  });

  it("der Datenexport nennt die Uebernahme im Turnier (tournamentId) und keine fremden Daten", async () => {
    const { t, squads } = await paymentPhase();
    const s = squads[0];
    for (const p of s.players.slice(0, 3)) await giveCard(p.id);
    await takeOverTournamentShare(s.captain.id, t.id, s.players[3].id, MANDATE);
    const mine = await exportCardData(s.captain.id);
    expect(mine.coversGiven).toEqual([expect.objectContaining({ tournamentId: t.id, matchId: null, mandate: expect.any(String) })]);
    const other = await exportCardData(squads[1].captain.id);
    expect(other.coversGiven).toEqual([]);
  });

  it("kostenloses Turnier (Hallenkosten 0), Schalter EIN: kein Kartenmodell, kein Bereit noetig, das Bracket entsteht", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, hourlyCents: 0 });
    const squads = [];
    for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id, 4, true));
    expect((await stateOf(t.id)).finalShareCents).toBe(0);
    expect(await tournamentCardMode(db, t.id)).toBe(false);
    expect(squads.length).toBe(t.maxTeams); // Gratis PR B: "Bereit" entfaellt, das Bracket entsteht mit dem letzten "vollzaehlig"
    const st = await stateOf(t.id);
    expect(st.status).toBe("running");
    expect(st.bracketGeneratedAt).not.toBeNull();
  });

  it("Captain-Sicht: ein uebernommener Platz ist NICHT rot, das Team ist vollstaendig und der Bereit-Weg offen (cardMissing 0)", async () => {
    const { t, squads } = await paymentPhase();
    const s = squads[0];
    for (const p of s.players.slice(0, 3)) await giveCard(p.id);
    const a = s.players[3];
    await takeOverTournamentShare(s.players[1].id, t.id, a.id, MANDATE);
    const cap = await getTournament(t.id, { id: s.captain.id, role: "player" });
    const team = cap!.teams.find((x) => x.teamId === s.team.id)!;
    expect(team.cardMissing).toBe(0);
    expect(team.players.find((p) => p.userId === a.id)).toMatchObject({ paid: true, covered: true });
    await setPaidReady(s.captain.id, t.id);
  });

  it("Sicht je Rolle: Veranstalter und Mitglied sehen Karten-Aggregat bzw. Ampeln, Gast und fremder Spieler nur Anzahl (keine Ampeln, kein Aggregat)", async () => {
    const { o, t, squads } = await paymentPhase();
    const s = squads[0];
    for (const p of s.players) await giveCard(p.id);
    const admin = await makeUser("vadm2", "admin");
    const teamOf2 = (view: Awaited<ReturnType<typeof getTournament>>, id: string) => view!.teams.find((x) => x.teamId === id)!;

    const org = await getTournament(t.id, { id: o.id, role: "player" }); // Veranstalter: Aggregat je Team, keine Spieler-Ampeln
    expect(teamOf2(org, s.team.id)).toMatchObject({ cardsComplete: true, showLights: false, cardMissing: 0 });
    expect(teamOf2(org, squads[2].team.id)).toMatchObject({ cardsComplete: false, showLights: false });

    const mine = await getTournament(t.id, { id: s.captain.id, role: "player" }); // Mitglied/Captain: Ampeln des eigenen Teams, fremde Teams nichts
    expect(teamOf2(mine, s.team.id)).toMatchObject({ showLights: true, cardsComplete: null });
    expect(teamOf2(mine, squads[1].team.id)).toMatchObject({ showLights: false, cardsComplete: null });

    for (const view of [await getTournament(t.id, null), await getTournament(t.id, { id: squads[1].players[1].id, role: "player" }), await getTournament(t.id, { id: (await makeUser("fremd")).id, role: "player" })]) {
      for (const team of view!.teams.filter((x) => x.teamId !== squads[1].team.id)) expect(team, team.name).toMatchObject({ cardsComplete: null, showLights: false });
      expect(view!.cardMode).toBe(true);
    }
    const adm = await getTournament(t.id, { id: admin.id, role: "admin" }); // Plattform-Admin: Support-Sicht mit Ampeln
    expect(teamOf2(adm, s.team.id).showLights).toBe(true);
  });

  it("Uebernahme geschlossen: nach Abbuchungszeile, bei laufendem Turnier und bei abgesagtem Turnier (und Zuruecknehmen nach Abbuchungszeile)", async () => {
    const { t, squads } = await paymentPhase();
    const s = squads[0];
    for (const p of s.players.slice(0, 3)) await giveCard(p.id);
    await takeOverTournamentShare(s.captain.id, t.id, s.players[3].id, MANDATE);
    // Abbuchungszeile des Turniers (M5-4 legt sie an): Zuruecknehmen und neue Uebernahmen sind gesperrt
    const [c] = await db.insert(paymentCharges).values({ tournamentId: t.id, userId: s.captain.id, amountCents: 1000, idempotencyKey: `tc-closed:${t.id}` }).returning();
    await expect(releaseTournamentCover(s.captain.id, t.id)).rejects.toThrow(/nicht mehr/);
    await expect(takeOverTournamentShare(s.players[1].id, t.id, s.players[2].id, MANDATE)).rejects.toThrow();
    await db.delete(paymentCharges).where(eq(paymentCharges.id, c.id));
    for (const status of ["running", "cancelled"] as const) {
      await db.update(tournaments).set({ status }).where(eq(tournaments.id, t.id));
      await expect(takeOverTournamentShare(s.players[1].id, t.id, s.players[2].id, MANDATE)).rejects.toThrow();
      await expect(releaseTournamentCover(s.captain.id, t.id)).rejects.toThrow(/nicht mehr/);
    }
  });

  it("Mischzustand: liegt Geld aus dem Guthabenmodell im Turnier (paid_cents > 0), bleibt es im Guthabenmodell", async () => {
    const { t, squads } = await paymentPhase();
    expect(await tournamentCardMode(db, t.id)).toBe(true);
    await db.update(tournamentPlayers).set({ paidCents: 1000 }).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, squads[0].captain.id)));
    expect(await tournamentCardMode(db, t.id)).toBe(false);
    await expect(takeOverTournamentShare(squads[0].captain.id, t.id, squads[0].players[1].id, MANDATE)).rejects.toThrow();
  });

  it("Schalter AUS bei bereits fixiertem Kartenfluss: Bezahlung und Bereit sind pausiert (kein Guthaben-Weg an Halle und Provision vorbei, Review Zahlungen AUS)", async () => {
    const { t, squads } = await paymentPhase();
    for (const p of squads[0].players) await giveCard(p.id);
    await setSetting(null, "card_payments_enabled", false);
    try {
      expect(await tournamentCardMode(db, t.id)).toBe(false);
      await expect(setPaidReady(squads[0].captain.id, t.id)).rejects.toThrow(/pausiert/);
    } finally {
      await setSetting(null, "card_payments_enabled", true);
    }
  });

  it("Anteil 0 (final_share_cents = 0) oder kein Preis (ohne Gesamtbetrag, Eintritt 0): kein Kartenmodell", async () => {
    const { t } = await paymentPhase();
    expect(await tournamentCardMode(db, t.id)).toBe(true);
    await db.update(tournaments).set({ finalShareCents: 0 }).where(eq(tournaments.id, t.id));
    expect(await tournamentCardMode(db, t.id)).toBe(false);
    await db.update(tournaments).set({ finalShareCents: null, totalCents: null, entryFeeCents: 0 }).where(eq(tournaments.id, t.id));
    expect(await tournamentCardMode(db, t.id)).toBe(false);
    await db.update(tournaments).set({ totalCents: null, entryFeeCents: 500 }).where(eq(tournaments.id, t.id)); // Festgeld pro Spieler (alt): Kartenmodell
    expect(await tournamentCardMode(db, t.id)).toBe(true);
  });
});

