"use client";

// Eingabefeld mit Beschriftung, Hinweis, Pflichtmarke und Fehler am Feld (Vertrag 013 M2-3a, K15).
// Nativ plus eigene Bausteine (ADR 0002): das Eingabeelement bleibt ein normales <input>/<select>/<textarea>.
import { cloneElement, isValidElement, useContext, type ReactElement, type ReactNode } from "react";
import { DEFAULT_LOCALE, translate } from "@/lib/i18n";
import { FormErrorsContext } from "./form-context";

/** Klassen für Eingabeelemente: mindestens 44 px hoch (`.field`), Schrift 16 px (kein Zoom auf dem iPhone), sichtbarer Fokus in `--focus`. */
export const FIELD_CONTROL = "field ui-focus w-full min-w-0 max-w-full text-base";

type ControlProps = {
  id?: string;
  name?: string;
  required?: boolean;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export type FieldProps = {
  /** Feldname wie im Formular (`name` des Eingabeelements); verbindet den Fehler aus `ActionState.fieldErrors`. */
  name: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  /** Überschreibt den Fehler aus dem umgebenden `Form`. */
  error?: string;
  /** Genau ein Eingabeelement. */
  children: ReactElement<ControlProps>;
};

/**
 * Das Feld verknüpft Beschriftung (`label[for]`), Hinweis und Fehler (`aria-describedby`) mit dem Eingabeelement und setzt
 * `aria-invalid`. Ein Fehler steht UNTER dem Feld, mit Symbol und Wort, nie nur als Farbe. Pflicht: sichtbares Wort, `required`, `aria-required`.
 */
export function Field({ name, label, required = false, hint, error, children }: FieldProps) {
  const errors = useContext(FormErrorsContext);
  const message = error ?? errors[name];
  if (!isValidElement<ControlProps>(children)) throw new Error("Field braucht genau ein Eingabeelement als Kind.");
  const id = children.props.id ?? `field-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = message ? `${id}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = cloneElement(children, {
    id,
    name: children.props.name ?? name,
    required: required || children.props.required || undefined,
    "aria-required": required || undefined,
    "aria-invalid": message ? true : undefined,
    "aria-describedby": describedBy,
  });
  return (
    <div className="space-y-1" data-field={name}>
      <label htmlFor={id} className="label !mb-0 flex flex-wrap items-baseline gap-x-2">
        <span>{label}</span>
        {required && <span className="text-xs font-semibold text-ink">{translate(DEFAULT_LOCALE, "ui.required")}</span>}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {message && (
        <p id={errorId} role="alert" className="error flex items-start gap-2 text-sm" data-testid={`error-${name}`}>
          <span aria-hidden>⚠</span>
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}

/** Feldgruppe mit Titel (`<fieldset>`/`<legend>`): zusammengehörige Felder, für Screenreader mit Gruppennamen. */
export function Fieldset({ legend, children }: { legend: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-[10px] border border-line p-3">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}
