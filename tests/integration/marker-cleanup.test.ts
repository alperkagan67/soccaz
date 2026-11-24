import { and, eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { remindersSent } from "@/db/schema";
import { settings } from "@/db/schema-finance";
import { cleanup as cleanupJob } from "@/server/scheduled";
import { cleanup, makeMatch } from "./helpers";

// Backlog 217: Marker der Pause-Mitteilung (reminders_sent "pause-resume:<ms>", settings "pause_notified:<Turnier>:<ms>") wachsen sonst ohne Ende. Gelöscht wird, wenn die Frist im Schlüssel (<ms>)
// mehr als 90 Tage zurückliegt (der Marker wird nur gebraucht, solange die neue Frist noch in der Zukunft liegt); alles andere bleibt, auch fremde Arten von Erinnerungen und Einstellungen.
afterAll(cleanup);

const DAY = 86_400_000;
const NOW = new Date("2026-12-01T12:00:00Z");
const ms = (daysAgo: number) => NOW.getTime() - daysAgo * DAY;
const TID = "11111111-2222-3333-4444-555555555555";

describe("Pause-Marker aufräumen (cleanup-Job)", () => {
  it("löscht nur alte Pause-Marker; neue, laufende und fremde Schlüssel bleiben", async () => {
    const { match } = await makeMatch();
    const kept = [`pause-resume:${ms(89)}`, `pause-resume:${NOW.getTime() + DAY}`, "reminder-24h", `pause-resume:${ms(200)}x`, "pause-resume:abc", `xpause-resume:${ms(200)}`];
    const gone = [`pause-resume:${ms(91)}`, `pause-resume:${ms(400)}`];
    await db.insert(remindersSent).values([...kept, ...gone].map((kind) => ({ matchId: match.id, kind })));
    const keptKeys = [`pause_notified:${TID}:${ms(10)}`, `pause_notified:${TID}:${NOW.getTime() + DAY}`, "pause_notified:kein-uuid:1", `pause_notified:${TID}:${ms(200)}x`, "payments_enabled_test_marker", `evidence_marker_${ms(500)}`];
    const goneKeys = [`pause_notified:${TID}:${ms(91)}`, `pause_notified:${TID}:${ms(1000)}`];
    await db.insert(settings).values([...keptKeys, ...goneKeys].map((key) => ({ key, value: true })));

    const r = await cleanupJob(NOW);
    expect(r.pauseMarkers).toBeGreaterThanOrEqual(gone.length + goneKeys.length);

    const left = (await db.select({ kind: remindersSent.kind }).from(remindersSent).where(eq(remindersSent.matchId, match.id))).map((x) => x.kind).sort();
    expect(left).toEqual([...kept].sort());
    const leftKeys = (await db.select({ key: settings.key }).from(settings).where(like(settings.key, "%pause_notified:%"))).map((x) => x.key);
    for (const k of goneKeys) expect(leftKeys).not.toContain(k);
    for (const k of keptKeys.filter((k) => k.includes("pause_notified:"))) expect(leftKeys).toContain(k);
    const other = await db.select({ key: settings.key }).from(settings).where(and(like(settings.key, "evidence_marker_%")));
    expect(other).toHaveLength(1);
    await db.delete(settings).where(like(settings.key, "pause_notified:%")); // eigene Testmarker entfernen
    await db.delete(settings).where(like(settings.key, "evidence_marker_%"));
    await db.delete(settings).where(eq(settings.key, "payments_enabled_test_marker"));
  });

  it("ein zweiter Lauf löscht nichts mehr", async () => {
    const r = await cleanupJob(NOW);
    expect(r.pauseMarkers).toBe(0);
  });
});
