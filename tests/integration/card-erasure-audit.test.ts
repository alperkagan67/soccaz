import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentErasureTasks } from "@/db/schema";
import { runErasureTasks } from "@/server/payments/erasure";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { cleanup, makeUser } from "./helpers";

// Review M4b-1 (Fund 4): ein Fehler beim Audit NACH dem erfolgreichen Stripe-Aufruf darf den Auftrag nicht zurueck auf 'pending' mit Fehlercode setzen; done und Audit sind EINE Transaktion.
const state = vi.hoisted(() => ({ failDoneAudit: false }));
vi.mock("@/server/audit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/audit")>();
  return {
    ...real,
    audit: async (...args: Parameters<typeof real.audit>) => {
      if (state.failDoneAudit && args[1] === "erasure.done") throw new Error("Audit kaputt");
      return real.audit(...args);
    },
  };
});

let provider: FakeProvider;
const made: string[] = [];
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  state.failDoneAudit = false;
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  for (const id of made) await db.delete(paymentErasureTasks).where(eq(paymentErasureTasks.id, id));
  await cleanup();
});

describe("Fund 4: done und Audit in einer Transaktion", () => {
  it("scheitert das Audit nach dem Stripe-Erfolg: der Lauf bricht ab, der Auftrag bleibt beansprucht (nicht pending mit Fehlercode), der naechste Lauf nach Ablauf der Lease beendet ihn", async () => {
    const u = await makeUser("era");
    const customer = "cus_era_" + Date.now().toString(36);
    const [t] = await db.insert(paymentErasureTasks).values({ userId: u.id, stripeCustomerId: customer, nextTryAt: new Date(Date.now() - 1000) }).returning();
    made.push(t.id);
    state.failDoneAudit = true;
    await expect(runErasureTasks(new Date(), 100, { onlyTaskId: t.id })).rejects.toThrow(/Audit kaputt/);
    const after = (await db.select().from(paymentErasureTasks).where(eq(paymentErasureTasks.id, t.id)))[0];
    expect(after.status).toBe("claimed"); // die Transaktion wurde zurueckgerollt; KEIN pending-Backoff wegen eines Audit-Fehlers
    expect(after.lastErrorCode).toBeNull();
    expect(after.attempts).toBe(1);
    expect(provider.deletedCustomers.has(customer)).toBe(true);

    state.failDoneAudit = false;
    await runErasureTasks(new Date(Date.now() + 10 * 60_000), 100, { onlyTaskId: t.id }); // Lease abgelaufen
    const done = (await db.select().from(paymentErasureTasks).where(eq(paymentErasureTasks.id, t.id)))[0];
    expect(done).toMatchObject({ status: "done", stripeCustomerId: null, attempts: 2 });
  });
});
