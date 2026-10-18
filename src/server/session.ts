import { connection } from "next/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { can, type Permission } from "@/lib/roles";

export type CurrentUser = typeof users.$inferSelect;

/** Liefert den eingeloggten Nutzer frisch aus der DB (Sperre und Rolle werden immer neu geprüft). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Cache Components: erst Anfragezeit abwarten, bevor Auth.js zufällige Werte erzeugt.
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user || user.bannedAt) return null;
  return user;
}

/** Für Seiten und Aktionen, die einen vollständig eingerichteten Account brauchen. */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/anmelden?next=${encodeURIComponent(next)}` : "/anmelden");
  if (!user.onboardedAt) redirect(next ? `/willkommen?next=${encodeURIComponent(next)}` : "/willkommen");
  return user;
}

/** Für das Onboarding selbst: eingeloggt, aber noch nicht eingerichtet. */
export async function requireLoggedIn(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/app");
  return user;
}

/** Verlangt eine Berechtigung (Plattform-Admins haben alle, Teilrollen nur ihren Bereich). Sonst Weiterleitung. */
export async function requirePermission(permission: Permission, next = "/admin"): Promise<CurrentUser> {
  const user = await requireUser(next);
  if (!can(user.role, permission)) redirect("/app");
  return user;
}

/** Ist das Konto der aktuellen Sitzung gesperrt? Für einen verständlichen Hinweis statt stiller Abmeldung. */
export async function isCurrentSessionBanned(): Promise<boolean> {
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return false;
  const [user] = await db.select({ bannedAt: users.bannedAt }).from(users).where(eq(users.id, id));
  return Boolean(user?.bannedAt);
}
