import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pilot-P2 PR C (Plan docs/design/pilot-offen-plan.md): Mandats-Kästchen mit Touch-Ziel, Fußzeile text-sm, BottomNav bewusst unverändert (Look-Liste). Quelltext-Pins; das Verhalten prüfen lobby-captain.spec und ui-seiten.spec.
const src = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf8");

describe("Mandats-Kästchen (CardForm)", () => {
  const card = src("src/app/lobby/[id]/CardForm.tsx");
  it("beide Kästchen 24 px, Zeile als Label mindestens 44 px und anklickbar; Mandatstext unverändert über mandateText", () => {
    expect((card.match(/type="checkbox" className="mt-0\.5 size-6 shrink-0"/g) ?? []).length).toBe(2);
    expect((card.match(/<label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm" htmlFor="card-mandate(-stored)?">/g) ?? []).length).toBe(2);
    expect((card.match(/<span data-testid="card-mandate">\{mandateText\}<\/span>/g) ?? []).length).toBe(2);
  });
});

describe("Fußzeile und BottomNav", () => {
  it("Fußzeile text-sm (nicht mehr text-xs)", () => {
    const f = src("src/components/Footer.tsx");
    expect(f).toContain("text-sm text-muted");
    expect(f).not.toMatch(/<footer[^>]*text-xs/);
  });
  it("BottomNav bleibt unverändert (Look-Änderung, steht in docs/design/look-liste.md)", () => {
    expect(src("src/components/BottomNav.tsx")).toContain("gap-0.5 text-xs");
    expect(src("docs/design/look-liste.md")).toContain("BottomNav-Beschriftung");
  });
});
