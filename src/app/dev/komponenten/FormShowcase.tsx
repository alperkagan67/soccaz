"use client";

// Showcase für Form, Field und DateTimeField (Vertrag 013 M2-3a). Eigene Datei, damit die Showcase-Seite nur EINE Zeile ändert.
// Die Aktion ist hier eine Client-Funktion ohne Datenbank: "vergeben" als Name erzeugt einen Feldfehler, ein Anstoß ohne volle Viertelstunde ebenfalls.
// Grenzen (min/max) prüft schon der Browser, bevor etwas abgeschickt wird.
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Field, Fieldset, FIELD_CONTROL } from "@/components/ui/Field";
import { Form } from "@/components/ui/Form";
import type { ActionState } from "@/lib/validation";

const MIN = "2026-11-01T10:00";
const MAX = "2026-12-31T22:00";

async function demoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await new Promise((r) => setTimeout(r, 150));
  const fieldErrors: Record<string, string> = {};
  if (String(formData.get("teamname") ?? "").trim().toLowerCase() === "vergeben") fieldErrors.teamname = "Dieser Teamname ist schon vergeben.";
  const start = String(formData.get("anstoss") ?? "");
  if (start && Number(start.slice(14, 16)) % 15 !== 0) fieldErrors.anstoss = "Bitte eine volle Viertelstunde wählen.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return { ok: true };
}

export function FormShowcase() {
  return (
    <section className="space-y-3" aria-labelledby="frm" data-testid="form-demo">
      <h2 id="frm" className="text-lg font-semibold">Form, Field, DateTimeField</h2>
      <Form action={demoAction} submitLabel="Speichern">
        <Fieldset legend="Team">
          <Field name="teamname" label="Teamname" required hint="Mindestens 3 Zeichen. „vergeben“ erzeugt einen Fehler am Feld.">
            <input type="text" minLength={3} autoComplete="off" className={FIELD_CONTROL} />
          </Field>
          <Field name="stadt" label="Stadt">
            <select className={FIELD_CONTROL} defaultValue="Essen">
              <option>Essen</option>
              <option>Köln</option>
              <option>Dortmund</option>
            </select>
          </Field>
          <Field name="hinweis" label="Hinweis" hint="Optional.">
            <textarea rows={3} className={FIELD_CONTROL} />
          </Field>
        </Fieldset>
        <Fieldset legend="Termin">
          <DateTimeField name="anstoss" label="Anstoß" value="2026-11-23T15:15" min={MIN} max={MAX} required />
        </Fieldset>
      </Form>
    </section>
  );
}
