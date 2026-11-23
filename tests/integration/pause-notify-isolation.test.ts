import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, notifications } from "@/db/schema";
import { abortDeadline, dueWithGrace, fixDeadline, hasLongLead } from "@/lib/deadlines";
import { notifyResumedGames } from "@/server/pause-notify";
import { setSetting } from "@/server/settings";
import { cleanup, makeMatch } from "./helpers";
import { resumeCycle } from "./pause-helpers";

// Ein Spiel, bei dem etwas fehlschlaegt, bricht die Mitteilung an die uebrigen nicht ab (je Spiel eigener Fangblock, eigene Transaktion).
const poison = vi.hoisted(() => ({ id: "" }));
vi.mock("@/server/wallet", async (orig) => {
  const m = await orig<typeof import("@/server/wallet")>();
  return { ...m, leadStart: async (...a: Parameters<typeof m.leadStart>) => { if ((a[1] as { id: string }).id === poison.id) throw new Error("kaputt"); return m.leadStart(...a); } };
});
beforeEach(async () => {
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "card_payments_enabled", true);
  await db.execute(sql`delete from audit_log where action like 'card_switch.%' and entity_id = 'card_payments_enabled'`);
});
afterAll(async () => {
  poison.id = "";
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

describe("Mitteilung: Fehler bei einem Spiel", () => {
  it("das kaputte Spiel wird uebersprungen, das andere bekommt seine Mitteilung", async () => {
    const bad = await makeMatch({ hoursAhead: 72, priceCents: 6000, costCents: 6000 });
    const good = await makeMatch({ hoursAhead: 72, priceCents: 6000, costCents: 6000 });
    const [row] = await db.select().from(matches).where(eq(matches.id, good.match.id));
    const due = dueWithGrace(hasLongLead(row.startsAt, row.createdAt) ? fixDeadline(row.startsAt) : abortDeadline(row.startsAt), row.createdAt, row.startsAt, row.createdAt);
    await resumeCycle(new Date(due.getTime() + 30_000), new Date(due.getTime() - 3_600_000));
    poison.id = bad.match.id;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await notifyResumedGames();
    spy.mockRestore();
    const notes = async (uid: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, uid), eq(notifications.type, "payment")))).filter((n) => n.title === "Bezahlung ist wieder möglich");
    expect(await notes(good.adminA.id)).toHaveLength(1);
    expect(await notes(bad.adminA.id)).toHaveLength(0);
  });
});
