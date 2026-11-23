import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { berlinTime, notifyResumedGames } from "@/server/pause-notify";
import { setCardSwitch } from "@/server/payment-switch";
import { lastResumeAt, RESUME_GRACE_MS } from "@/server/pause-resume";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// Nach dem Wiedereinschalten: Spieler und Captains der Spiele, deren Frist die Karenz (seit + 2 h) nach hinten schiebt, erfahren die neue Frist (Typ payment, ohne Namen Dritter, Zeit in Berliner Zeit).
let owner: Awaited<ReturnType<typeof makeUser>> | undefined;
beforeEach(async () => {
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "card_payments_enabled", true);
});
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

const notesOf = (userId: string) => db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, "payment")));
async function pauseAndResume() {
  owner ??= await makeUser("rn", "owner");
  await setCardSwitch(owner.id, false, "Notabschaltung wegen Stoerung", true);
  await setCardSwitch(owner.id, true, "Stoerung behoben, alles geprueft", true);
}

describe("Mitteilung nach dem Wiedereinschalten", () => {
  it("Spiel mit Frist in den naechsten 2 Stunden: Spieler und Captains bekommen 'Bezahlung ist wieder moeglich, neue Frist', ohne Namen; Fremde und Spiele mit spaeterer Frist nichts", async () => {
    const soon = await makeMatch({ hoursAhead: 2.5, priceCents: 6000, costCents: 6000 }); // Frist (Anstoss - 1 h) in 1,5 h: die Karenz (2 h) verschiebt sie
    const later = await makeMatch({ hoursAhead: 72, priceCents: 6000, costCents: 6000 }); // Frist in 24 h: unberuehrt
    const player = await addPlayer(soon.match.id, soon.home.id);
    const outsider = await makeUser("rno");
    await pauseAndResume();
    const resumeAt = (await lastResumeAt())!;
    for (const u of [soon.adminA, soon.adminB, player]) {
      const notes = await notesOf(u.id);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe("Bezahlung ist wieder möglich");
      expect(notes[0].body).toContain(`Neue Frist: ${berlinTime(new Date(resumeAt.getTime() + RESUME_GRACE_MS))}`);
      expect(notes[0].body).toContain(new Date(resumeAt.getTime() + RESUME_GRACE_MS).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })); // Berliner Zeit, unabhaengig berechnet
      expect(notes[0].body).not.toMatch(/Heim|Gast|E2E/); // keine Namen von Teams oder Dritten
    }
    expect(await notesOf(outsider.id)).toHaveLength(0);
    expect(await notesOf(later.adminA.id)).toHaveLength(0);
  });

  it("entprellt je Spiel und je Einschaltung: ein zweiter Lauf schreibt nichts nach; eine neue Einschaltung meldet erneut", async () => {
    const soon = await makeMatch({ hoursAhead: 2.5, priceCents: 6000, costCents: 6000 });
    await pauseAndResume();
    expect(await notifyResumedGames()).toBe(0);
    expect(await notesOf(soon.adminA.id)).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 20));
    await setCardSwitch(owner!.id, false, "Zweite Notabschaltung wegen Stoerung", true);
    await setCardSwitch(owner!.id, true, "Zweite Stoerung behoben, geprueft", true);
    expect(await notesOf(soon.adminA.id)).toHaveLength(2);
  });

  it("Karenz reicht nicht bis zum Anstoss: keine 'neue Frist' (die Absageregel mit Klartext greift)", async () => {
    const m = await makeMatch({ hoursAhead: 1.5, priceCents: 6000, costCents: 6000 });
    await pauseAndResume();
    expect(await notesOf(m.adminA.id)).toHaveLength(0);
  });

  it("ohne Audit-Eintrag (nie wieder eingeschaltet) keine Mitteilung", async () => {
    await db.execute(sql`delete from audit_log where action = 'card_switch.on' and entity_id = 'card_payments_enabled'`);
    expect(await notifyResumedGames()).toBe(0);
  });
});
