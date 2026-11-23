import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { tournamentTeams, tournaments } from "@/db/schema-league";
import { setSetting } from "@/server/settings";
import { createTournament, joinAsPlayer, registerTeam, reopenRosters, setOrganizer, setRosterComplete } from "@/server/tournaments";
import { listPartnerVenueOptions, setTournamentVenue } from "@/server/tournament-venue";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Kartenmodell UND Zahlungen EIN (Produktivzustand); "Zahlungen AUS" = Gratis ist in payments-off-free.test.ts abgedeckt.
beforeAll(() => setSetting(null, "payments_enabled", true));
afterAll(() => setSetting(null, "payments_enabled", false));

// 012 M5-1: Partnerhalle am Turnier (Pflicht im Kartenmodell), Snapshot von Zugang und Provisionssatz beim Fixieren, Halle waehlen nur durch den Veranstalter.

beforeAll(() => setSetting(null, "card_payments_enabled", true));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const T0 = Date.now();
const base = { name: "Hallen-Cup", city: "Essen", startsAt: new Date(T0 + 5 * 86_400_000), registrationDeadline: new Date(T0 + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };

let n = 0;
async function venue(over: Partial<typeof venues.$inferInsert> = {}) {
  n += 1;
  const [v] = await db.insert(venues).values({ name: `E2E Halle M5 ${n} ${Date.now()}`, city: "Essen", address: "Hallenweg 1", isPartner: true, active: true, ...over }).returning();
  return v;
}

async function organizer() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  return { o, admin };
}

async function squad(tid: string, size = 4) {
  const captain = await makeUser("cap");
  const team = await makeTeam(captain.id, "Turnier");
  await registerTeam(captain.id, tid, team.id);
  for (let i = 1; i < size; i++) {
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, tid, team.id);
  }
  return { captain, team };
}

const rowOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];

