import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VenueRequestList, type VenueRequestRow } from "@/app/admin/hallen/anfragen/VenueRequestList";

// 013 v3 AC-31, Nacharbeit (Review w2): Rückfrage per ConfirmDialog, Name im zugänglichen Namen der Knöpfe, Überschrift je Zeile, ein Statusbereich außerhalb der Zeilen.
// Das Verhalten im Browser (Fokus nach Erfolg, Dialog, Fehler am Feld) prüft tests/e2e/admin-hallen-anfragen.spec.ts (nur CI).
const root = path.resolve(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");
const rows: VenueRequestRow[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Halle Nord", city: "Essen", address: "Weg 1", surface: "Kunstrasen", contact: null, requestedLabel: "23.11.2026, 10:00" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Halle Süd", city: "Bochum", address: null, surface: null, contact: null, requestedLabel: null },
];
const none = async () => undefined;
const html = (requests: readonly VenueRequestRow[] = rows) => renderToStaticMarkup(createElement(VenueRequestList, { requests, approveAction: none, rejectAction: none }));

describe("Liste der Hallen-Anfragen (Markup)", () => {
  it("je Zeile eine Überschrift (h2) mit dem Hallennamen, Angaben darunter", () => {
    const m = html();
    expect(m).toMatch(/<h2[^>]*>Halle Nord <span[^>]*>· Essen<\/span><\/h2>/);
    expect(m).toMatch(/<h2[^>]*>Halle Süd /);
    expect(m).toContain("Weg 1 · Kunstrasen");
    expect(m).toContain("Keine weiteren Angaben");
  });

  it("die Auslöser-Knöpfe tragen den Hallennamen im zugänglichen Namen (sr-only), je Zeile zwei Dialoge", () => {
    const m = html();
    expect(m).toContain('Freischalten<span class="sr-only"> Halle Halle Nord</span>');
    expect(m).toContain('Ablehnen<span class="sr-only"> Halle Halle Süd</span>');
    expect((m.match(/data-testid="confirm-dialog"/g) ?? []).length).toBe(4);
  });

  it("Freischalten: Rückfrage mit Folge (nicht rücknehmbar); Ablehnen: Gefahrendialog mit Pflichtfeld Grund (3 bis 200), keine ActionForm mehr", () => {
    const m = html();
    expect(m).toContain("Halle „Halle Nord“ freischalten?");
    expect(m).toContain("Die Freischaltung lässt sich nicht zurücknehmen.");
    expect(m).toContain("Halle „Halle Nord“ ablehnen?");
    expect(m).toContain("Grund der Ablehnung");
    expect(m).toMatch(/<textarea[^>]*maxLength="200"/);
    expect(m).toContain("border-2 border-danger");
    expect(m).not.toMatch(/<form\b/); // keine eigenen Formulare mehr: alles läuft über den Dialog
  });

  it("EIN Statusbereich außerhalb der Zeilen: role=status, fokussierbar (tabIndex -1), steht vor der Liste", () => {
    const m = html();
    expect(m).toMatch(/<div[^>]*role="status"[^>]*tabindex="-1"[^>]*data-testid="requests-status"|<div[^>]*tabindex="-1"[^>]*role="status"[^>]*data-testid="requests-status"/);
    expect(m.indexOf("requests-status")).toBeLessThan(m.indexOf("requests-list"));
    expect((m.match(/role="status"/g) ?? []).length).toBe(1);
  });

  it("leer: Hinweis statt Liste, Statusbereich bleibt", () => {
    const m = html([]);
    expect(m).toContain('data-testid="requests-empty"');
    expect(m).not.toContain("requests-list");
    expect(m).toContain('data-testid="requests-status"');
  });
});

describe("Seite und Server-Aktionen (Quelltext)", () => {
  it("die Seite benutzt die Client-Liste und keine ActionForm mehr; Anfragende nur als Angaben der Halle", () => {
    const page = read("src/app/admin/hallen/anfragen/page.tsx");
    expect(page).toContain('import { VenueRequestList } from "./VenueRequestList"');
    expect(page).toContain("<VenueRequestList approveAction={approveVenueAction} rejectAction={rejectVenueAction}");
    expect(page).not.toContain("ActionForm");
  });

  it("die Dialog-Aktionen haben keine zweite Rechtelogik: nur guarded('booking') und approveVenue/rejectVenue, keine FormData, kein eigenes isOwner/canUser", () => {
    const actions = read("src/server/admin-finance-actions.ts");
    const approve = /export async function approveVenueAction\(([^)]*)\)[\s\S]*?\n}\n/.exec(actions)?.[0] ?? "";
    const reject = /export async function rejectVenueAction\(([^)]*)\)[\s\S]*?\n}\n/.exec(actions)?.[0] ?? "";
    expect(approve).toContain("export async function approveVenueAction(venueId: string): Promise<ActionState>");
    expect(reject).toContain("export async function rejectVenueAction(venueId: string, reason: string): Promise<ActionState>");
    for (const body of [approve, reject]) {
      expect(body).toContain('guarded("booking", "/admin/hallen/anfragen"');
      expect(body).toContain("refreshOnError(");
      expect(body).not.toMatch(/FormData|isOwner|canUser|isPlatformAdmin/);
    }
    expect(approve).toContain("approveVenue(actor, venueId)");
    expect(reject).toContain("rejectVenue(actor, venueId,");
  });

  it("alte Formular-Aktionen sind weg: keine Aufrufer mit .bind(null, id) und keine FormData-Signatur der beiden Aktionen", () => {
    const actions = read("src/server/admin-finance-actions.ts");
    expect(actions).not.toMatch(/approveVenueAction\(venueId: string, _prev/);
    expect(actions).not.toMatch(/rejectVenueAction\(venueId: string, _prev/);
  });
});
