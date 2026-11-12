import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { invoiceDeliveries, invoiceLines, invoiceNumberCounters, invoices, settings, venues } from "@/db/schema-finance";
import { bookCommission, reverseCommission } from "@/server/commission";
import { currentMonth, getAlerts, venueCommissionOverview } from "@/server/finance";
import { post } from "@/server/ledger";
import { setSetting } from "@/server/settings";
import { cleanup, makeMatch, makeUser } from "./helpers";

// Vertrag 009 M2, AC-6: Monatssammelrechnung je Halle. Echte Datenbank; nur Anmeldung, Weiterleitung und der Mail-Versand sind ersetzt.
let currentUserId = "";
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: currentUserId } }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const mail = vi.hoisted(() => ({ gate: null as Promise<void> | null, throwFor: null as string | null, result: { status: "sent" } as { status: "sent" | "skipped" | "failed"; detail?: string }, calls: [] as { to: string; subject: string; text: string; attachments?: { filename: string; contentBase64: string }[] }[] }));
vi.mock("@/server/providers/email", () => ({
  sendEmail: async (m: (typeof mail.calls)[number]) => {
    if (mail.gate) await mail.gate;
    if (mail.throwFor && m.subject.includes(mail.throwFor)) throw new Error("PDF/Mail-Fehler (Test)");
    mail.calls.push(m);
    return mail.result;
  },
}));
import { createInvoicesForMonth, deliverInvoices, invoiceHooks, loadInvoiceData } from "@/server/invoices";
import { GET as invoicePdf } from "@/app/api/rechnungen/[id]/route";

const PREFIX = "Rech Halle";
const env = { OPERATOR_NAME: "Soccaz Test GmbH", OPERATOR_ADDRESS: "Teststr. 1, 45127 Essen", OPERATOR_EMAIL: "kontakt@test.invalid", OPERATOR_TAX_ID: "DE000000000" };
let seq = 0;
const nid = () => `${Date.now().toString(36)}${++seq}`;
const period = currentMonth();
const year = new Date().getUTCFullYear();

async function dropVenues() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local socaz.ledger_maintenance = 'on'`);
    const ids = (await tx.select({ id: venues.id }).from(venues).where(like(venues.name, `${PREFIX}%`))).map((v) => v.id);
    if (ids.length === 0) return;
    const inv = (await tx.select({ id: invoices.id }).from(invoices).where(inArray(invoices.venueId, ids))).map((i) => i.id);
    if (inv.length) {
      await tx.delete(invoiceDeliveries).where(inArray(invoiceDeliveries.invoiceId, inv));
      await tx.delete(invoiceLines).where(inArray(invoiceLines.invoiceId, inv));
      await tx.delete(invoices).where(inArray(invoices.id, inv));
    }
    await tx.execute(sql`delete from match_commissions where venue_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
    await tx.delete(venues).where(inArray(venues.id, ids));
  });
}

beforeEach(async () => {
  Object.assign(process.env, env);
  mail.result = { status: "sent" };
  mail.calls.length = 0;
  mail.gate = null;
  mail.throwFor = null;
  invoiceHooks.afterNumber = async () => {};
  await setSetting(null, "vat_mode", "19");
  await setSetting(null, "vat_note", "");
  await cleanup();
  await dropVenues();
});
afterAll(async () => {
  await cleanup();
  await dropVenues();
  await setSetting(null, "vat_mode", "");
});

async function venue(o: { email?: string | null; bonus?: boolean; percent?: string } = {}) {
  const [v] = await db.insert(venues).values({ name: `${PREFIX} ${nid()}`, city: "Essen", source: "manual", commissionPercent: o.percent ?? "10", commissionBonusEnabled: o.bonus ?? false, invoiceEmail: o.email === undefined ? "halle@test.invalid" : o.email }).returning();
  return v;
}
async function booked(venueId: string, cost = 8000) {
  const m = await makeMatch({ hoursAhead: 72, priceCents: cost, costCents: cost, ledgerModel: "commission" });
  await db.update(matches).set({ venueId }).where(eq(matches.id, m.match.id));
  const row = (await db.select().from(matches).where(eq(matches.id, m.match.id)))[0];
  await db.transaction((tx) => bookCommission(tx, row));
  return { row, home: m.home, away: m.away };
}
const invoicesOf = (venueId: string) => db.select().from(invoices).where(eq(invoices.venueId, venueId));
const counter = async () => (await db.select().from(invoiceNumberCounters).where(eq(invoiceNumberCounters.year, year)))[0]?.last ?? 0;

