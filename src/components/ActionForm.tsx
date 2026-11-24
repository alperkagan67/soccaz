"use client";

import { useEffect, useRef } from "react";
import type { ActionState } from "@/lib/validation";
import { useFormAction } from "./useFormAction";

/**
 * Formular für Admin-Aktionen: zeigt Fehler und Erfolg. Bei einem Fehler bleiben die Eingaben erhalten,
 * nach Erfolg wird das Formular geleert (außer `keepOnSuccess`).
 * `action` ist eine Server-Aktion mit der Signatur (vorher, formData) => ActionState.
 */
export function ActionForm({
  action,
  submit,
  children,
  className = "card space-y-3",
  successText = "Gespeichert.",
  keepOnSuccess = false,
  danger = false,
  quiet = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submit: string;
  children?: React.ReactNode;
  className?: string;
  successText?: string;
  keepOnSuccess?: boolean;
  danger?: boolean;
  /** quiet: ein anderer Knopf der Ansicht ist die Hauptaktion (AC-30), dieser ist ruhig. */
  quiet?: boolean;
}) {
  const { state, pending, onSubmit, formAction } = useFormAction(action);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && !keepOnSuccess) ref.current?.reset();
  }, [state, keepOnSuccess]);

  return (
    <form ref={ref} action={formAction} onSubmit={onSubmit} className={className}>
      {children}
      <button className={`btn ${danger ? "btn-danger" : quiet ? "btn-ghost" : "btn-primary"} w-full disabled:opacity-60`} disabled={pending}>
        {pending ? "Bitte warten…" : submit}
      </button>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.ok && !pending && <p className="text-sm text-accent-fg" role="status">{successText}</p>}
    </form>
  );
}
