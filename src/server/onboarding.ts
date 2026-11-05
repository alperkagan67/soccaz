import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "./audit";

type UserRow = typeof users.$inferSelect;

/**
 * Plattform-Mitarbeiter (Admin, Finanzen, Buchung, Moderation) spielen nicht mit und brauchen kein Spieler-Onboarding
 * (Stadt, Position, Geburtsdatum). Ihr Konto gilt beim ersten Besuch als eingerichtet; Spieler gehen weiter durch das Onboarding.
 */
export async function ensureStaffOnboarded(user: UserRow): Promise<UserRow> {
  if (user.role === "player" || user.onboardedAt) return user;
  const now = new Date();
  await db.update(users).set({ onboardedAt: now }).where(eq(users.id, user.id));
  await audit(user.id, "user.onboarded.staff", "user", user.id, {});
  return { ...user, onboardedAt: now };
}
