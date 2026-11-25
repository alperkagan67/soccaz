import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Papier-Fallback (Option B): Druck-Regeln und Druckseite. Die Wirkung (hell, ohne Kopf, Querformat) belegt tests/e2e/turnier-druck.spec.ts; hier die Pins, damit sie nicht still verschwinden.
describe("Druck-CSS und Druckseite", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const druck = css.slice(css.lastIndexOf("@media print"));
  it("@media print am Dateiende: hell erzwungen (auch Dunkel-Themen), Kopf, Menü, Fuß und Knöpfe aus, Inhalt volle Breite", () => {
    expect(css.lastIndexOf("@media print")).toBeGreaterThan(css.lastIndexOf("@media (prefers-color-scheme: light)"));
    expect(druck).toContain(':root[data-theme="dark"]');
    expect(druck).toContain("--ink: #000000");
    expect(druck).toContain("color-scheme: light");
    for (const sel of ["body > header", "body > footer", "body > nav", ".print-hide"]) expect(druck).toContain(sel);
    expect(druck).toContain("max-width: none");
  });
  it("Druckseite: Querformat, noindex, reines Server-Render (nur der Drucken-Knopf ist ein Client-Baustein), gleiche Zugangsprüfung wie die Turnierseite", () => {
    const seite = readFileSync("src/app/turniere/[id]/druck/page.tsx", "utf8");
    expect(seite).toContain("@page { size: A4 landscape");
    expect(seite).toContain("robots: { index: false");
    expect(seite).not.toContain('"use client"');
    expect(seite).toContain("getTournament(id, user ? { id: user.id, role: user.role } : null, token)");
    expect(seite).toContain("if (!data) return <EinladungUngueltig />");
    expect(seite).not.toMatch(/organizerName|veranstalterLabel/); // keine Personennamen
  });
});
