"use client";

import { startTransition, useActionState } from "react";
import type { ActionState } from "@/lib/validation";

/**
 * Wie `useActionState`, aber ohne das automatische Zurücksetzen der Felder, das React 19 nach jedem Absenden ausführt.
 * Wer einen Fehler bekommt, soll seine Eingaben behalten. Benutzung:
 *   const { state, pending, onSubmit } = useFormAction(action);
 *   <form onSubmit={onSubmit}> ... <SubmitButton pending={pending}>…</SubmitButton>
 */
export function useFormAction(action: (prev: ActionState, formData: FormData) => Promise<ActionState>) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  };
  return { state, pending, onSubmit };
}
