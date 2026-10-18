import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n";
import { setLocaleAction } from "@/server/locale-actions";

/** Zwei Knöpfe ohne JavaScript-Pflicht: jeder ist ein eigenes Formular. */
export function LanguageSwitch({ current, label }: { current: Locale; label: string }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      {LOCALES.map((locale) => (
        <form key={locale} action={setLocaleAction.bind(null, locale)}>
          <button className={locale === current ? "font-semibold text-ink" : "hover:text-ink"} aria-pressed={locale === current} lang={locale}>
            {LOCALE_NAMES[locale]}
          </button>
        </form>
      ))}
    </div>
  );
}
