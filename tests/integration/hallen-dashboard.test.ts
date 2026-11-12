import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLog, matches, users } from "@/db/schema";
import { venueAccess, venues } from "@/db/schema-finance";
import { matchHallRequests, matchOptions } from "@/db/schema-matchmaking";
import { deleteAccount } from "@/server/account";
import { acceptChallenge, challengeTeam } from "@/server/challenges";
import { proposeOption, voteOption } from "@/server/scheduling";
import { inviteVenueManager, listVenueAccess, redeemVenueInvites, revokeVenueAccess } from "@/server/venue-access";
import { hasVenueAccess, isVenueManager, venueIdsOf } from "@/server/venue-access-rules";
import { answerHallRequest, pendingHallInquiries } from "@/server/veto";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Vertrag 011 M1 (Server): venue_access, Einlösen beim Login, hasVenueAccess, Datenübernahme. Entscheide t9: Einlösepfad für alle (P10), Admin nie Betreiber (P4),
// 14 Tage Ablauf (P6), offene Anfragen eines entzogenen Zugangs werden „unmanaged“ (P5), nur Admin 1 sieht die E-Mail (P7), je Halle eine Zeile (P9).

afterAll(async () => {
  await db.delete(venueAccess).where(sql`${venueAccess.venueId} in (select id from venues where name like 'E2E Dash%')`);
  await db.delete(venues).where(sql`${venues.name} like 'E2E Dash%'`);
  await cleanup();
});

// Admin 1 gibt es höchstens einmal je Datenbank (Teilindex): eine Instanz für die ganze Datei
let ownerUser: Awaited<ReturnType<typeof makeUser>> | null = null;
const getOwner = async () => (ownerUser ??= await makeUser("own", "owner"));
let seq = 0;
async function venue(tag = "v") {
  seq += 1;
  const [v] = await db.insert(venues).values({ name: `E2E Dash ${tag}${seq}`, city: "Dashort", source: "manual" }).returning();
  return v;
}
const accessRows = (venueId: string) => db.select().from(venueAccess).where(eq(venueAccess.venueId, venueId));
const openRows = async (venueId: string) => (await accessRows(venueId)).filter((r) => r.status !== "revoked");
const login = (u: { id: string; email: string }, over: Partial<{ provider: string; emailVerified: boolean | undefined }> = {}) =>
  redeemVenueInvites({ userId: u.id, email: u.email, provider: "google", emailVerified: true, ...over });
const reason = "Test";

/** Betreiber mit aktivem Zugang über den echten Weg: Einladung durch Admin 1, Login mit verifizierter Google-E-Mail. */
async function activeManager(owner: { id: string }, v: { id: string }, tag: string) {
  const m = await makeUser(tag);
  await inviteVenueManager(owner.id, v.id, m.email, reason);
  expect(await login(m)).toBe(1);
  return m;
}

