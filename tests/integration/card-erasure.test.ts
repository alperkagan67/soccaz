import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications, paymentErasureTasks } from "@/db/schema";
import { runCardCharges } from "@/server/payments/charge-trigger";
import { setSetting } from "@/server/settings";
import { ERASURE_MAX_ATTEMPTS, erasureBackoffMs, runErasureTasks } from "@/server/payments/erasure";
import { FakeProvider } from "@/server/payments/fake";
import { PaymentsUnavailableError, setPaymentProviderForTests } from "@/server/payments/provider";
import { cleanup, makeUser } from "./helpers";

// Vertrag 012, M4b (AC-16): Job fuer die Loeschung des Stripe-Kunden: beanspruchen, Stripe aufrufen (nie in einer Transaktion), Backoff, Alarm nach zu vielen Versuchen, idempotent.

let provider: FakeProvider;
const made: string[] = [];
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  if (made.length) await db.delete(paymentErasureTasks).where(inArray(paymentErasureTasks.id, made));
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;
const H = 3_600_000;

/** Ein Loeschauftrag fuer ein neues Konto mit Kunden-ID; Standard: faellig. */
async function task(over: Partial<typeof paymentErasureTasks.$inferInsert> = {}) {
  const u = await makeUser("er");
  const customer = over.stripeCustomerId === undefined ? nid("cus_er") : over.stripeCustomerId;
  const [t] = await db.insert(paymentErasureTasks).values({ userId: u.id, stripeCustomerId: customer, nextTryAt: new Date(Date.now() - 1000), ...over }).returning();
  made.push(t.id);
  return { t, u, customer };
}
const reload = async (id: string) => (await db.select().from(paymentErasureTasks).where(eq(paymentErasureTasks.id, id)))[0];
const delCalls = (customer: string) => provider.calls.filter((c) => c.method === "deleteCustomer" && (c.args as { customerId: string }).customerId === customer);

describe("Backoff", () => {
  it("1 h, 6 h, 24 h, danach taeglich", () => {
    expect([1, 2, 3, 4, 9].map(erasureBackoffMs)).toEqual([H, 6 * H, 24 * H, 24 * H, 24 * H]);
  });
});

