"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isValidTopup, parseEuro } from "@/lib/money";
import type { ActionState } from "@/lib/validation";
import { activeProvider, completePayment, createTopUp, failPayment, getPaymentFor } from "./payments";
import { previewPromo } from "./promo";
import { requireUser } from "./session";
import { DomainError } from "./teams";

/** Startet die Aufladung und leitet zum Anbieter weiter. */
export async function createTopUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/app/guthaben");
  const cents = parseEuro(String(formData.get("amount") ?? ""));
  if (cents === null || !isValidTopup(cents)) return { error: "Bitte gib einen Betrag zwischen 5,00 und 200,00 Euro ein.", fieldErrors: { amount: "Betrag zwischen 5,00 und 200,00 Euro" } };
  const promo = String(formData.get("promo") ?? "").trim();

  let url: string;
  try {
    ({ url } = await createTopUp(user, cents, promo || undefined, String(formData.get("back") ?? "") || null));
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, fieldErrors: promo ? { promo: error.message } : undefined };
    throw error;
  }
  redirect(url);
}

/** Vorschau für das Rabattcode-Feld: Was bringt der Code bei diesem Betrag? */
export async function previewPromoAction(code: string, amountText: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser("/app/guthaben");
  const cents = parseEuro(amountText);
  if (!code.trim()) return { ok: false, message: "" };
  if (cents === null || !isValidTopup(cents)) return { ok: false, message: "Gib zuerst einen gültigen Betrag ein." };
  const r = await previewPromo(user.id, code, cents);
  return r.ok ? { ok: true, message: `Bonus: ${(r.bonusCents / 100).toFixed(2).replace(".", ",")} € zusätzlich.` } : { ok: false, message: r.reason };
}

/** Entwicklungs-Zahlungsbildschirm: simuliert Erfolg oder Abbruch (nur mit Entwicklungs-Anbieter). */
export async function devPayAction(paymentId: string, outcome: "success" | "cancel"): Promise<void> {
  const user = await requireUser("/app/guthaben");
  if (activeProvider() !== "dev") redirect("/app/guthaben");
  const payment = await getPaymentFor(user.id, paymentId);
  if (!payment || payment.provider !== "dev") redirect("/app/guthaben");
  if (outcome === "success") await completePayment({ paymentId });
  else await failPayment({ paymentId }, "canceled", "Vom Nutzer abgebrochen");
  revalidatePath("/app/guthaben");
  redirect(`/app/guthaben?zahlung=${paymentId}&status=${outcome === "success" ? "ok" : "abbruch"}`);
}