describe("Schema und Einladung (M1-B)", () => {
  it("nur Admin 1 darf einladen und entziehen (auch die Funktion prüft es selbst)", async () => {
    const owner = await getOwner();
    const admin2 = await makeUser("o2", "admin");
    const player = await makeUser("o3");
    const v = await venue();
    for (const who of [admin2, player]) {
      await expect(inviteVenueManager(who.id, v.id, "x@test.local", reason)).rejects.toThrow(/Admin 1/);
      await expect(revokeVenueAccess(who.id, v.id, reason)).rejects.toThrow(/Admin 1/);
    }
    expect(await accessRows(v.id)).toHaveLength(0);
    await inviteVenueManager(owner.id, v.id, "  Mixed.Case@Test.LOCAL ", reason);
    expect(await openRows(v.id)).toMatchObject([{ status: "invited", invitedEmail: "mixed.case@test.local", userId: null }]); // klein und getrimmt, keine Punkt-Normalisierung
  });

  it("genau ein offener oder aktiver Zugang je Halle (Datenbank), Historie bleibt; CHECKs", async () => {
    const owner = await getOwner();
    const v = await venue();
    await inviteVenueManager(owner.id, v.id, "a1@test.local", reason);
    await expect(db.insert(venueAccess).values({ venueId: v.id, invitedEmail: "zweite@test.local", status: "invited" })).rejects.toThrow(); // partieller Unique
    await expect(db.insert(venueAccess).values({ venueId: v.id, invitedEmail: null, status: "revoked" })).resolves.toBeDefined(); // widerrufene Zeilen sind beliebig viele
    const w = await venue();
    await expect(db.insert(venueAccess).values({ venueId: w.id, status: "invited", invitedEmail: null })).rejects.toThrow(); // invited braucht E-Mail
    const u = await makeUser("s2");
    await expect(db.insert(venueAccess).values({ venueId: w.id, status: "invited", invitedEmail: "b@test.local", userId: u.id })).rejects.toThrow(); // invited ohne Konto
    await expect(db.insert(venueAccess).values({ venueId: w.id, status: "active", userId: null })).rejects.toThrow(); // active braucht ein Konto
  });

  it("zweite Einladung entzieht den alten Zugang sofort und ersetzt ihn; Protokoll nur mit IDs und Grund, nie mit der Adresse", async () => {
    const owner = await getOwner();
    const v = await venue();
    const m = await activeManager(owner, v, "r2");
    expect(await hasVenueAccess(v.id, m.id)).toBe(true);
    const second = await inviteVenueManager(owner.id, v.id, "neu@test.local", "Wechsel");
    expect(await hasVenueAccess(v.id, m.id)).toBe(false);
    const rows = await accessRows(v.id);
    expect(rows.filter((r) => r.status === "revoked")).toHaveLength(1);
    expect(rows.find((r) => r.status === "revoked")).toMatchObject({ userId: m.id, invitedEmail: null }); // E-Mail geleert, Konto bleibt als Historie
    expect((await db.select({ m: venues.managerUserId }).from(venues).where(eq(venues.id, v.id)))[0].m).toBeNull(); // Rückfall-Spalte mitgeschrieben
    const log = await db.select().from(auditLog).where(and(eq(auditLog.entity, "venue"), eq(auditLog.entityId, v.id)));
    expect(JSON.stringify(log.map((l) => l.after))).not.toMatch(/@test\.local/);
    expect(log.some((l) => l.action === "venue.access.invite" && JSON.stringify(l.after).includes(second.accessId))).toBe(true);
  });

  it("Admin-Konten (P4) und gesperrte oder anonymisierte Adressen können nicht eingeladen werden", async () => {
    const owner = await getOwner();
    const admin2 = await makeUser("a2", "admin");
    const banned = await makeUser("a3");
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, banned.id));
    const v = await venue();
    await expect(inviteVenueManager(owner.id, v.id, admin2.email, reason)).rejects.toThrow(/Admin-Konto/);
    await expect(inviteVenueManager(owner.id, v.id, banned.email, reason)).rejects.toThrow(/gesperrt/);
    await expect(inviteVenueManager(owner.id, v.id, "geloescht-0000@geloescht.invalid", reason)).rejects.toThrow();
    await expect(inviteVenueManager(owner.id, v.id, "keine-mail", reason)).rejects.toThrow();
    await expect(inviteVenueManager(owner.id, v.id, "ok@test.local", "x")).rejects.toThrow(/Grund/);
    expect(await accessRows(v.id)).toHaveLength(0);
  });
});

