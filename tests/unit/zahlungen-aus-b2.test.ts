import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { zahlungsWorte } from "@/lib/zahlungen-aus";
import { Steps } from "../../src/app/lobby/[id]/Steps";
import { LightLegend } from "@/components/PlayerLight";

// Zahlungen AUS PR B Teil 2: Schritte und Ampel-Legende der Lobby ohne Zahlungswörter; bei Zahlungen AN unverändert (Gegenprobe).
const text = (html: string) => html.replace(/<[^>]+>/g, " ") + " " + (html.match(/aria-label="[^"]*"/g) ?? []).join(" ");

describe("Lobby-Schritte und Legende bei Zahlungen AUS", () => {
  it("Steps aus: dritter Schritt 'Bereit', kein Zahlungswort; AN: weiter 'Bezahlen'", () => {
    const aus = renderToStaticMarkup(createElement(Steps, { current: 3, decisions: [], title: "t", aus: true }));
    const an = renderToStaticMarkup(createElement(Steps, { current: 3, decisions: [], title: "t" }));
    expect(zahlungsWorte(text(aus))).toEqual([]);
    expect(aus).toContain("Bereit");
    expect(an).toContain("Bezahlen");
  });
  it("Legende: bei AUS ohne 'Ampel' (aria-label), bei AN unverändert", () => {
    expect(zahlungsWorte(text(renderToStaticMarkup(createElement(LightLegend, { paymentsOn: false }))))).toEqual([]);
    expect(renderToStaticMarkup(createElement(LightLegend, { paymentsOn: true }))).toContain("Legende der Ampel");
  });
});
