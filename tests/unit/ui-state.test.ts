import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StateMessage, type StateMessageProps } from "@/components/ui/StateMessage";
import { StatusBadge } from "@/components/ui/StatusBadge";

// lose getippt: die Typ-Einschränkungen prüfen die Zeilen mit @ts-expect-error
const el = (C: unknown, props: Record<string, unknown> | null, children?: unknown) => createElement(C as never, props as never, children as never);
const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const count = (h: string, n: string) => h.split(n).length - 1;

const base = { title: "Noch keine Spiele", reason: "Es gibt noch keins.", action: { label: "Spiel suchen", href: "/suche" } };

describe("StateMessage (M2-2c)", () => {
  it("zeigt Titel, Grund und genau eine Handlung", () => {
    for (const kind of ["empty", "error", "ended", "forbidden"] as const) {
      const m = html(el(StateMessage, { kind, ...base }));
      expect(m, kind).toContain(">Noch keine Spiele<");
      expect(m).toContain(">Es gibt noch keins.<");
      expect(count(m, "<a ") + count(m, "<button"), kind).toBe(1);
      expect(m).toContain('href="/suche"');
      expect(m).toContain(`data-kind="${kind}"`);
      expect(m).not.toMatch(/<h[1-6]/); // keine eigene Überschrift: die Seite hat genau eine h1
    }
  });

  it("error ist role=alert, die anderen Arten role=status", () => {
    expect(html(el(StateMessage, { kind: "error", ...base }))).toContain('role="alert"');
    for (const kind of ["empty", "ended", "forbidden"] as const) {
      const m = html(el(StateMessage, { kind, ...base }));
      expect(m).toContain('role="status"');
      expect(m).not.toContain('role="alert"');
    }
  });

  it("Symbol und Wort, nicht nur Farbe", () => {
    const m = html(el(StateMessage, { kind: "error", ...base }));
    expect(m).toContain('aria-hidden="true"');
    expect(m).toContain("✕");
    expect(m).toContain(">Noch keine Spiele<");
  });

  it("die Handlung ist ein 44-px-Knopf; als Handler ein Button", () => {
    const link = html(el(StateMessage, { kind: "empty", ...base }));
    expect(link).toContain("min-h-[var(--tap)]");
    const btn = html(el(StateMessage, { kind: "error", ...base, action: { label: "Neu laden", onClick: () => {} } }));
    expect(btn).toContain('type="button"');
    expect(btn).toContain(">Neu laden<");
  });

  it("der Typ erzwingt eine Handlung und erlaubt keine zweite", () => {
    // @ts-expect-error action ist Pflicht
    const none: StateMessageProps = { kind: "empty", title: "T", reason: "R" };
    // @ts-expect-error genau eine Handlung, keine Liste
    const many: StateMessageProps = { kind: "empty", title: "T", reason: "R", action: [{ label: "A", href: "/a" }] };
    expect([none, many]).toHaveLength(2);
  });
});

describe("StatusBadge (M2-2c)", () => {
  it("jeder Status liefert Symbol und Wort", () => {
    const icons = { ok: "✓", warn: "▲", danger: "✕", info: "i", neutral: "•" } as const;
    for (const status of Object.keys(icons) as (keyof typeof icons)[]) {
      const m = html(el(StatusBadge, { status, label: "Wort" }));
      expect(m, status).toContain(icons[status]);
      expect(m).toContain(">Wort<");
      expect(m).toContain(`data-status="${status}"`);
      expect(m).toContain('aria-hidden="true"'); // das Symbol ist für Screenreader aus, das Wort bleibt
    }
  });

  it("die Symbole der fünf Status sind verschieden", () => {
    const set = new Set(["ok", "warn", "danger", "info", "neutral"].map((status) => html(el(StatusBadge, { status, label: "W" })).match(/<span aria-hidden="true"[^>]*>([^<]*)</)?.[1]));
    expect(set.size).toBe(5);
  });

  it("Farben nur aus den Status-Tokens, Orange kommt nicht vor", () => {
    for (const status of ["ok", "warn", "danger", "info", "neutral"]) {
      const m = html(el(StatusBadge, { status, label: "W" }));
      expect(m, status).not.toMatch(/accent/);
    }
    expect(html(el(StatusBadge, { status: "ok", label: "W" }))).toContain("text-ok");
    expect(html(el(StatusBadge, { status: "danger", label: "W" }))).toContain("text-danger");
  });

  it("Schrift mindestens 12 px (text-xs), nie kleiner", () => {
    const m = html(el(StatusBadge, { status: "ok", label: "W" }));
    expect(m).toContain("text-xs");
    expect(m).not.toMatch(/text-\[\d+px\]/);
  });

  it("Dritte sehen immer neutral, ohne Zahlstatus und ohne das Wort des Zustands", () => {
    const m = html(el(StatusBadge, { viewer: "third", thirdLabel: "Dabei" }));
    expect(m).toContain('data-status="neutral"');
    expect(m).toContain(">Dabei<");
    expect(m).not.toMatch(/text-ok|text-warn|text-danger|text-info/);
    // auch wenn ein Aufrufer (gegen den Typ) Status und Wort mitgibt: für Dritte zählt nur thirdLabel
    const leak = html(el(StatusBadge, { viewer: "third", thirdLabel: "Dabei", status: "ok", label: "bezahlt" }));
    expect(leak).not.toContain("bezahlt");
    expect(leak).toContain('data-status="neutral"');
  });

  it("der Typ verbietet label und status für Dritte und thirdLabel fehlt nie", () => {
    // @ts-expect-error für Dritte kein label und kein status
    const a: Parameters<typeof StatusBadge>[0] = { viewer: "third", thirdLabel: "Dabei", status: "ok", label: "bezahlt" };
    // @ts-expect-error für Dritte ist thirdLabel Pflicht
    const b: Parameters<typeof StatusBadge>[0] = { viewer: "third" };
    // @ts-expect-error ohne Wort gibt es keinen Status (nie nur Farbe)
    const c: Parameters<typeof StatusBadge>[0] = { status: "ok" };
    expect([a, b, c]).toHaveLength(3);
  });

  it("Betroffene und Captain sehen den echten Zustand", () => {
    for (const viewer of ["self", "captain"]) {
      const m = html(el(StatusBadge, { viewer, status: "danger", label: "Abbuchung fehlgeschlagen" }));
      expect(m).toContain('data-status="danger"');
      expect(m).toContain(">Abbuchung fehlgeschlagen<");
    }
  });
});
