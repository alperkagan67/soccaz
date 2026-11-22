// DSGVO-Loeschung des Stripe-Kunden (Vertrag 012, M4b, AC-16). Die Transaktion von deleteAccount legt den Auftrag an (Kunden-ID nur noch hier) und loescht Profil und Mandat; DIESER Job ruft nur noch
// Stripe auf: Netz, nie in einer Transaktion. Zustaende: pending -> claimed -> done | failed. Beanspruchen mit FOR UPDATE SKIP LOCKED und Lease (zwei Laeufe tun nie dasselbe), Absturz nach dem Stripe-Erfolg
// ist harmlos (der naechste Lauf ruft deleteCustomer noch einmal auf; "Kunde existiert nicht (mehr)" zaehlt als Erfolg).
// Wiederholung mit Backoff (1 h, 6 h, 24 h, danach taeglich); nach ERASURE_MAX_ATTEMPTS Versuchen wird der Auftrag failed und Admin 1 bekommt EINEN Alarm (manuell klaeren: Kunde im Stripe-Dashboard loeschen).
// Stripe nicht konfiguriert (PaymentsUnavailableError): der Auftrag wartet, ohne einen Versuch zu verbrauchen.
import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentErasureTasks } from "@/db/schema";
import { audit } from "../audit";
import { notifyUsers, platformAdminIds } from "../notifications";
import { getPaymentProvider, PaymentsUnavailableError } from "./provider";

export const ERASURE_MAX_ATTEMPTS = 10;
export const ERASURE_LEASE_MS = 5 * 60_000;
const H = 3_600_000;

/** Wartezeit bis zum naechsten Versuch nach dem n-ten fehlgeschlagenen Versuch (n >= 1): 1 h, 6 h, 24 h, danach taeglich. */
export function erasureBackoffMs(attemptsSoFar: number): number {
  return attemptsSoFar <= 1 ? H : attemptsSoFar === 2 ? 6 * H : 24 * H;
}

const cleanCode = (e: unknown) => {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" && /^[a-z0-9_.-]{1,64}$/i.test(c) ? c : "network";
};

type Claimed = { id: string; customerId: string | null; attempts: number };

/** Beansprucht den naechsten faelligen Auftrag (pending und faellig, oder claimed mit abgelaufener Lease). Verbraucht den Versuch schon hier: ein Absturz zaehlt mit. */
async function claimNext(now: Date, onlyId?: string): Promise<Claimed | null> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      select id, stripe_customer_id, attempts
      from payment_erasure_tasks
      where ((status = 'pending' and next_try_at <= ${now}) or (status = 'claimed' and claimed_until < ${now})) and (${onlyId ?? null}::uuid is null or id = ${onlyId ?? null}::uuid)
      order by next_try_at, id
      limit 1
      for update skip locked`);
    const row = (rows.rows as { id: string; stripe_customer_id: string | null; attempts: number }[])[0];
    if (!row) return null;
    const attempts = row.attempts + 1;
    await tx.update(paymentErasureTasks).set({ status: "claimed", attempts, claimedUntil: new Date(now.getTime() + ERASURE_LEASE_MS) }).where(eq(paymentErasureTasks.id, row.id));
    return { id: row.id, customerId: row.stripe_customer_id, attempts };
  });
}

export type ErasureResult = { done: number; retried: number; failed: number };

/** Arbeitet faellige Loeschauftraege ab (hoechstens `limit` je Lauf). Idempotent und parallel sicher. Fehler bei einem Auftrag stoppen die anderen nicht. */
export async function runErasureTasks(now: Date = new Date(), limit = 20, opts: { onlyTaskId?: string } = {}): Promise<ErasureResult> {
  const out: ErasureResult = { done: 0, retried: 0, failed: 0 };
  for (let i = 0; i < limit; i++) {
    const task = await claimNext(now, opts.onlyTaskId);
    if (!task) break;
    // Kein Kunde (mehr) bekannt: nichts zu loeschen
    if (!task.customerId) {
      await db.update(paymentErasureTasks).set({ status: "done", doneAt: new Date(), claimedUntil: null }).where(eq(paymentErasureTasks.id, task.id));
      out.done += 1;
      continue;
    }
    try {
      const provider = await getPaymentProvider();
      await provider.deleteCustomer(task.customerId); // Netz, nie in einer Transaktion
    } catch (error) {
      if (error instanceof PaymentsUnavailableError) {
        // Stripe nicht konfiguriert: wartet, ohne einen Versuch zu verbrauchen
        await db.update(paymentErasureTasks).set({ status: "pending", attempts: task.attempts - 1, claimedUntil: null, nextTryAt: new Date(now.getTime() + H) }).where(eq(paymentErasureTasks.id, task.id));
        out.retried += 1;
        continue;
      }
      const code = cleanCode(error);
      if (task.attempts >= ERASURE_MAX_ATTEMPTS) {
        await db.transaction(async (tx) => {
          await tx.update(paymentErasureTasks).set({ status: "failed", claimedUntil: null, lastErrorCode: code }).where(eq(paymentErasureTasks.id, task.id));
          await audit(null, "erasure.failed", "payment_erasure_task", task.id, { after: { attempts: task.attempts, code } }, tx);
          await notifyUsers(await platformAdminIds(tx), { type: "admin.task", title: "Stripe-Kunde nicht gelöscht", body: "Die Löschung eines Stripe-Kunden (Kontolöschung) ist wiederholt fehlgeschlagen. Bitte den Kunden im Stripe-Dashboard von Hand löschen.", url: "/admin/finanzen" }, tx);
        });
        out.failed += 1;
      } else {
        await db.update(paymentErasureTasks).set({ status: "pending", claimedUntil: null, lastErrorCode: code, nextTryAt: new Date(now.getTime() + erasureBackoffMs(task.attempts)) }).where(eq(paymentErasureTasks.id, task.id));
        out.retried += 1;
      }
      continue;
    }
    // Stripe hat den Kunden geloescht: done und Audit in EINER Transaktion, ausserhalb des try um den Stripe-Aufruf (ein Fehler beim Audit darf den Auftrag nicht zurueck auf pending setzen, Review M4b-1 Fund 4)
    await db.transaction(async (tx) => {
      await tx.update(paymentErasureTasks).set({ status: "done", stripeCustomerId: null, doneAt: new Date(), claimedUntil: null, lastErrorCode: null }).where(eq(paymentErasureTasks.id, task.id));
      await audit(null, "erasure.done", "payment_erasure_task", task.id, {}, tx);
    });
    out.done += 1;
  }
  return out;
}

/** Alarmliste (Anzahl offener und gescheiterter Auftraege), ohne IDs. */
export async function erasureBacklog(now: Date = new Date()): Promise<{ pending: number; failed: number }> {
  const rows = await db
    .select({ status: paymentErasureTasks.status })
    .from(paymentErasureTasks)
    .where(or(eq(paymentErasureTasks.status, "failed"), and(eq(paymentErasureTasks.status, "pending"), lt(paymentErasureTasks.nextTryAt, new Date(now.getTime() - 24 * H)))))
    .orderBy(asc(paymentErasureTasks.createdAt));
  return { pending: rows.filter((r) => r.status === "pending").length, failed: rows.filter((r) => r.status === "failed").length };
}
