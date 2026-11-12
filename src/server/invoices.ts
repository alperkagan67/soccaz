import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { invoiceDeliveries, invoiceLines, invoiceNumberCounters, invoices, venues } from "@/db/schema-finance";
import { invoiceNumber, isPeriod, parseVatMode, previousPeriod, vatCentsOf, vatPercentOf, type VatMode } from "@/lib/invoice";
import { operator } from "@/lib/legal";
import { audit } from "./audit";
import { monthPeriod } from "./finance";
import { notifyUsers } from "./notifications";
import { sendEmail } from "./providers/email";
import { getSetting } from "./settings";
import { DomainError } from "./teams";

/** Testnaht: wird in der Rechnungs-Transaktion NACH der Nummernvergabe aufgerufen (Fehlerstellen-Test: eine abgebrochene Transaktion verbraucht keine Nummer). */
export const invoiceHooks = { afterNumber: async (): Promise<void> => {} };

const MAX_ATTEMPTS = 5;

export type InvoiceSettings = {
  mode: VatMode;
  /** Hinweistext auf der Rechnung (z. B. für Kleinunternehmer); der Wortlaut kommt vom Steuerberater, nichts davon steht im Code. */
  note: string | null;
  operator: { name: string; address: string; email: string; taxId: string };
};

/**
 * Pflichtangaben für eine Rechnung. Fehlt der USt-Schalter (kein Standardwert!), der Hinweistext bei Kleinunternehmer oder eine Betreiberangabe, schlägt die Erzeugung fehl:
 * es entsteht nie ein leeres oder unvollständiges PDF.
 */
export async function invoiceSettings(): Promise<InvoiceSettings> {
  const mode = parseVatMode(await getSetting<unknown>("vat_mode", ""));
  if (!mode) throw new DomainError("Der Umsatzsteuer-Schalter ist nicht gesetzt (Einstellungen). Ohne ihn werden keine Rechnungen erzeugt.");
  const note = (await getSetting<string>("vat_note", ""))?.trim() || null;
  if (mode === "kleinunternehmer" && !note) throw new DomainError("Für Kleinunternehmer fehlt der Hinweistext auf der Rechnung (Einstellungen, Wortlaut vom Steuerberater).");
  const op = operator();
  const taxId = process.env.OPERATOR_TAX_ID?.trim();
  if (!op.name || !op.address || !op.email || !taxId) throw new DomainError("Die Betreiberangaben fehlen (OPERATOR_NAME, OPERATOR_ADDRESS, OPERATOR_EMAIL, OPERATOR_TAX_ID). Ohne sie werden keine Rechnungen erzeugt.");
  return { mode, note, operator: { name: op.name, address: op.address, email: op.email, taxId } };
}

type Candidate = { entryId: string; kind: "commission" | "bonus"; amountCents: number; matchId: string | null; startsAt: Date | null; gameNumber: number | null };

/** Noch nicht abgerechnete Provisionsbuchungen einer Halle bis zum Ende des Zeitraums; stornierte Provisionen werden nicht abgerechnet. */
async function candidatesFor(tx: Pick<typeof db, "execute">, venueId: string, until: Date): Promise<Candidate[]> {
  const res = await tx.execute(sql`
    select l.id as entry_id, l.kind, l.amount_cents, l.match_id, m.starts_at, m.number as game_number
    from ledger_entries l
    join match_commissions mc on mc.match_id = l.match_id and mc.venue_id = ${venueId}
    join matches m on m.id = l.match_id
    where l.kind in ('commission', 'commission_bonus')
      and l.at < ${until}
      and not exists (select 1 from invoice_lines il where il.ledger_entry_id = l.id)
      and not (l.kind = 'commission' and exists (select 1 from ledger_entries r where r.reverses_entry_id = l.id))
    order by m.starts_at, l.at`);
  return (res.rows as { entry_id: string; kind: string; amount_cents: number; match_id: string | null; starts_at: Date | null; game_number: number | null }[]).map((r) => ({
    entryId: r.entry_id,
    kind: r.kind === "commission_bonus" ? "bonus" : "commission",
    amountCents: r.amount_cents,
    matchId: r.match_id,
    startsAt: r.starts_at ? new Date(r.starts_at) : null,
    gameNumber: r.game_number,
  }));
}

