import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema-finance";
import { audit } from "./audit";

type Exec = Pick<typeof db, "select">;

export async function getSetting<T>(key: string, fallback: T, exec: Exec = db): Promise<T> {
  const [row] = await exec.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  return row ? (row.value as T) : fallback;
}

export async function setSetting(actorId: string | null, key: string, value: unknown) {
  const before = await getSetting<unknown>(key, null);
  await db
    .insert(settings)
    .values({ key, value, updatedBy: actorId })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: actorId, updatedAt: new Date() } });
  await audit(actorId, "setting.change", "setting", key, { before: { value: before }, after: { value } });
}

/** Sind Zahlungen eingeschaltet? Solange nicht, bleibt die Lobby kostenlos (Phase 1). */
export async function paymentsEnabled(exec: Exec = db): Promise<boolean> {
  return (await getSetting<boolean>("payments_enabled", false, exec)) === true;
}

/** Mindestzahl zahlender Spieler, ab der ein Spiel stattfindet und durch die der Hallenpreis höchstens geteilt wird. */
export async function minPaidPlayers(exec: Exec = db): Promise<number> {
  const n = await getSetting<number>("min_paid_players", 8, exec);
  return Number.isInteger(n) && n >= 2 && n <= 12 ? n : 8;
}
