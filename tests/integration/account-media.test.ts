import { afterAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, teamMembers, teams, users } from "@/db/schema";
import { comments, media } from "@/db/schema-content";
import { playerStats } from "@/db/schema-community";
import { deleteAccount, exportMyData, updateProfile } from "@/server/account";
import { getMedia, processImage, removeMedia, storeImage } from "@/server/media";
import { creditWallet } from "@/server/ledger";
import { postComment } from "@/server/content";
import { addPlayer, cleanup, makeMatch, makeTeam, makeUser } from "./helpers";

afterAll(cleanup);

const png = (w = 600, h = 400) => sharp({ create: { width: w, height: h, channels: 3, background: "#2ecc71" } }).png().toBuffer();

describe("Bilder", () => {
  it("nur echte Bilder: Text, GIF und leere Dateien werden abgelehnt", async () => {
    await expect(processImage(Buffer.from("das ist kein bild"), "avatar")).rejects.toThrow(/gelesen|Erlaubt/);
    await expect(processImage(Buffer.alloc(0), "avatar")).rejects.toThrow(/leer/);
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).gif().toBuffer();
    await expect(processImage(gif, "avatar")).rejects.toThrow(/Erlaubt/);
    await expect(processImage(Buffer.alloc(5 * 1024 * 1024 + 1), "avatar")).rejects.toThrow(/5 MB/);
  });

  it("wird neu kodiert: WebP, feste Größe, keine Metadaten", async () => {
    const withExif = await sharp(await png(1000, 500)).withMetadata({ exif: { IFD0: { Copyright: "geheim", Artist: "Max" } } }).jpeg().toBuffer();
    const avatar = await processImage(withExif, "avatar");
    const meta = await sharp(avatar).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([256, 256]);
    expect(meta.exif).toBeUndefined();
    const photo = await sharp(await processImage(await png(3000, 2000), "match_photo")).metadata();
    expect(photo.width).toBe(1280);
    expect(photo.height).toBe(853);
  });

  it("Berechtigungen: Profilbild nur selbst, Logo nur Team-Admin, Spielfoto nur Mitspieler nach Anpfiff", async () => {
    const m = await makeMatch({ hoursAhead: 72 });
    const other = await makeUser("other");
    const file = await png();

    await expect(storeImage(other, "avatar", m.adminA.id, file)).rejects.toThrow(/Berechtigung/);
    const url = await storeImage(m.adminA, "avatar", m.adminA.id, file);
    expect(url).toMatch(/^\/api\/media\/[0-9a-f-]{36}$/);
    expect((await db.select().from(users).where(eq(users.id, m.adminA.id)))[0].avatarUrl).toBe(url);
    // zweites Bild ersetzt das erste
    const url2 = await storeImage(m.adminA, "avatar", m.adminA.id, file);
    expect(await getMedia(url.split("/").pop()!)).toBeNull();
    expect(await getMedia(url2.split("/").pop()!)).not.toBeNull();

    await expect(storeImage(other, "team_logo", m.home.id, file)).rejects.toThrow(/Berechtigung/);
    await expect(storeImage(m.adminB, "team_logo", m.home.id, file)).rejects.toThrow(/Berechtigung/); // Admin des anderen Teams
    await storeImage(m.adminA, "team_logo", m.home.id, file);
    expect((await db.select().from(teams).where(eq(teams.id, m.home.id)))[0].logoUrl).toMatch(/^\/api\/media\//);

    const p = await addPlayer(m.match.id, m.home.id, "fotograf");
    await expect(storeImage({ id: p.id, role: "player" }, "match_photo", m.match.id, file)).rejects.toThrow(/Berechtigung/); // Spiel noch nicht angepfiffen
  });

  it("Spielfotos: nach Anpfiff, begrenzt, entfernbar", async () => {
    const { matches } = await import("@/db/schema");
    const m = await makeMatch({ hoursAhead: 72 });
    await db.update(matches).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, m.match.id));
    const p = await addPlayer(m.match.id, m.home.id, "foto");
    const actor = { id: p.id, role: "player" };
    const file = await png();
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push((await storeImage(actor, "match_photo", m.match.id, file)).split("/").pop()!);
    await expect(storeImage(actor, "match_photo", m.match.id, file)).rejects.toThrow(/Maximal 8/);

    const stranger = await makeUser("stranger");
    await expect(removeMedia({ id: stranger.id, role: "player" }, ids[0])).rejects.toThrow(/darfst/);
    await removeMedia(actor, ids[0]);
    expect(await getMedia(ids[0])).toBeNull();
    const mod = await makeUser("modm", "moderator");
    await removeMedia({ id: mod.id, role: "moderator" }, ids[1]);
    expect(await getMedia(ids[1])).toBeNull();
    expect((await db.select().from(media).where(eq(media.refId, m.match.id))).filter((r) => r.status === "visible")).toHaveLength(6);
  });
});

