import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matches, notifications, teamMembers } from "@/db/schema";
import { tournamentMatches, tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { fixDeadline } from "@/lib/deadlines";
import { decideResult } from "@/server/results";
import {
  closeTournamentsAtDeadline,
  closeWithJoinedTeams,
  createTournament,
  getTournament,
  joinAsPlayer,
  leavePlayer,
  notifyRegistrationDeadlines,
  registerTeam,
  setOrganizer,
  setRosterComplete,
  withdrawTeam,
} from "@/server/tournaments";
import { cleanup, makeTeam, makeUser, tokenOf } from "./helpers";

afterAll(cleanup);

// Für den Test "ein Fehler bricht die übrigen Turniere nicht ab": Benachrichtigungen für ein bestimmtes Turnier schlagen fehl.
const forced = vi.hoisted(() => ({ failUrlSuffix: null as string | null, failAfterUrlSuffix: null as string | null }));
vi.mock("@/server/notifications", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/server/notifications")>();
  return {
    ...orig,
    notifyUsers: async (...args: Parameters<typeof orig.notifyUsers>) => {
      if (forced.failUrlSuffix && args[1].url?.endsWith(forced.failUrlSuffix)) throw new Error("erzwungener Fehler");
      const sentCount = await orig.notifyUsers(...args);
      // Fehler NACH dem Eintragen (z. B. beim Festschreiben): die Transaktion rollt zurück, der Zähler des Jobs darf nichts davon zählen
      if (forced.failAfterUrlSuffix && args[1].url?.endsWith(forced.failAfterUrlSuffix)) throw new Error("erzwungener Fehler nach dem Eintragen");
      return sentCount;
    },
  };
});

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function organizer() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  return o;
}

// 2 Stunden à 80 Euro = 160 Euro Hallenkosten, 4 Teams
// Eine einzige Uhr für Start und Anmeldeschluss: Zwei Date.now()-Aufrufe können eine Millisekunde auseinanderliegen, dann wäre der Abstand knapp unter 48 Stunden (AC-12).
const T0 = Date.now();
const base = { name: "Hallen-Cup", city: "Essen", startsAt: new Date(T0 + 5 * 86_400_000), registrationDeadline: new Date(T0 + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
const newTournament = async (o: { id: string }, over: Partial<typeof base & { isPrivate: boolean }> = {}) => createTournament(o.id, { ...base, ...over });
const orgView = (o: { id: string }, tid: string) => getTournament(tid, { id: o.id, role: "player" });
const statusOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];

type Squad = Awaited<ReturnType<typeof squad>>;

/** Ein Team mit Captain und \`size\` Spielern im Kader; auf Wunsch meldet der Captain "vollzählig". */
async function squad(tid: string, size = 4, complete = false) {
  const captain = await makeUser("cap");
  const team = await makeTeam(captain.id, "Turnier");
  await registerTeam(captain.id, tid, team.id, await tokenOf(tid));
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

const bracketRows = (tid: string) => db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, tid));

