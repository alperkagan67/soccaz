"use client";

// 011 M2a: Schalter „Uhrenquelle auf Datenbank“ und „Beweispflicht einschalten“ (nur Admin 1). Begründung Pflicht; folgenreich (danger). Kein Ausschalten hier.
import { Field, FIELD_CONTROL } from "@/components/ui/Field";
import { Form } from "@/components/ui/Form";
import { SWITCH_REASON_MAX, SWITCH_REASON_MIN } from "@/lib/evidence-switch";
import type { ActionState } from "@/lib/validation";

type Props = { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; step: string; label: string };

export function EvidenceSwitchForm({ action, step, label }: Props) {
  return (
    <Form action={action} submitLabel={label} danger successText="Gespeichert.">
      <Field name="reason" label="Grund" required hint={`${SWITCH_REASON_MIN} bis ${SWITCH_REASON_MAX} Zeichen, wird im Prüfprotokoll festgehalten.`}>
        <textarea id={`reason-switch-${step}`} rows={2} maxLength={SWITCH_REASON_MAX * 2} className={FIELD_CONTROL} />
      </Field>
    </Form>
  );
}
