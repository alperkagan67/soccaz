import { readFileSync } from "node:fs";
import path from "node:path";
import { Fragment, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerOnboarding, buildPlayerSteps } from "@/app/willkommen/PlayerOnboarding";
import type { SchrittProps } from "@/components/ui/Assistent";
import { serialisiereEntwurf, startZustand, type Werte } from "@/lib/assistent";
import { PLAYER_ONBOARDING_STEPS, validatePlayerStep } from "@/lib/player-onboarding";

// Vertrag 013 Version 3 (AC-26): Die Oberfläche des Spieler-Onboardings folgt der gemeinsamen Quelle (src/lib/player-onboarding.ts). Auflage: Geburtsdatum, Zustimmung und Rücksprungziel
// gelangen nie in den Entwurf im Browser; das Geburtsdatum steht nie im Klartext in der Zusammenfassung. Das Browserverhalten prüft tests/e2e/willkommen-onboarding.spec.ts.
const full: Werte = { name: "Alex", city: "Essen", position: "Angriff", birthDate: "1995-05-05", terms: "on", next: "/lobby/abc" };
const steps = buildPlayerSteps();
const props = (werte: Werte, fehler: Record<string, string> = {}): SchrittProps => ({
  werte,
  fehler,
  setze: () => {},
  feld: (name) => ({ name, value: werte[name] ?? "", onChange: () => {} }),
});
const markup = (index: number, werte: Werte = full, fehler: Record<string, string> = {}) => renderToStaticMarkup(createElement(Fragment, null, steps[index].render(props(werte, fehler))));

describe("Schritte folgen der gemeinsamen Quelle", () => {
  it("gleiche Reihenfolge, Kennungen, Felder und nichtSpeichern wie PLAYER_ONBOARDING_STEPS; die Prüfung je Schritt ist validatePlayerStep", () => {
    expect(steps.map((s) => s.id)).toEqual(PLAYER_ONBOARDING_STEPS.map((s) => s.id));
    const bad: Werte = { name: "a", city: "", position: "", birthDate: "2099-01-01", terms: "" };
    steps.forEach((s, i) => {
      expect(s.felder, s.id).toEqual(PLAYER_ONBOARDING_STEPS[i].felder);
      expect(s.nichtSpeichern ?? [], s.id).toEqual(PLAYER_ONBOARDING_STEPS[i].nichtSpeichern ?? []);
      expect(s.pruefe?.(bad), s.id).toEqual(validatePlayerStep(s.id as never, bad));
    });
  });

  it("jedes deklarierte Feld (außer next) erscheint im Markup seines Schrittes mit genau diesem Namen (Formular und Server benutzen dieselben Namen)", () => {
    steps.forEach((s, i) => {
      const out = markup(i);
      for (const f of s.felder.filter((x) => x !== "next")) expect(out, `${s.id}.${f}`).toContain(`name="${f}"`);
    });
  });
});

describe("Auflage: Geburtsdatum, Zustimmung und Rücksprungziel gelangen nie in den Entwurf", () => {
  it("nichtSpeichern = birthDate, terms, next; der Entwurf im Browser enthält davon nichts, aber den Rest", () => {
    const nicht = steps.flatMap((s) => [...(s.nichtSpeichern ?? [])]).sort();
    expect(nicht).toEqual(["birthDate", "next", "terms"]);
    const roh = serialisiereEntwurf({ ...startZustand(full), schritt: 4 }, steps);
    for (const geheim of ["1995-05-05", "birthDate", "terms", "/lobby/abc", "next"]) expect(roh, geheim).not.toContain(geheim);
    expect(roh).toContain("Alex");
    expect(roh).toContain("Essen");
    expect(roh).toContain("Angriff");
  });
});

