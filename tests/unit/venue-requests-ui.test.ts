import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 013 v3 AC-31, Nacharbeit w2: Hinweise und Verhalten der Admin-Ansicht der Hallen-Anfragen (Quelltext-Pruefung, kein Browser noetig).
const root = path.resolve(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");

describe("Hallen-Anfragen: Admin-Oberflaeche", () => {
  it("/admin/hallen zeigt oben den Link 'Hallen-Anfragen (n offen)' aus countVenueRequests", () => {
    const page = read("src/app/admin/hallen/page.tsx");
    expect(page).toContain("countVenueRequests");
    expect(page).toMatch(/href="\/admin\/hallen\/anfragen"[^>]*data-testid="venue-requests-link"/);
    expect(page).toMatch(/Hallen-Anfragen \(\{openRequests\} offen\)/);
  });

  it("die Admin-Navigation zeigt an 'Hallen' die Zahl offener Anfragen (nur mit Recht booking)", () => {
    const layout = read("src/app/admin/layout.tsx");
    expect(layout).toMatch(/canUser\(user, "booking"\) \? await countVenueRequests\(\) : 0/);
    expect(layout).toContain('data-testid="open-venue-requests"');
    expect(layout).toContain("offene Hallen-Anfragen"); // Text fuer Screenreader
  });

  it("'schon entschieden' (DomainError) laedt die Liste neu: beide Aktionen revalidieren auch im Fehlerfall", () => {
    const actions = read("src/server/admin-finance-actions.ts");
    expect(actions).toMatch(/function refreshOnError\(result: ActionState, path: string\)[\s\S]{0,200}revalidatePath\(path\)/);
    expect(actions).toMatch(/export async function approveVenueAction[\s\S]{0,200}refreshOnError\(/);
    expect(actions).toMatch(/export async function rejectVenueAction[\s\S]{0,200}refreshOnError\(/);
  });

  it("Skelett mit aria-busy und Statusmeldung (loading.tsx)", () => {
    const f = "src/app/admin/hallen/anfragen/loading.tsx";
    expect(existsSync(path.join(root, f))).toBe(true);
    const src = read(f);
    expect(src).toContain('aria-busy="true"');
    expect(src).toContain('role="status"');
  });

  it("Umschalter 'Abgelehnte anzeigen' (?abgelehnt=1) zeigt abgelehnte Anfragen nur lesend", () => {
    const page = read("src/app/admin/hallen/anfragen/page.tsx");
    expect(page).toContain('data-testid="toggle-rejected"');
    expect(page).toContain("abgelehnt=1");
    expect(page).toContain("listRejectedVenues");
    expect(page).toContain('data-testid="rejected-list"');
  });
});
