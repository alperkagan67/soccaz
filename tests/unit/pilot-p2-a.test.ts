import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pilot-P2 PR A (Plan docs/design/pilot-offen-plan.md): der Freigabe-Satz steht nur einmal, der Sprachumschalter hat 44-px-Ziele. Quelltext-Pins; das Verhalten prüft ui-seiten.spec (Zielgrößen in der Fußzeile).
const src = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf8");

describe("Freigabe-Satz (Lobby, Abbuchung fehlgeschlagen)", () => {
  it("der Grund aus charge-failure-text.ts steht einmal; LobbyClient wiederholt ihn nicht mehr", () => {
    expect(src("src/lib/charge-failure-text.ts")).toContain("Die Bank braucht deine Freigabe der Zahlung.");
    const lobby = src("src/app/lobby/[id]/LobbyClient.tsx");
    expect(lobby).not.toMatch(/Bank braucht eine Freigabe/);
    expect(lobby).toContain("Gib sie hier frei");
  });
});

describe("Sprachumschalter", () => {
  it("Knöpfe mindestens 44 px hoch und breit (min-h-11 min-w-11), Aktion bleibt je Sprache ein eigenes Formular", () => {
    const s = src("src/components/LanguageSwitch.tsx");
    expect(s).toContain("min-h-11 min-w-11");
    expect(s).toContain("<form key={locale} action={setLocaleAction.bind(null, locale)}>");
  });
});

describe("Teilen-Links (bereits behoben, hier festgehalten)", () => {
  it("die Teilen-Links im Spielbrett sind 44 px hoch und text-sm", () => {
    const b = src("src/components/LobbyBoard.tsx");
    const n = (b.match(/className="inline-flex min-h-11 items-center text-sm text-muted underline">\s*Teilen/g) ?? []).length;
    expect(n).toBe(2);
  });
});
