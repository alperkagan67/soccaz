import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// TURNIER_ONLY: Wächter über die Server-Aktionen der gesperrten Module. Jede exportierte async-Funktion dieser Dateien beginnt mit der Sperre (erste Anweisung), damit eine neue Aktion
// nicht ungeschützt dazukommt. Die Oberfläche allein schützt nicht: eine Server-Aktion lässt sich direkt aufrufen.
const root = join(__dirname, "..", "..");
const src = (f: string) => readFileSync(join(root, f), "utf8");

/** Exportierte async-Funktionen mit der ersten Zeile ihres Körpers. */
function exporte(code: string): { name: string; erste: string }[] {
  const L = code.split("\n");
  const out: { name: string; erste: string }[] = [];
  for (let i = 0; i < L.length; i++) {
    const m = /^export async function (\w+)\(/.exec(L[i]);
    if (!m) continue;
    let j = i;
    while (j < L.length && !L[j].trimEnd().endsWith("{")) j++;
    out.push({ name: m[1], erste: (L[j + 1] ?? "").trim() });
  }
  return out;
}

const KOMPLETT = ["matchmaking-actions", "privategame-actions", "freeplayers-actions", "league-actions", "venue-request-actions", "venue-review-actions"];
describe("Module komplett gesperrt: jede Aktion beginnt mit assertBereichOffen()", () => {
  for (const m of KOMPLETT) {
    it(`src/server/${m}.ts`, () => {
      const ex = exporte(src(`src/server/${m}.ts`));
      expect(ex.length, m).toBeGreaterThan(0);
      for (const e of ex) expect(e.erste, `${m}.${e.name}`).toMatch(/^await assertBereichOffen\(\);/);
    });
  }
});

describe("clips-actions: je Spiel (Turnier-Spiele bleiben offen)", () => {
  it("beginnt mit assertSpielOffen(matchId)", () => {
    for (const e of exporte(src("src/server/clips-actions.ts"))) expect(e.erste, e.name).toMatch(/^await assertSpielOffen\(matchId\);/);
  });
});

describe("actions.ts: Spiel-Aktionen gesperrt, Onboarding/Team/Benachrichtigungen offen", () => {
  const ex = exporte(src("src/server/actions.ts"));
  const sperre = new Set(["createRequestAction", "acceptRequestAction", "cancelRequestAction"]);
  const spiel = ["cancelMatchAction", "adminCancelMatchAction", "recordEventAction", "undoLastEventAction", "submitResultAction", "submitScoreAction", "confirmResultAction", "disputeResultAction", "decideResultAction", "castMvpVoteAction", "markNoShowAction", "takeOverShareAction", "releaseCoverAction"];
  const offen = ["completeOnboardingAction", "createTeamAction", "createInviteAction", "joinTeamAction", "markNotificationsReadAction", "savePrefsAction", "savePushSubscriptionAction", "removePushSubscriptionAction"];
  it("Spielsuche: assertBereichOffen", () => {
    for (const n of sperre) expect(ex.find((e) => e.name === n)?.erste, n).toMatch(/^await assertBereichOffen\(\);/);
  });
  it("Spiel-Aktionen: assertSpielOffen(matchId) (Turnier-Spiele bleiben bedienbar)", () => {
    for (const n of spiel) expect(ex.find((e) => e.name === n)?.erste, n).toMatch(/^await assertSpielOffen\(matchId\);/);
  });
  it("Lobby-Aktionen laufen über lobbyAction mit eigener Sperre", () => {
    const code = src("src/server/actions.ts");
    expect(code).toMatch(/async function lobbyAction\([^)]*\)[^{]*\{\n\s*if \(await bereichGesperrt\(\)\) return \{ error: KOMMT_BALD_TEXT \};/);
    for (const n of ["joinLobbyAction", "leaveLobbyAction", "setReadyAction", "finalConfirmAction", "randomSplitAction", "unassignParticipantAction", "setVenueAction", "joinAsSubstituteAction", "assignSubstituteAction", "removeParticipantAction"]) {
      expect(ex.find((e) => e.name === n)?.erste, n).toMatch(/lobbyAction\(/);
    }
  });
  it("offene Aktionen (Onboarding, Team, Einladung, Benachrichtigungen) tragen KEINE Sperre", () => {
    for (const n of offen) expect(ex.find((e) => e.name === n)?.erste ?? "", n).not.toMatch(/assertBereichOffen|assertSpielOffen/);
  });
});

describe("Live-Kanäle und Sitemap", () => {
  it("Routen weisen bei gesperrtem Bereich ab (403), Spiel-Kanäle je Spiel", () => {
    expect(src("src/app/api/lobby/[id]/events/route.ts")).toMatch(/if \(await bereichGesperrt\(\)\) return gesperrteAntwort\(\);/);
    expect(src("src/app/api/spiele/stream/route.ts")).toMatch(/if \(await bereichGesperrt\(\)\) return gesperrteAntwort\(\);/);
    expect(src("src/app/api/spiele/[id]/events/route.ts")).toMatch(/if \(await spielGesperrt\(id\)\) return gesperrteAntwort\(\);/);
    expect(src("src/app/api/spiele/[id]/live/route.ts")).toMatch(/if \(await spielGesperrt\(id\)\) return gesperrteAntwort\(\);/);
  });
  it("jeder gesperrte Bereich hat ein layout mit BereichGate; Spiele-Liste und Spiel-Seite prüfen selbst", () => {
    for (const d of ["matchmaking", "suche", "hallen", "halle", "rangliste", "mitspieler", "ligen", "overlay", "profitag", "lobby", "spiel", "app/privatspiel", "app/suche"]) {
      expect(src(`src/app/${d}/layout.tsx`), d).toContain("<BereichGate>{children}</BereichGate>");
    }
    expect(src("src/app/spiele/page.tsx")).toMatch(/if \(await bereichGesperrt\(\)\) return <KommtBald \/>;/);
    expect(src("src/app/spiele/[id]/page.tsx")).toMatch(/page\.match\.kind !== "tournament" && \(await bereichGesperrt\(\)\)/);
  });
  it("Sitemap lässt gesperrte Seiten bei TURNIER_ONLY weg", () => {
    const s = src("src/app/sitemap.ts");
    expect(s).toContain("pfadGesperrt(p)");
    expect(s).toMatch(/const venueRows = nurTurnier \? \[\]/);
  });
});
