import { Fragment, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildHalleSteps, onboardingDraftId } from "@/app/halle/anfragen/HalleOnboarding";
import type { SchrittProps } from "@/components/ui/Assistent";
import { entwurfSchluessel, serialisiereEntwurf, startZustand, type Werte } from "@/lib/assistent";
import { ONBOARDING_STEPS, validateStep } from "@/lib/venue-onboarding";

// Vertrag 013 Version 3, M2d (AC-25): Die Oberfläche des Hallen-Onboardings folgt der gemeinsamen Quelle (src/lib/venue-onboarding.ts). Auflage (Review Assistent): Zustimmung und
// Kontakt stehen unter nichtSpeichern UND gelangen nie in den Entwurf im Browser. Das Browserverhalten (Weiter, Fehler am Feld, Neuladen) prüft tests/e2e/halle-onboarding.spec.ts.
const full: Werte = {
  name: "Soccerhalle Nord",
  city: "Essen",
  address: "Hauptstr. 1",
  contact: "geheim@example.test",
  courts: "3",
  surface: "Kunstrasen",
  hasShowers: "on",
  hasParking: "",
  price60: "40,00",
  price90: "55,00",
  terms: "on",
};
const steps = buildHalleSteps(10);
const props = (werte: Werte, fehler: Record<string, string> = {}): SchrittProps => ({
  werte,
  fehler,
  setze: () => {},
  feld: (name) => ({ name, value: werte[name] ?? "", onChange: () => {} }),
});
const markup = (index: number, werte: Werte = full, fehler: Record<string, string> = {}) => renderToStaticMarkup(createElement(Fragment, null, steps[index].render(props(werte, fehler))));

describe("Schritte folgen der gemeinsamen Quelle", () => {
  it("gleiche Reihenfolge, Kennungen, Felder und nichtSpeichern wie ONBOARDING_STEPS; die Prüfung je Schritt ist validateStep", () => {
    expect(steps.map((s) => s.id)).toEqual(ONBOARDING_STEPS.map((s) => s.id));
    steps.forEach((s, i) => {
      expect(s.felder, s.id).toEqual(ONBOARDING_STEPS[i].felder);
      expect(s.nichtSpeichern ?? [], s.id).toEqual(ONBOARDING_STEPS[i].nichtSpeichern ?? []);
      expect(s.pruefe?.({ ...full, courts: "0", price60: "", terms: "", contact: "x" }), s.id).toEqual(validateStep(s.id as never, { ...full, courts: "0", price60: "", terms: "", contact: "x" }));
    });
  });

  it("jedes deklarierte Feld erscheint im Markup seines Schrittes mit genau diesem Namen (Formular und Server benutzen dieselben Namen)", () => {
    steps.forEach((s, i) => {
      const out = markup(i);
      for (const f of s.felder) expect(out, `${s.id}.${f}`).toMatch(new RegExp(`name="${f}"`));
    });
  });
});

describe("Auflage: Zustimmung und Kontakt gelangen nie in den Entwurf (nichtSpeichern)", () => {
  it("Kontakt und Zustimmung stehen unter nichtSpeichern, und der Entwurf im Browser enthält weder Kontakt noch Zustimmung", () => {
    const nicht = steps.flatMap((s) => [...(s.nichtSpeichern ?? [])]).sort();
    expect(nicht).toEqual(["contact", "terms"]);
    const roh = serialisiereEntwurf({ ...startZustand(full), schritt: 4 }, steps);
    expect(roh).not.toContain("geheim@example.test");
    expect(roh).not.toContain("terms");
    expect(roh).not.toContain("contact");
    expect(roh).toContain("Soccerhalle Nord"); // gegenprobe: gespeichert wird der Rest
    expect(roh).toContain("40,00");
  });
});

describe("Inhalt der Schritte", () => {
  it("Schritt 1: Pflichtfelder, alle 15 Städte, Kontakt mit Hinweis (nicht öffentlich, nicht im Entwurf); Fehler stehen am Feld", () => {
    const out = markup(0, full, { name: "Name fehlt.", contact: "Kontakt fehlt." });
    expect(out).toContain("Name fehlt.");
    expect(out).toContain("Kontakt fehlt.");
    expect(out).toContain("Nicht öffentlich und nicht im Entwurf gespeichert");
    expect((out.match(/<option /g) ?? []).length).toBe(16); // "Bitte wählen" plus 15 Städte
  });

  it("Schritt 3 nennt die Hallenmiete je Termin (kein Spielerpreis); die Zusammenfassung zeigt Beträge als Euro und keine rohen Eingaben", () => {
    expect(markup(2)).toContain("Hallenmiete je Termin");
    const sum = markup(3);
    expect(sum).toContain("40,00");
    expect(sum).toContain("55,00");
    expect(sum).toContain("Soccerhalle Nord");
  });

  it("Zusammenfassung escaped Eingaben (kein HTML aus Nutzertext)", () => {
    const out = markup(3, { ...full, name: "<script>alert(1)</script>", address: "\"><img src=x onerror=1>" });
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<img");
  });

  it("Abschluss: Bedingungen als gekennzeichneter ENTWURF, Provisionssatz sichtbar, Häkchen mit Namen terms und Pflichtmarke", () => {
    const out = markup(4, { ...full, terms: "" });
    expect(out).toContain("ENTWURF, rechtlich noch nicht geprüft");
    expect(out).toContain('data-testid="onboarding-terms"');
    expect(out).toMatch(/name="terms"/);
    expect(out).not.toMatch(/name="terms"[^>]*checked/);
    expect(String(steps[4].beschreibung)).toContain("10,00 %");
    expect(markup(4, full)).toMatch(/checked/);
  });
});

describe("Review R-T335: getrennte Entwürfe und Hinweis bei leerem Kontakt", () => {
  it("Entwurfsschlüssel: neuer Antrag und jede erneute Anfrage haben verschiedene Kennungen (nie Werte einer anderen Halle)", () => {
    const neu = onboardingDraftId();
    const a = onboardingDraftId("11111111-1111-4111-8111-111111111111");
    const b = onboardingDraftId("22222222-2222-4222-8222-222222222222");
    expect(neu).toBe("halle-onboarding");
    expect(new Set([neu, a, b]).size).toBe(3);
    expect(entwurfSchluessel(a)).not.toBe(entwurfSchluessel(neu));
    expect(onboardingDraftId(null)).toBe(neu);
  });

  it("Zusammenfassung: ohne Kontakt (z. B. nach dem Neuladen) steht ein Hinweis auf Schritt 1, mit Kontakt nicht", () => {
    expect(markup(3, { ...full, contact: "" })).toContain('data-testid="summary-contact-missing"');
    expect(markup(3, full)).not.toContain("summary-contact-missing");
  });
});
