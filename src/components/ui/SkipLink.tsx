import { DEFAULT_LOCALE, translate } from "@/lib/i18n";

/**
 * Erstes fokussierbares Element der Seite: springt zum Inhalt (`<main id="inhalt" tabIndex={-1}>`).
 * Nur bei Fokus sichtbar (sr-only, sonst normal). Rahmen und Abstand gelten nur im Fokus, sonst bliebe der Link größer als 1 px.
 * Der Einbau ins Layout ist ein eigener Schritt (Plan M2, Schritt C).
 */
export function SkipLink({ label }: { label?: string }) {
  return (
    <a
      href="#inhalt"
      className="ui-focus sr-only text-sm font-semibold text-ink focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-[10px] focus:border focus:border-rim focus:bg-panel focus:px-4 focus:py-3"
    >
      {label ?? translate(DEFAULT_LOCALE, "ui.skipToContent")}
    </a>
  );
}
