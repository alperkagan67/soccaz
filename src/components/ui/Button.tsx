"use client";

// Client-Komponente: der Handler, der Auslösen bei pending/disabled blockt, darf nicht aus einer Server-Komponente kommen.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { DEFAULT_LOCALE, translate } from "@/lib/i18n";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-styles";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "children"> & {
  /** `primary` höchstens einmal je Seite (die eine Hauptaktion). */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Läuft die Aktion: Wort statt Beschriftung, `aria-busy`, nicht erneut auslösbar. */
  pending?: boolean;
  /** Text bei `pending`; Standard „Bitte warten…“ aus i18n. */
  pendingLabel?: string;
  children: ReactNode;
};

/**
 * Knopf für Aktionen (nie für Navigation, dafür `LinkButton`). Mindestens 44 px hoch, sichtbarer Fokus,
 * `type="button"` als Standard. Gesperrt (`disabled`/`pending`) bleibt sichtbar: gestrichelter Rahmen statt nur blasser.
 */
export function Button({ variant = "secondary", size = "md", pending = false, pendingLabel, type = "button", disabled, children, onClick, ...rest }: ButtonProps) {
  const blocked = Boolean(disabled) || pending;
  return (
    <button
      {...rest}
      type={type}
      style={undefined} // auch zur Laufzeit kein Stil von außen
      disabled={disabled}
      // bei `pending` bleibt der Knopf fokussierbar (aria-disabled statt disabled); der Handler blockt das Auslösen
      aria-disabled={blocked || undefined}
      aria-busy={pending || undefined}
      onClick={blocked ? (e) => e.preventDefault() : onClick}
      className={buttonClasses(variant, size, blocked)}
    >
      {pending ? (pendingLabel ?? translate(DEFAULT_LOCALE, "ui.pending")) : children}
    </button>
  );
}
