"use client";

import { startTransition, useActionState } from "react";
import type { ActionState } from "@/lib/validation";

/**
 * Wie `useActionState`, aber ohne das automatische Zurücksetzen der Felder, das React 19 nach jedem Absenden ausführt.
 * Wer einen Fehler bekommt, soll seine Eingaben behalten. Benutzung:
 *   const { state, pending, onSubmit, formAction } = useFormAction(action);
 *   <form action={formAction} onSubmit={onSubmit}> ... <SubmitButton pending={pending}>…</SubmitButton>
 * `action={formAction}` ist die Rückfalllinie VOR der Hydration (Progressive Enhancement): ohne Handler sendet der Browser ein Formular ohne `action` nativ als GET (alle Felder in der Adresse, die Aktion läuft
 * nicht). Mit `action` ist es ein POST der Server-Aktion (nur mit einer Server-Aktions-Referenz, auch per `bind`, nie mit einer Inline-Closure). Nach der Hydration verhindert `onSubmit` den Standardweg
 * (`preventDefault`), React ruft die Aktion dann nicht selbst auf (kein zweiter Aufruf, die Eingaben bleiben bei Fehlern erhalten).
 */
export function useFormAction(action: (prev: ActionState, formData: FormData) => Promise<ActionState>) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  };
  return { state, pending, onSubmit, formAction };
}