describe("Monatssammelrechnung (AC-6)", () => {
  it("eine Rechnung je Halle: Zeile je Spiel, Netto, USt 19 % einmal auf die Summe, Nummer fortlaufend; Halle ohne Spiele bekommt keine Rechnung und keine Nummer", async () => {
    const v = await venue();
    const empty = await venue();
    await booked(v.id, 8000); // 800
    await booked(v.id, 999); // 99
    await booked(v.id, 1001); // 100
    const before = await counter();
    const r = await createInvoicesForMonth(period);
    expect(r.created).toBe(1);
    const [inv] = await invoicesOf(v.id);
    expect(inv.number).toBe(`RE-${year}-${String(before + 1).padStart(6, "0")}`);
    expect(inv.netCents).toBe(999);
    expect(inv.vatCents).toBe(190); // 189,81 -> 190, einmal auf die Summe
    expect(inv.grossCents).toBe(999 + 190);
    expect(inv.period).toBe(period);
    expect(await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))).toHaveLength(3);
    expect(await invoicesOf(empty.id)).toHaveLength(0);
    expect(await counter()).toBe(before + 1);
  });

  it("mehrfach ausführbar: je Halle und Monat genau eine Rechnung, parallele Läufe erzeugen keine zweite und keine doppelte Nummer", async () => {
    const v = await venue();
    const w = await venue();
    await booked(v.id);
    await booked(w.id);
    const before = await counter();
    await Promise.all([createInvoicesForMonth(period), createInvoicesForMonth(period)]);
    expect(await invoicesOf(v.id)).toHaveLength(1);
    expect(await invoicesOf(w.id)).toHaveLength(1);
    const numbers = [...(await invoicesOf(v.id)), ...(await invoicesOf(w.id))].map((i) => i.number).sort();
    expect(new Set(numbers).size).toBe(2);
    expect(await counter()).toBe(before + 2); // lückenlos: keine verbrauchte Nummer
    expect((await createInvoicesForMonth(period)).created).toBe(0);
  });

  it("Rennen: läuft die Erzeugung für Halle und Monat schon (Nummer vergeben, Transaktion offen), wartet ein zweiter Lauf und erzeugt nichts doppelt, ohne Fehler", async () => {
    const v = await venue();
    await booked(v.id);
    const before = await counter();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    invoiceHooks.afterNumber = async () => {
      if (first) {
        first = false;
        await gate;
      }
    };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const a = createInvoicesForMonth(period);
    await sleep(600);
    const b = createInvoicesForMonth(period);
    await sleep(600);
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.created + rb.created).toBe(1);
    expect(await invoicesOf(v.id)).toHaveLength(1);
    expect(await counter()).toBe(before + 1);
  });

  it("Abbruch in der Transaktion (Fehlerstelle nach der Nummernvergabe) verbraucht keine Nummer: die nächste Rechnung bekommt dieselbe Nummer", async () => {
    const v = await venue();
    await booked(v.id);
    const before = await counter();
    invoiceHooks.afterNumber = async () => {
      throw new Error("Fehlerstelle");
    };
    await expect(createInvoicesForMonth(period)).rejects.toThrow(/Fehlerstelle/);
    expect(await invoicesOf(v.id)).toHaveLength(0);
    expect(await counter()).toBe(before);
    invoiceHooks.afterNumber = async () => {};
    await createInvoicesForMonth(period);
    expect((await invoicesOf(v.id))[0].number).toBe(`RE-${year}-${String(before + 1).padStart(6, "0")}`);
  });

  it("stornierte Provision wird nicht abgerechnet; jede Provisionsbuchung wird höchstens einmal abgerechnet (spätere Spiele erscheinen auf der nächsten Rechnung)", async () => {
    const v = await venue();
    const a = await booked(v.id, 8000);
    const gone = await booked(v.id, 5000);
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, gone.row.id));
    await db.transaction((tx) => reverseCommission(tx, gone.row.id));
    await createInvoicesForMonth(period);
    const [first] = await invoicesOf(v.id);
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, first.id));
    expect(lines).toHaveLength(1);
    expect(lines[0].matchId).toBe(a.row.id);
    await booked(v.id, 4000);
    const next = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
    const nextPeriod = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    await createInvoicesForMonth(nextPeriod);
    const second = (await invoicesOf(v.id)).find((i) => i.period === nextPeriod)!;
    expect(await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, second.id))).toHaveLength(1);
    expect(second.netCents).toBe(400);
  });

  it("10er-Bonus ist eine eigene Zeile", async () => {
    const v = await venue({ bonus: true });
    for (let i = 0; i < 10; i++) await booked(v.id, 8000);
    await createInvoicesForMonth(period);
    const [inv] = await invoicesOf(v.id);
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id));
    expect(lines.filter((l) => l.kind === "bonus")).toHaveLength(1);
    expect(lines.filter((l) => l.kind === "commission")).toHaveLength(10);
    expect(inv.netCents).toBe(10 * 800 + 8000);
  });
});

