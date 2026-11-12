"use client";

// Rückfrage vor Unumkehrbarem oder Folgenreichem (Vertrag 013 M2-3b, K15). Natives <dialog> mit showModal(): Fokus im Dialog, Hintergrund inert, Escape schließt.
// Dazu eine eigene Fokus-Falle (Tab/Umschalt+Tab bleiben im Dialog) und die Rückgabe des Fokus an den öffnenden Knopf.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { DEFAULT_LOCALE, translate, type MessageKey } from "@/lib/i18n";
import type { ActionState } from "@/lib/validation";
import { Button } from "./Button";
import type { ButtonSize, ButtonVariant } from "./button-styles";
import { FIELD_CONTROL } from "./Field";

export type ConfirmDialogProps = {
  /** Der öffnende Knopf. */
  trigger: { label: ReactNode; variant?: ButtonVariant; size?: ButtonSize };
  title: string;
  /** Die Folge in einem Satz. */
  body: string;
  /** Betrag oder Folge, die sichtbar bleiben soll (z. B. „12,00 € werden abgebucht“); erscheint hervorgehoben mit dem Wort „Folge“. */
  consequence?: string;
  /** Benennt die Handlung („Spieler entfernen“), nie nur „OK“. */
  confirmLabel: string;
  /** Standard „Abbrechen“. */
  cancelLabel?: string;
  /** Läuft nach „Bestätigen“ (Server-Aktion, vom Server gereicht, oder Client-Funktion; der Name endet auf Action, weil Next so serialisierbare Props prüft). Ein `error` im Ergebnis (oder eine Ausnahme) bleibt im Dialog sichtbar; sonst schließt er. */
  onConfirmAction: () => Promise<ActionState> | ActionState | void;
  /** Unumkehrbar: Rahmen und Symbol, Abbrechen hat den Startfokus. */
  danger?: boolean;
  /** Wort, das getippt werden muss, bevor bestätigt werden kann (z. B. LÖSCHEN). */
  confirmText?: string;
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function errorText(result: ActionState | void): string | undefined {
  if (!result) return undefined;
  if (result.error) return result.error;
  const fields = Object.values(result.fieldErrors ?? {});
  return fields.length > 0 ? fields.join(" ") : undefined;
}

export function ConfirmDialog({ trigger, title, body, consequence, confirmLabel, cancelLabel, onConfirmAction, danger = false, confirmText }: ConfirmDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [typed, setTyped] = useState("");
  const t = (key: MessageKey, vars?: Record<string, string>) => translate(DEFAULT_LOCALE, key, vars);
  const mayConfirm = !confirmText || typed.trim() === confirmText;

  function open(target: HTMLElement) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    opener.current = target;
    setError(undefined);
    setTyped("");
    dialog.showModal();
    // Startfokus: bei `danger` Abbrechen (die sichere Wahl), mit Bestätigungswort das Eingabefeld, sonst die Bestätigung
    const start = danger ? '[data-role="cancel"]' : confirmText ? "input" : '[data-role="confirm"]';
    dialog.querySelector<HTMLElement>(start)?.focus();
  }

  function close() {
    dialogRef.current?.close();
  }

  async function confirm() {
    if (pending || !mayConfirm) return;
    setPending(true);
    setError(undefined);
    try {
      const message = errorText(await onConfirmAction());
      if (message) setError(message);
      else close();
    } catch {
      setError(t("ui.confirmFailed"));
    } finally {
      setPending(false);
    }
  }

  // Fokus-Falle: am Ende springt Tab zum Anfang, am Anfang Umschalt+Tab zum Ende (der Browser würde sonst in seine Leiste wechseln)
  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== "Tab") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const outside = !e.currentTarget.contains(active);
    if (e.shiftKey && (active === first || outside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || outside)) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <Button variant={trigger.variant ?? (danger ? "danger" : "secondary")} size={trigger.size} onClick={(e) => open(e.currentTarget)}>
        {trigger.label}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        // Escape: während die Aktion läuft nicht abbrechen (sonst bliebe unklar, ob sie durchging)
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
        // Vormerkung M3: Ist der Auslöser nach der Aktion nicht mehr im DOM (Weiterleitung, Eintrag entfernt), scheitert diese Fokus-Rückgabe still;
        // die Seite muss dann selbst einen sinnvollen Fokus setzen (z. B. auf die Überschrift der Liste).
        onClose={() => opener.current?.focus()}
        onKeyDown={onKeyDown}
        className={`m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl bg-panel p-0 text-ink backdrop:bg-black/70 ${danger ? "border-2 border-danger" : "border border-line"}`}
        data-testid="confirm-dialog"
      >
        <div className="space-y-4 p-4">
          <h2 id={`${id}-title`} className="text-lg font-bold">
            {danger && <span aria-hidden="true">⚠ </span>}
            {title}
          </h2>
          <p id={`${id}-body`}>{body}</p>
          {consequence && (
            <p className="rounded-lg border-2 border-line px-3 py-2 font-semibold" data-testid="confirm-consequence">
              <span className="text-muted">{t("ui.confirmConsequence")}: </span>
              {consequence}
            </p>
          )}
          {confirmText && (
            <div className="space-y-1">
              <label htmlFor={`${id}-word`} className="block text-sm font-semibold">
                {t("ui.confirmType", { word: confirmText })}
              </label>
              <input
                id={`${id}-word`}
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className={FIELD_CONTROL}
              />
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:w-full sm:[&>button]:w-auto">
            <Button data-role="cancel" disabled={pending} onClick={close}>
              {cancelLabel ?? t("ui.cancel")}
            </Button>
            <Button data-role="confirm" variant={danger ? "danger" : "primary"} pending={pending} disabled={!mayConfirm} onClick={confirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
