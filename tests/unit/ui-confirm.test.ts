import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmDialog, type ConfirmDialogProps } from "@/components/ui/ConfirmDialog";

// M2-3b: Struktur des ConfirmDialog als statisches Markup (vitest läuft ohne DOM; Fokus, Escape und Fokus-Falle: tests/e2e/ui-confirm.spec.ts).
const base: ConfirmDialogProps = {
  trigger: { label: "Spieler entfernen" },
  title: "Spieler entfernen?",
  body: "Alex wird aus der Lobby genommen.",
  confirmLabel: "Spieler entfernen",
  onConfirmAction: () => undefined,
};
const html = (props: Partial<ConfirmDialogProps> = {}) => renderToStaticMarkup(createElement(ConfirmDialog, { ...base, ...props }));
const dialog = (m: string) => m.slice(m.indexOf("<dialog"), m.indexOf("</dialog>"));

describe("ConfirmDialog (M2-3b)", () => {
  it("ist ein natives <dialog> mit aria-labelledby/-describedby auf Titel und Folgesatz", () => {
    const m = html();
    expect(m).toContain("<dialog");
    const labelled = /aria-labelledby="([^"]+)"/.exec(m)?.[1];
    const described = /aria-describedby="([^"]+)"/.exec(m)?.[1];
    expect(labelled).toBeTruthy();
    expect(described).toBeTruthy();
    expect(m).toContain(`<h2 id="${labelled}"`);
    expect(m).toContain(`<p id="${described}">Alex wird aus der Lobby genommen.</p>`);
    expect(m.slice(m.indexOf(`<h2 id="${labelled}"`))).toMatch(/^<h2[^>]*>Spieler entfernen\?<\/h2>/);
  });

  it("hat genau zwei Knöpfe im Dialog: Abbrechen und die benannte Handlung (nie „OK“)", () => {
    const d = dialog(html());
    const buttons = d.match(/<button\b[^>]*>[^<]*<\/button>/g) ?? [];
    expect(buttons).toHaveLength(2);
    expect(d).toContain(">Abbrechen</button>");
    expect(d).toContain(">Spieler entfernen</button>");
    expect(d).not.toMatch(/>\s*OK\s*</);
  });

  it("der öffnende Knopf steht außerhalb des Dialogs und öffnet nicht von allein (kein open-Attribut)", () => {
    const m = html();
    expect(m.indexOf("<button")).toBeLessThan(m.indexOf("<dialog"));
    expect(dialog(m)).not.toMatch(/<dialog[^>]*\sopen/);
  });

  it("eigene Beschriftung für Abbrechen wird übernommen", () => {
    const d = dialog(html({ cancelLabel: "Zurück" }));
    expect(d).toContain(">Zurück</button>");
    expect(d).not.toContain(">Abbrechen</button>");
  });

  it("danger: Rahmen in Gefahrenfarbe, Symbol (nur Zierde) und Bestätigungsknopf als danger mit 2-px-Rahmen; Auslöser ebenfalls danger", () => {
    const m = html({ danger: true });
    const open = dialog(m).slice(0, dialog(m).indexOf(">")); // nur das <dialog>-Tag selbst
    expect(open).toContain("border-2 border-danger");
    expect(dialog(m)).toContain('<span aria-hidden="true">⚠ </span>');
    expect(dialog(m).match(/border-2 border-danger bg-transparent text-danger/g)?.length).toBe(1); // Bestätigung
    expect(m.slice(0, m.indexOf("<dialog"))).toContain("border-danger"); // Auslöser
  });

  it("ohne danger: kein Gefahrenrahmen, Bestätigung ist primär", () => {
    const d = dialog(html());
    expect(d).not.toContain("border-danger");
    expect(d.slice(0, d.indexOf(">"))).toContain("border border-line");
    expect(d).not.toContain("⚠");
    expect(d).toContain("bg-accent");
  });

  it("Betrag/Folge erscheint mit dem Wort „Folge“, nur wenn angegeben", () => {
    const withIt = dialog(html({ consequence: "12,00 € werden abgebucht." }));
    expect(withIt).toContain('data-testid="confirm-consequence"');
    expect(withIt).toContain("Folge: ");
    expect(withIt).toContain("12,00 € werden abgebucht.");
    expect(dialog(html())).not.toContain("confirm-consequence");
  });

  it("Bestätigungswort: beschriftetes Eingabefeld (label[for] = id), Bestätigung gesperrt bis das Wort getippt ist", () => {
    const d = dialog(html({ confirmText: "LÖSCHEN" }));
    const forId = /<label for="([^"]+)"/.exec(d)?.[1];
    expect(forId).toBeTruthy();
    expect(d).toMatch(new RegExp(`<input id="${forId}"`));
    expect(d).toContain("LÖSCHEN");
    expect(d).toMatch(/<button[^>]*disabled=""[^>]*>Spieler entfernen<\/button>/);
    expect(dialog(html())).not.toContain("<input");
    expect(dialog(html())).not.toMatch(/<button[^>]*disabled=""[^>]*>Spieler entfernen/);
  });

  it("Fehlerfläche (role=alert) gibt es erst nach einem Fehler, nicht im Ausgangszustand", () => {
    expect(html()).not.toContain('role="alert"');
  });

  it("Knöpfe im Dialog: volle Breite auf dem Handy (Stapel), nebeneinander ab sm; Dialog nie breiter als der Bildschirm", () => {
    const d = dialog(html());
    expect(d).toContain("flex-col-reverse");
    expect(d).toContain("[&amp;&gt;button]:w-full");
    expect(d).toContain("w-[min(32rem,calc(100vw-2rem))]");
    expect(d).toContain("max-h-[calc(100dvh-2rem)]");
    expect(d).toContain("backdrop:bg-black/70");
  });

  it("Zustimmung: Kästchen mit Beschriftung von der Seite (label[for] = id), Bestätigung gesperrt, Text nicht fest in der Komponente", () => {
    const d = dialog(html({ consent: { label: "Ich stimme dem Zusatz zu." } }));
    const forId = /<label for="([^"]+)"/.exec(d)?.[1];
    expect(forId).toBeTruthy();
    expect(d).toMatch(new RegExp(`<input id="${forId}" type="checkbox"`));
    expect(d).toContain("Ich stimme dem Zusatz zu.");
    expect(d).toMatch(/<button[^>]*disabled=""[^>]*>Spieler entfernen<\/button>/); // ohne Häkchen gesperrt
    expect(d).not.toMatch(/checked/); // Ausgangszustand: nicht angehakt
    expect(d).toContain("min-h-[var(--tap)]"); // Tippziel >= 44 px (ganze Zeile klickbar)
  });

  it("ohne consent: kein Kästchen, Bestätigung nicht durch eine Zustimmung gesperrt", () => {
    const d = dialog(html());
    expect(d).not.toContain('type="checkbox"');
    expect(d).not.toContain("confirm-consent");
    expect(d).not.toMatch(/<button[^>]*disabled=""[^>]*>Spieler entfernen/);
  });

  it("Zustimmung und Bestätigungswort zusammen: beides nötig, Wort-Feld bleibt ein Textfeld", () => {
    const d = dialog(html({ consent: { label: "Zustimmung" }, confirmText: "LÖSCHEN" }));
    expect(d).toContain('type="checkbox"');
    expect(d).toContain('type="text"');
    expect(d).toMatch(/<button[^>]*disabled=""[^>]*>Spieler entfernen<\/button>/);
  });
});