/** Eine Rechnung für eine Halle und einen Monat in EINER Transaktion: Nummer + Kopf + Zeilen + Versand-Auftrag. Keine Nummer ohne Zeilen, genau eine Rechnung je Halle und Monat. */
async function createForVenue(venueId: string, period: string, until: Date, s: InvoiceSettings, now: Date): Promise<{ created: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`invoice:${venueId}:${period}`}, 0))`);
    const [dup] = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.venueId, venueId), eq(invoices.period, period)));
    if (dup) return { created: false };
    const lines = await candidatesFor(tx, venueId, until);
    if (lines.length === 0) return { created: false }; // Halle ohne Spiele: keine Rechnung, keine Nummer
    const net = lines.reduce((sum, l) => sum + l.amountCents, 0);
    if (net <= 0) return { created: false };

    const year = Number(period.slice(0, 4)); // Rechnungsjahr = Abrechnungsjahr des Zeitraums, nicht das Ausstellungsjahr (S2 offen)
    await tx.insert(invoiceNumberCounters).values({ year, last: 0 }).onConflictDoNothing();
    const [counter] = await tx.select().from(invoiceNumberCounters).where(eq(invoiceNumberCounters.year, year)).for("update");
    const n = counter.last + 1;
    await tx.update(invoiceNumberCounters).set({ last: n }).where(eq(invoiceNumberCounters.year, year));
    await invoiceHooks.afterNumber();

    const vat = vatCentsOf(net, s.mode);
    const [inv] = await tx
      .insert(invoices)
      .values({ number: invoiceNumber(year, n), venueId, period, vatMode: s.mode, vatPercent: vatPercentOf(s.mode), netCents: net, vatCents: vat, grossCents: net + vat, note: s.note, issuedAt: now })
      .returning();
    await tx.insert(invoiceLines).values(lines.map((l) => ({ invoiceId: inv.id, kind: l.kind, ledgerEntryId: l.entryId, matchId: l.matchId, gameStartsAt: l.startsAt, gameNumber: l.gameNumber, amountCents: l.amountCents })));
    await tx.insert(invoiceDeliveries).values({ invoiceId: inv.id });
    await audit(null, "invoice.create", "invoice", inv.id, { after: { number: inv.number, venueId, period, netCents: net, vatCents: vat, lines: lines.length } }, tx);
    return { created: true };
  });
}

/**
 * Erzeugt die Monatsrechnungen (Vertrag 009 M2, AC-6): je Halle mit offenen Provisionsbuchungen bis zum Monatsende eine Sammelrechnung. Mehrfach ausführbar: je Halle und Monat
 * entsteht genau eine Rechnung. Fehlende Pflichtangaben brechen vor der ersten Rechnung ab (DomainError).
 */
export async function createInvoicesForMonth(period: string, now: Date = new Date()): Promise<{ created: number; venues: number }> {
  if (!isPeriod(period)) throw new DomainError("Ungültiger Zeitraum (JJJJ-MM).");
  const range = monthPeriod(period)!;
  const res = await db.execute(sql`
    select distinct mc.venue_id
    from ledger_entries l join match_commissions mc on mc.match_id = l.match_id
    where l.kind in ('commission', 'commission_bonus') and l.at < ${range.to}
      and not exists (select 1 from invoice_lines il where il.ledger_entry_id = l.id)`);
  const venueIds = (res.rows as { venue_id: string }[]).map((r) => r.venue_id);
  if (venueIds.length === 0) return { created: 0, venues: 0 }; // nichts abzurechnen: keine Pflichtangaben nötig, kein Alarm
  const s = await invoiceSettings();
  let created = 0;
  for (const venueId of venueIds) if ((await createForVenue(venueId, period, range.to, s, now)).created) created += 1;
  return { created, venues: venueIds.length };
}

/** Job am 1. des Monats: Vormonat abrechnen; ein Fehler (z. B. fehlende Pflichtangaben) wird Admin 1 als Aufgabe gemeldet statt still zu bleiben. */
export async function runInvoiceMonth(now: Date = new Date()): Promise<number> {
  try {
    return (await createInvoicesForMonth(previousPeriod(now), now)).created;
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    const owners = (await db.select({ id: users.id }).from(users).where(and(eq(users.isOwner, true), sql`${users.bannedAt} is null`))).map((u) => u.id);
    if (owners.length === 0) console.error("Rechnungen nicht erzeugt (kein Admin 1):", error.message);
    else await notifyUsers(owners, { type: "admin.task", title: "Rechnungen nicht erzeugt", body: error.message, url: "/admin/einstellungen" });
    return 0;
  }
}

const TZ = "Europe/Berlin";
const day = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const clock = (d: Date) => d.toLocaleTimeString("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export type InvoiceData = {
  number: string;
  issuedAt: Date;
  period: string;
  venueName: string;
  venueAddress: string | null;
  operator: InvoiceSettings["operator"];
  lines: { label: string; amountCents: number }[];
  vatMode: VatMode;
  vatPercent: number;
  netCents: number;
  vatCents: number;
  grossCents: number;
  note: string | null;
};

/** Inhalt der Rechnung aus den festgehaltenen Zeilen: Datum, Uhrzeit, Spielnummer, Betrag. KEINE Team- und KEINE Spielernamen (Datenschutz, Vertrag 011). */
export async function loadInvoiceData(invoiceId: string): Promise<InvoiceData | null> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return null;
  const [venue] = await db.select({ name: venues.name, address: venues.address }).from(venues).where(eq(venues.id, inv.venueId));
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)).orderBy(asc(invoiceLines.gameStartsAt), asc(invoiceLines.id));
  const op = operator();
  return {
    number: inv.number,
    issuedAt: inv.issuedAt,
    period: inv.period,
    venueName: venue?.name ?? "",
    venueAddress: venue?.address ?? null,
    operator: { name: op.name ?? "", address: op.address ?? "", email: op.email ?? "", taxId: process.env.OPERATOR_TAX_ID?.trim() ?? "" },
    lines: lines.map((l) => ({
      label: `${l.kind === "bonus" ? "10er-Bonus" : "Provision"} · ${l.gameStartsAt ? `${day(l.gameStartsAt)}, ${clock(l.gameStartsAt)} Uhr` : "Spiel"}${l.gameNumber ? ` · Spiel ${l.gameNumber}` : ""}`,
      amountCents: l.amountCents,
    })),
    vatMode: inv.vatMode,
    vatPercent: inv.vatPercent,
    netCents: inv.netCents,
    vatCents: inv.vatCents,
    grossCents: inv.grossCents,
    note: inv.note,
  };
}

/** Sperrzeit einer in Arbeit genommenen Zeile: ein zweiter Lauf fasst sie nicht an; stürzt der erste ab, wird sie danach erneut versucht. */
const LEASE_MS = 10 * 60_000;
const RETRY_SKIPPED_MS = 24 * 3600_000;

/**
 * Versand der Rechnungen (Outbox): PDF erzeugen und per Mail an die Adresse der Halle. Die Zeile wird VOR dem Senden reserviert (Versuch gezählt, nächster Versuch erst nach der Sperrzeit),
 * damit zwei Läufe nie dieselbe Rechnung senden. Ein Fehler bei EINER Rechnung (PDF, Daten, Mail) wird gezählt und mit Wartezeit wiederholt (höchstens 5 Versuche) und blockiert die
 * folgenden nicht. "skipped" (keine Adresse, kein Mail-Dienst) ist nicht endgültig: nach einem Tag wird erneut geprüft, der Versuch zählt nicht.
 */
export async function deliverInvoices(now: Date = new Date(), limit = 20): Promise<number> {
  const due = await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      select invoice_id, status, attempts from invoice_deliveries where status in ('pending', 'skipped') and next_try_at <= ${now} order by next_try_at limit ${limit} for update skip locked`);
    const list = rows.rows as { invoice_id: string; status: string; attempts: number }[];
    for (const r of list) {
      await tx.update(invoiceDeliveries).set({ attempts: r.attempts + 1, nextTryAt: new Date(now.getTime() + LEASE_MS), updatedAt: new Date() }).where(eq(invoiceDeliveries.invoiceId, r.invoice_id));
    }
    return list.map((r) => ({ id: r.invoice_id, attempts: r.attempts + 1 }));
  });
  let sent = 0;
  for (const { id, attempts } of due) {
    const finish = (status: "sent" | "skipped" | "failed" | "pending", error: string | null, n: number, next: Date) =>
      db.update(invoiceDeliveries).set({ status, lastError: error, attempts: n, nextTryAt: next, updatedAt: new Date() }).where(eq(invoiceDeliveries.invoiceId, id));
    const fail = (detail: string) => finish(attempts >= MAX_ATTEMPTS ? "failed" : "pending", detail, attempts, new Date(now.getTime() + attempts * 15 * 60_000));
    try {
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
      if (!inv) {
        await fail("Rechnung nicht gefunden.");
        continue;
      }
      const [venue] = await db.select({ email: venues.invoiceEmail }).from(venues).where(eq(venues.id, inv.venueId));
      if (!venue?.email) {
        await finish("skipped", "Keine Rechnungsadresse bei der Halle hinterlegt.", attempts - 1, new Date(now.getTime() + RETRY_SKIPPED_MS));
        continue;
      }
      const data = await loadInvoiceData(id);
      if (!data) {
        await fail("Rechnungsdaten nicht lesbar.");
        continue;
      }
      const { renderInvoicePdf } = await import("./invoice-pdf");
      const pdf = await renderInvoicePdf(data);
      const result = await sendEmail({
        to: venue.email,
        subject: `Rechnung ${data.number} (${data.period})`,
        text: `Im Anhang findest du die Rechnung ${data.number} über die Provision für ${data.period}.`,
        attachments: [{ filename: `${data.number}.pdf`, contentBase64: pdf.toString("base64") }],
      });
      if (result.status === "sent") {
        await finish("sent", null, attempts, now);
        sent += 1;
      } else if (result.status === "skipped") await finish("skipped", result.detail ?? null, attempts - 1, new Date(now.getTime() + RETRY_SKIPPED_MS));
      else await fail(result.detail ?? "Versand fehlgeschlagen");
    } catch (error) {
      await fail(error instanceof Error ? error.message.slice(0, 300) : "Unbekannter Fehler");
    }
  }
  return sent;
}

export async function listInvoices(venueIds?: string[]) {
  return db
    .select({ id: invoices.id, number: invoices.number, period: invoices.period, venueId: invoices.venueId, venueName: venues.name, netCents: invoices.netCents, vatCents: invoices.vatCents, grossCents: invoices.grossCents, issuedAt: invoices.issuedAt })
    .from(invoices)
    .innerJoin(venues, eq(venues.id, invoices.venueId))
    .where(venueIds ? inArray(invoices.venueId, venueIds) : undefined)
    .orderBy(sql`${invoices.issuedAt} desc`)
    .limit(200);
}