describe("Turnier anlegen", () => {
  it("nur freigeschaltete Veranstalter, Eingaben werden geprüft, standardmäßig privat mit Einladungstoken", async () => {
    const plain = await makeUser("plain");
    await expect(createTournament(plain.id, base)).rejects.toThrow(/freigeschaltete Veranstalter/);
    const o = await organizer();
    await expect(createTournament(o.id, { ...base, name: "ab" })).rejects.toThrow(/3 bis 80/);
    await expect(createTournament(o.id, { ...base, startsAt: new Date(Date.now() - 1000) })).rejects.toThrow(/Zukunft/);
    await expect(createTournament(o.id, { ...base, registrationDeadline: days(9) })).rejects.toThrow(/vor dem Turnierbeginn/);
    await expect(createTournament(o.id, { ...base, maxTeams: 3 })).rejects.toThrow(/4 bis 32/);
    await expect(createTournament(o.id, { ...base, maxTeams: 33 })).rejects.toThrow(/4 bis 32/);
    await expect(createTournament(o.id, { ...base, hourlyCents: 200_000 })).rejects.toThrow(/1.000 Euro/);
    await expect(createTournament(o.id, { ...base, hourlyCents: -1 })).rejects.toThrow(/1.000 Euro/);
    await expect(createTournament(o.id, { ...base, durationMin: 20 })).rejects.toThrow(/30 Minuten/);
    await expect(createTournament(o.id, { ...base, durationMin: 125 })).rejects.toThrow(/30 Minuten/);
    const t = await newTournament(o);
    expect(t).toMatchObject({ status: "registration", isPrivate: true, format: "knockout", bracketGeneratedAt: null, totalCents: 16_000, finalShareCents: null });
    expect(t.inviteToken).toBeTruthy();
    const admin = await makeUser("tadm2", "admin");
    expect((await createTournament(admin.id, base)).organizerId).toBe(admin.id); // Plattform-Admins dürfen immer
  });

  it("Privates Turnier: nur Veranstalter, Admin, Mitglieder angemeldeter Teams und wer den Token hat sehen es; öffentliche Turniere alle", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const stranger = await makeUser("fremd");
    const sq0 = await squad(t.id, 4);
    for (const viewer of [null, { id: stranger.id, role: "player" as const }]) {
      // kein Zuschauer-Modus mehr (PR 3): fehlender oder falscher Token = NICHTS, genau wie bei einem unbekannten Turnier
      expect(await getTournament(t.id, viewer, "falscher-token")).toBeNull();
      expect(await getTournament(t.id, viewer)).toBeNull();
      expect(await getTournament(t.id, viewer, "")).toBeNull();
    }
    expect((await getTournament(t.id, { id: sq0.players[1].id, role: "player" }))?.teams.some((x) => x.players.length > 0)).toBe(true);
    expect(await getTournament(t.id, { id: stranger.id, role: "player" }, t.inviteToken)).not.toBeNull();
    expect((await orgView(o, t.id))?.tournament.inviteToken).toBe(t.inviteToken); // der Veranstalter sieht den Link
    expect((await getTournament(t.id, { id: stranger.id, role: "player" }, t.inviteToken))?.tournament.inviteToken).toBeNull(); // Gäste mit Link nicht den Token zum Weitergeben
    const sq = await squad(t.id, 4);
    expect(await getTournament(t.id, { id: sq.players[1].id, role: "player" })).not.toBeNull(); // Mitglied eines angemeldeten Teams
    const open = await newTournament(o, { isPrivate: false });
    expect(await getTournament(open.id, null)).not.toBeNull();
  });
});

describe("Beitritt: ein Captain pro Team, Spieler über die Teamlogik", () => {
  it("Regeln für Anmeldung und Kader", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const cap = await makeUser("cap");
    const team = await makeTeam(cap.id, "Regel");
    const outsider = await makeUser("out");
    await expect(registerTeam(outsider.id, t.id, team.id, await tokenOf(t.id))).rejects.toThrow(/Team-Admins/);
    await registerTeam(cap.id, t.id, team.id, await tokenOf(t.id));
    await expect(registerTeam(cap.id, t.id, team.id, await tokenOf(t.id))).rejects.toThrow(/schon angemeldet/);
    const second = await makeTeam(cap.id, "Zweites");
    await expect(registerTeam(cap.id, t.id, second.id, await tokenOf(t.id))).rejects.toThrow(/schon in einem anderen Team/); // ein Captain, ein Team

    await expect(joinAsPlayer(outsider.id, t.id, team.id)).rejects.toThrow(/Mitglieder des Teams/);
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, t.id, team.id);
    await expect(joinAsPlayer(p.id, t.id, team.id)).rejects.toThrow(/schon im Turnier-Kader/);
    await expect(joinAsPlayer(p.id, t.id, second.id)).rejects.toThrow(/nicht im Turnier/);
    for (let i = 0; i < 4; i++) {
      const x = await makeUser("pl");
      await db.insert(teamMembers).values({ teamId: team.id, userId: x.id, role: "player" });
      await joinAsPlayer(x.id, t.id, team.id);
    }
    const extra = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: extra.id, role: "player" });
    await expect(joinAsPlayer(extra.id, t.id, team.id)).rejects.toThrow(/Kader ist voll/);
    await squad(t.id, 4);
    await squad(t.id, 4);
    await squad(t.id, 4);
    const late = await makeUser("late");
    const lateTeam = await makeTeam(late.id, "Zuspät");
    await expect(registerTeam(late.id, t.id, lateTeam.id, await tokenOf(t.id))).rejects.toThrow(/voll/);
  });

  it("nach dem Anmeldeschluss geht keine Anmeldung mehr", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, t.id));
    const cap = await makeUser("cap");
    const team = await makeTeam(cap.id, "Spät");
    await expect(registerTeam(cap.id, t.id, team.id, await tokenOf(t.id))).rejects.toThrow(/Anmeldeschluss/);
  });
});

