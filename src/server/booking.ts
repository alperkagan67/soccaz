import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { db } from "@/db";
import { matches, teams, users } from "@/db/schema";
import { bookingJobs, expenses, priceRules, venues } from "@/db/schema-finance";
import { audit } from "./audit";
import { getAgent } from "./booking-agent";
import { post } from "./ledger";
import { teamName } from "./names";
import { notifyUsers } from "./notifications";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

type MatchRow = typeof matches.$inferSelect;
export type BookingStatus = typeof bookingJobs.$inferSelect.status;

/** Erlaubte Übergänge. "withdrawn" setzt nur das System (Spiel abgesagt). */
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  open: ["in_progress", "unavailable"],
  in_progress: ["booked", "unavailable", "open"],
  booked: ["confirmed", "in_progress"],
  unavailable: ["in_progress", "open"],
  confirmed: ["done"],
  withdrawn: [],
  done: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

async function bookingStaffIds(tx: Pick<typeof db, "select">): Promise<string[]> {
  const rows = await tx.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "booking"]));
  return rows.map((r) => r.id);
}

/** Legt den Buchungsauftrag an, sobald ein Spiel bestätigt ist, und informiert die zuständigen Admins. Ein Auftrag pro Spiel. */
export async function createBookingJob(tx: Tx, match: MatchRow) {
  const [job] = await tx.insert(bookingJobs).values({ matchId: match.id, venueId: match.venueId }).onConflictDoNothing({ target: bookingJobs.matchId }).returning();
  if (!job) return null;
  await audit(null, "booking.create", "match", match.id, { after: { jobId: job.id } }, tx);
  await notifyUsers(
    await bookingStaffIds(tx),
    {
      type: "admin.task",
      title: "Halle buchen",
      body: `${await teamName(tx, match.homeTeamId)} gegen ${await teamName(tx, match.awayTeamId)} ist bestätigt und bezahlt. Bitte die Halle buchen.`,
      url: "/admin/buchungen",
    },
    tx,
  );
  return job;
}

/** Zieht den Auftrag zurück, wenn das Spiel abgesagt wird. */
export async function withdrawBookingJob(tx: Tx, matchId: string) {
  const [job] = await tx.select().from(bookingJobs).where(eq(bookingJobs.matchId, matchId));
  if (!job || job.status === "withdrawn" || job.status === "done") return;
  await tx.update(bookingJobs).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(bookingJobs.id, job.id));
  const hallAlreadyBooked = job.status === "booked" || job.status === "confirmed";
  await audit(null, "booking.withdraw", "match", matchId, { before: { status: job.status } }, tx);
  await notifyUsers(
    await bookingStaffIds(tx),
    {
      type: "admin.task",
      title: hallAlreadyBooked ? "Halle stornieren" : "Buchung entfällt",
      body: hallAlreadyBooked ? "Ein gebuchtes Spiel wurde abgesagt. Bitte die Halle stornieren (Kosten prüfen)." : "Ein Spiel wurde vor der Buchung abgesagt.",
      url: "/admin/buchungen",
    },
    tx,
  );
}

export async function listBookingJobs(filter: { status?: string } = {}) {
  await connection();
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  return db
    .select({
      id: bookingJobs.id,
      status: bookingJobs.status,
      note: bookingJobs.note,
      proofUrl: bookingJobs.proofUrl,
      venueId: bookingJobs.venueId,
      venueName: venues.name,
      assignee: users.name,
      matchId: matches.id,
      startsAt: matches.startsAt,
      durationMin: matches.durationMin,
      priceCents: matches.priceCents,
      costCents: matches.costCents,
      homeName: home.name,
      awayName: away.name,
      updatedAt: bookingJobs.updatedAt,
    })
    .from(bookingJobs)
    .innerJoin(matches, eq(matches.id, bookingJobs.matchId))
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .leftJoin(venues, eq(venues.id, bookingJobs.venueId))
    .leftJoin(users, eq(users.id, bookingJobs.assigneeId))
    .where(filter.status && filter.status !== "all" ? eq(bookingJobs.status, filter.status as BookingStatus) : or(eq(bookingJobs.status, "open"), eq(bookingJobs.status, "in_progress"), eq(bookingJobs.status, "booked"), eq(bookingJobs.status, "unavailable"), eq(bookingJobs.status, "confirmed")))
    .orderBy(matches.startsAt)
    .limit(100);
}

export type BookingPatch = { status?: BookingStatus; venueId?: string | null; note?: string | null; proofUrl?: string | null };

