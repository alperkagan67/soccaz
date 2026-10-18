"use client";

import { useState, useTransition } from "react";
import { createTopUpAction, previewPromoAction } from "@/server/wallet-actions";
import { FieldError, SubmitButton } from "@/components/FormBits";
import { useFormAction } from "@/components/useFormAction";

const PRESETS = [20, 50, 100];

export function TopUpForm({ initialAmount, back }: { initialAmount: string; back?: string | null }) {
  const { state, pending, onSubmit } = useFormAction(createTopUpAction);
  const [amount, setAmount] = useState(initialAmount);
  const [promo, setPromo] = useState("");
  const [preview, setPreview] = useState<{ ok: boolean; message: string }>();
  const [, start] = useTransition();
  const fe = state?.fieldErrors ?? {};

  const checkPromo = (code: string, amt: string) =>
    start(async () => setPreview(code.trim() ? await previewPromoAction(code, amt) : undefined));

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      {back && <input type="hidden" name="back" value={back} />}
      <div>
        <label className="label" htmlFor="amount">Betrag in Euro</label>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`btn ${amount === String(p) ? "btn-primary" : "btn-ghost"} flex-1`}
              onClick={() => {
                setAmount(String(p));
                checkPromo(promo, String(p));
              }}
            >
              {p} €
            </button>
          ))}
        </div>
        <input
          id="amount"
          name="amount"
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => checkPromo(promo, amount)}
          className="field mt-2"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-muted">Zwischen 5,00 und 200,00 Euro. Größere Beträge sparen Gebühren, denn jede Zahlung kostet etwas.</p>
        <FieldError message={fe.amount} />
      </div>

      <div>
        <label className="label" htmlFor="promo">Rabattcode (optional)</label>
        <input
          id="promo"
          name="promo"
          value={promo}
          onChange={(e) => setPromo(e.target.value)}
          onBlur={() => checkPromo(promo, amount)}
          className="field uppercase"
          autoComplete="off"
          maxLength={24}
        />
        {preview?.message && <p className={`mt-1 text-sm ${preview.ok ? "text-green" : "error"}`} role="status">{preview.message}</p>}
        <FieldError message={fe.promo && fe.promo !== preview?.message ? fe.promo : undefined} />
      </div>

      <SubmitButton pending={pending}>Jetzt bezahlen</SubmitButton>
      {state?.error && !state.fieldErrors && <p className="error" role="alert">{state.error}</p>}
      <p className="text-xs text-muted">Du wirst zum Zahlungsanbieter weitergeleitet. Dein Guthaben verfällt nicht und kann nur für Spiele auf Socaz verwendet werden.</p>
    </form>
  );
}
