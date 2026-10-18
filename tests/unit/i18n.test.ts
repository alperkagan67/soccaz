import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, MESSAGES, isLocale, translate } from "@/lib/i18n";

describe("Mehrsprachigkeit", () => {
  it("jede Sprache hat alle Schlüssel und keine leeren Texte", () => {
    const keys = Object.keys(MESSAGES.de);
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort(), locale).toEqual([...keys].sort());
      for (const [key, value] of Object.entries(MESSAGES[locale])) expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
    }
  });
  it("Platzhalter sind in allen Sprachen gleich", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, de] of Object.entries(MESSAGES.de)) for (const locale of LOCALES) expect(vars(MESSAGES[locale][key as keyof typeof MESSAGES.de]), `${locale}.${key}`).toEqual(vars(de));
  });
  it("Werte einsetzen und auf Deutsch zurückfallen", () => {
    expect(translate("en", "nav.notificationsUnread", { count: 3 })).toBe("Notifications, 3 unread");
    expect(translate("de", "nav.notificationsUnread", { count: 3 })).toBe("Benachrichtigungen, 3 ungelesen");
    expect(translate("fr" as never, "nav.signIn")).toBe("Anmelden");
    expect(translate("de", "nav.notificationsUnread")).toContain("{count}");
  });
  it("nur bekannte Sprachen sind gültig, Standard ist Deutsch", () => {
    expect(DEFAULT_LOCALE).toBe("de");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
