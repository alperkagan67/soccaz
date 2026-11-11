import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader, type PageHeaderProps } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { PageTitle } from "@/components/ui/PageTitle";
import { SkipLink } from "@/components/ui/SkipLink";

// lose getippt: die Typ-Einschränkungen prüfen die Zeilen mit @ts-expect-error
const el = (C: unknown, props: Record<string, unknown> | null, children?: unknown) => createElement(C as never, props as never, children as never);
const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("PageTitle / PageHeader (M2-2b)", () => {
  it("PageTitle ist genau eine h1 mit Sprungziel", () => {
    const m = html(el(PageTitle, null, "Lobby"));
    expect(count(m, "<h1")).toBe(1);
    expect(m).toContain('id="seiten-titel"');
    expect(m).toContain('tabindex="-1"');
    expect(m).toContain(">Lobby<");
  });

  it("PageHeader rendert genau eine h1 und keine weitere Überschrift", () => {
    const m = html(el(PageHeader, { title: "Spiel suchen", meta: "Berlin", stand: "Du bist bereit.", action: { label: "Los", href: "/x" } }));
    expect(count(m, "<h1")).toBe(1);
    expect(m).not.toMatch(/<h[2-6]/);
  });

  it("Stand-Block steht nur mit stand, mit Beschriftung „Dein Stand“", () => {
    expect(html(el(PageHeader, { title: "T" }))).not.toContain("page-stand");
    const m = html(el(PageHeader, { title: "T", stand: "Karte hinterlegt" }));
    expect(m).toContain('aria-label="Dein Stand"');
    expect(m).toContain("Karte hinterlegt");
  });

  it("genau eine Hauptaktion, nur einmal gerendert, als primary", () => {
    const m = html(el(PageHeader, { title: "T", action: { label: "Weiter", href: "/weiter" } }));
    expect(count(m, 'data-testid="page-action"')).toBe(1);
    expect(count(m, "bg-accent text-accent-ink")).toBe(1);
    expect(count(m, "<a ")).toBe(1);
    expect(m).toContain('href="/weiter"');
    expect(m).toContain(">Weiter<");
    expect(html(el(PageHeader, { title: "T" }))).not.toContain("page-action");
  });

  it("Handy: feste Leiste über der BottomNav mit Safe-Area und Platzhalter; ab sm im Kopf", () => {
    const m = html(el(PageHeader, { title: "T", action: { label: "A", href: "/a" } }));
    expect(m).toContain("fixed");
    expect(m).toContain("safe-area-inset-bottom");
    expect(m).toContain("sm:static");
    expect(m).toMatch(/aria-hidden="true" class="h-16 sm:hidden"/);
  });

  it("Aktion als Formular-Absenden oder Handler", () => {
    const f = html(el(PageHeader, { title: "T", action: { label: "Speichern", form: "f1" } }));
    expect(f).toContain('type="submit"');
    expect(f).toContain('form="f1"');
    const c = html(el(PageHeader, { title: "T", action: { label: "Los", onClick: () => {} } }));
    expect(c).toContain('type="button"');
  });

  it("der Typ erlaubt keine Liste von Aktionen und keine Aktion ohne Ziel", () => {
    // @ts-expect-error mehrere Aktionen sind nicht vorgesehen
    const many: PageHeaderProps = { title: "T", action: [{ label: "A", href: "/a" }] };
    // @ts-expect-error eine Aktion braucht href, onClick oder form
    const none: PageHeaderProps = { title: "T", action: { label: "A" } };
    expect([many, none]).toHaveLength(2);
  });
});

describe("PageShell (M2-2b)", () => {
  it("Breiten kommen aus den Tokens und es gibt kein <main>", () => {
    expect(html(el(PageShell, { width: "narrow" }, "x"))).toContain("max-w-[var(--w-narrow)]");
    expect(html(el(PageShell, { width: "std" }, "x"))).toContain("max-w-[var(--w-std)]");
    expect(html(el(PageShell, { width: "full" }, "x"))).toContain("max-w-[var(--w-full)]");
    expect(html(el(PageShell, null, "x"))).toContain("max-w-[var(--w-std)]"); // Standard
    expect(html(el(PageShell, null, "x"))).not.toContain("<main");
  });

  it("Seitenleiste: nur mit aside, ab lg zweispaltig", () => {
    const without = html(el(PageShell, null, "x"));
    expect(without).not.toContain("<aside");
    expect(without).not.toContain("lg:grid");
    const withAside = html(el(PageShell, { aside: "S" }, "x"));
    expect(withAside).toContain("<aside");
    expect(withAside).toContain("lg:grid-cols-");
  });
});

describe("SkipLink (M2-2b)", () => {
  it("ist ein Link auf #inhalt, nur bei Fokus sichtbar, mit Text aus i18n", () => {
    const m = html(el(SkipLink, null));
    expect(m).toMatch(/^<a /);
    expect(m).toContain('href="#inhalt"');
    expect(m).toContain("sr-only");
    expect(m).toContain("focus:not-sr-only");
    expect(m).toContain("ui-focus");
    expect(m).toContain(">Zum Inhalt springen<");
    expect(html(el(SkipLink, { label: "Skip to content" }))).toContain(">Skip to content<");
  });
});