describe("ConfirmDialog mit Textfeld (field, Hallen-Anfragen)", () => {
  const field = { label: "Grund der Ablehnung", minLength: 3, maxLength: 200, hint: "Pflicht, 3 bis 200 Zeichen." };

  it("Textarea mit Beschriftung (label[for] = id), maxlength, Pflicht und Hinweis, Zähler als Text mit Mindestangabe", () => {
    const d = dialog(html({ field }));
    const forId = /<label for="([^"]+)"[^>]*>Grund der Ablehnung<\/label>/.exec(d)?.[1];
    expect(forId).toBeTruthy();
    expect(d).toMatch(new RegExp(`<textarea id="${forId}"[^>]*data-role="field"`));
    expect(d).toMatch(/<textarea[^>]*maxLength="200"/);
    expect(d).toMatch(/<textarea[^>]*aria-required="true"/);
    expect(d).toContain("Pflicht, 3 bis 200 Zeichen.");
    expect(d).toMatch(/data-testid="confirm-field-count"[^>]*>0 von 200 Zeichen \(mindestens 3\)</);
  });

  it("die Textarea verweist auf Hinweis und Zähler (aria-describedby), nicht auf einen nicht vorhandenen Fehler", () => {
    const d = dialog(html({ field }));
    const described = /<textarea[^>]*aria-describedby="([^"]*)"/.exec(d)?.[1] ?? "";
    expect(described).toContain("-field-hint");
    expect(described).toContain("-field-count");
    expect(described).not.toContain("-error");
    expect(d).not.toMatch(/<textarea[^>]*aria-invalid/);
  });

  it("Bestätigung bleibt gesperrt, bis die Mindestlänge erreicht ist (Ausgangszustand leer = gesperrt)", () => {
    expect(dialog(html({ field }))).toMatch(/<button[^>]*disabled=""[^>]*>Spieler entfernen<\/button>/);
  });

  it("ohne field: keine Textarea, kein Zähler", () => {
    const d = dialog(html());
    expect(d).not.toContain("<textarea");
    expect(d).not.toContain("confirm-field");
  });

  it("danger mit Feld bleibt ein Gefahrendialog (Rahmen, Symbol, Bestätigung als danger)", () => {
    const d = dialog(html({ field, danger: true }));
    expect(d).toContain("border-2 border-danger");
    expect(d).toContain("<textarea");
  });

  it("Quelltext: Startfokus mit Feld ist das Feld, dokumentiert (Doku-Kommentar und Auswahl vor danger); Fokus nach Erfolg geht an focusAfterSuccessAction", () => {
    const src = readFileSync(path.resolve(import.meta.dirname, "../../src/components/ui/ConfirmDialog.tsx"), "utf8");
    expect(src).toContain("STARTFOKUS mit Feld ist das Feld");
    expect(src).toMatch(/const start = field \? '\[data-role="field"\]' : danger \?/);
    expect(src).toMatch(/succeeded\.current && focusAfterSuccessAction \? focusAfterSuccessAction\(\) : null/);
    expect(src).toMatch(/\(target \?\? opener\.current\)\?\.focus\(\)/);
  });
});
