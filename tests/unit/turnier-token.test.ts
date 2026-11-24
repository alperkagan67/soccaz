import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOKEN_UNGUELTIG_HINWEIS, TOKEN_UNGUELTIG_TEXT, tokenGueltig } from "@/lib/turnier-token";

describe("tokenGueltig", () => {
  it("nur der exakt gleiche, nicht leere Token gilt", () => {
    expect(tokenGueltig("abcDEF123", "abcDEF123")).toBe(true);
    for (const g of ["abcDEF124", "abcdef123", "abcDEF12", "abcDEF1234", "", " abcDEF123", undefined, null, 5, {}, ["abcDEF123"]]) expect(tokenGueltig("abcDEF123", g), String(g)).toBe(false);
  });
  it("ohne erwarteten Token (null, leer, kein Text) ist nichts gültig", () => {
    for (const e of [null, undefined, "", 5 as unknown as string]) {
      expect(tokenGueltig(e, "")).toBe(false);
      expect(tokenGueltig(e, "egal")).toBe(false);
      expect(tokenGueltig(e, e)).toBe(false);
    }
  });
});

// Wächter: die Schutzstellen stehen im Quelltext (Verhalten: tests/integration/turnier-token.test.ts)
const src = (p: string) => readFileSync(p, "utf8");
describe("Schutzstellen", () => {
  it("registerTeam prüft den Token als ERSTES nach dem Sperren des Turniers, vor requireOpen und allen fachlichen Prüfungen", () => {
    const s = src("src/server/tournaments.ts");
    const i = s.indexOf("export async function registerTeam(");
    const rumpf = s.slice(i, i + 1500);
    expect(rumpf.indexOf("tokenGueltig(t.inviteToken, token)")).toBeGreaterThan(0);
    expect(rumpf.indexOf("tokenGueltig(t.inviteToken, token)")).toBeLessThan(rumpf.indexOf("requireOpen(t)"));
    expect(rumpf).toContain("throw new DomainError(TOKEN_UNGUELTIG_TEXT)");
  });
  it("getTournament gibt für private Turniere ohne Zugang null zurück (kein Zuschauer-Modus), Token nur zeitkonstant verglichen", () => {
    const s = src("src/server/tournaments.ts");
    expect(s).toContain("if (t.isPrivate && !isOrganizer && !inTournament && !tokenOk) return null;");
    expect(s).toContain("const tokenOk = tokenGueltig(t.inviteToken, token);");
    expect(s).not.toContain("spectator");
    expect(s).not.toMatch(/token === t\.inviteToken/);
  });
  it("Seite: immer dieselbe neutrale Seite für 'kein Turnier', kein Gast-Weiterreichen, Token nur bei privaten Turnieren in Links", () => {
    const p = src("src/app/turniere/[id]/page.tsx");
    expect(p).toContain("if (!data) return <EinladungUngueltig />;");
    expect(p).not.toContain("function Guest");
    expect(p).not.toContain("notFound");
    expect(p).toContain("const tokenQuery = t.isPrivate && data.tokenOk && token ? `?t=${token}` : \"\";");
    expect(p).toContain("token={t.isPrivate && data.tokenOk ? token : null}"); // das versteckte Formularfeld nur bei serverseitig bestätigtem Token
    expect(p.split("?t=${token}").length - 1).toBe(1); // der Token steht genau einmal in einem Link-Text (tokenQuery), sonst nirgends
    expect(p.indexOf("if (!data) return <EinladungUngueltig />;")).toBeLessThan(p.indexOf("redirect(`/willkommen?next="));
  });
  it("Neutrale Seite: nur der gemeinsame Text, kein Turnierinhalt, kein Token; Anmeldung reicht den Token von der Seite aus an die Aktion (Formularfeld)", () => {
    const c = src("src/components/EinladungUngueltig.tsx");
    expect(c).toContain("TOKEN_UNGUELTIG_TEXT");
    expect(c).not.toMatch(/token=|\?t=|searchParams/);
    expect(TOKEN_UNGUELTIG_TEXT).toBe("Dieser Einladungslink ist ungültig oder abgelaufen.");
    expect(TOKEN_UNGUELTIG_HINWEIS.length).toBeGreaterThan(10);
    expect(src("src/app/turniere/[id]/RegisterForm.tsx")).toContain('name="token"');
    expect(src("src/server/tournament-actions.ts")).toContain('registerTeam(uid, tournamentId, str(f, "teamId"), str(f, "token") || null)');
  });
});

describe("Zusatz security-Review (#397)", () => {
  it("registerTeam: unbekannte oder ungültige Turnier-id = dieselbe neutrale Meldung (kein Existenz-Orakel); getTournament prüft den Zugang vor den teuren Abfragen; tokenOk nach außen", () => {
    const s = src("src/server/tournaments.ts");
    const i = s.indexOf("export async function registerTeam(");
    const rumpf = s.slice(i, i + 1300);
    expect(rumpf).toContain("if (!/^[0-9a-f-]{36}$/i.test(tournamentId)) throw new DomainError(TOKEN_UNGUELTIG_TEXT);");
    expect(rumpf).toContain("if (!vorhanden) throw new DomainError(TOKEN_UNGUELTIG_TEXT);");
    expect(rumpf.indexOf("if (!vorhanden)")).toBeLessThan(rumpf.indexOf("lockTournament(tx, tournamentId)"));
    const g = s.indexOf("export async function getTournament(");
    const gr = s.slice(g, g + 2500);
    expect(gr.indexOf("if (!mitglied) return null;")).toBeGreaterThan(0);
    expect(gr.indexOf("if (!mitglied) return null;")).toBeLessThan(gr.indexOf("const entries = await db"));
    expect(s).toContain("tokenOk, // der gelieferte Token ist gültig");
  });
  it("neutrale Seite trägt selbst noindex", () => {
    expect(src("src/components/EinladungUngueltig.tsx")).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});
