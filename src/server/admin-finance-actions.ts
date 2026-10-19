"use server";

import { revalidatePath } from "next/cache";
import { parseEuro } from "@/lib/money";
import type { ActionState } from "@/lib/validation";
import { recordExpense, updateBookingJob, type BookingPatch, type BookingStatus } from "./booking";
import { manualRefund } from "./finance";
import { createPromo, setPromoActive } from "./promo";
import { requirePermission } from "./session";
import { setSetting } from "./settings";
import { DomainError } from "./teams";
import { addPriceRule, createVenue, listVenues, setVenueManager, setVenueVerified, updateVenue } from "./venues";

type Permission = Parameters<typeof requirePermission>[0];

async function guarded(permission: Permission, path: string, fn: (actorId: string) => Promise<void>): Promise<ActionState> {
  const user = await requirePermission(permission, path);
  try {
    await fn(user.id);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath(path);
  return { ok: true };
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const optional = (fd: FormData, key: string) => text(fd, key) || null;
const euro = (fd: FormData, key: string) => parseEuro(text(fd, key));
const date = (fd: FormData, key: string) => {
  const v = text(fd, key);
  return v ? new Date(v) : null;
};

// --- Rabattcodes (Finanzen) ---

export async function createPromoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const kind = text(fd, "kind") === "fixed" ? "fixed" : "percent";
  const rawValue = kind === "fixed" ? euro(fd, "value") : Number(text(fd, "value"));
  if (rawValue === null || !Number.isFinite(rawValue)) return { error: "Bitte einen gültigen Wert eingeben." };
  const budget = optional(fd, "budget");
  const maxBonus = optional(fd, "maxBonus");
  const minTopup = optional(fd, "minTopup");
  const budgetCents = budget ? parseEuro(budget) : null;
  const maxBonusCents = maxBonus ? parseEuro(maxBonus) : null;
  const minTopupCents = minTopup ? parseEuro(minTopup) : 0;
  if ((budget && budgetCents === null) || (maxBonus && maxBonusCents === null) || (minTopup && minTopupCents === null)) return { error: "Beträge bitte als Euro angeben, z. B. 25,00." };

  return guarded("finance", "/admin/codes", (actor) =>
    createPromo(actor, {
      code: text(fd, "code"),
      kind,
      value: rawValue,
      budgetCents,
      maxBonusCents,
      minTopupCents: minTopupCents ?? 0,
      validFrom: date(fd, "validFrom"),
      validUntil: date(fd, "validUntil"),
      newUsersOnly: fd.get("newUsersOnly") === "on",
      maxPerUser: Number(text(fd, "maxPerUser")) || 1,
      note: optional(fd, "note"),
    }).then(() => undefined),
  );
}

export async function setPromoActiveAction(id: string, active: boolean) {
  return guarded("finance", "/admin/codes", (actor) => setPromoActive(actor, id, active));
}

// --- Ausgaben und Erstattungen (Finanzen) ---

export async function recordExpenseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const cents = euro(fd, "amount");
  if (cents === null) return { error: "Bitte einen Betrag in Euro angeben, z. B. 80,00." };
  const matchId = optional(fd, "matchId");
  return guarded("finance", "/admin/finanzen", (actor) =>
    recordExpense(actor, {
      matchId,
      kind: text(fd, "kind") === "other" ? "other" : "venue",
      amountCents: cents,
      note: optional(fd, "note"),
      receiptUrl: optional(fd, "receiptUrl"),
      paidOn: optional(fd, "paidOn") ?? undefined,
    }).then(() => undefined),
  );
}

export async function manualRefundAction(matchId: string, userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const cents = euro(fd, "amount");
  if (cents === null) return { error: "Bitte einen Betrag in Euro angeben." };
  const result = await guarded("finance", `/admin/finanzen/spiel/${matchId}`, (actor) => manualRefund(actor, matchId, userId, cents, text(fd, "reason")));
  if (result?.ok) revalidatePath("/admin/finanzen");
  return result;
}

// --- Buchungen und Hallen (Hallen-Buchung) ---

export async function updateBookingAction(jobId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const status = text(fd, "status") as BookingStatus;
  const patch: BookingPatch = {
    status: status || undefined,
    venueId: fd.has("venueId") ? optional(fd, "venueId") : undefined,
    note: fd.has("note") ? optional(fd, "note") : undefined,
    proofUrl: fd.has("proofUrl") ? optional(fd, "proofUrl") : undefined,
  };
  return guarded("booking", "/admin/buchungen", (actor) => updateBookingJob(actor, jobId, patch));
}

export async function createVenueAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guarded("booking", "/admin/hallen", (actor) =>
    createVenue(actor, {
      name: text(fd, "name"),
      city: text(fd, "city"),
      address: optional(fd, "address"),
      contact: optional(fd, "contact"),
      surface: optional(fd, "surface"),
      hasShowers: fd.get("hasShowers") === "on",
      hasParking: fd.get("hasParking") === "on",
      isPartner: fd.get("isPartner") === "on",
    }).then(() => undefined),
  );
}

export async function toggleVenueAction(venueId: string, active: boolean, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  void _fd;
  return guarded("booking", "/admin/hallen", async (actor) => {
    const v = (await listVenues()).find((x) => x.id === venueId);
    if (!v) throw new DomainError("Halle nicht gefunden.");
    await updateVenue(actor, venueId, { name: v.name, city: v.city, address: v.address, contact: v.contact, surface: v.surface, hasShowers: v.hasShowers, hasParking: v.hasParking, isPartner: v.isPartner, active });
  });
}

export async function setVenueManagerAction(venueId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return guarded("booking", "/admin/hallen", async (actor) => {
    await setVenueManager(actor, venueId, String(fd.get("email") ?? ""));
  });
}

export async function verifyVenueAction(venueId: string, verified: boolean, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  void _fd;
  return guarded("booking", "/admin/hallen", async (actor) => {
    await setVenueVerified(actor, venueId, verified);
  });
}

// --- Preise (Finanzen) ---

export async function addPriceRuleAction(venueId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const price = euro(fd, "price");
  const cost = euro(fd, "cost");
  if (price === null || cost === null) return { error: "Preis und Kosten bitte in Euro angeben, z. B. 80,00." };
  return guarded("finance", "/admin/hallen", (actor) => addPriceRule(actor, { venueId, durationMin: Number(text(fd, "duration")), priceCents: price, costCents: cost, validFrom: optional(fd, "validFrom") ?? undefined }).then(() => undefined));
}

// --- Einstellungen (Plattform-Admin) ---

export async function savePlatformSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const minPaid = Number(text(fd, "minPaid"));
  if (!Number.isInteger(minPaid) || minPaid < 2 || minPaid > 12) return { error: "Die Mindestzahl zahlender Spieler liegt zwischen 2 und 12." };
  return guarded("admin", "/admin/einstellungen", async (actor) => {
    await setSetting(actor, "payments_enabled", fd.get("paymentsEnabled") === "on");
    await setSetting(actor, "min_paid_players", minPaid);
  });
}