describe("Loeschauftrag abarbeiten", () => {
  it("ruft deleteCustomer mit der Kunden-ID auf, Auftrag done, Kunden-ID danach NULL", async () => {
    const { t, customer } = await task();
    const res = await runErasureTasks(new Date(), 100);
    expect(res.done).toBeGreaterThanOrEqual(1);
    expect(delCalls(customer!)).toHaveLength(1);
    expect(provider.deletedCustomers.has(customer!)).toBe(true);
    expect(await reload(t.id)).toMatchObject({ status: "done", stripeCustomerId: null, attempts: 1 });
    expect((await reload(t.id)).doneAt).not.toBeNull();
  });

  it("kein Netzaufruf innerhalb einer Datenbanktransaktion", async () => {
    let depth = 0;
    const original = db.transaction.bind(db);
    (db as unknown as { transaction: unknown }).transaction = ((fn: never, cfg: never) => {
      depth += 1;
      return (original as (f: never, c: never) => Promise<unknown>)(fn, cfg).finally(() => {
        depth -= 1;
      });
    }) as never;
    provider.inTransaction = () => depth > 0;
    try {
      const { customer } = await task();
      await runErasureTasks(new Date(), 100);
      expect(delCalls(customer!)).toHaveLength(1);
      expect(provider.violations).toEqual([]);
    } finally {
      (db as unknown as { transaction: unknown }).transaction = original;
    }
  });

  it("zwei parallele Laeufe: genau EIN Stripe-Aufruf (SKIP LOCKED, Lease)", async () => {
    const { t, customer } = await task();
    await Promise.all([runErasureTasks(new Date(), 100), runErasureTasks(new Date(), 100), runErasureTasks(new Date(), 100)]);
    expect(delCalls(customer!)).toHaveLength(1);
    expect((await reload(t.id)).status).toBe("done");
  });

  it("Rennfall (R-T189): haelt eine andere Transaktion die Auftragszeile (FOR UPDATE), wartet claimNext NICHT und findet nichts (SKIP LOCKED); nach der Freigabe wird der Auftrag normal abgearbeitet", async () => {
    const { t, customer } = await task();
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    let held!: () => void;
    const heldP = new Promise<void>((r) => (held = r));
    const holder = db.transaction(async (tx) => {
      await tx.select().from(paymentErasureTasks).where(eq(paymentErasureTasks.id, t.id)).for("update");
      held();
      await hold;
    });
    await heldP;
    const run = runErasureTasks(new Date(), 100, { onlyTaskId: t.id });
    try {
      // Mit SKIP LOCKED kehrt der Lauf sofort zurueck; ohne wuerde er bis zur Freigabe blockieren
      const first = await Promise.race([run.then(() => "fertig" as const), new Promise<"blockiert">((r) => setTimeout(() => r("blockiert"), 1200))]);
      expect(first).toBe("fertig");
      expect(delCalls(customer!)).toHaveLength(0);
      expect((await reload(t.id)).status).toBe("pending"); // nicht beansprucht, kein Versuch verbraucht
      expect((await reload(t.id)).attempts).toBe(0);
    } finally {
      release(); // auch bei einem Fehlschlag die Sperre freigeben, sonst haengt der Lauf bis zum Zeitlimit
      await holder;
      await run.catch(() => undefined);
    }
    await runErasureTasks(new Date(), 100, { onlyTaskId: t.id });
    expect(delCalls(customer!)).toHaveLength(1);
    expect((await reload(t.id)).status).toBe("done");
  });

  it("waehrend des Stripe-Aufrufs ist der Auftrag beansprucht (claimed) mit Lease in der Zukunft, der Versuch ist schon gezaehlt", async () => {
    const { t } = await task();
    let seen: { status: string; leaseOk: boolean; attempts: number } | null = null;
    class Spy extends FakeProvider {
      override async deleteCustomer(customerId: string): Promise<void> {
        const r = (await db.select().from(paymentErasureTasks).where(eq(paymentErasureTasks.id, t.id)))[0];
        seen = { status: r.status, leaseOk: r.claimedUntil !== null && r.claimedUntil.getTime() > Date.now(), attempts: r.attempts };
        return super.deleteCustomer(customerId);
      }
    }
    setPaymentProviderForTests(new Spy());
    await runErasureTasks(new Date(), 100);
    expect(seen).toEqual({ status: "claimed", leaseOk: true, attempts: 1 });
  });

  it("noch nicht faellig (next_try_at in der Zukunft) oder schon done/failed wird nicht angefasst", async () => {
    const future = await task({ nextTryAt: new Date(Date.now() + H) });
    const done = await task({ status: "done" });
    const failed = await task({ status: "failed" });
    await runErasureTasks(new Date(), 100);
    for (const x of [future, done, failed]) expect(delCalls(x.customer!), x.t.status).toHaveLength(0);
    expect((await reload(future.t.id)).status).toBe("pending");
  });

  it("Auftrag ohne Kunden-ID: erledigt ohne Stripe-Aufruf", async () => {
    const { t } = await task({ stripeCustomerId: null });
    await runErasureTasks(new Date(), 100);
    expect(await reload(t.id)).toMatchObject({ status: "done" });
    expect(provider.calls.filter((c) => c.method === "deleteCustomer")).toHaveLength(0);
  });
});