describe("Profil, Export und Konto löschen", () => {
  it("Profil ändern mit Prüfung", async () => {
    const u = await makeUser("profil");
    await expect(updateProfile(u.id, { name: "x", city: "Essen", position: "Angriff", profilePublic: true })).rejects.toThrow(/2 bis 60/);
    await expect(updateProfile(u.id, { name: "Neuer Name", city: "Mars", position: "Angriff", profilePublic: true })).rejects.toThrow(/Stadt/);
    await updateProfile(u.id, { name: "  Neuer   Name ", city: "Essen", position: "Angriff", profilePublic: false });
    expect((await db.select().from(users).where(eq(users.id, u.id)))[0]).toMatchObject({ name: "Neuer Name", position: "Angriff", profilePublic: false });
  });

  it("Spielerprofil: Spitzname, Nummer, Fuß, Verein, Farbe werden geprüft und gespeichert", async () => {
    const u = await makeUser("gamer");
    const base = { name: "Gamer Test", city: "Essen", position: "Angriff", profilePublic: true };
    await expect(updateProfile(u.id, { ...base, shirtNumber: 100 })).rejects.toThrow(/1 und 99/);
    await expect(updateProfile(u.id, { ...base, nickname: "x".repeat(25) })).rejects.toThrow(/Spitzname/);
    await expect(updateProfile(u.id, { ...base, favoriteClub: "x".repeat(41) })).rejects.toThrow(/Lieblingsverein/);
    await updateProfile(u.id, { ...base, nickname: "  Der   Hammer ", shirtNumber: "10", strongFoot: "links", favoriteClub: "FC Schalke", accentColor: "violet" });
    expect((await db.select().from(users).where(eq(users.id, u.id)))[0]).toMatchObject({ nickname: "Der Hammer", shirtNumber: 10, strongFoot: "links", favoriteClub: "FC Schalke", accentColor: "violet" });
    // ungültige Auswahl wird ignoriert statt gespeichert
    await updateProfile(u.id, { ...base, accentColor: "neon", strongFoot: "hinten" });
    expect((await db.select().from(users).where(eq(users.id, u.id)))[0]).toMatchObject({ accentColor: null, strongFoot: null, nickname: null, shirtNumber: null });
  });

  it("Datenexport enthält die eigenen Daten, nicht die anderer", async () => {
    const u = await makeUser("export");
    const v = await makeUser("export-other");
    await db.insert(playerStats).values({ userId: u.id, matches: 2, goals: 1 });
    await postComment(u.id, { targetType: "player", targetId: v.id, body: "Mein Kommentar" });
    const data = await exportMyData(u.id);
    expect(data.user).toMatchObject({ email: u.email, name: u.name });
    expect(data.stats).toMatchObject({ matches: 2, goals: 1 });
    expect(data.comments).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain(v.email);
  });

  it("Löschen ist blockiert bei Guthaben, offenem Spiel und letztem Team-Admin", async () => {
    const rich = await makeUser("rich");
    await db.transaction((tx) => creditWallet(tx, rich.id, { from: "bank", amountCents: 500, kind: "adjustment", idempotencyKey: `acct-${rich.id}` }));
    await expect(deleteAccount(rich.id)).rejects.toThrow(/Guthaben/);

    const m = await makeMatch({ hoursAhead: 72 });
    const p = await addPlayer(m.match.id, m.home.id, "offen");
    await expect(deleteAccount(p.id)).rejects.toThrow(/offenes Spiel/);

    const admin = await makeUser("solo");
    const team = await makeTeam(admin.id, "Solo");
    const member = await makeUser("mitglied");
    await db.insert(teamMembers).values({ teamId: team.id, userId: member.id, role: "player" });
    await expect(deleteAccount(admin.id)).rejects.toThrow(/einzige Admin/);
  });

  it("Löschen anonymisiert und entfernt persönliche Inhalte, Team ohne Mitglieder wird archiviert", async () => {
    const u = await makeUser("loesch");
    const target = await makeUser("loesch-target");
    const team = await makeTeam(u.id, "Einsam");
    await db.insert(playerStats).values({ userId: u.id, matches: 1 });
    await postComment(u.id, { targetType: "player", targetId: target.id, body: "weg damit" });

    await deleteAccount(u.id);
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after).toMatchObject({ name: "Gelöschter Nutzer", city: null, position: null, googleId: null, profilePublic: false });
    expect(after.email).toContain("geloescht");
    expect(after.bannedAt).not.toBeNull();
    expect(await db.select().from(comments).where(eq(comments.authorId, u.id))).toHaveLength(0);
    expect(await db.select().from(playerStats).where(eq(playerStats.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(teamMembers).where(eq(teamMembers.userId, u.id))).toHaveLength(0);
    expect((await db.select().from(teams).where(eq(teams.id, team.id)))[0].archivedAt).not.toBeNull();
    await expect(deleteAccount(u.id)).rejects.toThrow(/nicht mehr/);
    expect(await db.select().from(matchParticipants).where(eq(matchParticipants.userId, u.id))).toHaveLength(0);
  });
});
