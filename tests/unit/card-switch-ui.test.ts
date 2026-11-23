import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Notschalter Kartenzahlung: Oberflaeche (Quelltext-Pruefung, kein Browser noetig): Zustand mit "seit wann", Folgetext, Pflicht-Grund, Pflicht-Haekchen, beide Richtungen.
const root = path.resolve(import.meta.dirname, "../..");
const page = readFileSync(path.join(root, "src/app/admin/einstellungen/page.tsx"), "utf8");

describe("/admin/einstellungen: Notabschaltung Kartenzahlung", () => {
  it("zeigt Zustand und seit wann, im Wortlaut 'EIN'/'AUS'", () => {
    expect(page).toContain('data-testid="card-switch-state"');
    expect(page).toContain("getCardSwitch()");
    expect(page).toMatch(/cardSwitch\.enabled \? "EIN" : "AUS"/);
    expect(page).toContain("seit ${formatDateTime(cardSwitch.since)}");
  });

  it("Folgetext beim Ausschalten (Entscheid t2q) und beim Wiedereinschalten", () => {
    expect(page).toContain("Neue Bezahlungen werden pausiert, Turniere frieren ein, Alarm nach 6 Stunden");
    expect(page).toContain("Es gibt keinen Ersatzweg für die Zahlung, und nichts wird kostenlos");
    expect(page).toContain('data-testid="card-switch-consequence-on"');
  });

  it("beide Richtungen mit Pflicht-Grund und Pflicht-Haekchen (ohne ConfirmDialog-Abhaengigkeit)", () => {
    const forms = page.match(/<ActionForm action=\{setCardSwitchAction\.bind\(null, (true|false)\)\}/g) ?? [];
    expect(forms).toHaveLength(2);
    expect(page.match(/name="reason"[^>]*required/g)).toHaveLength(2);
    expect(page.match(/type="checkbox" name="confirm" required/g)).toHaveLength(2);
  });
});
