import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MESSAGES, translator } from "@/lib/i18n";
import { zahlungsWorte } from "@/lib/zahlungen-aus";
import { APPLE_KONTO_URL, GOOGLE_KONTO_URL } from "@/lib/konto-links";

// Hinweis "Zum Mitmachen brauchst du ein Google- oder Apple-Konto (kostenlos)": zentral in i18n, hängt am Schalter der Apple-Anmeldung (appleLoginEnabled: Flag UND ID UND Secret).
vi.mock("@/server/locale", () => ({ getT: async () => ({ locale: "de", t: translator("de") }) }));
import { KontoHinweis, kontoSatz } from "@/components/KontoHinweis";

const KEYS = ["APPLE_LOGIN_ENABLED", "AUTH_APPLE_ID", "AUTH_APPLE_SECRET"] as const;
const alt = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (alt[k] === undefined) delete process.env[k];
    else process.env[k] = alt[k];
  }
});
const apple = (an: boolean) => {
  for (const k of KEYS) delete process.env[k];
  if (an) Object.assign(process.env, { APPLE_LOGIN_ENABLED: "1", AUTH_APPLE_ID: "de.example.test", AUTH_APPLE_SECRET: "test" });
};
const html = async () => renderToStaticMarkup(await KontoHinweis({}));

describe("KontoHinweis", () => {
  it("Flag aus: nur Google-Konto, ein Link, kein Apple", async () => {
    apple(false);
    const h = await html();
    expect(h).toContain("Zum Mitmachen brauchst du ein Google-Konto (kostenlos).");
    expect(h).toContain("Jeder Spieler braucht ein eigenes Konto.");
    expect(h).toContain(GOOGLE_KONTO_URL);
    expect(h).not.toMatch(/Apple/);
    expect(h).not.toContain(APPLE_KONTO_URL);
    expect(await kontoSatz()).toBe("Zum Mitmachen brauchst du ein Google-Konto (kostenlos).");
  });

  it("Flag an (mit ID und Secret): Google- oder Apple-Konto mit zwei Links", async () => {
    apple(true);
    const h = await html();
    expect(h).toContain("Zum Mitmachen brauchst du ein Google- oder Apple-Konto (kostenlos).");
    expect(h).toContain(GOOGLE_KONTO_URL);
    expect(h).toContain(APPLE_KONTO_URL);
    expect(await kontoSatz()).toBe("Zum Mitmachen brauchst du ein Google- oder Apple-Konto (kostenlos).");
  });

  it("Flag 1 OHNE Services ID/Secret: kein Apple im Text (falsche Zusage vermeiden)", async () => {
    apple(false);
    process.env.APPLE_LOGIN_ENABLED = "1";
    expect(await html()).not.toMatch(/Apple/);
  });

  it("externe Links: neuer Tab mit rel noopener noreferrer, Tippfläche mindestens 44 px (min-h-11)", async () => {
    apple(true);
    const h = await html();
    const links = h.match(/<a [^>]*>/g) ?? [];
    expect(links.length).toBe(2);
    for (const a of links) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
      expect(a).toContain("min-h-11");
    }
  });
});

describe("Texte (i18n) und Wortscan", () => {
  const KEYS_KONTO = ["konto.hint", "konto.hintApple", "konto.eigenes", "konto.googleLink", "konto.appleLink"] as const;
  it("in beiden Sprachen vorhanden, ohne Zahlungswort", () => {
    for (const locale of ["de", "en"] as const) {
      for (const k of KEYS_KONTO) {
        const text = MESSAGES[locale][k as keyof (typeof MESSAGES)["de"]];
        expect(text, `${locale} ${k}`).toBeTruthy();
        expect(zahlungsWorte(text), `${locale} ${k}`).toEqual([]);
      }
    }
  });
  it("die Adressen sind https und gehören den Anbietern", () => {
    expect(GOOGLE_KONTO_URL).toBe("https://accounts.google.com/signup");
    expect(APPLE_KONTO_URL).toBe("https://account.apple.com");
  });
});