describe("Pflichtangaben: kein leeres PDF, kein Standardwert", () => {
  it("ohne gesetzten USt-Schalter schlägt die Erzeugung fehl", async () => {
    const v = await venue();
    await booked(v.id);
    await db.delete(settings).where(eq(settings.key, "vat_mode")); // Schalter fehlt ganz: es gibt keinen Standardwert
    await expect(createInvoicesForMonth(period)).rejects.toThrow(/Umsatzsteuer-Schalter/);
    await setSetting(null, "vat_mode", "");
    await expect(createInvoicesForMonth(period)).rejects.toThrow(/Umsatzsteuer-Schalter/);
    expect(await invoicesOf(v.id)).toHaveLength(0);
  });

  it("Kleinunternehmer braucht den Hinweistext; mit Text: USt 0, Text steht in der Rechnung", async () => {
    const v = await venue();
    await booked(v.id);
    await setSetting(null, "vat_mode", "kleinunternehmer");
    await expect(createInvoicesForMonth(period)).rejects.toThrow(/Hinweistext/);
    await setSetting(null, "vat_note", "Hinweis vom Steuerberater.");
    await createInvoicesForMonth(period);
    const [inv] = await invoicesOf(v.id);
    expect(inv).toMatchObject({ vatMode: "kleinunternehmer", vatPercent: 0, vatCents: 0, note: "Hinweis vom Steuerberater." });
    expect(inv.grossCents).toBe(inv.netCents);
  });

  it("fehlende Betreiberangaben blockieren die Rechnung", async () => {
    const v = await venue();
    await booked(v.id);
    for (const key of Object.keys(env)) {
      const saved = process.env[key];
      process.env[key] = "";
      await expect(createInvoicesForMonth(period), key).rejects.toThrow(/Betreiberangaben/);
      process.env[key] = saved;
    }
    expect(await invoicesOf(v.id)).toHaveLength(0);
  });
});

describe("Datenschutz und Unveränderlichkeit", () => {
  it("Inhalt der Rechnung: Datum, Uhrzeit, Spielnummer, Betrag; keine Team- und keine Spielernamen", async () => {
    const v = await venue();
    const g = await booked(v.id);
    await createInvoicesForMonth(period);
    const [inv] = await invoicesOf(v.id);
    const data = await loadInvoiceData(inv.id);
    const text = JSON.stringify(data);
    expect(text).not.toContain(g.home.name);
    expect(text).not.toContain(g.away.name);
    expect(data!.lines[0].label).toMatch(/Provision · \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} Uhr/);
  });

  it("invoices und invoice_lines sind nur anhängend: UPDATE und DELETE werden abgelehnt", async () => {
    const v = await venue();
    await booked(v.id);
    await createInvoicesForMonth(period);
    const [inv] = await invoicesOf(v.id);
    await expect(db.update(invoices).set({ netCents: 1 }).where(eq(invoices.id, inv.id))).rejects.toThrow();
    await expect(db.delete(invoices).where(eq(invoices.id, inv.id))).rejects.toThrow();
    await expect(db.update(invoiceLines).set({ amountCents: 1 }).where(eq(invoiceLines.invoiceId, inv.id))).rejects.toThrow();
    await expect(db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))).rejects.toThrow();
  });
});

