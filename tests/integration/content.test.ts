import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { comments, userWarnings } from "@/db/schema-content";
import { playerStats } from "@/db/schema-community";
import { deleteComment, listComments, moderateComment, moderationQueue, postComment, reportComment } from "@/server/content";
import { cleanup, makeTeam, makeUser } from "./helpers";

afterAll(cleanup);

const statusOf = async (id: string) => (await db.select().from(comments).where(eq(comments.id, id)))[0].status;

describe("Kommentare", () => {
  it("auf Team und Spieler, mit Regeln für Länge, Ziel und Selbst-Kommentar", async () => {
    const a = await makeUser("ca");
    const b = await makeUser("cb");
    const team = await makeTeam(b.id, "Kommentar");

    await expect(postComment(a.id, { targetType: "team", targetId: team.id, body: " " })).rejects.toThrow(/schreibe etwas/);
    await expect(postComment(a.id, { targetType: "team", targetId: team.id, body: "x".repeat(501) })).rejects.toThrow(/Maximal 500/);
    await expect(postComment(a.id, { targetType: "team", targetId: crypto.randomUUID(), body: "hallo" })).rejects.toThrow(/gibt es nicht/);
    await expect(postComment(b.id, { targetType: "player", targetId: b.id, body: "ich selbst" })).rejects.toThrow(/eigenes Profil/);

    const id = await postComment(a.id, { targetType: "team", targetId: team.id, body: "Starkes Team\u0000!" });
    const list = await listComments("team", team.id, a.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ body: "Starkes Team!", mine: true });
    expect((await listComments("team", team.id, b.id))[0].mine).toBe(false);

    await expect(deleteComment(b.id, id)).rejects.toThrow(/nicht/);
    await deleteComment(a.id, id);
    expect(await listComments("team", team.id)).toHaveLength(0);
  });

  it("Ratenbegrenzung: höchstens 5 pro Stunde", async () => {
    const a = await makeUser("rate");
    const b = await makeUser("ratetarget");
    for (let i = 0; i < 5; i++) await postComment(a.id, { targetType: "player", targetId: b.id, body: `Nachricht ${i}` });
    await expect(postComment(a.id, { targetType: "player", targetId: b.id, body: "zu viel" })).rejects.toThrow(/viele Kommentare/);
  });

  it("gesperrte Nutzer können nicht kommentieren", async () => {
    const a = await makeUser("banned");
    const b = await makeUser("bannedtarget");
    const { users } = await import("@/db/schema");
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, a.id));
    await expect(postComment(a.id, { targetType: "player", targetId: b.id, body: "hallo" })).rejects.toThrow(/nicht kommentieren/);
  });
});

describe("Hallenbewertung", () => {
  it("nur mit gespieltem Spiel, 1 bis 5 Sterne, eine Bewertung pro Person (wird ersetzt)", async () => {
    const [venue] = await db.insert(venues).values({ name: "E2E Testhalle", city: "Essen" }).returning();
    const rookie = await makeUser("rookie");
    const player = await makeUser("vplayer");
    await db.insert(playerStats).values({ userId: player.id, matches: 3 });

    await expect(postComment(rookie.id, { targetType: "venue", targetId: venue.id, body: "super", rating: 5 })).rejects.toThrow(/schon ein Spiel/);
    await expect(postComment(player.id, { targetType: "venue", targetId: venue.id, body: "super" })).rejects.toThrow(/Sterne/);
    await expect(postComment(player.id, { targetType: "venue", targetId: venue.id, body: "super", rating: 6 })).rejects.toThrow(/Sterne/);

    await postComment(player.id, { targetType: "venue", targetId: venue.id, body: "Gute Halle", rating: 4 });
    await postComment(player.id, { targetType: "venue", targetId: venue.id, body: "Jetzt noch besser", rating: 5 });
    const list = await listComments("venue", venue.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ body: "Jetzt noch besser", rating: 5 });
  });
});

describe("Melden und Moderation", () => {
  it("ab drei verschiedenen Meldenden vorläufig ausgeblendet; doppelte Meldung zählt nicht", async () => {
    const author = await makeUser("author");
    const target = await makeUser("target");
    const id = await postComment(author.id, { targetType: "player", targetId: target.id, body: "Pöbelei" });
    const [r1, r2, r3] = await Promise.all([makeUser("r"), makeUser("r"), makeUser("r")]);

    await expect(reportComment(author.id, id, "selbst")).rejects.toThrow(/löschen/);
    expect((await reportComment(r1.id, id, "beleidigend")).reports).toBe(1);
    expect((await reportComment(r1.id, id, "nochmal")).reports).toBe(1);
    expect((await reportComment(r2.id, id, "spam")).hidden).toBe(false);
    expect(await statusOf(id)).toBe("visible");
    expect((await reportComment(r3.id, id, "hetze")).hidden).toBe(true);
    expect(await statusOf(id)).toBe("hidden");
    expect(await listComments("player", target.id)).toHaveLength(0);

    const queue = (await moderationQueue()).rows;
    expect(queue.find((q) => q.id === id)).toMatchObject({ reports: 3, status: "hidden" });

    // Wieder anzeigen erledigt die Meldungen, der Kommentar bleibt sichtbar
    const mod = await makeUser("mod", "moderator");
    await moderateComment(mod.id, id, "restore");
    expect(await statusOf(id)).toBe("visible");
    expect((await moderationQueue()).rows.find((q) => q.id === id)).toBeUndefined();
  });

  it("Entfernen und verwarnen: Verwarnung gespeichert, Autor benachrichtigt", async () => {
    const author = await makeUser("author2");
    const target = await makeUser("target2");
    const reporter = await makeUser("rep2");
    const id = await postComment(author.id, { targetType: "player", targetId: target.id, body: "Beleidigung" });
    await reportComment(reporter.id, id, "beleidigend");
    const mod = await makeUser("mod2", "moderator");
    await moderateComment(mod.id, id, "remove_and_warn", "Beleidigung");
    expect(await statusOf(id)).toBe("removed");
    expect(await db.select().from(userWarnings).where(eq(userWarnings.userId, author.id))).toHaveLength(1);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, author.id));
    expect(notes.some((n) => n.title === "Verwarnung")).toBe(true);
  });
});