/** Admin bearbeitet einen Buchungsauftrag. Beim Buchen wird die Halle am Spiel hinterlegt und die Hallenkosten aus der Preisregel übernommen. */
export async function updateBookingJob(actorId: string, jobId: string, patch: BookingPatch) {
  await db.transaction(async (tx) => {
    const [job] = await tx.select().from(bookingJobs).where(eq(bookingJobs.id, jobId)).for("update");
    if (!job) throw new DomainError("Auftrag nicht gefunden.");
    if (job.status === "withdrawn" || job.status === "done") throw new DomainError("Dieser Auftrag ist abgeschlossen.");

    const next = patch.status ?? job.status;
    if (!canTransition(job.status, next)) throw new DomainError("Dieser Statuswechsel ist nicht erlaubt.");
    const venueId = patch.venueId === undefined ? job.venueId : patch.venueId;
    if ((next === "booked" || next === "confirmed") && !venueId) throw new DomainError("Bitte zuerst eine Halle auswählen.");
    if (patch.proofUrl && !/^https?:\/\//.test(patch.proofUrl)) throw new DomainError("Der Nachweis muss ein Link sein (http oder https).");

    await tx
      .update(bookingJobs)
      .set({
        status: next,
        venueId,
        note: patch.note === undefined ? job.note : patch.note,
        proofUrl: patch.proofUrl === undefined ? job.proofUrl : patch.proofUrl,
        assigneeId: job.assigneeId ?? actorId,
        updatedAt: new Date(),
      })
      .where(eq(bookingJobs.id, jobId));

    if (venueId && (next === "booked" || next === "confirmed")) {
      const [venue] = await tx.select().from(venues).where(eq(venues.id, venueId));
      if (!venue) throw new DomainError("Halle nicht gefunden.");
      const [m] = await tx.select().from(matches).where(eq(matches.id, job.matchId)).for("update");
      const [rule] = await tx
        .select({ costCents: priceRules.costCents })
        .from(priceRules)
        .where(and(eq(priceRules.venueId, venueId), eq(priceRules.durationMin, m.durationMin)))
        .orderBy(desc(priceRules.validFrom))
        .limit(1);
      await tx
        .update(matches)
        .set({
          venueId,
          venueText: m.venueText || [venue.name, venue.address].filter(Boolean).join(", "),
          ...(rule ? { costCents: rule.costCents } : {}),
        })
        .where(eq(matches.id, m.id));
      await tx.execute(sql`select pg_notify('lobby', ${m.id})`);
    }
    await audit(actorId, "booking.update", "match", job.matchId, { before: { status: job.status, venueId: job.venueId }, after: { status: next, venueId, note: patch.note, proofUrl: patch.proofUrl } }, tx);
  });
}

/** Hallenkosten als Ausgabe erfassen: Eintrag in `expenses` und Buchung (Hallenkosten an Bank). */
export async function recordExpense(
  actorId: string,
  input: { matchId?: string | null; kind: "venue" | "other"; amountCents: number; note?: string | null; receiptUrl?: string | null; paidOn?: string },
) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 5_000_000) throw new DomainError("Bitte einen gültigen Betrag angeben.");
  if (input.receiptUrl && !/^https?:\/\//.test(input.receiptUrl)) throw new DomainError("Der Beleg muss ein Link sein (http oder https).");
  return db.transaction(async (tx) => {
    if (input.matchId) {
      const [m] = await tx.select({ id: matches.id }).from(matches).where(eq(matches.id, input.matchId));
      if (!m) throw new DomainError("Spiel nicht gefunden.");
    }
    const [row] = await tx
      .insert(expenses)
      .values({ matchId: input.matchId ?? null, kind: input.kind, amountCents: input.amountCents, note: input.note ?? null, receiptUrl: input.receiptUrl ?? null, paidOn: input.paidOn ?? new Date().toISOString().slice(0, 10), createdBy: actorId })
      .returning();
    const entry = await post(tx, {
      debit: { account: "venue_cost" },
      credit: { account: "bank" },
      amountCents: input.amountCents,
      kind: "venue_cost",
      matchId: input.matchId ?? null,
      reason: input.note ?? (input.kind === "venue" ? "Hallenmiete" : "Ausgabe"),
      idempotencyKey: `expense:${row.id}`,
      actorId,
    });
    await tx.update(expenses).set({ ledgerEntryId: entry.id }).where(eq(expenses.id, row.id));
    await audit(actorId, "expense.create", input.matchId ? "match" : "expense", input.matchId ?? row.id, { after: { ...row, ledgerEntryId: entry.id } }, tx);
    return row;
  });
}

/** Lässt den Agenten offene Aufträge versuchen. Ohne Agent (Standard) passiert nichts. */
export async function runBookingAgent(): Promise<number> {
  const agent = getAgent();
  if (agent.name === "manual") return 0;
  const open = await db
    .select({ id: bookingJobs.id, matchId: bookingJobs.matchId, note: bookingJobs.note, venueName: venues.name, venueContact: venues.contact, startsAt: matches.startsAt, durationMin: matches.durationMin })
    .from(bookingJobs)
    .innerJoin(matches, eq(matches.id, bookingJobs.matchId))
    .leftJoin(venues, eq(venues.id, bookingJobs.venueId))
    .where(eq(bookingJobs.status, "open"));
  let handled = 0;
  for (const j of open) {
    const result = await agent.attempt({ jobId: j.id, matchId: j.matchId, startsAt: j.startsAt, durationMin: j.durationMin, venueName: j.venueName, venueContact: j.venueContact, note: j.note });
    if (result.status === "skipped") continue;
    await db.update(bookingJobs).set({ status: result.status === "booked" ? "booked" : "unavailable", note: result.note ?? j.note, proofUrl: result.proofUrl ?? null, updatedAt: new Date() }).where(eq(bookingJobs.id, j.id));
    await audit(null, `booking.agent.${result.status}`, "match", j.matchId, { after: result });
    handled += 1;
  }
  return handled;
}
