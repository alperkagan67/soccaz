import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Assistent, type AssistentProps } from "@/components/ui/Assistent";
import { Field, FIELD_CONTROL } from "@/components/ui/Field";

// Vertrag 013 Version 3, AC-25: Struktur des Assistenten als statisches Markup (vitest läuft ohne DOM). Enter, Fokus auf die Überschrift, Neuladen und Fehler am Feld
// im Browser prüft tests/e2e/halle-onboarding.spec.ts (mit M2d, Hallen-Onboarding); die Zustandslogik prüft tests/unit/assistent.test.ts.
const schritte: AssistentProps["schritte"] = [
  {
    id: "name",
    titel: "Name und Adresse",
    felder: ["name", "adresse"],
    beschreibung: "Wie heißt die Halle?",
    render: ({ feld }) => createElement(Field as never, { name: "name", label: "Name", required: true } as never, createElement("input", { className: FIELD_CONTROL, ...feld("name") })),
    pruefe: (w): Record<string, string> => (w.name?.trim() ? {} : { name: "Bitte einen Namen angeben." }),
  },
  { id: "plaetze", titel: "Anzahl Plätze", felder: ["plaetze"], render: ({ feld }) => createElement("input", { className: FIELD_CONTROL, ...feld("plaetze") }) },
  { id: "preise", titel: "Preise", felder: ["preis60", "preis90"], render: () => createElement("p", null, "Preise") },
  { id: "abschluss", titel: "Anfrage senden", felder: ["bedingungen"], nichtSpeichern: ["bedingungen"], render: () => createElement("p", null, "Zusammenfassung") },
];
const base: AssistentProps = {
  id: "halle-onboarding",
  titel: "Halle anfragen",
  schritte,
  abschlussLabel: "Anfrage senden",
  abschlussAction: async () => ({ ok: true }),
};
const html = (props: Partial<AssistentProps> = {}) => renderToStaticMarkup(createElement(Assistent, { ...base, ...props }));

describe("Assistent (013 AC-25)", () => {
  it("zeigt „Schritt 1 von 4“ und genau einen aktuellen Eintrag mit aria-current=\"step\"", () => {
    const m = html();
    expect(m).toContain("Schritt 1 von 4");
    expect(m.match(/aria-current="step"/g)).toHaveLength(1);
    expect(m).toMatch(/<li aria-current="step"[^>]*data-testid="assistent-punkt-name"/);
    expect(m).toContain('data-testid="assistent-punkt-preise"');
  });

  it("die Fortschrittsliste ist eine benannte Liste, der Status steht auch als Wort (nie nur Farbe)", () => {
    const m = html();
    expect(m).toContain('<ol aria-label="Fortschritt"');
    expect(m).toContain("(aktueller Schritt)");
    expect(m).toContain("(offen)");
  });

  it("die Überschrift des Schritts ist fokussierbar (tabindex -1) und nennt den Schritt", () => {
    const m = html();
    expect(m).toMatch(/<h2 tabindex="-1"[^>]*data-testid="assistent-ueberschrift">Name und Adresse<\/h2>/);
  });

  it("im ersten Schritt gibt es „Weiter“ als Absenden-Knopf (Enter = Weiter) und kein „Zurück“", () => {
    const m = html();
    expect(m).toMatch(new RegExp('<button[^>]*data-testid="assistent-weiter"[^>]*type="submit"[^>]*>Weiter</button>'));
    expect(m).not.toContain("assistent-zurueck");
    expect(m).not.toContain("assistent-abschluss");
  });

  it("das Formular prüft selbst (noValidate), damit Enter und Weiter die Schrittprüfung auslösen, nicht die Browser-Meldung", () => {
    expect(html()).toMatch(/<form[^>]*noValidate=""|<form[^>]*novalidate=""/i);
  });

  it("rendert nur die Felder des aktuellen Schritts, mit Beschreibung und den Anfangswerten", () => {
    const m = html({ anfangswerte: { name: "Halle A", plaetze: "4" } });
    expect(m).toContain('name="name"');
    expect(m).toContain('value="Halle A"');
    expect(m).toContain("Wie heißt die Halle?");
    expect(m).not.toContain('name="plaetze"');
    expect(m).not.toContain("Zusammenfassung");
  });

  it("Pflichtfeld: sichtbares Wort „Pflichtfeld“ am Feld (Field), kein Fehler vor dem ersten Weiter", () => {
    const m = html();
    expect(m).toContain("Pflichtfeld");
    expect(m).not.toContain('role="alert"');
  });

  it("der Titel benennt den Bereich (aria-labelledby) und kein Schritt ist beim ersten Rendern als Fertig-Zustand ausgegeben", () => {
    const m = html();
    expect(m).toMatch(/<section aria-labelledby="([^"]+)-titel"/);
    expect(m).toContain("Halle anfragen");
    expect(m).not.toContain('data-testid="assistent-fertig"');
    expect(m).toContain('data-schritt="1"');
  });

  it("jeder Schritt hat eine Test-ID (Punkt und Form), damit die Spec je Schritt prüfen kann (AC-26)", () => {
    const m = html();
    for (const s of schritte) expect(m).toContain(`data-testid="assistent-punkt-${s.id}"`);
    expect(m).toContain('data-testid="assistent-form-name"');
  });
});
