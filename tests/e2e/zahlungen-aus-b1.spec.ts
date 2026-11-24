import { expect, test, type Page } from "@playwright/test";
import { closeContexts, devLogin, newUser, run } from "./helpers";
import { setPlatformSetting } from "./helpers-db";
import { zahlungsWorte } from "@/lib/zahlungen-aus";

// Zahlungen AUS PR B Teil 1 (Go-live, Pflicht vor Freeze): Seiten, die ein Turnier-Nutzer als Gast, im Onboarding und angemeldet sieht, enthalten KEIN Zahlungswort (Wortliste src/lib/zahlungen-aus.ts,
// inkl. title/aria-label/alt). Lobby- und Teamspiel-Seiten sind nachrangig und nicht Teil dieser Liste (Turnier-Modus sperrt sie ohnehin). Die Zahlungswort-Liste der Turnierseiten prüft zahlungen-aus-matrix.spec.ts.
test.describe.configure({ mode: "serial" }); // der Schalter payments_enabled wird im AN-Test kurz umgelegt
test.setTimeout(180_000);
test.beforeAll(async () => {
  await setPlatformSetting("payments_enabled", false);
  await setPlatformSetting("card_payments_enabled", false);
});
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const GAST_SEITEN = ["/", "/hilfe", "/kontakt", "/agb", "/hausordnung", "/impressum", "/datenschutz", "/anmelden", "/turniere"];
const NUTZER_SEITEN = ["/app", "/app/einstellungen", "/teams"];

async function sichtbarerText(page: Page): Promise<string> {
  // ohne script/style/noscript (Dev-Server legt Pfade und Bündel in die Seite); sonst alles inkl. zugeklappter Abschnitte (textContent)
  const text = await page.locator("body").evaluate((el) => {
    const kopie = el.cloneNode(true) as HTMLElement;
    kopie.querySelectorAll("script,style,noscript,template").forEach((n) => n.remove());
    return kopie.textContent ?? "";
  });
  const attrs = await page.locator("body").evaluate((el) => [...el.querySelectorAll("[title],[aria-label],[alt]")].map((e) => [e.getAttribute("title"), e.getAttribute("aria-label"), e.getAttribute("alt")].filter(Boolean).join(" ")).join(" "));
  return `${text} ${attrs}`.replace(/\s+/g, " ");
}

async function scan(page: Page, pfade: string[], funde: string[]) {
  for (const pfad of pfade) {
    const res = await page.goto(pfad);
    if (!res || res.status() >= 400) {
      funde.push(`${pfad}: Status ${res?.status()}`);
      continue;
    }
    await page.waitForLoadState("domcontentloaded");
    const text = await sichtbarerText(page);
    const treffer = zahlungsWorte(text);
    if (treffer.length > 0) {
      const ausschnitte = treffer.map((t) => {
        const m = new RegExp(t, "i").exec(text);
        return m ? `…${text.slice(Math.max(0, m.index - 40), m.index + 60)}…` : t;
      });
      funde.push(`${pfad}: ${ausschnitte.join(" | ")}`);
    }
  }
}

test("Zahlungen AUS: Gast-Seiten ohne Zahlungswort", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const funde: string[] = [];
  await scan(page, GAST_SEITEN, funde);
  expect(funde, funde.join("\n")).toEqual([]);
});

test("Zahlungen AUS: Onboarding (/willkommen) und angemeldete Seiten ohne Zahlungswort", async ({ browser }) => {
  const funde: string[] = [];
  // Onboarding: Nutzer ohne abgeschlossenes Onboarding
  const neu = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await devLogin(neu, `b1neu-${run}@test.local`, "Neu B1");
  await neu.waitForURL(/\/willkommen|\/app/, { timeout: 60_000 });
  await scan(neu, ["/willkommen"], funde);
  // Angemeldeter Nutzer (Onboarding fertig)
  const fertig = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await newUser(fertig, "b1ok");
  await scan(fertig, NUTZER_SEITEN, funde);
  expect(funde, funde.join("\n")).toEqual([]);
});

test("Zahlungen AN (Gegenprobe): die alten Texte bleiben auf Startseite, AGB, Hausordnung und in den Einstellungen", async ({ browser }) => {
  await setPlatformSetting("payments_enabled", true);
  try {
    const gast = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const text = async (pfad: string) => {
      await gast.goto(pfad);
      return sichtbarerText(gast);
    };
    expect(await text("/"), "Startseite").toContain("Was kostet das?");
    const agb = await text("/agb");
    for (const alt of ["Preise und Zahlung", "Absage und Erstattung", "wickelt auf Wunsch die Bezahlung der Hallenmiete ab"]) expect(agb, `AGB: ${alt}`).toContain(alt);
    expect(agb).not.toContain("[ENTWURF"); // die Entwurf-Marken gehören nur zum AUS-Zweig
    expect(await text("/hausordnung"), "Hausordnung").toContain("offene Zahlungen und Reservierungen");
    const nutzer = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await newUser(nutzer, "b1an");
    await nutzer.goto("/app/einstellungen");
    expect(await sichtbarerText(nutzer), "Einstellungen").toContain("Ergebnissen und Zahlungen bekommst du immer");
  } finally {
    await setPlatformSetting("payments_enabled", false);
  }
});
