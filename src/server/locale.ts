import { cookies } from "next/headers";
import { connection } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translator, type Locale, type Translator } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  await connection();
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getT(): Promise<{ locale: Locale; t: Translator }> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
