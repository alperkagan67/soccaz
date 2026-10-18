"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { getCurrentUser } from "./session";

/** Sprache wählen: Cookie für alle, bei Angemeldeten zusätzlich im Profil. */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax", httpOnly: false });
  const user = await getCurrentUser();
  if (user && user.locale !== locale) await db.update(users).set({ locale }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
}