describe("Team vollzählig: erst wenn alle da sind, dann wird der Preis automatisch berechnet", () => {
  it("alle Teams vollzählig: der Preis ist Hallenkosten durch alle Spieler, der Kader ist gesperrt", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    for (const n of [4, 5, 5]) await squad(t.id, n, true);
    expect((await statusOf(t.id)).status).toBe("registration"); // das vierte Team fehlt noch
    const last = await squad(t.id, 6, false);
    expect((await statusOf(t.id)).status).toBe("registration"); // da, aber nicht vollzählig
    await setRosterComplete(last.captain.id, t.id, true);
    expect(await statusOf(t.id)).toMatchObject({ status: "payment", finalShareCents: 800 }); // 160 Euro / 20 Spieler
    expect((await orgView(o, t.id))!.pricing).toMatchObject({ shareCents: 800, players: 20 });
  });

  it("M1 AC-7: Anteil = aufgerundet Gesamtpreis ÷ tatsächliche Spieler (keine Reservierung), Vorschau als Spanne", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const before = (await orgView(o, t.id))!.pricing;
    expect(before.range).toEqual({ lowest: 667, highest: 1000 }); // 160 Euro: 4 Teams mit 6 bzw. 4 Spielern
    for (const n of [4, 5, 5, 5]) await squad(t.id, n, true);
    expect(await statusOf(t.id)).toMatchObject({ status: "payment", finalShareCents: 843 }); // 16000 ÷ 19 = 842,1 aufgerundet
    expect((await orgView(o, t.id))!.pricing).toMatchObject({ shareCents: 843, players: 19 });
  });

  it("in der Zahlungsphase ist der Kader gesperrt", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    expect((await statusOf(t.id)).status).toBe("payment");
    const late = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: squads[0].team.id, userId: late.id, role: "player" });
    await expect(joinAsPlayer(late.id, t.id, squads[0].team.id)).rejects.toThrow(/geschlossen/);
    await expect(leavePlayer(squads[0].captain.id, t.id, squads[0].players[1].id)).rejects.toThrow(/keine Änderung/);
    await expect(withdrawTeam(squads[0].captain.id, t.id, squads[0].team.id)).rejects.toThrow(/Nach dem Start/);
    await expect(setRosterComplete(squads[0].captain.id, t.id, false)).rejects.toThrow(/Preis steht schon fest/);
  });
});


const paidReadyOf = async (tid: string, teamId: string) =>
  (await db.select({ v: tournamentTeams.paidReadyAt }).from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tid), eq(tournamentTeams.teamId, teamId))))[0].v;