describe("Einlösen beim Login (M1-C, M1-D, M1-H, M1-I)", () => {
  it("nur Google mit verifizierter E-Mail; Dev-Login, fehlende oder falsche Verifizierung lösen nie ein; bestehendes Konto bleibt bis dahin eingeladen", async () => {
    const owner = await getOwner();
    const v = await venue();
    const m = await makeUser("l2"); // Konto existiert schon: trotzdem nur über den Einlösepfad (P10)
    await inviteVenueManager(owner.id, v.id, m.email, reason);
    expect(await hasVenueAccess(v.id, m.id)).toBe(false);
    expect(await isVenueManager(m.id)).toBe(false);
    expect(await login(m, { provider: "dev" })).toBe(0);
    expect(await login(m, { emailVerified: false })).toBe(0);
    expect(await login(m, { emailVerified: undefined })).toBe(0);
    expect(await openRows(v.id)).toMatchObject([{ status: "invited" }]);
    expect(await login(m)).toBe(1);
    expect(await openRows(v.id)).toMatchObject([{ status: "active", userId: m.id }]);
    expect(await hasVenueAccess(v.id, m.id)).toBe(true);
    expect(await venueIdsOf(m.id)).toEqual([v.id]);
    expect((await db.select({ m: venues.managerUserId }).from(venues).where(eq(venues.id, v.id)))[0].m).toBe(m.id); // Rückfall-Spalte
    expect(await login(m)).toBe(0); // zweiter Login löst nichts mehr ein
  });

  it("ein fremdes Konto löst die Einladung nicht ein, auch nicht mit verifizierter E-Mail", async () => {
    const owner = await getOwner();
    const v = await venue();
    await inviteVenueManager(owner.id, v.id, "eingeladen@test.local", reason);
    const other = await makeUser("f2");
    expect(await redeemVenueInvites({ userId: other.id, email: "eingeladen@test.local", provider: "google", emailVerified: true })).toBe(0); // Konto-E-Mail passt nicht zur Einladung
    expect(await login(other)).toBe(0);
    expect(await openRows(v.id)).toMatchObject([{ status: "invited", userId: null }]);
  });

  it("gesperrtes Konto und Admin-Konto lösen nie ein", async () => {
    const owner = await getOwner();
    const v = await venue();
    const w = await venue();
    const banned = await makeUser("g2");
    await inviteVenueManager(owner.id, v.id, banned.email, reason);
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, banned.id)); // nach der Einladung gesperrt
    expect(await login(banned)).toBe(0);
    const admin2 = await makeUser("g3");
    await inviteVenueManager(owner.id, w.id, admin2.email, reason);
    await db.update(users).set({ role: "admin" }).where(eq(users.id, admin2.id)); // nach der Einladung zum Admin gemacht
    expect(await login(admin2)).toBe(0);
    expect(await openRows(v.id)).toMatchObject([{ status: "invited" }]);
    expect(await openRows(w.id)).toMatchObject([{ status: "invited" }]);
  });

  it("Mehr-Hallen-Einladung: eine E-Mail für zwei Hallen wird beim ersten Login für beide eingelöst (ein Statement)", async () => {
    const owner = await getOwner();
    const v1 = await venue();
    const v2 = await venue();
    const m = await makeUser("h2");
    await inviteVenueManager(owner.id, v1.id, m.email, reason);
    await inviteVenueManager(owner.id, v2.id, m.email, reason);
    expect(await login(m)).toBe(2);
    expect((await venueIdsOf(m.id)).sort()).toEqual([v1.id, v2.id].sort());
  });

  it("Race: parallele Logins lösen jede Zeile höchstens einmal ein (auch Teil-Rennen)", async () => {
    const owner = await getOwner();
    const v1 = await venue();
    const v2 = await venue();
    const m = await makeUser("c2");
    await inviteVenueManager(owner.id, v1.id, m.email, reason);
    await inviteVenueManager(owner.id, v2.id, m.email, reason);
    const counts = await Promise.all([login(m), login(m), login(m)]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
    expect((await openRows(v1.id)).length + (await openRows(v2.id)).length).toBe(2);
  });

  it("Sperrprüfung im selben Statement: ein zwischen Einladung und Login gesperrtes Konto wird nicht eingelöst (kein Fenster)", async () => {
    const owner = await getOwner();
    const v = await venue();
    const m = await makeUser("k2");
    await inviteVenueManager(owner.id, v.id, m.email, reason);
    await Promise.all([db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, m.id)), login(m)]);
    const open = await openRows(v.id);
    const banned = (await db.select({ b: users.bannedAt }).from(users).where(eq(users.id, m.id)))[0].b;
    expect(banned).not.toBeNull();
    if (open[0].status === "active") expect(await hasVenueAccess(v.id, m.id)).toBe(false); // höchstens eingelöst, aber nie wirksam
  });

  it("Einladung läuft nach 14 Tagen ab (P6) und blockiert die Halle nicht: neue Einladung ersetzt sie", async () => {
    const owner = await getOwner();
    const v = await venue();
    const m = await makeUser("e2");
    await inviteVenueManager(owner.id, v.id, m.email, reason);
    await db.update(venueAccess).set({ invitedAt: sql`now() - interval '15 days'` }).where(eq(venueAccess.venueId, v.id));
    expect(await login(m)).toBe(0); // abgelaufen
    await inviteVenueManager(owner.id, v.id, m.email, reason); // Halle nicht blockiert
    expect(await login(m)).toBe(1);
  });

  it("nach active hängt der Zugang an user_id: E-Mail-Wechsel des Kontos behält ihn, die alte Adresse löst nichts mehr auf", async () => {
    const owner = await getOwner();
    const v = await venue();
    const m = await activeManager(owner, v, "w2");
    await db.update(users).set({ email: `neu-${m.email}` }).where(eq(users.id, m.id));
    expect(await hasVenueAccess(v.id, m.id)).toBe(true);
    const newcomer = await makeUser("w3");
    expect(await redeemVenueInvites({ userId: newcomer.id, email: m.email, provider: "google", emailVerified: true })).toBe(0);
    expect(await hasVenueAccess(v.id, newcomer.id)).toBe(false);
  });
});