describe("Fehler, Backoff, Alarm", () => {
  it("Stripe-Fehler: bleibt pending mit Backoff (1 h, dann 6 h, dann 24 h), Fehlercode ohne Details; ein Erfolg danach beendet", async () => {
    const { t, customer } = await task();
    provider.setDeleteCustomerOutcome(customer!, "error");
    const t0 = new Date();
    await runErasureTasks(t0, 100);
    let r = await reload(t.id);
    expect(r).toMatchObject({ status: "pending", attempts: 1, lastErrorCode: "network", stripeCustomerId: customer });
    expect(r.nextTryAt.getTime() - t0.getTime()).toBe(H);
    await runErasureTasks(new Date(t0.getTime() + 30 * 60_000), 100); // zu frueh: nichts
    expect((await reload(t.id)).attempts).toBe(1);
    const t1 = new Date(t0.getTime() + H + 1000);
    await runErasureTasks(t1, 100);
    r = await reload(t.id);
    expect(r.attempts).toBe(2);
    expect(r.nextTryAt.getTime() - t1.getTime()).toBe(6 * H);
    const t2 = new Date(t1.getTime() + 6 * H + 1000);
    await runErasureTasks(t2, 100);
    r = await reload(t.id);
    expect(r.attempts).toBe(3);
    expect(r.nextTryAt.getTime() - t2.getTime()).toBe(24 * H);
    provider.setDeleteCustomerOutcome(customer!, "ok");
    await runErasureTasks(new Date(t2.getTime() + 24 * H + 1000), 100);
    expect(await reload(t.id)).toMatchObject({ status: "done", stripeCustomerId: null });
  });

  it("nach ERASURE_MAX_ATTEMPTS Versuchen: failed und GENAU EIN Alarm an Admin 1, danach kein weiterer Versuch", async () => {
    const admin = await makeUser("eradm", "admin");
    const { t, customer } = await task({ attempts: ERASURE_MAX_ATTEMPTS - 1 });
    provider.setDeleteCustomerOutcome(customer!, "error");
    const res = await runErasureTasks(new Date(), 100);
    expect(res.failed).toBeGreaterThanOrEqual(1);
    expect(await reload(t.id)).toMatchObject({ status: "failed", attempts: ERASURE_MAX_ATTEMPTS, stripeCustomerId: customer });
    const alerts = async () => (await db.select().from(notifications).where(eq(notifications.userId, admin.id))).filter((n) => n.title === "Stripe-Kunde nicht gelöscht");
    expect(await alerts()).toHaveLength(1);
    expect(JSON.stringify(await alerts())).not.toContain(customer!); // keine Kunden-ID im Alarm
    await runErasureTasks(new Date(Date.now() + 100 * H), 100);
    expect(delCalls(customer!)).toHaveLength(1);
    expect(await alerts()).toHaveLength(1);
  });

  it("Stripe nicht konfiguriert: der Auftrag wartet, ohne einen Versuch zu verbrauchen", async () => {
    class Unavailable extends FakeProvider {
      override async deleteCustomer(): Promise<void> {
        throw new PaymentsUnavailableError();
      }
    }
    setPaymentProviderForTests(new Unavailable());
    const { t } = await task({ attempts: 2 });
    const t0 = new Date();
    await runErasureTasks(t0, 100);
    const r = await reload(t.id);
    expect(r).toMatchObject({ status: "pending", attempts: 2 });
    expect(r.nextTryAt.getTime()).toBeGreaterThan(t0.getTime());
  });
});

describe("Absturz und Lease", () => {
  it("Absturz NACH dem Stripe-Erfolg (Auftrag noch claimed, Lease abgelaufen): der naechste Lauf ruft noch einmal auf und beendet; der Kunde ist schon weg = Erfolg", async () => {
    const { t, customer } = await task({ status: "claimed", attempts: 1, claimedUntil: new Date(Date.now() - 1000) });
    provider.deletedCustomers.add(customer!); // bei Stripe schon geloescht
    await runErasureTasks(new Date(), 100);
    expect(delCalls(customer!)).toHaveLength(1);
    expect(await reload(t.id)).toMatchObject({ status: "done", stripeCustomerId: null, attempts: 2 });
  });

  it("ein Auftrag mit gueltiger Lease (anderer Lauf arbeitet) wird nicht angefasst", async () => {
    const { t, customer } = await task({ status: "claimed", attempts: 1, claimedUntil: new Date(Date.now() + 5 * 60_000) });
    await runErasureTasks(new Date(), 100);
    expect(delCalls(customer!)).toHaveLength(0);
    expect((await reload(t.id)).status).toBe("claimed");
  });
});

describe("Auslöser", () => {
  it("der Job card-charges arbeitet Loeschauftraege auch bei AUSGESCHALTETEM Kartenmodell ab", async () => {
    await setSetting(null, "card_payments_enabled", false);
    const { t, customer } = await task();
    await runCardCharges(new Date());
    expect(delCalls(customer!)).toHaveLength(1);
    expect((await reload(t.id)).status).toBe("done");
  });
});
