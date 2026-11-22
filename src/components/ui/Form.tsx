"use client";

// Formular mit Server-Aktion (Vertrag 013 M2-3a, K15): Fehler am Feld, genau eine Speichern-Handlung, Eingaben bleiben bei Fehler erhalten.
import { useEffect, useRef, type ReactNode } from "react";
import { useFormAction } from "@/components/useFormAction";
import { DEFAULT_LOCALE, translate } from "@/lib/i18n";
import type { ActionState } from "@/lib/validation";
import { Button } from "./Button";
import { FormErrorsContext } from "./form-context";

const NO_ERRORS: Readonly<Record<string, string>> = {};

export type FormProps = {
  /** Server-Aktion mit der Signatur (vorher, formData) => ActionState; Fehler je Feld in `fieldErrors` (Name = `name` des Feldes). */
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Beschriftung der einzigen Speichern-Handlung. */
  submitLabel: string;
  /** Folgenreiche Aktion: der Knopf bekommt Rahmen und Wort statt Orange (`danger`). */
  danger?: boolean;
  successText?: string;
  /** Nach Erfolg das Formular nicht leeren. */
  keepOnSuccess?: boolean;
  children: ReactNode;
};

/**
 * Bei einem Fehler bleiben die Eingaben erhalten, der Fokus springt auf das erste fehlerhafte Feld (`aria-invalid`), dort steht der Text.
 * Nach Erfolg wird das Formular geleert (außer `keepOnSuccess`). Die Speichern-Handlung ist ein `Button` (44 px, `pending` mit Wort).
 */
export function Form({ action, submitLabel, danger = false, successText, keepOnSuccess = false, children }: FormProps) {
  const { state, pending, onSubmit } = useFormAction(action);
  const ref = useRef<HTMLFormElement>(null);
  const fieldErrors = state?.fieldErrors ?? NO_ERRORS;
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  useEffect(() => {
    if (state?.ok && !keepOnSuccess) ref.current?.reset();
  }, [state, keepOnSuccess]);

  useEffect(() => {
    if (hasFieldErrors) ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, hasFieldErrors]);

  return (
    <FormErrorsContext.Provider value={fieldErrors}>
      <form ref={ref} onSubmit={onSubmit} className="space-y-4">
        {children}
        {hasFieldErrors && <p className="text-sm font-semibold">{translate(DEFAULT_LOCALE, "ui.checkFields")}</p>}
        {state?.error && (
          <p className="error" role="alert">
            {state.error}
          </p>
        )}
        <div>
          <Button type="submit" variant={danger ? "danger" : "primary"} pending={pending}>
            {submitLabel}
          </Button>
        </div>
        {state?.ok && !pending && (
          <p className="text-sm font-semibold" role="status">
            {successText ?? translate(DEFAULT_LOCALE, "ui.saved")}
          </p>
        )}
      </form>
    </FormErrorsContext.Provider>
  );
}