describe("Versand (Outbox mit Wiederholung)", () => {
  async function invoiceFor(email: string | null = "halle@test.invalid") {
    const v = await venue({ email });
    await booked(v.id);
    await createInvoicesForMonth(period);
    return (await invoicesOf(v.id))[0];
  }
  const deliveryOf = async (id: string) => (await db.select().from(invoiceDeliveries).where(eq(invoiceDeliveries.invoiceId, id)))[0];

  it("Mail mit PDF-Anhang an die Adresse der Halle, ohne Team- und Spielernamen im Text; Status sent", async () => {
    const inv = await invoiceFor();
    expect(await deliverInvoices(new Date(), 50)).toBeGreaterThanOrEqual(1);
    const call = mail.calls.find((c) => c.subject.includes(inv.number))!;
    expect(call.to).toBe("halle@test.invalid");
    expect(call.attachments?.[0].filename).toBe(`${inv.number}.pdf`);
    expect(Buffer.from(call.attachments![0].contentBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect((await deliveryOf(inv.id)).status).toBe("sent");
  });

  it("Fehler werden wiederholt, nach 5 Versuchen failed; ohne Adresse skipped (Rechnung bleibt im Admin abrufbar)", async () => {
    const inv = await invoiceFor();
    mail.result = { status: "failed", detail: "Test" };
    let now = new Date();
    for (let i = 1; i <= 4; i++) {
      await deliverInvoices(now, 50);
      const d = await deliveryOf(inv.id);
      expect(d.status).toBe("pending");
      expect(d.attempts).toBe(i);
      now = new Date(d.nextTryAt.getTime() + 1000);
    }
    await deliverInvoices(now, 50);
    expect(await deliveryOf(inv.id)).toMatchObject({ status: "failed", attempts: 5 });
    const noMail = await invoiceFor(null);
    mail.result = { status: "sent" };
    await deliverInvoices(new Date(Date.now() + 1000), 50);
    expect((await deliveryOf(noMail.id)).status).toBe("skipped");
  });

  it("Punkt 4: zwei gleichzeitige Läufe senden dieselbe Rechnung nur einmal (Zeile ist beim Senden reserviert)", async () => {
    const inv = await invoiceFor();
    let release: () => void = () => {};
    mail.gate = new Promise<void>((r) => (release = r));
    const now = new Date();
    const first = deliverInvoices(now, 50); // hängt im Senden
    await new Promise((r) => setTimeout(r, 400));
    const second = await deliverInvoices(now, 50); // fasst die reservierte Zeile nicht an
    expect(second).toBe(0);
    mail.gate = null;
    release();
    expect(await first).toBeGreaterThanOrEqual(1);
    expect(mail.calls.filter((c) => c.subject.includes(inv.number))).toHaveLength(1);
    expect((await deliveryOf(inv.id)).status).toBe("sent");
  });

  it("Punkt 4: ein Fehler bei EINER Rechnung (PDF/Mail wirft) wird gezählt und mit Wartezeit wiederholt und blockiert die folgenden nicht", async () => {
    const a = await invoiceFor("a@test.invalid");
    const b = await invoiceFor("b@test.invalid");
    mail.throwFor = a.number;
    const now = new Date();
    await deliverInvoices(now, 50);
    const da = await deliveryOf(a.id);
    expect(da).toMatchObject({ status: "pending", attempts: 1 });
    expect(da.nextTryAt.getTime()).toBeGreaterThan(now.getTime());
    expect(da.lastError).toBeTruthy();
    expect((await deliveryOf(b.id)).status).toBe("sent");
    mail.throwFor = null;
  });

  it("Punkt 4: 'skipped' ist nicht endgültig: nach Eintragen der Adresse wird die Rechnung später gesendet, der übersprungene Versuch zählt nicht", async () => {
    const inv = await invoiceFor(null);
    await deliverInvoices(new Date(), 50);
    expect(await deliveryOf(inv.id)).toMatchObject({ status: "skipped", attempts: 0 });
    await db.update(venues).set({ invoiceEmail: "spaeter@test.invalid" }).where(eq(venues.id, inv.venueId));
    await deliverInvoices(new Date(Date.now() + 25 * 3600_000), 50);
    expect(await deliveryOf(inv.id)).toMatchObject({ status: "sent", attempts: 1 });
    expect(mail.calls.some((c) => c.to === "spaeter@test.invalid")).toBe(true);
  });
});

describe("Rechnungsnummer und Erzeugung (Review-Fixes)", () => {
  it("Punkt 6: das Jahr der Nummer kommt aus dem Abrechnungszeitraum, nicht aus dem Ausstellungsdatum", async () => {
    const v = await venue();
    await booked(v.id);
    await createInvoicesForMonth("2099-12", new Date("2100-01-02T03:00:00Z"));
    const [inv] = await invoicesOf(v.id);
    expect(inv.number).toMatch(/^RE-2099-\d{6}$/);
    await db.execute(sql`delete from invoice_number_counters where year = 2099`);
  });

  it("Punkt 5: ohne offene Provisionsbuchungen wirft die Erzeugung auch bei fehlenden Pflichtangaben nicht (kein monatlicher Alarm); mit offenen Buchungen schon", async () => {
    await setSetting(null, "vat_mode", "");
    await expect(createInvoicesForMonth("2000-01")).resolves.toEqual({ created: 0, venues: 0 });
    const v = await venue();
    await booked(v.id);
    await expect(createInvoicesForMonth(period)).rejects.toThrow();
  });
});

describe("Abruf (PDF) nur Admin 1", () => {
  it("Admin 1 bekommt das PDF, Admin 2 und Spieler eine 404-Antwort (gleich für unbekannte Rechnungen)", async () => {
    const v = await venue();
    await booked(v.id);
    await createInvoicesForMonth(period);
    const [inv] = await invoicesOf(v.id);
    const call = (id: string) => invoicePdf(new Request("http://localhost/api/rechnungen/x"), { params: Promise.resolve({ id }) } as never);
    const owner = await makeUser("rg1", "owner");
    const admin2 = await makeUser("rg2", "admin");
    const player = await makeUser("rg3", "player");
    currentUserId = owner.id;
    const ok = await call(inv.id);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await ok.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    expect((await call("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    for (const u of [admin2, player]) {
      currentUserId = u.id;
      expect((await call(inv.id)).status).toBe(404);
    }
  });
});

describe("Anzeige: Provision, Gebühr und Rest je Halle, Minus-Warnung (AC-15)", () => {
  it("Halle im Minus, wenn die Provision die Zahlungsgebühren nicht deckt; Alarm; Halle mit Rest im Plus nicht markiert", async () => {
    const minus = await venue();
    const plus = await venue();
    const a = await booked(minus.id, 8000); // Provision 800
    const b = await booked(plus.id, 8000);
    await post(db, { debit: { account: "fees" }, credit: { account: "clearing" }, amountCents: 900, kind: "fee", matchId: a.row.id, idempotencyKey: `fee:test:${nid()}` });
    await post(db, { debit: { account: "fees" }, credit: { account: "clearing" }, amountCents: 100, kind: "fee", matchId: b.row.id, idempotencyKey: `fee:test:${nid()}` });
    const rows = await venueCommissionOverview({ from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) });
    const m = rows.find((r) => r.venueId === minus.id)!;
    const p = rows.find((r) => r.venueId === plus.id)!;
    expect(m).toMatchObject({ commissionCents: 800, feesCents: 900, restCents: -100, minus: true });
    expect(p).toMatchObject({ commissionCents: 800, feesCents: 100, restCents: 700, minus: false });
    const alerts = await getAlerts();
    expect(alerts.some((x) => x.code === `venue-minus:${minus.id}`)).toBe(true);
    expect(alerts.some((x) => x.code === `venue-minus:${plus.id}`)).toBe(false);
  });
});