describe("Bereit nach Zahlung (paid_ready_at)", () => {
  it("AC-2: Kaderänderung setzt Bereit zurück", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const s = await squad(t.id, 4, false);
    await db.update(tournamentTeams).set({ paidReadyAt: new Date() }).where(and(eq(tournamentTeams.tournamentId, t.id), eq(tournamentTeams.teamId, s.team.id)));
    const late = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: s.team.id, userId: late.id, role: "player" });
    await joinAsPlayer(late.id, t.id, s.team.id);
    expect(await paidReadyOf(t.id, s.team.id)).toBeNull();

    await db.update(tournamentTeams).set({ paidReadyAt: new Date() }).where(and(eq(tournamentTeams.tournamentId, t.id), eq(tournamentTeams.teamId, s.team.id)));
    await leavePlayer(late.id, t.id, late.id);
    expect(await paidReadyOf(t.id, s.team.id)).toBeNull();
  });

});

describe("Bracket: verborgen, bis alle bezahlt haben, dann genau einmal", () => {
  it("kostenloses Turnier: das Bracket steht, sobald alle Teams vollzählig sind", async () => {
    const o = await organizer();
    const t = await newTournament(o, { hourlyCents: 0 });
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    // Gratis-Turnier (Gratis PR B, Entscheid t2q 2026-11-24): "Bereit" entfaellt, das Bracket steht sofort mit dem letzten "vollzaehlig" (alle Plaetze belegt, alle Teams vollzaehlig)
    expect(await statusOf(t.id)).toMatchObject({ status: "running", finalShareCents: 0 });
    expect(await bracketRows(t.id)).toHaveLength(3);
    expect(squads).toHaveLength(4);
  });

});


describe("Sonderfälle: Teams ersetzen, mit weniger Teams starten, Kader wieder öffnen, absagen", () => {
  it("der Veranstalter ersetzt ein Team bis zum Anmeldeschluss; danach nicht mehr", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const a = await squad(t.id, 4, true);
    await squad(t.id, 4, true);
    const stranger = await makeUser("fremd");
    await expect(withdrawTeam(stranger.id, t.id, a.team.id)).rejects.toThrow(/Captain oder der Veranstalter/);
    await withdrawTeam(o.id, t.id, a.team.id);
    expect(await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.teamId, a.team.id)))).toHaveLength(0);
    const replacement = await squad(t.id, 4, true); // Platz ist wieder frei
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, t.id));
    await expect(withdrawTeam(o.id, t.id, replacement.team.id)).rejects.toThrow(/Anmeldeschluss/);
    await withdrawTeam(replacement.captain.id, t.id, replacement.team.id); // der Captain selbst darf sich abmelden
  });

  it("nach dem Anmeldeschluss mit weniger Teams starten (mindestens 4); der Preis wird dann mit den vorhandenen Teams berechnet", async () => {
    const o = await organizer();
    const t = await newTournament(o, { maxTeams: 5 });
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    expect((await statusOf(t.id)).status).toBe("registration"); // das fünfte Team fehlt
    await expect(closeWithJoinedTeams(o.id, t.id)).rejects.toThrow(/nach dem Anmeldeschluss/);
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, t.id));
    await expect(closeWithJoinedTeams(squads[0].captain.id, t.id)).rejects.toThrow(/Veranstalter/);
    await closeWithJoinedTeams(o.id, t.id);
    expect(await statusOf(t.id)).toMatchObject({ maxTeams: 4, status: "payment", finalShareCents: 1000 }); // 160 Euro / 16 Spieler

    const t2 = await newTournament(o, { maxTeams: 8 });
    for (let i = 0; i < 3; i++) await squad(t2.id, 4, true);
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, t2.id));
    await expect(closeWithJoinedTeams(o.id, t2.id)).rejects.toThrow(/weniger als 4/);
  });

  it("AC-11: der Veranstalter bekommt am Anmeldeschluss genau eine Benachrichtigung, auch bei doppeltem Job-Lauf", async () => {
    const o = await organizer();
    const countFor = async (tid: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, o.id), eq(notifications.url, `/turniere/${tid}`), eq(notifications.title, "Anmeldeschluss erreicht")))).length;
    const open = await newTournament(o, { maxTeams: 8 }); // Frist nicht erreicht
    const t = await newTournament(o, { maxTeams: 8 });
    const full = await newTournament(o, { maxTeams: 4 });
    for (let i = 0; i < 4; i++) await squad(full.id, 4, true);
    for (let i = 0; i < 4; i++) await squad(t.id, 4, true);
    for (const id of [t.id, full.id]) await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, id));
    await Promise.all([notifyRegistrationDeadlines(), notifyRegistrationDeadlines()]);
    await notifyRegistrationDeadlines();
    expect(await countFor(t.id)).toBe(1);
    expect(await countFor(open.id)).toBe(0); // Frist nicht erreicht
    expect(await countFor(full.id)).toBe(0); // volles Turnier: unverändert, keine Meldung
  });

});