describe("Rechte und Mandantentrennung (AC-1, AC-4, AC-7, M1-E, M1-F, M1-K)", () => {
  it("Entzug, Sperre und Admin-Rolle wirken sofort (ohne neue Anmeldung); nichts steht im Sitzungstoken", async () => {
    const owner = await getOwner();
    const v = await venue();
    const m = await activeManager(owner, v, "x2");
    expect(await isVenueManager(m.id)).toBe(true);
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, m.id));
    expect(await hasVenueAccess(v.id, m.id)).toBe(false);
    await db.update(users).set({ bannedAt: null, role: "admin" }).where(eq(users.id, m.id));
    expect(await hasVenueAccess(v.id, m.id)).toBe(false); // Admin nie Betreiber, auch umgekehrt (P4)
    await db.update(users).set({ role: "player" }).where(eq(users.id, m.id));
    expect(await hasVenueAccess(v.id, m.id)).toBe(true);
    expect(await revokeVenueAccess(owner.id, v.id, reason)).toBe(true);
    expect(await hasVenueAccess(v.id, m.id)).toBe(false);
    expect(await isVenueManager(m.id)).toBe(false);
    expect(await revokeVenueAccess(owner.id, v.id, reason)).toBe(false); // nichts mehr zu entziehen
  });

  it("Betreiber sieht nur seine Hallen; fremde Halle entscheiden wird abgelehnt; Entzug macht offene Anfragen zu „unmanaged“ und das Spiel geht weiter (P5)", async () => {
    const owner = await getOwner();
    const a = await makeUser("y2");
    const b = await makeUser("y3");
    const ta = await makeTeam(a.id, "Dash A");
    const tb = await makeTeam(b.id, "Dash B");
    const { teams } = await import("@/db/schema");
    await db.update(teams).set({ city: "Dashort" }).where(inArray(teams.id, [ta.id, tb.id]));
    const own = await venue("own");
    const foreign = await venue("foreign");
    const mine = await activeManager(owner, own, "y4");
    const theirs = await activeManager(owner, foreign, "y5");
    // andere aktive Hallen im Ort ausblenden: nur diese beiden stehen zur Wahl
    const others = (await db.select({ id: venues.id }).from(venues).where(eq(venues.active, true))).map((x) => x.id).filter((id) => id !== own.id && id !== foreign.id);
    await db.update(venues).set({ active: false }).where(inArray(venues.id, others));
    try {
      const id = await challengeTeam(a.id, ta.id, tb.id);
      await acceptChallenge(b.id, id);
      await proposeOption(a.id, id, { startsAt: new Date(Date.now() + 5 * 86_400_000) });
      const [opt] = await db.select().from(matchOptions).where(eq(matchOptions.matchId, id));
      await voteOption(b.id, id, opt.id);
      expect((await pendingHallInquiries(mine.id)).map((q) => q.venueId)).toEqual([own.id]); // nur die eigene Halle
      expect((await pendingHallInquiries(mine.id))[0]).toHaveProperty("players");
      expect(JSON.stringify(await pendingHallInquiries(mine.id))).not.toContain(a.name); // keine Spielernamen (AC-5)
      await expect(answerHallRequest(mine.id, id, foreign.id, true)).rejects.toThrow(/nicht zu deinem Konto/); // fremde Halle
      await answerHallRequest(theirs.id, id, foreign.id, true);
      // Entzug des Zugangs von „own“, während die Anfrage offen ist: wird „unmanaged“ (nicht abgelehnt), das Veto beginnt
      await revokeVenueAccess(owner.id, own.id, "Entzug im Test");
      const reqs = await db.select().from(matchHallRequests).where(eq(matchHallRequests.matchId, id));
      expect(reqs.find((r) => r.venueId === own.id)?.status).toBe("unmanaged");
      expect((await db.select().from(matches).where(eq(matches.id, id)))[0].vetoStatus).not.toBe("halls");
      await expect(answerHallRequest(mine.id, id, own.id, true)).rejects.toThrow(); // nach dem Entzug nichts mehr (nicht mehr offen oder nicht dein Konto)
    } finally {
      await db.update(venues).set({ active: true }).where(inArray(venues.id, others));
    }
  });

  it("neue Hallenanfrage: Halle ohne Zugang ist „unmanaged“, auch wenn manager_user_id noch gesetzt ist (eine Quelle: venue_access)", async () => {
    const a = await makeUser("z2");
    const b = await makeUser("z3");
    const ta = await makeTeam(a.id, "Dash C");
    const tb = await makeTeam(b.id, "Dash D");
    const { teams } = await import("@/db/schema");
    await db.update(teams).set({ city: "Dashort" }).where(inArray(teams.id, [ta.id, tb.id]));
    const owner = await getOwner();
    const legacy = await venue("legacy");
    const m = await makeUser("z4");
    await db.update(venues).set({ managerUserId: m.id }).where(eq(venues.id, legacy.id)); // nur der Rückfall, kein venue_access
    const others = (await db.select({ id: venues.id }).from(venues).where(eq(venues.active, true))).map((x) => x.id).filter((id) => id !== legacy.id);
    await db.update(venues).set({ active: false }).where(inArray(venues.id, others));
    try {
      const id = await challengeTeam(a.id, ta.id, tb.id);
      await acceptChallenge(b.id, id);
      await proposeOption(a.id, id, { startsAt: new Date(Date.now() + 5 * 86_400_000) });
      const [opt] = await db.select().from(matchOptions).where(eq(matchOptions.matchId, id));
      await voteOption(b.id, id, opt.id);
      const reqs = await db.select().from(matchHallRequests).where(eq(matchHallRequests.matchId, id));
      expect(reqs.find((r) => r.venueId === legacy.id)?.status).toBe("unmanaged");
      expect(await pendingHallInquiries(m.id)).toHaveLength(0);
      void owner;
    } finally {
      await db.update(venues).set({ active: true }).where(inArray(venues.id, others));
    }
  });

  it("Übersicht: die E-Mail-Adresse liefert die Abfrage nur an Admin 1, nie an Admin 2 oder Betreiber (M1-K)", async () => {
    const owner = await getOwner();
    const v = await venue();
    await inviteVenueManager(owner.id, v.id, "geheim@test.local", reason);
    const asOwner = (await listVenueAccess({ isOwner: true })).find((r) => r.venueId === v.id);
    const asOther = (await listVenueAccess({ isOwner: false })).find((r) => r.venueId === v.id);
    expect(asOwner).toMatchObject({ status: "invited", invitedEmail: "geheim@test.local", hasAccount: false });
    expect(asOther).toMatchObject({ status: "invited", invitedEmail: null });
    expect(JSON.stringify(asOther)).not.toContain("geheim");
  });

  it("Konto-Löschung (M1-E): Zugang entzogen, E-Mail geleert, Halle ohne Zugang", async () => {
    const owner = await getOwner();
    const v = await venue();
    const m = await activeManager(owner, v, "d2");
    await deleteAccount(m.id);
    expect(await openRows(v.id)).toHaveLength(0);
    expect((await accessRows(v.id))[0]).toMatchObject({ status: "revoked", userId: m.id, invitedEmail: null });
    expect(await hasVenueAccess(v.id, m.id)).toBe(false);
    expect((await db.select({ m: venues.managerUserId }).from(venues).where(eq(venues.id, v.id)))[0].m).toBeNull();
  });
});

