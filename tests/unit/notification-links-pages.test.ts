import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Backlog 3 (Nit R-T184): Die Seiten verlinken nur interne Pfade. Altzeilen mit fremder Adresse (vor der Prüfung in notifyUsers gespeichert) und Alarm-Hrefs bekommen keinen Link.
const rows = vi.hoisted(() => ({
  notifications: [] as { id: string; title: string; body: string; url: string | null; createdAt: Date; readAt: Date | null; type: string }[],
  alerts: [] as { code: string; severity: "high" | "medium"; title: string; detail: string; href?: string }[],
}));

vi.mock("@/server/session", () => ({
  requireUser: vi.fn(async () => ({ id: "u1" })),
  requirePermission: vi.fn(async () => ({ id: "u1" })),
}));
vi.mock("@/server/notifications", () => ({ listNotifications: vi.fn(async () => rows.notifications) }));
vi.mock("../../src/app/app/benachrichtigungen/MarkReadOnView", () => ({ MarkReadOnView: () => null }));
vi.mock("@/server/finance", () => ({
  currentMonth: () => "2026-11",
  monthPeriod: () => ({ from: new Date(0), to: new Date(1) }),
  overview: async () => new Proxy({}, { get: () => 0 }),
  getAlerts: vi.fn(async () => rows.alerts),
  listMatchFinance: async () => [],
}));
const { default: NotificationsPage } = await import("../../src/app/app/benachrichtigungen/page");
const { default: FinancePage } = await import("../../src/app/admin/finanzen/page");

const note = (id: string, url: string | null) => ({ id, title: `T-${id}`, body: "b", url, createdAt: new Date("2026-11-12T10:00:00Z"), readAt: null, type: "system" });
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe("/app/benachrichtigungen verlinkt nur interne Pfade", () => {
  it("Altzeilen mit fremder Adresse, Host-Ersatz, Schema und Steuerzeichen bekommen keinen Link, ein interner Pfad schon", async () => {
    rows.notifications = [
      note("a", "https://evil.example/x"),
      note("b", "@evil.example"),
      note("c", "//evil.example"),
      note("d", "javascript:alert(1)"),
      note("e", "/\t/evil.example"),
      note("f", null),
      note("g", "/lobby/42?x=1"),
    ];
    const html = renderToStaticMarkup(await NotificationsPage());
    const links = hrefs(html);
    expect(links.filter((h) => /evil|javascript/i.test(h))).toEqual([]);
    expect(links).toContain("/lobby/42?x=1");
    for (const id of ["a", "b", "c", "d", "e", "f"]) expect(html).toContain(`T-${id}`); // der Eintrag bleibt sichtbar, nur ohne Link
  });
});

describe("/admin/finanzen: Alarm-Hrefs nur intern", () => {
  const page = async () => renderToStaticMarkup(await FinancePage({ searchParams: Promise.resolve({}) } as never));

  it("ein roher fremder Href aus der Alarmliste wird nicht verlinkt, ein interner schon", async () => {
    rows.alerts = [
      { code: "x1", severity: "high", title: "Fremd", detail: "d", href: "https://evil.example/a" },
      { code: "x2", severity: "high", title: "Host", detail: "d", href: "@evil.example" },
      { code: "x3", severity: "medium", title: "Intern", detail: "d", href: "/admin/nutzer/123" },
      { code: "x4", severity: "medium", title: "Ohne", detail: "d" },
    ];
    const html = await page();
    const links = hrefs(html);
    expect(links.filter((h) => /evil/i.test(h))).toEqual([]);
    expect(links).toContain("/admin/nutzer/123");
    for (const t of ["Fremd", "Host", "Intern", "Ohne"]) expect(html).toContain(t);
  });
});
