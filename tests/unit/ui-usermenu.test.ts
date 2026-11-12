import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UserMenu, UserMenuContent, type UserMenuProps } from "@/components/UserMenu";

// M2-4a: Struktur des Konto-Menüs als statisches Markup (vitest läuft ohne DOM; Tastatur, Fokus und Schließen: tests/e2e/user-menu.spec.ts).
const labels = { games: "Meine Spiele", venue: "Meine Halle", wallet: "Guthaben", settings: "Konto und Einstellungen", notifications: "Benachrichtigungen", admin: "Admin", signOut: "Abmelden", help: "Hilfe", account: "Konto", unread: "ungelesen" };
const base: UserMenuProps = { name: "Alex Beispiel", userId: "u-1", avatarUrl: null, balanceText: "12,00 €", unread: 0, showAdmin: false, showVenue: false, labels, signOutAction: async () => {} };
const menu = (p: Partial<UserMenuProps> = {}) => renderToStaticMarkup(createElement(UserMenu, { ...base, ...p }));
const content = (p: Partial<UserMenuProps> = {}) => renderToStaticMarkup(createElement(UserMenuContent, { ...base, ...p }));

describe("UserMenu (M2-4a)", () => {
  it("Knopf und Popover sind verknüpft (popovertarget = id) und das Popover ist nativ (popover=auto)", () => {
    const m = menu();
    const target = /popovertarget="([^"]+)"/i.exec(m)?.[1];
    expect(target).toBeTruthy();
    expect(m).toContain(`id="${target}"`);
    expect(m).toContain('popover="auto"');
    expect(m).toContain('aria-haspopup="menu"');
    expect(m).toContain('aria-expanded="false"');
    expect(m).toContain('data-testid="user-menu-button"');
  });

  it("vor der Hydration (und ohne Skript) steht der Inhalt im Popover: der native Knopf öffnet nichts Leeres (B-01)", () => {
    const m = menu();
    expect(m).toContain('role="menu"');
    expect((m.match(/role="menuitem"/g) ?? []).length).toBe(6);
  });

  it("ohne Popover-Unterstützung bleibt das Popover verborgen (B-04)", () => {
    expect(menu()).toContain("not-supports-[selector(:popover-open)]:hidden");
  });

  it("niedrige Fenster: Popover scrollt innen (B-02); Rand in --rim und kräftiger Schatten (Punkt 10)", () => {
    const m = menu();
    expect(m).toContain("overflow-y-auto");
    expect(m).not.toContain("overflow-visible");
    expect(m).toContain("border-rim");
    expect(m).toContain("shadow-2xl");
  });

  it("Knopf mindestens 44 px hoch (Tippziel), kein altes btn-ghost mit 36 px; Name mit Konto-Label und Chevron", () => {
    const m = menu();
    expect(m).toContain("min-h-[var(--tap)]");
    expect(m).not.toContain("!min-h-9");
    expect(m).toContain('aria-label="Konto: Alex"');
    expect(m).toMatch(/<svg[^>]*aria-hidden/);
    expect(m).toContain("group-aria-expanded:rotate-180");
    expect(m).toContain("aria-expanded:bg-panel2");
  });

  it("Anzeige: Initiale ohne Bild, Bild mit leerem alt wenn vorhanden; Vorname gekürzt", () => {
    expect(menu()).toContain(">A</span>");
    expect(menu({ avatarUrl: "/a.png" })).toContain('src="/a.png"');
    expect(menu({ avatarUrl: "/a.png" })).toContain('alt=""');
    expect(menu()).toContain(">Alex</span>");
  });
});

