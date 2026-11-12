import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Field, Fieldset, FIELD_CONTROL } from "@/components/ui/Field";
import { Form } from "@/components/ui/Form";
import { FormErrorsContext } from "@/components/ui/form-context";

// M2-3a: Struktur der Formular-Bausteine als statisches Markup (vitest läuft ohne DOM; Verhalten wie Fokus: tests/e2e/ui-form.spec.ts).
const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const input = (props: Record<string, unknown> = {}) => createElement("input", { className: FIELD_CONTROL, ...props });
const field = (props: Record<string, unknown>, control = input()) => createElement(Field as never, props as never, control);
const withErrors = (errors: Record<string, string>, node: Parameters<typeof renderToStaticMarkup>[0]) =>
  html(createElement(FormErrorsContext.Provider, { value: errors }, node));

describe("Field (M2-3a)", () => {
  it("verknüpft Beschriftung und Eingabeelement (label[for] = id) und setzt name", () => {
    const m = html(field({ name: "teamname", label: "Teamname" }));
    expect(m).toContain('<label for="field-teamname"');
    expect(m).toContain('id="field-teamname"');
    expect(m).toContain('name="teamname"');
    expect(m).toContain("Teamname");
  });

  it("eine eigene id des Eingabeelements bleibt, die Beschriftung zeigt darauf", () => {
    const m = html(field({ name: "a", label: "A" }, input({ id: "mein-feld" })));
    expect(m).toContain('<label for="mein-feld"');
    expect(m).toContain('id="mein-feld"');
    expect(m).not.toContain('id="field-a"');
  });

  it("Pflichtfeld: sichtbares Wort, required und aria-required; ohne Pflicht nichts davon", () => {
    const req = html(field({ name: "n", label: "Name", required: true }));
    expect(req).toContain("Pflichtfeld");
    expect(req).toContain("required");
    expect(req).toContain('aria-required="true"');
    const opt = html(field({ name: "n", label: "Name" }));
    expect(opt).not.toContain("Pflichtfeld");
    expect(opt).not.toContain("aria-required");
    expect(opt).not.toMatch(/\srequired/);
  });

  it("Hinweis: eigener Absatz, per aria-describedby verknüpft", () => {
    const m = html(field({ name: "n", label: "Name", hint: "Mindestens 3 Zeichen." }));
    expect(m).toContain('id="field-n-hint"');
    expect(m).toContain("Mindestens 3 Zeichen.");
    expect(m).toContain('aria-describedby="field-n-hint"');
  });

  it("Fehler am Feld: unter dem Feld, role=alert, Symbol und Wort, aria-invalid und aria-describedby auf den Fehler", () => {
    const m = html(field({ name: "n", label: "Name", error: "Dieser Name ist vergeben." }));
    expect(m).toContain('aria-invalid="true"');
    expect(m).toContain('id="field-n-error"');
    expect(m).toContain('role="alert"');
    expect(m).toContain("Dieser Name ist vergeben.");
    expect(m).toContain("⚠"); // Symbol, nicht nur Farbe
    expect(m).toContain('aria-describedby="field-n-error"');
    // Reihenfolge im Markup: Eingabeelement vor dem Fehler (Fehler steht UNTER dem Feld)
    expect(m.indexOf("<input")).toBeLessThan(m.indexOf("Dieser Name ist vergeben."));
  });

  it("Hinweis und Fehler zusammen: beide Ids in aria-describedby", () => {
    const m = html(field({ name: "n", label: "Name", hint: "Hilfe", error: "Fehler" }));
    expect(m).toContain('aria-describedby="field-n-hint field-n-error"');
  });

  it("ohne Fehler kein Fehlerblock und kein aria-invalid", () => {
    const m = html(field({ name: "n", label: "Name" }));
    expect(m).not.toContain("aria-invalid");
    expect(m).not.toContain('role="alert"');
  });

  it("liest den Fehler aus dem umgebenden Form (Kontext) per Feldname; die Eigenschaft error hat Vorrang", () => {
    const fromForm = withErrors({ n: "Aus dem Formular" }, field({ name: "n", label: "Name" }));
    expect(fromForm).toContain("Aus dem Formular");
    expect(fromForm).toContain('aria-invalid="true"');
    const other = withErrors({ x: "Anderes Feld" }, field({ name: "n", label: "Name" }));
    expect(other).not.toContain("Anderes Feld");
    const override = withErrors({ n: "Kontext" }, field({ name: "n", label: "Name", error: "Eigener" }));
    expect(override).toContain("Eigener");
    expect(override).not.toContain("Kontext");
  });

  it("Eingabeelement: mindestens 44 px (.field), Schrift 16 px, sichtbarer Fokus, volle Breite, keine !-Überschreibung", () => {
    const m = html(field({ name: "n", label: "Name" }));
    for (const c of ["field", "ui-focus", "w-full", "min-w-0", "text-base"]) expect(m).toContain(c);
    expect(m).not.toMatch(/!min-h|!px|text-\[/);
  });

  it("wirft, wenn kein Eingabeelement übergeben wird", () => {
    expect(() => html(createElement(Field as never, { name: "n", label: "N" } as never, "nur Text"))).toThrow();
  });

  it("Fieldset: Gruppe mit legend", () => {
    const m = html(createElement(Fieldset as never, { legend: "Team" } as never, field({ name: "n", label: "Name" })));
    expect(m).toMatch(/^<fieldset/);
    expect(m).toContain("<legend");
    expect(m).toContain("Team");
  });
});

describe("Form (M2-3a)", () => {
  const form = (props: Record<string, unknown> = {}, children: unknown = field({ name: "n", label: "Name" })) =>
    html(createElement(Form as never, { action: async () => ({ ok: true }), submitLabel: "Speichern", ...props } as never, children as never));

  it("genau eine Speichern-Handlung: ein Submit-Knopf mit der Beschriftung, 44 px (Button), kein zweiter", () => {
    const m = form();
    expect(m).toMatch(/^<form/);
    expect([...m.matchAll(/<button\b/g)]).toHaveLength(1);
    expect(m).toContain('type="submit"');
    expect(m).toContain("Speichern");
    expect(m).toContain("min-h-[var(--tap)]");
    expect(m).not.toMatch(/!min-h|!px/);
  });

  it("Hauptaktion Orange (primary), folgenreich: danger mit Rahmen statt Orange", () => {
    expect(form()).toContain("bg-accent");
    const danger = form({ danger: true });
    expect(danger).not.toContain("bg-accent");
    expect(danger).toContain("border-danger");
  });

  it("zeigt zu Beginn weder Erfolg noch Fehler noch Feldfehler-Hinweis", () => {
    const m = form();
    expect(m).not.toContain('role="status"');
    expect(m).not.toContain('role="alert"');
    expect(m).not.toContain("markierten Felder");
    expect(m).not.toContain('aria-busy="true"');
  });

  it("Felder im Formular: Pflichtwort und Beschriftung kommen mit", () => {
    const m = form({}, field({ name: "teamname", label: "Teamname", required: true }));
    expect(m).toContain("Teamname");
    expect(m).toContain("Pflichtfeld");
  });
});

describe("DateTimeField (M2-3a)", () => {
  const dt = (props: Record<string, unknown> = {}) => html(createElement(DateTimeField as never, { name: "anstoss", label: "Anstoß", ...props } as never));

  it("natives datetime-local, Beschriftung verknüpft, Name wie angegeben", () => {
    const m = dt();
    expect(m).toContain('type="datetime-local"');
    expect(m).toContain('<label for="field-anstoss"');
    expect(m).toContain('name="anstoss"');
    expect(m).toContain("Anstoß");
  });

  it("Startwert und Grenzen als Attribute im Format YYYY-MM-DDTHH:mm", () => {
    const m = dt({ value: "2026-11-23T15:04", min: "2026-11-01T10:00", max: "2026-12-31T22:00" });
    expect(m).toContain('value="2026-11-23T15:04"');
    expect(m).toContain('min="2026-11-01T10:00"');
    expect(m).toContain('max="2026-12-31T22:00"');
  });

  it("volle Breite ohne Abschneiden (w-full min-w-0 max-w-full), 44 px, 16 px Schrift", () => {
    const m = dt();
    for (const c of ["w-full", "min-w-0", "max-w-full", "text-base", "field", "ui-focus"]) expect(m).toContain(c);
  });

  it("Hinweis nennt die Zeitzone und Grenzen in Worten (Berliner Zeit, Wochentag, Datum, Uhrzeit)", () => {
    const m = dt({ min: "2026-11-01T10:00", max: "2026-12-31T22:00" });
    expect(m).toContain("Uhrzeit in deutscher Zeit");
    expect(m).toMatch(/Frühestens So\., 01\.11\., 10:00 Uhr/);
    expect(m).toMatch(/Spätestens Do\., 31\.12\., 22:00 Uhr/);
  });

  it("Berliner Zeit über die Zeitumstellung: 03:30 am Tag der Umstellung bleibt 03:30", () => {
    const m = dt({ min: "2026-03-29T03:30" });
    expect(m).toMatch(/Frühestens So\., 29\.03\., 03:30 Uhr/);
  });

  it("ungültige Grenze: keine Wortangabe, kein Absturz", () => {
    const m = dt({ min: "kein-datum", max: "2026-13-45T99:99" });
    expect(m).not.toContain("Frühestens");
    expect(m).not.toContain("Spätestens");
    expect(m).toContain("Uhrzeit in deutscher Zeit");
  });

  it("Pflicht und Fehler wie bei Field", () => {
    const m = dt({ required: true, error: "Zu früh." });
    expect(m).toContain("Pflichtfeld");
    expect(m).toContain('aria-invalid="true"');
    expect(m).toContain("Zu früh.");
    expect(m).toContain('role="alert"');
  });
});