describe("Inhalt der Schritte", () => {
  it("Schritt 1: Anzeigename (maxlength 40) und alle 15 Städte; Fehler stehen am Feld", () => {
    const out = markup(0, full, { name: "Name fehlt.", city: "Stadt fehlt." });
    expect(out).toContain("Name fehlt.");
    expect(out).toContain("Stadt fehlt.");
    expect(out).toContain('maxLength="40"');
    expect((out.match(/<option /g) ?? []).length).toBe(16); // "Bitte wählen" plus 15 Städte
  });

  it("Schritt 2: genau die fünf Positionen", () => {
    const out = markup(1);
    for (const p of ["Torwart", "Abwehr", "Mittelfeld", "Angriff", "Flexibel"]) expect(out).toContain(`>${p}</option>`);
    expect((out.match(/<option /g) ?? []).length).toBe(6);
  });

  it("Schritt 3: Datumsfeld mit Hinweis (nur Prüfung, nicht gespeichert), Fehler am Feld", () => {
    const out = markup(2, full, { birthDate: "Bitte gib dein Geburtsdatum an." });
    expect(out).toContain('type="date"');
    expect(out).toContain("nur zur Prüfung verwendet und nicht gespeichert");
    expect(out).toContain("Bitte gib dein Geburtsdatum an.");
  });

  it("Zusammenfassung: zeigt Name, Stadt, Position; das Geburtsdatum NIE im Klartext; ohne Datum (nach dem Neuladen) ein Hinweis auf Schritt 3", () => {
    const sum = markup(3);
    expect(sum).toContain("Alex");
    expect(sum).toContain("Essen");
    expect(sum).toContain("Angriff");
    expect(sum).not.toContain("1995");
    expect(sum).not.toContain("summary-birthdate-missing");
    const ohne = markup(3, { ...full, birthDate: "" });
    expect(ohne).toContain('data-testid="summary-birthdate-missing"');
    expect(ohne).toContain("Schritt 3");
  });

  it("Zusammenfassung escaped Eingaben (kein HTML aus Nutzertext)", () => {
    const out = markup(3, { ...full, name: "<script>alert(1)</script>" });
    expect(out).not.toContain("<script>");
  });

  it("Abschluss: Zustimmung mit dem bisherigen Wortlaut, Name terms, Pflichtmarke; ohne Haken nicht angehakt", () => {
    const aus = markup(4, { ...full, terms: "" });
    expect(aus).toContain("Ich akzeptiere die Datenschutzerklärung und die Hausordnung.");
    expect(aus).toContain('name="terms"');
    expect(aus).not.toMatch(/name="terms"[^>]*checked/);
    expect(markup(4, full)).toContain("checked");
  });
});

describe("Baustein und Seite", () => {
  it("die Seite im SSR (vor der Hydration): Schritt 1 sichtbar, Felder und Weiter gesperrt (Backlog 224), Entwurfsschlüssel eigen", () => {
    const m = renderToStaticMarkup(createElement(PlayerOnboarding, { defaultName: "Alex", next: "/app", userId: "u-1", abschlussAction: async () => undefined }));
    expect(m).toContain("Schritt 1 von 5");
    expect(m).toMatch(/<fieldset[^>]*disabled/);
    expect(m).toContain('data-testid="assistent-laedt"');
    expect(m).toContain('value="Alex"');
  });

  it("Entwurfsschlüssel je Konto: zwei Nutzer im selben Browser teilen sich keinen Entwurf", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const src = readFileSync(path.join(root, "src/app/willkommen/PlayerOnboarding.tsx"), "utf8");
    expect(src).toContain("id={`${PLAYER_ONBOARDING_ID}:${userId}`}");
  });

  it("Quelltext: page.tsx reicht die Server-Aktion als Prop, das alte einseitige Formular ist weg", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const page = readFileSync(path.join(root, "src/app/willkommen/page.tsx"), "utf8");
    expect(page).toContain("<PlayerOnboarding defaultName={user.appleId !== null && user.name === APPLE_NAME_PLATZHALTER ? \"\" : user.name} next={next} userId={user.id} abschlussAction={completeOnboardingAction} />");
    expect(page).not.toContain("OnboardingForm");
    expect(() => readFileSync(path.join(root, "src/app/willkommen/OnboardingForm.tsx"), "utf8")).toThrow();
  });
});