describe("UserMenuContent (M2-4a)", () => {
  it("Test-IDs unverändert, Name steht als Titel AUSSERHALB von role=menu, das Menü trägt den Namen (B-05)", () => {
    const c = content();
    expect(c).toContain('data-testid="user-menu"');
    const title = /<p id="([^"]+)"[^>]*data-testid="user-menu-name"/.exec(c);
    expect(title).toBeTruthy();
    expect(c).toContain(`<div role="menu" aria-labelledby="${title![1]}"`);
    expect(c.indexOf('data-testid="user-menu-name"')).toBeLessThan(c.indexOf('role="menu"'));
  });

  it("im Menü nur Einträge und Trenner: kein <p>, Formular als none, zwei Trenner (Gruppen), sechs Einträge für Spieler", () => {
    const c = content();
    const inner = c.slice(c.indexOf('role="menu"'));
    expect(inner).not.toContain("<p ");
    expect(inner).toContain('<form role="none"');
    expect((inner.match(/role="separator"/g) ?? []).length).toBe(2);
    expect((inner.match(/role="menuitem"/g) ?? []).length).toBe(6);
    expect((c.match(/min-h-\[var\(--tap\)\]/g) ?? []).length).toBe(6);
  });

  it("Reihenfolge (Textentscheid t9): Meine Spiele, [Meine Halle], [Admin], Trenner, Konto-Gruppe (Benachrichtigungen, Guthaben, Einstellungen, Hilfe), Trenner, Abmelden", () => {
    const c = content({ showAdmin: true, showVenue: true });
    const marks = ['href="/app"', 'href="/halle"', 'href="/admin"', 'role="separator"', "/app/benachrichtigungen", "/app/guthaben", "/app/einstellungen", "/hilfe", "Abmelden"];
    const at = marks.map((s) => c.indexOf(s));
    for (let i = 1; i < at.length; i++) expect(at[i], `Schritt ${i}: ${marks[i]}`).toBeGreaterThan(at[i - 1]);
    expect(c.lastIndexOf('role="separator"')).toBeGreaterThan(c.indexOf("/hilfe")); // zweiter Trenner vor Abmelden
    expect((c.match(/role="menuitem"/g) ?? []).length).toBe(8);
  });

  it("Mein Bereich und Mein Profil sind kein Eintrag mehr (Meine Spiele zeigt auf /app; das Profil ist von /app und den Einstellungen aus erreichbar)", () => {
    const c = content();
    expect(c).not.toContain("Mein Bereich");
    expect(c).not.toContain("Mein Profil");
    expect(c).not.toContain("/spieler/");
    expect(c).toContain(">Meine Spiele<");
  });

  it("Ziele und Beschriftungen (Beschriftungen kommen von der Seite)", () => {
    const c = content({ labels: { ...labels, games: "Spiele X" } });
    for (const href of ["/app", "/app/guthaben", "/app/benachrichtigungen", "/app/einstellungen", "/hilfe"]) expect(c).toContain(`href="${href}"`);
    expect(c).toContain("Spiele X");
    expect(c).toContain("12,00 €"); // Guthaben bleibt bis 012 M5 (Option B)
  });

  it("Meine Halle nur für Hallenbetreiber, Admin nur mit showAdmin (Text bleibt Admin)", () => {
    expect(content()).not.toContain('href="/halle"');
    expect(content()).not.toContain('href="/admin"');
    expect(content({ showVenue: true })).toContain('href="/halle"');
    expect(content({ showVenue: true })).toContain(">Meine Halle<");
    expect(content({ showAdmin: true })).toContain('href="/admin"');
    expect(content({ showAdmin: true })).toContain(">Admin<");
    expect((content({ showAdmin: true }).match(/role="menuitem"/g) ?? []).length).toBe(7);
  });

  it("Ungelesen-Zähler: nur wenn > 0, ab 10 als 9+, text-sm (≥ 14 px), Zahl aria-hidden und zusätzlich als Text N ungelesen (B-06)", () => {
    expect(content()).not.toContain("rounded-full bg-accent");
    expect(content()).not.toContain("sr-only");
    const c = content({ unread: 3 });
    expect(c).toMatch(/aria-hidden="true"[^>]*text-sm[^>]*>3</);
    expect(c).toMatch(/class="sr-only">\s*3 ungelesen/);
    expect(c).not.toContain("text-xs");
    const many = content({ unread: 12 });
    expect(many).toMatch(/>9\+</);
    expect(many).toMatch(/12 ungelesen/); // vorgelesen wird die genaue Zahl
  });

  it("Abmelden ist ein Absenden-Knopf im Formular (funktioniert auch ohne Skript), Rolle menuitem", () => {
    expect(content()).toMatch(/<form[^>]*role="none"[^>]*><button role="menuitem" type="submit"/);
  });
});
