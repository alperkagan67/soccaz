"use client";

// 011 M2b: Ablehnen einer Hallenanfrage mit Grund (Auswahlliste, Pflicht) und Anmerkung (optional 3 bis 200 Zeichen, bei „sonstiges“ Pflicht).
// Bestehende Bausteine: Form (Fehler am Feld, Eingaben bleiben, Fokus auf das erste fehlerhafte Feld), Field, Fieldset. Keine Spielernamen im Formular (AC-5).
import { useContext, useState } from "react";
import { Field, Fieldset, FIELD_CONTROL } from "@/components/ui/Field";
import { Form } from "@/components/ui/Form";
import { FormErrorsContext } from "@/components/ui/form-context";
import { DECLINE_CODES, DECLINE_LABELS, DECLINE_TEXT_MAX, DECLINE_TEXT_MIN, type DeclineCode } from "@/lib/hall-decline";
import type { ActionState } from "@/lib/validation";

type Props = {
  /** Server-Aktion (vorher, formData) => ActionState; die Ids und die Runde sind schon gebunden oder kommen als Hidden-Felder. */
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Eindeutiger Teil für die Element-IDs (je Karte verschieden), zum Beispiel matchId und venueId. */
  uid: string;
  /** Runde der Anfrage (Plan 011 M2, 3.1): kommt als Hidden-Feld mit, damit eine veraltete Seite abgelehnt werden kann. Optional bis zur Anbindung. */
  round?: number | null;
};

/** Fehler der Radiogruppe: unter der Gruppe, mit Symbol und Wort, `role="alert"` (wie `Field`). */
function GroupError({ id }: { id: string }) {
  const message = useContext(FormErrorsContext).reasonCode;
  if (!message) return null;
  return (
    <p id={id} role="alert" className="error flex items-start gap-2 text-sm" data-testid="error-reasonCode">
      <span aria-hidden>⚠</span>
      <span>{message}</span>
    </p>
  );
}

function Reason({ uid, other }: { uid: string; other: boolean }) {
  return (
    <Field
      name="reason"
      label="Anmerkung"
      required={other}
      hint={`${other ? "Pflicht bei „Sonstiges“" : "Optional"}, ${DECLINE_TEXT_MIN} bis ${DECLINE_TEXT_MAX} Zeichen. Bitte keine Namen von Personen.`}
    >
      <textarea id={`reason-${uid}`} rows={3} maxLength={DECLINE_TEXT_MAX * 2} className={FIELD_CONTROL} />
    </Field>
  );
}

/** Die Felder (Grund und Anmerkung); eigene Komponente, damit die Struktur ohne `Form` prüfbar ist. */
export function HallDeclineFields({ uid }: { uid: string }) {
  const [code, setCode] = useState<DeclineCode | "">("");
  const groupErrorId = `reasonCode-${uid}-error`;
  return (
    <>
      <Fieldset legend="Grund der Ablehnung (Pflicht)">
        <div role="radiogroup" aria-required="true" aria-describedby={groupErrorId} className="space-y-2">
          {DECLINE_CODES.map((value) => (
            <label key={value} className="flex min-h-[var(--tap)] cursor-pointer items-center gap-3 rounded-[10px] border border-line px-3">
              <input type="radio" name="reasonCode" value={value} checked={code === value} onChange={() => setCode(value)} className="ui-focus h-5 w-5" />
              <span className="text-base">{DECLINE_LABELS[value]}</span>
            </label>
          ))}
        </div>
        <GroupError id={groupErrorId} />
      </Fieldset>
      <Reason uid={uid} other={code === "sonstiges"} />
    </>
  );
}

export function HallDeclineForm({ action, uid, round = null }: Props) {
  return (
    <Form action={action} submitLabel="Ablehnung senden" danger>
      {round !== null && <input type="hidden" name="round" value={String(round)} />}
      <HallDeclineFields uid={uid} />
    </Form>
  );
}
