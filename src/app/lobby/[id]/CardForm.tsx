"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { createCardSetupAction } from "@/server/payments/card-actions";
import { fakeCardReadyAction } from "@/server/payments/fake-card-actions";
import { STORED_CARD_ACTION_AVAILABLE, activateStoredCard } from "./stored-card";

let stripePromise: Promise<Stripe | null> | null = null;
/** Der öffentliche Schlüssel kommt nur aus NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (nie im Code). Ohne Schlüssel gibt es kein Formular. */
function getStripe(): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

/** Nach dem Bestätigen setzt der Webhook den Platz auf "Karte hinterlegt"; die Seite lädt dafür ein paar Mal neu. */
function useRefreshSoon() {
  const router = useRouter();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return () => {
    router.refresh();
    timers.current = [1500, 4000, 8000].map((ms) => setTimeout(() => router.refresh(), ms));
  };
}

function ConfirmStep({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        setError(undefined);
        const result = await stripe.confirmSetup({ elements, redirect: "if_required", confirmParams: { return_url: window.location.href } });
        setBusy(false);
        if (result.error) setError(result.error.message ?? "Die Karte konnte nicht hinterlegt werden.");
        else onDone();
      }}
    >
      <PaymentElement />
      <button className="btn btn-primary w-full" disabled={!stripe || busy} data-testid="card-confirm">{busy ? "Bitte warten…" : "Karte speichern"}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

/**
 * Karte hinterlegen (Vertrag 012, AC-1). Zuerst der Mandatstext mit Zustimmung, dann das Stripe-Formular (Stripe Elements: die Karte geht nie über
 * unseren Server). Mit `fake` (nur Tests, PAYMENTS_FAKE=1) gibt es stattdessen den Knopf "Testkarte hinterlegen".
 */
export function CardForm({ matchId, mandateText, fake, stored }: { matchId: string; mandateText: string; fake: boolean; stored?: { brand: string | null; last4: string } | null }) {
  const refreshSoon = useRefreshSoon();
  const [accepted, setAccepted] = useState(false);
  const [clientSecret, setClientSecret] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const stripe = getStripe();

  async function start() {
    setBusy(true);
    setError(undefined);
    try {
      if (fake) {
        const r = await fakeCardReadyAction(matchId);
        if (r.error) setError(r.error);
        else {
          setDone(true);
          refreshSoon();
        }
      } else {
        const r = await createCardSetupAction({ matchId, mandateAccepted: accepted });
        if (r.ok) setClientSecret(r.clientSecret);
        else setError(r.error);
      }
    } catch {
      setError("Das hat gerade nicht geklappt. Bitte versuche es noch einmal.");
    } finally {
      setBusy(false);
    }
  }

  const [useNew, setUseNew] = useState(false);
  const showStored = Boolean(stored) && STORED_CARD_ACTION_AVAILABLE && !fake && !useNew;

  async function useStored() {
    setBusy(true);
    setError(undefined);
    try {
      const r = await activateStoredCard({ matchId, mandateAccepted: accepted });
      if (r.ok) {
        setDone(true);
        refreshSoon();
      } else {
        setError(r.error);
        if (r.needsNewCard) setUseNew(true); // gespeicherte Karte unbrauchbar: neues Formular anbieten
      }
    } catch {
      setError("Das hat gerade nicht geklappt. Bitte versuche es noch einmal.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="text-sm text-muted" role="status">Karte wird gespeichert…</p>;
  if (!fake && !stripe) return <p className="text-sm text-muted" data-testid="card-unavailable">Die Kartenzahlung ist gerade nicht verfügbar.</p>;

  if (showStored && stored) {
    return (
      <div className="space-y-3" data-testid="card-stored">
        <p className="text-sm">Gespeicherte Karte: <strong>{stored.brand ? `${stored.brand} ` : ""}•••• {stored.last4}</strong></p>
        <label className="flex items-start gap-2 text-sm" htmlFor="card-mandate-stored">
          <input id="card-mandate-stored" type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span data-testid="card-mandate">{mandateText}</span>
        </label>
        <button className="btn btn-primary w-full" disabled={busy || !accepted} onClick={useStored} data-testid="card-use-stored">{busy ? "Bitte warten…" : "Karte für diese Lobby nutzen"}</button>
        <button type="button" className="btn btn-ghost w-full" onClick={() => setUseNew(true)}>Andere Karte hinterlegen</button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="card-form">
      {clientSecret && stripe ? (
        <Elements stripe={stripe} options={{ clientSecret, appearance: { theme: "night" } }}>
          <ConfirmStep onDone={() => { setDone(true); refreshSoon(); }} />
        </Elements>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm" htmlFor="card-mandate">
            <input id="card-mandate" type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span data-testid="card-mandate">{mandateText}</span>
          </label>
          <button className="btn btn-primary w-full" disabled={busy || !accepted} onClick={start} data-testid={fake ? "card-fake" : "card-start"}>
            {busy ? "Bitte warten…" : fake ? "Testkarte hinterlegen" : "Karte hinterlegen"}
          </button>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
