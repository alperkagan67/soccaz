import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HallDeclineFields, HallDeclineForm } from "@/app/halle/HallDeclineForm";
import { FormErrorsContext } from "@/components/ui/form-context";

// 011 M2b: Struktur des Ablehnen-Formulars als statisches Markup (vitest läuft ohne DOM; Bedienung per Tastatur: später E2E, braucht die Datenbank).
const noop = async () => undefined;
const render = (props: { round?: number | null } = {}) => renderToStaticMarkup(createElement(HallDeclineForm, { action: noop, uid: "m1-v1", ...props }));
// Fehler kommen über den Kontext von `Form`; die Felder allein sind mit einem eigenen Kontext prüfbar
const renderFields = (errors: Record<string, string>) => renderToStaticMarkup(createElement(FormErrorsContext.Provider, { value: errors }, createElement(HallDeclineFields, { uid: "m1-v1" })));

describe("HallDeclineForm (M2b)", () => {
  it("Fieldset mit Legende, vier Gründe als Radiooptionen mit Beschriftung, Anmerkung mit Hinweis", () => {
    const m = render();
    expect(m).toContain("<fieldset");
    expect(m).toContain("<legend");
    expect(m).toContain("Grund der Ablehnung (Pflicht)");
    for (const [value, label] of [["belegt", "Belegt"], ["wartung", "Geschlossen oder Wartung"], ["veranstaltung", "Veranstaltung"], ["sonstiges", "Sonstiges"]]) {
      expect(m).toContain(`name="reasonCode" value="${value}"`);
      expect(m).toContain(label);
    }
    expect((m.match(/type="radio"/g) ?? []).length).toBe(4);
    expect(m).toContain('<label for="reason-m1-v1"');
    expect(m).toContain("Optional, 3 bis 200 Zeichen");
    expect(m).toContain("Ablehnung senden");
  });

  it("Tippflächen: jede Option mindestens 44 px (--tap), Eingabefeld mit Schrift 16 px (text-base)", () => {
    const m = render();
    expect((m.match(/min-h-\[var\(--tap\)\]/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(m).toContain("text-base");
  });

  it("Gruppenfehler unter der Gruppe mit Symbol und Wort, role=alert", () => {
    const m = renderFields({ reasonCode: "Bitte wähle einen Grund." });
    expect(m).toContain('role="alert"');
    expect(m).toContain("Bitte wähle einen Grund.");
    expect(m).toContain("⚠");
    expect(m).toContain('data-testid="error-reasonCode"');
  });

  it("Anmerkungsfehler am Feld (aria-invalid, aria-describedby)", () => {
    const m = renderFields({ reason: "Bitte beschreibe den Grund in 3 bis 200 Zeichen." });
    expect(m).toContain('aria-invalid="true"');
    expect(m).toContain("Bitte beschreibe den Grund in 3 bis 200 Zeichen.");
    expect(m).toContain('data-testid="error-reason"');
  });

  it("Runde nur als Hidden-Feld, wenn gesetzt", () => {
    expect(render()).not.toContain('name="round"');
    expect(render({ round: 2 })).toContain('<input type="hidden" name="round" value="2"');
  });

  it("keine Namen, keine Links in der Lobby (AC-5)", () => {
    const m = render({ round: 1 });
    expect(m).not.toContain("/lobby/");
    expect(m).not.toContain("href=");
  });
});
