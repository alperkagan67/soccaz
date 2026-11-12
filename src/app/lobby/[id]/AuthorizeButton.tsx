"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { createAuthorizationAction } from "@/server/payments/authorize-actions";
import { fakeAuthorizeAction } from "@/server/payments/fake-card-actions";

let stripePromise: Promise<Stripe | null> | null = null;
/** Der öffentliche Schlüssel kommt nur aus NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (nie im Code). */
function getStripe(): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

/**
 * "Zahlung freigeben" (Vertrag 012, M3c-1c, AC-7): Die Bank verlangt eine Freigabe (3-D-Secure). Die Server-Aktion liefert NUR dem Betroffenen das clientSecret seines offenen Versuchs;
 * Stripe.js (handleNextAction) schliesst die Pruefung ab. Das Ergebnis im Browser bucht NICHTS: gebucht wird allein ueber den Webhook; die Seite laedt danach neu. Das Secret
 * liegt nur im Speicher dieser Funktion (kein State, kein Log, keine URL). Mit `fake` (nur Tests) gibt es stattdessen zwei Knoepfe, die ein Fake-Webhook-Ereignis ausloesen.
 */
export function AuthorizeButton({ matchId, fake }: { matchId: string; fake: boolean }) {
  const router = useRouter();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refreshSoon = () => {
    router.refresh();
    timers.current.forEach(clearTimeout); // fruehere Timer aufraeumen, sonst ueberschreibt der naechste Klick sie (Timer liefen unkontrolliert weiter)
    timers.current = [1500, 4000, 8000].map((ms) => setTimeout(() => router.refresh(), ms));
  };

  async function startFake(outcome: "ok" | "fail") {
    setBusy(true);
    setError(undefined);
    try {
      const r = await fakeAuthorizeAction(matchId, outcome);
      if (r.error) setError(r.error);
      else refreshSoon();
    } catch {
      setError("Das hat gerade nicht geklappt. Bitte versuche es noch einmal.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    setError(undefined);
    try {
      const stripe = await getStripe();
      if (!stripe) {
        setError("Die Kartenzahlung ist gerade nicht verfügbar.");
        return;
      }
      const res = await createAuthorizationAction(matchId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const result = await stripe.handleNextAction({ clientSecret: res.clientSecret });
      if (result.error) setError("Die Freigabe hat nicht geklappt. Du kannst es noch einmal versuchen oder deine Karte ändern.");
      refreshSoon(); // gebucht wird erst, wenn der Webhook eintrifft; die Seite laedt dafuer ein paar Mal neu
    } catch {
      setError("Das hat gerade nicht geklappt. Bitte versuche es noch einmal."); // bewusst ohne Fehlerobjekt: dort koennte ein Secret stehen
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2" data-testid="authorize">
      {fake ? (
        <>
          <button className="btn btn-primary w-full" disabled={busy} onClick={() => startFake("ok")} data-testid="authorize-fake">
            {busy ? "Bitte warten…" : "Zahlung freigeben (Test)"}
          </button>
          <button className="btn btn-ghost w-full" disabled={busy} onClick={() => startFake("fail")} data-testid="authorize-fake-fail">
            Freigabe scheitern lassen (Test)
          </button>
        </>
      ) : (
        <button className="btn btn-primary w-full" disabled={busy} onClick={start} data-testid="authorize-start">
          {busy ? "Bitte warten…" : "Zahlung freigeben"}
        </button>
      )}
      {error && (
        <p className="error" role="alert" data-testid="authorize-error">
          {error}
        </p>
      )}
    </div>
  );
}
