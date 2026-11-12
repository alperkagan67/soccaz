import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UserMenu, UserMenuContent, type UserMenuProps } from "@/components/UserMenu";

// M2-4a: Struktur des Konto-Menüs als statisches Markup (vitest läuft ohne DOM; Tastatur, Fokus und Schließen: tests/e2e/user-menu.spec.ts).
const labels = { profile: "Mein Profil", area: "Mein Bereich", wallet: "Guthaben", settings: "Konto und Einstellungen", notifications: "Benachrichtigungen", admin: "Admin", signOut: "Abmelden", help: "Hilfe" };
const base: UserMenuProps = { name: "Alex Beispiel", userId: "u-1", avatarUrl: null, balanceText: "12,00 €", unread: 0, showAdmin: false, labels, signOutAction: async () => {} };
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

  it("geschlossen: kein Menü im DOM (keine versteckten Einträge, keine toten Tab-Stopps)", () => {
    const m = menu();
    expect(m).not.toContain('role="menu"');
    expect(m).not.toContain("menuitem");
    expect(m).not.toContain('data-testid="user-menu"');
  });

  it("Knopf mindestens 44 px hoch (Tippziel), kein altes btn-ghost mit 36 px", () => {
    const m = menu();
    expect(m).toContain("min-h-[var(--tap)]");
    expect(m).not.toContain("!min-h-9");
  });

  it("Anzeige: Initiale ohne Bild, Bild mit leerem alt wenn vorhanden; Vorname gekürzt", () => {
    expect(menu()).toContain(">A</span>");
    expect(menu({ avatarUrl: "/a.png" })).toContain('src="/a.png"');
    expect(menu({ avatarUrl: "/a.png" })).toContain('alt=""');
    expect(menu()).toContain(">Alex</span>");
  });
});

describe("UserMenuContent (M2-4a)", () => {
  it("Rolle menu mit Namen, Test-IDs unverändert, jeder Eintrag ist ein menuitem mit mindestens 44 px", () => {
    const c = content();
    expect(c).toContain('role="menu"');
    expect(c).toContain('aria-label="Alex Beispiel"');
    expect(c).toContain('data-testid="user-menu"');
    expect(c).toContain('data-testid="user-menu-name"');
    const items = c.match(/role="menuitem"/g) ?? [];
    expect(items).toHaveLength(7); // Profil, Bereich, Guthaben, Benachrichtigungen, Einstellungen, Hilfe, Abmelden
    expect((c.match(/min-h-\[var\(--tap\)\]/g) ?? []).length).toBe(7);
  });

  it("Ziele und Beschriftungen (Beschriftungen kommen von der Seite)", () => {
    const c = content({ labels: { ...labels, profile: "Profil X" } });
    expect(c).toContain('href="/spieler/u-1"');
    expect(c).toContain('href="/app"');
    expect(c).toContain('href="/app/guthaben"');
    expect(c).toContain('href="/app/benachrichtigungen"');
    expect(c).toContain('href="/app/einstellungen"');
    expect(c).toContain('href="/hilfe"');
    expect(c).toContain("Profil X");
    expect(c).toContain("12,00 €"); // Guthaben bleibt bis 012 M5 (Option B)
  });

  it("Admin-Eintrag nur mit showAdmin", () => {
    expect(content()).not.toContain('href="/admin"');
    expect(content({ showAdmin: true })).toContain('href="/admin"');
    expect((content({ showAdmin: true }).match(/role="menuitem"/g) ?? []).length).toBe(8);
  });

  it("ungelesene Benachrichtigungen: Zahl nur wenn > 0, ab 10 als 9+", () => {
    expect(content()).not.toContain("rounded-full bg-accent");
    expect(content({ unread: 3 })).toContain(">3</span>");
    expect(content({ unread: 12 })).toContain(">9+</span>");
  });

  it("Abmelden ist ein Absenden-Knopf im Formular (funktioniert auch ohne Skript), Rolle menuitem", () => {
    const c = content();
    expect(c).toMatch(/<form[^>]*>\s*<button role="menuitem" type="submit"/);
  });
});
