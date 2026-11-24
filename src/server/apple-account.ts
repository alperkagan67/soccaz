import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

type UserRow = typeof users.$inferSelect;

export type AppleAnmeldung = { sub: unknown; email: string | null | undefined; emailVerified?: unknown; name: string };
export type AppleErgebnis = { ok: true; user: UserRow; created: boolean } | { ok: false; reason: "ungueltig" | "keine_email" | "email_unbestaetigt" | "email_vergeben" };

/**
 * Anmeldung mit Apple (Turnier 12.12.). Zuordnung NUR über den Apple-sub (users.apple_id), NIE über die E-Mail: sonst könnte jemand mit einer fremden E-Mail bei Apple ein bestehendes Google-Konto
 * übernehmen (Account-Takeover). Ohne von Apple bestätigte E-Mail entsteht kein Konto. Ist die E-Mail schon vergeben (Google-Konto, anderes Apple-Konto), wird abgewiesen und NICHTS verknüpft; bewusstes Verknüpfen (eingeloggt) kommt nach dem 12.12.
 * Ein gelöschtes Konto hat apple_id = null (deleteAccount) und wird nie wiederbelebt: dieselbe Kennung legt ein neues Konto an. Ein gesperrtes Konto wird geliefert; die Sperre wirkt im jwt-Callback wie bei Google.
 */
/** Apple liefert email_verified als Boolean oder als Text "true". Alles andere (fehlt, "false", anderer Wert) gilt als NICHT bestätigt. */
export function appleEmailBestaetigt(v: unknown): boolean {
  return v === true || v === "true";
}

export async function anmeldenMitApple(input: AppleAnmeldung): Promise<AppleErgebnis> {
  if (typeof input.sub !== "string" || input.sub.trim() === "" || input.sub.length > 255) return { ok: false, reason: "ungueltig" };
  const sub = input.sub;
  const [bekannt] = await db.select().from(users).where(eq(users.appleId, sub));
  if (bekannt) return { ok: true, user: bekannt, created: false };

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email) return { ok: false, reason: "keine_email" };
  // Vorab-Registrierung verhindern: ein Konto entsteht NUR mit einer von Apple bestätigten E-Mail (sonst könnte jemand die Adresse eines anderen vorab belegen; upsertUser findet Konten später über die E-Mail).
  // Private-Relay-Adressen sind von Apple selbst vergeben und werden mit email_verified = true geliefert; sie gehen den gleichen Weg.
  if (!appleEmailBestaetigt(input.emailVerified)) return { ok: false, reason: "email_unbestaetigt" };
  const [vergeben] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (vergeben) return { ok: false, reason: "email_vergeben" };

  try {
    const [created] = await db.insert(users).values({ email, name: input.name, appleId: sub }).returning();
    return { ok: true, user: created, created: true };
  } catch (error) {
    // gleichzeitige erste Anmeldung derselben Kennung (Teilindex users_apple_id_unique) oder derselben E-Mail: erneut nachsehen statt zu scheitern
    const [jetzt] = await db.select().from(users).where(eq(users.appleId, sub));
    if (jetzt) return { ok: true, user: jetzt, created: false };
    const [mail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (mail) return { ok: false, reason: "email_vergeben" };
    throw error;
  }
}
