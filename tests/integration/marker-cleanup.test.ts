import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { remindersSent } from "@/db/schema";
import { settings } from "@/db/schema-finance";
import { cleanup as cleanupJob } from "@/server/scheduled";
import { cleanup, makeMatch } from "./helpers";

// Backlog 217: Marker der Pause-Mitteilung (reminders_sent "pause-resume:<ms>", settings "pause_notified:<Turnier>:<ms>") wachsen sonst ohne Ende. Gelöscht wird, wenn die Frist im Schlüssel (<ms>)
// mehr als 90 Tage zurückliegt (der Marker wird nur gebraucht, solange die neue Frist noch in der Zukunft liegt); alles andere bleibt, auch fremde Arten von Erinnerungen und Einstellungen.
// Die Testschlüssel tragen eine zufällige Turnier-Kennung je Lauf und werden am Ende immer entfernt (ein abgebrochener Lauf blockiert den nächsten nicht).
afterAll(cleanup);

const DAY = 86_400_000;
const NOW = new Date("2026-12-01T12:00:00Z");
const ms = (daysAgo: number) => NOW.getTime() - daysAgo * DAY;
const TID = randomUUID();
const OTHER = `evidence_marker_${TID}`;

describe("Pause-Marker aufräumen (cleanup-Job)", () => {
  it("löscht nur alte Pause-Marker; neue, laufende und fremde Schlüssel bleiben (auch nach einem zweiten Lauf)", async () => {
    try {
      const { match } = await makeMatch();
      const kept = [`pause-resume:${ms(89)}`, `pause-resume:${NOW.getTime() + DAY}`, "reminder-24h", `pause-resume:${ms(200)}x`, "pause-resume:abc", `xpause-resume:${ms(200)}`];
      const gone = [`pause-resume:${ms(91)}`, `pause-resume:${ms(400)}`];
      await db.insert(remindersSent).values([...kept, ...gone].map((kind) => ({ matchId: match.id, kind })));
      const keptKeys = [`pause_notified:${TID}:${ms(10)}`, `pause_notified:${TID}:${NOW.getTime() + DAY}`, `pause_notified:kein-uuid:${TID}`, `fremd_marker:${TID}:${ms(500)}`, `pause_notified:${TID}:${ms(200)}x`, OTHER];
      const goneKeys = [`pause_notified:${TID}:${ms(91)}`, `pause_notified:${TID}:${ms(1000)}`];
      await db.insert(settings).values([...keptKeys, ...goneKeys].map((key) => ({ key, value: true })));

      const r = await cleanupJob(NOW);
      expect(r.pauseMarkers).toBeGreaterThanOrEqual(gone.length + goneKeys.length);
      const left = async () => ({
        games: (await db.select({ kind: remindersSent.kind }).from(remindersSent).where(eq(remindersSent.matchId, match.id))).map((x) => x.kind).sort(),
        keys: (await db.select({ key: settings.key }).from(settings).where(like(settings.key, `%${TID}%`))).map((x) => x.key).sort(),
      });
      const after1 = await left();
      expect(after1.games).toEqual([...kept].sort());
      expect(after1.keys).toEqual([...keptKeys].sort());

      await cleanupJob(NOW); // zweiter Lauf: nichts von unseren bleibenden Schlüsseln geht verloren
      expect(await left()).toEqual(after1);
    } finally {
      await db.delete(settings).where(like(settings.key, `%${TID}%`));
    }
  });
});
