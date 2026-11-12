"use client";

// Datum und Uhrzeit (Vertrag 013 M2-3a, K15): natives <input type="datetime-local"> in einem `Field`.
// Der Wert bleibt der heutige String "YYYY-MM-DDTHH:mm" in Berliner Ortszeit (src/lib/time.ts).
import { DEFAULT_LOCALE, translate } from "@/lib/i18n";
import { formatDateTime, parseBerlinLocal } from "@/lib/time";
import { Field, FIELD_CONTROL } from "./Field";

export type DateTimeFieldProps = {
  name: string;
  label: string;
  /** Startwert "YYYY-MM-DDTHH:mm" (Berliner Zeit). */
  value?: string;
  /** Grenzen im selben Format; sie stehen zusätzlich in Worten unter dem Feld. */
  min?: string;
  max?: string;
  required?: boolean;
  error?: string;
};

function when(local: string | undefined, key: "ui.dateTimeMin" | "ui.dateTimeMax"): string | null {
  const date = local ? parseBerlinLocal(local) : null;
  return date ? translate(DEFAULT_LOCALE, key, { when: formatDateTime(date) }) : null;
}

/**
 * Volle Breite (`w-full min-w-0`), damit der Wert auf 390 px nicht abgeschnitten wird; mindestens 44 px hoch, Schrift 16 px.
 * Unter dem Feld: Zeitzone („Uhrzeit in deutscher Zeit“) und, wenn gesetzt, frühester und spätester Zeitpunkt in Worten.
 */
export function DateTimeField({ name, label, value, min, max, required, error }: DateTimeFieldProps) {
  const parts = [translate(DEFAULT_LOCALE, "ui.dateTimeHint"), when(min, "ui.dateTimeMin"), when(max, "ui.dateTimeMax")].filter(Boolean);
  return (
    <Field name={name} label={label} required={required} error={error} hint={parts.join(" · ")}>
      <input type="datetime-local" defaultValue={value} min={min} max={max} className={FIELD_CONTROL} />
    </Field>
  );
}