describe("Datenübernahme in der Migration (M1-A, M1-J)", () => {
  const sqlFile = readFileSync(path.resolve(import.meta.dirname, "../../drizzle/0049_venue_access.sql"), "utf8");
  const takeover = sqlFile.slice(sqlFile.indexOf("INSERT INTO")).replace(/--> statement-breakpoint/g, "");

  it("jede gültige Zuordnung ergibt genau eine aktive Zeile; verwaiste, anonymisierte und Admin-Konten werden übersprungen; zweimal ausgeführt ändert nichts", async () => {
    const ok = await makeUser("t1");
    const banned = await makeUser("t2");
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, banned.id));
    const admin2 = await makeUser("t3", "admin");
    const anon = await makeUser("t4");
    await db.update(users).set({ email: `geloescht-${anon.id}@geloescht.invalid` }).where(eq(users.id, anon.id));
    const vOk = await venue("ok");
    const vBanned = await venue("banned");
    const vAdmin = await venue("admin");
    const vAnon = await venue("anon");
    const vOrphan = await venue("orphan");
    await db.update(venues).set({ managerUserId: ok.id }).where(eq(venues.id, vOk.id));
    await db.update(venues).set({ managerUserId: banned.id }).where(eq(venues.id, vBanned.id));
    await db.update(venues).set({ managerUserId: admin2.id }).where(eq(venues.id, vAdmin.id));
    await db.update(venues).set({ managerUserId: anon.id }).where(eq(venues.id, vAnon.id));
    await db.update(venues).set({ managerUserId: "00000000-0000-4000-8000-0000000000aa" }).where(eq(venues.id, vOrphan.id));
    await db.execute(sql.raw(takeover));
    await db.execute(sql.raw(takeover)); // zweimal: idempotent
    expect(await openRows(vOk.id)).toMatchObject([{ status: "active", userId: ok.id }]);
    expect(await openRows(vBanned.id)).toMatchObject([{ status: "active", userId: banned.id }]); // übernommen, aber hasVenueAccess schließt ihn aus (A7)
    expect(await hasVenueAccess(vBanned.id, banned.id)).toBe(false);
    for (const skipped of [vAdmin, vAnon, vOrphan]) expect(await accessRows(skipped.id)).toHaveLength(0);
    await db.update(venues).set({ managerUserId: null }).where(eq(venues.id, vOrphan.id)); // Aufräumen: Waise ohne Konto
  });

  it("Entzug, dann Datenübernahme erneut: der Zugang bleibt entzogen (Doppelschreiben hält manager_user_id leer)", async () => {
    const owner = await getOwner();
    const v = await venue();
    const m = await activeManager(owner, v, "u2");
    await revokeVenueAccess(owner.id, v.id, reason);
    await db.execute(sql.raw(takeover));
    expect(await openRows(v.id)).toHaveLength(0);
    expect(await hasVenueAccess(v.id, m.id)).toBe(false);
  });
});
