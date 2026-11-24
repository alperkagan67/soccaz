import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HallDeclineForm } from "@/app/halle/HallDeclineForm";
import { HALL_DECLINE_FINAL, HALL_DECLINE_FINAL_NOTE, HALL_DECLINE_NEXT } from "@/lib/hall-decline";
import { ZP } from "@/lib/zahlungspflicht-texte";

// Backlog 161, PR 2 (Oberflaeche): Hinweise beim Ablehnen und danach, zwei Wege des Veranstalters, Texte nur zentral. Quelltext-Pins fuer die Seiten (das Verhalten prueft turnier-ablehnen.spec).
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const root = join(__dirname, "..", "..");
const src = (f: string) => readFileSync(join(root, f), "utf8");
const noop = async () => ({ ok: true as const });

describe("Texte der Ablehnung", () => {
  it("Hinweis und Folgesatz im Wortlaut der Entscheidung t2q; die Meldung des Servers ist ihre Summe", () => {
    expect(HALL_DECLINE_FINAL_NOTE).toBe("Die Ablehnung ist endgültig.");
    expect(HALL_DECLINE_NEXT).toBe("Bitte den Veranstalter, die Halle erneut zu wählen.");
    expect(HALL_DECLINE_FINAL).toBe("Die Ablehnung ist endgültig. Bitte den Veranstalter, die Halle erneut zu wählen.");
    expect(src("src/server/tournament-confirm.ts")).toContain("export { HALL_DECLINE_FINAL }");
  });
  it("Rechtsfolge (Erstattung, keine Abbuchung) nur zentral in ZP; die Seiten nutzen die Konstanten, kein Streutext", () => {
    expect(ZP.hallDeclinedCancelNote).toMatch(/vollständig erstattet/);
    expect(ZP.hallDeclinedCancelNote).toMatch(/nichts abgebucht/);
    expect(ZP.hallDeclinedReopenConfirm).toMatch(/erstattet/);
    const page = src("src/app/turniere/[id]/page.tsx");
    expect(page).toContain("confirm={ZP.hallDeclinedReopenConfirm}");
    expect(page).toContain("confirm={ZP.hallDeclinedCancelConfirm}");
    expect(page).toContain("{ZP.hallDeclinedCancelNote}");
    const halle = src("src/app/halle/page.tsx");
    expect(halle).not.toMatch(/erstattet|Erstattung/); // die Halle sieht keine Zahlungsfolgen
  });
});

describe("Halle: Ablehnen mit Hinweis 'Die Ablehnung ist endgültig'", () => {
  it("das Formular zeigt den Hinweis vor dem Absenden, nur wenn er gesetzt ist", () => {
    const mit = renderToStaticMarkup(createElement(HallDeclineForm, { action: noop, uid: "t1", notice: HALL_DECLINE_FINAL_NOTE }));
    expect(mit).toContain('data-testid="decline-final-note"');
    expect(mit).toContain("Die Ablehnung ist endgültig.");
    expect(mit.indexOf("decline-final-note")).toBeLessThan(mit.indexOf("Ablehnung senden")); // vor dem Knopf
    const ohne = renderToStaticMarkup(createElement(HallDeclineForm, { action: noop, uid: "t1" }));
    expect(ohne).not.toContain("decline-final-note");
  });
  it("Seite: Ablehnen nur ohne Abbuchungszeile; abgelehnte Turniere zeigen 'Bitte den Veranstalter, die Halle erneut zu wählen' statt der Knöpfe", () => {
    const halle = src("src/app/halle/page.tsx");
    expect(halle).toContain("declineTournamentVenueFormAction.bind(null, c.tournamentId)");
    expect(halle).toContain("notice={HALL_DECLINE_FINAL_NOTE}");
    expect(halle).toContain("c.chargesStarted ?");
    expect(halle).toContain("{c.declined ? (");
    expect(halle).toContain("{HALL_DECLINE_FINAL_NOTE} {HALL_DECLINE_NEXT}");
  });
});

describe("Veranstalter: zwei Wege, nur die Kategorie", () => {
  it("die Seite zeigt Kategorie über DECLINE_LABELS (nie den Freitext) und genau EINE Hauptaktion im Kasten: 'Andere Halle wählen' (btn-primary), 'Turnier absagen' ruhig (btn-ghost)", () => {
    const page = src("src/app/turniere/[id]/page.tsx");
    expect(page).toContain("DECLINE_LABELS[declinedCode!]");
    expect(page).not.toMatch(/venueDeclinedBy|reason_text|evidence/i);
    const box = page.slice(page.indexOf('data-testid="venue-declined"'), page.indexOf('data-testid="venue-declined-team"'));
    expect((box.match(/btn-primary/g) ?? []).length).toBe(1);
    expect(box).toMatch(/label="Andere Halle wählen"[^>]*btn-primary/);
    expect(box).toMatch(/label="Turnier absagen"[^>]*btn-ghost/);
    expect(box).toContain("!min-h-11"); // 44 px
  });
  it("kein zweiter 'Turnier absagen'/'Kader wieder öffnen' im Veranstalter-Kasten, solange der Ablehnungs-Kasten die zwei Wege zeigt", () => {
    const page = src("src/app/turniere/[id]/page.tsx");
    expect(page).toContain("{inPayment && !declined && (");
    expect(page).toContain("{!(declined && inPayment) && <ActionButton action={cancelTournamentAction");
  });
  it("nach dem Kader öffnen: Hallenwahl mit der abgelehnten Halle wählbar ('hat abgelehnt'), auch bei ausgeschaltetem Kartenschalter (force)", () => {
    const page = src("src/app/turniere/[id]/page.tsx");
    expect(page).toContain("listPartnerVenueOptions({ force: declined })");
    expect(page).toContain("(hat abgelehnt)");
    expect(src("src/app/turniere/[id]/TournamentVenuePick.tsx")).toContain("Halle erneut oder andere Halle wählen");
  });
  it("Teams ohne Namen Dritter und ohne Kategorie: nur der neutrale Satz", () => {
    const page = src("src/app/turniere/[id]/page.tsx");
    const start = page.indexOf('data-testid="venue-declined-team"');
    const team = page.slice(start, page.indexOf("</p>", start));
    expect(team).toContain("Die Halle kann das Turnier nicht ausrichten. Der Veranstalter wählt eine andere Halle oder sagt das Turnier ab.");
    expect(team).not.toContain("declinedCode");
  });
});