describe("M5-1: Partnerhalle", () => {
  it("Kartenmodell AN: ein kostenpflichtiges Turnier braucht eine aktive Partnerhalle (ohne Halle, Nicht-Partner, gesperrte Halle abgelehnt)", async () => {
    const { o } = await organizer();
    await expect(createTournament(o.id, base)).rejects.toThrow(/Partnerhalle/);
    await expect(createTournament(o.id, { ...base, venueId: (await venue({ isPartner: false })).id })).rejects.toThrow(/Partnerhalle/);
    await expect(createTournament(o.id, { ...base, venueId: (await venue({ active: false })).id })).rejects.toThrow(/Partnerhalle/);
    await expect(createTournament(o.id, { ...base, venueId: "kein-uuid" })).rejects.toThrow(/Partnerhalle/);
    const v = await venue();
    const t = await createTournament(o.id, { ...base, venueId: v.id });
    expect(t.venueId).toBe(v.id);
    expect(t.venueText).toContain(v.name); // ohne eigenen Spielort wird die Halle eingetragen
    expect(t.venueText).toContain("Hallenweg 1"); // samt Adresse
    const own = await createTournament(o.id, { ...base, venueId: v.id, venueText: "Eigener Ort" });
    expect(own.venueText).toBe("Eigener Ort");
  });

  it("ein kostenloses Turnier braucht im Kartenmodell keine Halle", async () => {
    const { o } = await organizer();
    const t = await createTournament(o.id, { ...base, hourlyCents: 0 });
    expect(t.venueId).toBeNull();
  });

  it("Kartenmodell AUS: ohne Halle wie bisher; eine gewaehlte Halle muss trotzdem eine Partnerhalle sein", async () => {
    await setSetting(null, "card_payments_enabled", false);
    try {
      const { o } = await organizer();
      expect((await createTournament(o.id, base)).venueId).toBeNull();
      await expect(createTournament(o.id, { ...base, venueId: (await venue({ isPartner: false })).id })).rejects.toThrow(/Partnerhalle/);
    } finally {
      await setSetting(null, "card_payments_enabled", true);
    }
  });

  it("Fixieren im Kartenmodell: ohne Halle wird der Preis nicht fixiert (Meldung); mit Halle friert es Zugang und Provisionssatz ein", async () => {
    await setSetting(null, "card_payments_enabled", false);
    const { o } = await organizer();
    const t = await createTournament(o.id, base); // ohne Halle (Schalter AUS angelegt)
    await setSetting(null, "card_payments_enabled", true);
    const squads = [];
    for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
    for (const s of squads.slice(0, 3)) await setRosterComplete(s.captain.id, t.id, true);
    await expect(setRosterComplete(squads[3].captain.id, t.id, true)).rejects.toThrow(/Partnerhalle/);
    expect((await rowOf(t.id)).status).toBe("registration");
    const [entry] = await db.select().from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, t.id), eq(tournamentTeams.teamId, squads[3].team.id)));
    expect(entry.readyAt).toBeNull(); // die Meldung wurde zurueckgenommen

    const v = await venue();
    await setTournamentVenue(o.id, false, t.id, v.id);
    await setRosterComplete(squads[3].captain.id, t.id, true);
    const fixed = await rowOf(t.id);
    expect(fixed.status).toBe("payment");
    expect(fixed.venueAccessRequiredSnapshot).toBe(false);
    expect(fixed.commissionPercentSnapshot).toBe("0.00");

    // Wiederoeffnen verwirft die Snapshots (sie werden beim naechsten Fixieren neu eingefroren)
    await reopenRosters(o.id, t.id);
    const reopened = await rowOf(t.id);
    expect(reopened.status).toBe("registration");
    expect(reopened.venueAccessRequiredSnapshot).toBeNull();
    expect(reopened.commissionPercentSnapshot).toBeNull();
  });

  it("Halle waehlen: nur Veranstalter oder Plattform-Admin, nur eine Partnerhalle, nur solange der Kader offen ist; eine neue Halle braucht eine neue Zusage", async () => {
    const { o, admin } = await organizer();
    const stranger = await makeUser("fremd");
    const v1 = await venue();
    const v2 = await venue();
    const t = await createTournament(o.id, { ...base, venueId: v1.id });
    await db.update(tournaments).set({ venueConfirmedAt: new Date() }).where(eq(tournaments.id, t.id));
    await expect(setTournamentVenue(stranger.id, false, t.id, v2.id)).rejects.toThrow(/Veranstalter/);
    await expect(setTournamentVenue(o.id, false, t.id, (await venue({ isPartner: false })).id)).rejects.toThrow(/Partnerhalle/);
    await setTournamentVenue(o.id, false, t.id, v2.id);
    const changed = await rowOf(t.id);
    expect(changed.venueId).toBe(v2.id);
    expect(changed.venueConfirmedAt).toBeNull();
    await setTournamentVenue(admin.id, true, t.id, v1.id); // Plattform-Admin darf
    await db.update(tournaments).set({ status: "payment" }).where(eq(tournaments.id, t.id));
    await expect(setTournamentVenue(o.id, false, t.id, v2.id)).rejects.toThrow(/Kader offen/);
  });

  it("eine Halle mit Turnier laesst sich nicht loeschen (Fremdschluessel ohne cascade)", async () => {
    const { o } = await organizer();
    const v = await venue();
    const t = await createTournament(o.id, { ...base, venueId: v.id });
    await expect(db.delete(venues).where(eq(venues.id, v.id))).rejects.toThrow();
    await db.delete(tournaments).where(eq(tournaments.id, t.id));
    await db.delete(venues).where(eq(venues.id, v.id));
  });

  it("Auswahlliste fuer das Formular: nur bei Schalter EIN (sonst null = Formular unveraendert), nur aktive Partnerhallen", async () => {
    const partner = await venue();
    const other = await venue({ isPartner: false });
    const inactive = await venue({ active: false });
    const on = await listPartnerVenueOptions();
    expect(on).not.toBeNull();
    const ids = on!.map((o) => o.id);
    expect(ids).toContain(partner.id);
    expect(ids).not.toContain(other.id);
    expect(ids).not.toContain(inactive.id);
    await setSetting(null, "card_payments_enabled", false);
    try {
      expect(await listPartnerVenueOptions()).toBeNull();
    } finally {
      await setSetting(null, "card_payments_enabled", true);
    }
  });
});