describe("AC-10: Der Veranstalter trägt Ergebnisse ein und entscheidet Streit", () => {

  it("Regression: Veranstalterrecht gilt nur für Turnierspiele; Plattform-Admin-Pflicht bei anderen Spielen bleibt", async () => {
    const o = await organizer();
    const [other] = await db.select({ id: matches.id }).from(matches).limit(1);
    if (other) await expect(decideResult(o.id, other.id, 1, 0, "grundlos")).rejects.toThrow();
  });
});

describe("Anmeldeschluss-Job: ein Fehler bricht die übrigen Turniere nicht ab (T43 AC-2)", () => {
  it("Turnier 1 schlägt fehl, Turnier 2 bekommt genau eine Meldung; Turnier 1 beim nächsten Lauf", async () => {
    const o = await organizer();
    const countFor = async (tid: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, o.id), eq(notifications.url, `/turniere/${tid}`), eq(notifications.title, "Anmeldeschluss erreicht")))).length;
    const t1 = await newTournament(o, { maxTeams: 8 });
    const t2 = await newTournament(o, { maxTeams: 8 });
    for (const t of [t1, t2]) for (let i = 0; i < 4; i++) await squad(t.id, 4, true);
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 2 * 3_600_000) }).where(eq(tournaments.id, t1.id)); // zuerst dran
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 3_600_000) }).where(eq(tournaments.id, t2.id));

    forced.failUrlSuffix = t1.id;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(notifyRegistrationDeadlines()).resolves.toBeGreaterThanOrEqual(1); // wirft nicht
      await notifyRegistrationDeadlines();
      expect(await countFor(t1.id)).toBe(0);
      expect(await countFor(t2.id)).toBe(1);
      const logged = JSON.stringify(err.mock.calls);
      expect(logged).toContain(t1.id); // Fehler wurde mit Turnier-ID geloggt
      expect(logged).not.toContain(o.id);
    } finally {
      forced.failUrlSuffix = null;
      err.mockRestore();
    }
    await notifyRegistrationDeadlines();
    expect(await countFor(t1.id)).toBe(1);
    expect(await countFor(t2.id)).toBe(1);
  });
});

describe("Anmeldeschluss-Job: der Zähler zählt nur Festgeschriebenes (Backlog 3)", () => {
  it("scheitert Turnier 1 NACH dem Eintragen (Rollback), liefert der Lauf genau 1 (nur Turnier 2), nicht 2; Turnier 1 hat keine Meldung", async () => {
    const o = await organizer();
    const countFor = async (tid: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, o.id), eq(notifications.url, `/turniere/${tid}`), eq(notifications.title, "Anmeldeschluss erreicht")))).length;
    const t1 = await newTournament(o, { maxTeams: 8 });
    const t2 = await newTournament(o, { maxTeams: 8 });
    for (const t of [t1, t2]) for (let i = 0; i < 4; i++) await squad(t.id, 4, true);
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 2 * 3_600_000) }).where(eq(tournaments.id, t1.id));
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 3_600_000) }).where(eq(tournaments.id, t2.id));
    forced.failAfterUrlSuffix = t1.id;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await notifyRegistrationDeadlines()).toBe(1); // nur Turnier 2
      expect(await countFor(t1.id)).toBe(0); // zurückgerollt
      expect(await countFor(t2.id)).toBe(1);
      expect(await notifyRegistrationDeadlines()).toBe(0); // zweiter Lauf: Turnier 1 scheitert wieder, Turnier 2 ist schon gemeldet
    } finally {
      forced.failAfterUrlSuffix = null;
      err.mockRestore();
    }
    expect(await notifyRegistrationDeadlines()).toBe(1); // jetzt klappt Turnier 1
    expect(await countFor(t1.id)).toBe(1);
  });
});

