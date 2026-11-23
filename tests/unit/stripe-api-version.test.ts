import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STRIPE_API_VERSION, StripeProvider } from "@/server/payments/stripe";

// Backlog 183 Schritt 1: die Stripe-API-Version ist gepinnt (Weg A: gleich der bisher wirksamen Standardversion von stripe-node 23.1.0, Laufzeitwirkung null).
// Ein Bump der Bibliothek darf die API-Version nicht still wechseln: sobald die Standardversion der installierten Bibliothek vom Pin abweicht, wird dieser Test rot,
// und die Abweichung muss bewusst entschieden werden (Testmodus-Nachweis, dann Test anpassen).
const libDefault = (Stripe as unknown as { API_VERSION: string }).API_VERSION;

describe("Stripe: gepinnte API-Version", () => {
  it("der Pin entspricht der Standardversion der installierten Bibliothek", () => {
    expect(STRIPE_API_VERSION).toBe(libDefault);
  });

  it("Struktur: new Stripe(...) in stripe.ts bekommt apiVersion aus der Konstante", () => {
    const src = readFileSync("src/server/payments/stripe.ts", "utf8");
    expect(src).toMatch(/new Stripe\(key, \{ apiVersion: STRIPE_API_VERSION,/);
    expect(src.match(/new Stripe\(/g)).toHaveLength(1); // keine zweite, ungepinnte Instanz
  });

  it("Verhalten: mit dem Pin sendet stripe-node den Header Stripe-Version (gemocktes HTTP)", async () => {
    const seen: Headers[] = [];
    const fetchFn = vi.fn(async (_url: string, init: { headers: HeadersInit }) => {
      seen.push(new Headers(init.headers));
      return new Response(JSON.stringify({ id: "cus_test", object: "customer" }), { status: 200, headers: { "content-type": "application/json", "request-id": "req_test" } });
    });
    // gleiche Optionen wie im Anbieter, nur das HTTP wird durch ein Fetch-Mock ersetzt (der Pin kommt aus der exportierten Konstante)
    const StripeCtor = Stripe as unknown as new (key: string, opts: object) => Stripe;
    const real = new StripeCtor("sk_test_dummy", { apiVersion: STRIPE_API_VERSION, httpClient: Stripe.createFetchHttpClient(fetchFn as unknown as typeof fetch) });
    await real.customers.create({ email: "a@test.local" });
    expect(seen[0].get("Stripe-Version")).toBe("2026-10-28.endive");
  });

  it("Verhalten (Anbieter selbst): der Provider übergibt apiVersion an den Konstruktor von Stripe", async () => {
    vi.resetModules();
    const ctor = vi.fn();
    vi.doMock("stripe", () => ({ default: class { constructor(key: string, opts: object) { ctor(key, opts); } customers = { create: async () => ({ id: "cus_x" }) }; } }));
    const mod = await import("@/server/payments/stripe");
    const p = new mod.StripeProvider({ secretKey: "sk_test_dummy" });
    await p.createCustomer({ userId: "u", email: "a@test.local", idempotencyKey: "k" });
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor.mock.calls[0][1]).toMatchObject({ apiVersion: mod.STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 15_000 });
    vi.doUnmock("stripe");
  });
});
