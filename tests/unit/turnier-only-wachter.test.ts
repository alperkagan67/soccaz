import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
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
    expect(src("src/app/spiele/[id]/page.tsx")).toContain("if (await spielGesperrt(id)) return <KommtBald />;");
  });
  it("Sitemap lässt gesperrte Seiten bei TURNIER_ONLY weg", () => {
    const s = src("src/app/sitemap.ts");
    expect(s).toContain("pfadGesperrt(p)");
    expect(s).toMatch(/const venueRows = nurTurnier \? \[\]/);
  });
});

// Sicherheitsreview 0c2269a (Punkt 5): ALLE "use server"-Dateien aufzählen. Eine neue Aktionsdatei (oder eine Datei, die ihre Klassifizierung verliert) lässt den Test rot werden, statt unbemerkt ungeschützt zu bleiben.
import { readdirSync, statSync } from "node:fs";
function dateienMitUseServer(dir = join(root, "src"), out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) dateienMitUseServer(p, out);
    else if (/\.(ts|tsx)$/.test(n) && /^\s*["']use server["']/.test(readFileSync(p, "utf8").slice(0, 40))) out.push(p.slice(root.length + 1).split(sep).join("/"));
  }
  return out;
}

const GESPERRT_KOMPLETT = new Set(KOMPLETT.map((m) => `src/server/${m}.ts`));
const JE_SPIEL = new Set(["src/server/clips-actions.ts", "src/server/stream-actions.ts"]);
const GEMISCHT: Record<string, string> = {
  "src/server/actions.ts": "Spiel-Aktionen gesperrt (oben geprüft), Onboarding/Team/Einladung/Benachrichtigungen offen",
  "src/server/content-actions.ts": "Hallenbewertung (targetType venue) gesperrt, Kommentare an Profil und Team offen",
  "src/server/payments/card-actions.ts": "Lobby-Varianten je Spiel gesperrt; Karte im Konto (ohne Spiel) offen, bei Zahlungen AUS weist der Dienst ab (zahlungen-aus-abweisung.test.ts)",
  "src/server/payments/authorize-actions.ts": "Lobby-Freigabe je Spiel gesperrt; Turnier-Freigabe offen, bei Zahlungen AUS weist der Dienst ab",
  "src/server/payments/fake-card-actions.ts": "Lobby-Varianten je Spiel gesperrt; Turnier-Varianten offen; in Produktion ohnehin verboten (assertNoFakeInProduction)",
};
const OFFEN: Record<string, string> = {
  "src/server/account-actions.ts": "Konto: Export, Löschen, Einstellungen",
  "src/server/admin-actions.ts": "Admin-Bereich: Berechtigung im Dienst (requirePermission), Plattform-Admin ohnehin ausgenommen",
  "src/server/admin-finance-actions.ts": "Admin-Bereich (Finanzen)",
  "src/server/evidence-admin-actions.ts": "Admin 1 (Beweisprotokoll-Schalter)",
  "src/server/locale-actions.ts": "Sprachumschalter",
  "src/server/team-admin-actions.ts": "Teams (bleiben offen: Turnier-Anmeldung braucht sie)",
  "src/server/tournament-actions.ts": "Turniere (das Angebot der Betriebsart)",
  "src/server/tournament-confirm-actions.ts": "Turnier-Zusage der Halle (Turnier-Weg), Berechtigung im Dienst",
};

describe("alle 'use server'-Dateien sind klassifiziert (neue Datei = rot)", () => {
  const gefunden = dateienMitUseServer().sort();
  it("jede Datei steht in genau einer Liste (gesperrt, je Spiel, gemischt, offen mit Grund)", () => {
    const bekannt = new Set([...GESPERRT_KOMPLETT, ...JE_SPIEL, ...Object.keys(GEMISCHT), ...Object.keys(OFFEN)]);
    expect(gefunden.filter((f) => !bekannt.has(f)), "neue 'use server'-Datei: sperren oder mit Grund in OFFEN eintragen").toEqual([]);
    expect([...bekannt].filter((f) => !gefunden.includes(f)), "Eintrag ohne Datei").toEqual([]);
  });
  it("gemischte und offene Einträge haben einen Grund", () => {
    for (const [f, g] of [...Object.entries(GEMISCHT), ...Object.entries(OFFEN)]) expect(g.length, f).toBeGreaterThanOrEqual(7);
  });
  it("je-Spiel-Dateien beginnen jede Aktion mit assertSpielOffen(matchId)", () => {
    for (const f of JE_SPIEL) for (const e of exporte(src(f))) expect(e.erste, `${f}.${e.name}`).toMatch(/^await assertSpielOffen\(matchId\);/);
  });
  it("Zahlungsaktionen mit Spiel: assertSpielOffen als erste Anweisung der Lobby-Varianten", () => {
    const auth = exporte(src("src/server/payments/authorize-actions.ts"));
    expect(auth.find((e) => e.name === "createAuthorizationAction")?.erste).toMatch(/^await assertSpielOffen\(matchId\);/);
    const card = exporte(src("src/server/payments/card-actions.ts"));
    expect(card.find((e) => e.name === "createCardSetupAction")?.erste).toMatch(/assertSpielOffen\(input\.matchId\)/);
    expect(card.find((e) => e.name === "applyStoredCardForLobby")?.erste).toMatch(/^await assertSpielOffen\(/);
    const fake = exporte(src("src/server/payments/fake-card-actions.ts"));
    for (const n of ["fakeCardReadyAction", "fakeAuthorizeAction"]) expect(fake.find((e) => e.name === n)?.erste, n).toMatch(/^await assertSpielOffen\(matchId\);/);
  });
  it("Detailseiten gesperrter Bereiche liefern bei TURNIER_ONLY einen neutralen Titel ohne Datenabfrage", () => {
    for (const f of ["src/app/hallen/[id]/page.tsx", "src/app/ligen/[id]/page.tsx", "src/app/profitag/[id]/page.tsx"]) {
      expect(src(f), f).toMatch(/generateMetadata\([^)]*\)[^{]*\{\n\s*if \(turnierOnlyOn\(\)\) return \{ title: "Kommt bald"/);
    }
  });
});
