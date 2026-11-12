import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { LinkButton, type LinkButtonProps } from "@/components/ui/LinkButton";

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
// lose getippt: die Typ-Einschränkungen (kein className) prüfen die Zeilen mit @ts-expect-error
const el = (C: unknown, props: Record<string, unknown> | null, children?: unknown) => createElement(C as never, props as never, children as never);

describe("Button (M2-2a)", () => {
  it("ist ein <button type=button> mit Mindesthöhe 44 px in jeder Variante und Größe", () => {
    for (const variant of ["primary", "secondary", "danger"] as const) {
      for (const size of ["md", "sm"] as const) {
        const m = html(el(Button, { variant, size }, "Los"));
        expect(m, `${variant} ${size}`).toMatch(/^<button /);
        expect(m).toContain('type="button"');
        expect(m).toContain("min-h-[var(--tap)]");
        expect(m).toContain("ui-focus");
        expect(m).not.toMatch(/min-h-(?:[0-9]|10|11)\b/); // keine kleinere Mindesthöhe, auch nicht aus Altbestand (min-h-9)
        expect(m).not.toMatch(/!min-h|!px/);
      }
    }
  });

  it("Überblendung nur auf Farbe, Hintergrund und Rahmen, nie auf den Fokusring", () => {
    const m = html(el(Button, null, "A"));
    expect(m).toContain("transition-[color,background-color,border-color]");
    expect(m).not.toContain("transition-colors");
    expect(m).not.toContain("transition-all");
  });

  it("Standard ist secondary; Orange (bg-accent) nur bei primary", () => {
    expect(html(el(Button, null, "A"))).not.toContain("bg-accent");
    expect(html(el(Button, { variant: "secondary" }, "A"))).not.toContain("accent");
    expect(html(el(Button, { variant: "primary" }, "A"))).toContain("bg-accent text-accent-ink");
    expect(html(el(Button, { variant: "danger" }, "A"))).not.toContain("accent");
  });

  it("danger hat Rahmen und Wort, nicht nur eine Farbe", () => {
    const m = html(el(Button, { variant: "danger" }, "Entfernen"));
    expect(m).toContain("border-2");
    expect(m).toContain("border-danger");
    expect(m).toContain(">Entfernen<");
  });

  it("nimmt kein className und kein style an (Typ) und gibt sie auch nicht weiter", () => {
    // @ts-expect-error className ist absichtlich nicht erlaubt
    const typed: ButtonProps = { className: "x", children: "X" };
    expect(typed).toBeTruthy();
    const m = html(el(Button, { className: "!min-h-9 text-[11px]", style: { height: 20 } }, "X"));
    expect(m).not.toContain("min-h-9");
    expect(m).not.toContain("11px");
    expect(m).not.toContain("height:20px");
  });

  it("gesperrt: aria-disabled, gestrichelter Rahmen, Wort bleibt", () => {
    const m = html(el(Button, { disabled: true }, "Speichern"));
    expect(m).toContain("disabled");
    expect(m).toContain('aria-disabled="true"');
    expect(m).toContain("aria-disabled:border-dashed");
    expect(m).toContain(">Speichern<");
  });

  it("pending: zeigt das Wort „Bitte warten…“, aria-busy, aria-disabled", () => {
    const m = html(el(Button, { pending: true }, "Speichern"));
    expect(m).toContain("Bitte warten…");
    expect(m).not.toContain(">Speichern<");
    expect(m).toContain('aria-busy="true"');
    expect(m).toContain('aria-disabled="true"');
    expect(html(el(Button, { pending: true, pendingLabel: "Sende…" }, "Senden"))).toContain("Sende…");
  });

  it("kein aria-busy und kein aria-disabled im Normalzustand; type submit bleibt möglich", () => {
    const m = html(el(Button, { type: "submit" }, "Senden"));
    expect(m).not.toContain("aria-busy");
    expect(m).not.toContain("aria-disabled=");
    expect(m).toContain('type="submit"');
  });
});

describe("LinkButton (M2-2a)", () => {
  it("rendert einen Link mit href, Mindesthöhe und Fokusklasse", () => {
    const m = html(el(LinkButton, { href: "/suche", variant: "primary" }, "Spiel suchen"));
    expect(m).toMatch(/^<a /);
    expect(m).toContain('href="/suche"');
    expect(m).toContain("min-h-[var(--tap)]");
    expect(m).toContain("ui-focus");
    expect(m).toContain("bg-accent text-accent-ink");
  });

  it("nimmt kein className an", () => {
    // @ts-expect-error className ist absichtlich nicht erlaubt
    const typed: LinkButtonProps = { href: "/x", className: "x", children: "X" };
    expect(typed).toBeTruthy();
    const m = html(el(LinkButton, { href: "/x", className: "min-h-9" }, "X"));
    expect(m).not.toContain("min-h-9");
  });
});

describe("IconButton (M2-2a)", () => {
  it("hat den Namen als aria-label, blendet das Symbol aus und ist mindestens 44 × 44 px", () => {
    const m = html(el(IconButton, { label: "Schließen", icon: "✕" }));
    expect(m).toContain('aria-label="Schließen"');
    expect(m).toContain('aria-hidden="true"');
    expect(m).toContain("min-h-[var(--tap)]");
    expect(m).toContain("min-w-[var(--tap)]");
    expect(m).toContain('type="button"');
    expect(m).toContain("ui-focus");
  });

  it("gesperrt: aria-disabled und gestrichelter Rahmen", () => {
    const m = html(el(IconButton, { label: "Zu", icon: "✕", disabled: true }));
    expect(m).toContain('aria-disabled="true"');
    expect(m).toContain("aria-disabled:border-dashed");
  });
});

describe("Showcase /dev/komponenten", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("ist in der Produktion 404 (notFound wirft)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { default: Page } = await import("@/app/dev/komponenten/page");
    let digest = "";
    try {
      Page();
    } catch (e) {
      digest = String((e as { digest?: string }).digest ?? "");
    }
    expect(digest).toMatch(/404/);
  });

  it("rendert außerhalb der Produktion alle Komponenten", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { default: Page } = await import("@/app/dev/komponenten/page");
    const m = html(Page());
    expect(m).toContain("Komponenten (Entwicklung)");
    expect(m).toContain('data-testid="buttons-md"');
    expect(m).toContain('aria-label="Schließen"');
  });
});