describe("Fristen (Vertrag 008 v4, M3b): 48-h-Frist, Sofortbuchung, 1-h-Abbruch", () => {
  const hours = (n: number) => new Date(Date.now() + n * 3_600_000);
  it("AC-12: mit mindestens 48 Stunden Vorlauf muss der Anmeldeschluss mindestens 48 Stunden vor dem Start liegen, sonst Fehler und nichts gespeichert; darunter gilt nur 'vor dem Start'", async () => {
    const o = await organizer();
    const start = days(5);
    const before = (await db.select().from(tournaments).where(eq(tournaments.organizerId, o.id))).length;
    await expect(createTournament(o.id, { ...base, startsAt: start, registrationDeadline: new Date(start.getTime() - 47 * 3_600_000) })).rejects.toThrow(/48 Stunden/);
    await expect(createTournament(o.id, { ...base, startsAt: start, registrationDeadline: new Date(start.getTime() - 48 * 3_600_000 + 1) })).rejects.toThrow(/48 Stunden/); // eine Millisekunde zu spät
    expect((await db.select().from(tournaments).where(eq(tournaments.organizerId, o.id))).length).toBe(before); // nichts gespeichert
    await createTournament(o.id, { ...base, startsAt: start, registrationDeadline: new Date(start.getTime() - 48 * 3_600_000) }); // genau 48 Stunden geht
    const shortStart = hours(30); // weniger als 48 Stunden Vorlauf: nur vor dem Start
    await createTournament(o.id, { ...base, startsAt: shortStart, registrationDeadline: hours(29) });
  });

  it("Altturnier (Anmeldeschluss später als 48 Stunden vor dem Start, vor der Umstellung angelegt) bleibt bei den alten Regeln: der Job sagt es nicht ab", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    await db.update(tournaments).set({ registrationDeadline: new Date(t.startsAt!.getTime() - 24 * 3_600_000) }).where(eq(tournaments.id, t.id));
    await closeTournamentsAtDeadline(new Date(fixDeadline(t.startsAt!).getTime() + 3_600_000));
    expect((await statusOf(t.id)).status).toBe("registration");
  });

  it("Fairness: Wird der Preis nach dem Lesen der Kandidaten, aber vor der Sperre festgelegt, gilt die neue Karenz: nicht abgesagt (fällig wird unter der Sperre neu berechnet)", async () => {
    const o = await organizer();
    const start = hours(49);
    const t = await createTournament(o.id, { ...base, startsAt: start, registrationDeadline: new Date(start.getTime() - 48 * 3_600_000) });
    for (let i = 0; i < 4; i++) await squad(t.id, 4, i < 3); // das vierte Team ist noch nicht vollzählig: der Preis steht noch nicht fest
    const now = new Date(fixDeadline(start).getTime() + 3_600_000); // die 48-h-Frist ist eine Stunde her; ohne Preis wäre das Turnier jetzt fällig
    let job: Promise<number> | null = null;
    await db.transaction(async (tx) => {
      await tx.select().from(tournaments).where(eq(tournaments.id, t.id)).for("update"); // hält die Turniersperre: der Job liest die Kandidaten und wartet dann
      job = closeTournamentsAtDeadline(now);
      await new Promise((r) => setTimeout(r, 400));
      await tx.insert(auditLog).values({ action: "tournament.price", entity: "tournament", entityId: t.id }); // der Preis wird im Fenster festgelegt
    });
    await job;
    expect((await statusOf(t.id)).status).not.toBe("cancelled");
  });

});
