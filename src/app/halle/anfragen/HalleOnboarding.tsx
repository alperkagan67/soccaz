"use client";

// Hallen-Onboarding (Vertrag 013 Version 3, M2d, AC-25): die fünf Schritte als Inhalt für den Baustein `Assistent`. Die Schrittdefinition (Felder, nichtSpeichern) und die Prüfung stehen in
// `src/lib/venue-onboarding.ts` und laufen am Server genauso (Aktion `requestVenueAction`). Diese Datei enthält nur Oberfläche und Texte. Die Schritte stehen außerhalb der Komponente
// (stabile Identität: der Baustein leitet daraus die Entwurfs-Schritte ab).
import Link from "next/link";
import type { ReactNode } from "react";
import { Assistent, type AssistentSchritt, type SchrittProps } from "@/components/ui/Assistent";
import { Field, FIELD_CONTROL } from "@/components/ui/Field";
import { DEFAULT_LOCALE, translate } from "@/lib/i18n";
import { formatEuro, parseEuro } from "@/lib/money";
import { CITIES } from "@/lib/validation";
import { ONBOARDING_ID, ONBOARDING_STEPS, validateStep, type OnboardingStepId } from "@/lib/venue-onboarding";
import type { ActionState } from "@/lib/validation";

const t = (key: Parameters<typeof translate>[1]) => translate(DEFAULT_LOCALE, key);
const info = (id: OnboardingStepId) => ONBOARDING_STEPS.find((s) => s.id === id)!;

/** Häkchen als gesteuertes Feld: der Wert ist "on" oder leer (wie im FormData). */
function Check({ name, label, p, required = false, hint }: { name: string; label: ReactNode; p: SchrittProps; required?: boolean; hint?: ReactNode }) {
  return (
    <Field name={name} label={label} required={required} hint={hint} error={p.fehler[name]}>
      <input type="checkbox" className="h-5 w-5 ui-focus" checked={p.werte[name] === "on"} onChange={(e) => p.setze(name, e.target.checked ? "on" : "")} />
    </Field>
  );
}

function Summary({ p }: { p: SchrittProps }) {
  const w = p.werte;
  const euro = (v: string | undefined) => {
    const cents = parseEuro(v ?? "");
    return cents === null ? "—" : formatEuro(cents);
  };
  const row = (label: string, value: ReactNode, key: string) => (
    <div key={key} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-line py-2" data-testid={`summary-${key}`}>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
  return (
    <dl className="text-sm" data-testid="onboarding-summary">
      {row("Name", w.name, "name")}
      {row("Stadt", w.city, "city")}
      {row("Adresse", w.address, "address")}
      {row("Kontakt", w.contact || "—", "contact")}
      {row("Anzahl Plätze", w.courts, "courts")}
      {row("Boden", w.surface || "—", "surface")}
      {row("Duschen", w.hasShowers === "on" ? "ja" : "nein", "showers")}
      {row("Parkplatz", w.hasParking === "on" ? "ja" : "nein", "parking")}
      {row("Hallenmiete je Termin, 60 Minuten", euro(w.price60), "price60")}
      {row("Hallenmiete je Termin, 90 Minuten", euro(w.price90), "price90")}
    </dl>
  );
}

/** Die fünf Schritte. `commissionPercent` kommt vom Server (Standardsatz laut 012, nur Anzeige). */
export function buildHalleSteps(commissionPercent: number): readonly AssistentSchritt[] {
  return [
    {
      ...info("halle"),
      titel: "Deine Halle",
      beschreibung: "Wie heißt die Halle und wo steht sie? Diese Angaben sehen wir nach der Freischaltung auch die Spieler.",
      pruefe: (w) => validateStep("halle", w),
      render: (p) => (
        <>
          <Field name="name" label="Name der Halle" required error={p.fehler.name}>
            <input className={FIELD_CONTROL} autoComplete="off" {...p.feld("name")} />
          </Field>
          <Field name="city" label="Stadt" required error={p.fehler.city}>
            <select className={FIELD_CONTROL} {...p.feld("city")}>
              <option value="">Bitte wählen</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field name="address" label="Adresse" required error={p.fehler.address}>
            <input className={FIELD_CONTROL} autoComplete="off" {...p.feld("address")} />
          </Field>
          <Field name="contact" label="Kontakt (E-Mail oder Telefon)" required hint="Nur für uns, damit wir dich bei Rückfragen erreichen. Nicht öffentlich und nicht im Entwurf gespeichert." error={p.fehler.contact}>
            <input className={FIELD_CONTROL} autoComplete="off" {...p.feld("contact")} />
          </Field>
        </>
      ),
    },
    {
      ...info("plaetze"),
      titel: "Plätze",
      beschreibung: "Wie viele Plätze hat die Halle?",
      pruefe: (w) => validateStep("plaetze", w),
      render: (p) => (
        <>
          <Field name="courts" label="Anzahl Plätze" required hint="Eine ganze Zahl von 1 bis 20." error={p.fehler.courts}>
            <input className={FIELD_CONTROL} inputMode="numeric" autoComplete="off" {...p.feld("courts")} />
          </Field>
          <Field name="surface" label="Boden (optional)" hint="Zum Beispiel Kunstrasen oder Hartboden." error={p.fehler.surface}>
            <input className={FIELD_CONTROL} autoComplete="off" {...p.feld("surface")} />
          </Field>
          <Check name="hasShowers" label="Duschen vorhanden" p={p} />
          <Check name="hasParking" label="Parkplatz vorhanden" p={p} />
        </>
      ),
    },
    {
      ...info("preise"),
      titel: "Preise",
      beschreibung: "Was kostet die Halle je Termin? Der Preis gilt für alle Plätze und ist die Hallenmiete (kein Spielerpreis).",
      pruefe: (w) => validateStep("preise", w),
      render: (p) => (
        <>
          <Field name="price60" label="Hallenmiete je Termin, 60 Minuten (Euro)" required hint="Zwischen 1,00 und 1.000,00 Euro, zum Beispiel 40,00." error={p.fehler.price60}>
            <input className={FIELD_CONTROL} inputMode="decimal" autoComplete="off" {...p.feld("price60")} />
          </Field>
          <Field name="price90" label="Hallenmiete je Termin, 90 Minuten (Euro)" required hint="Zwischen 1,00 und 1.000,00 Euro, zum Beispiel 55,00." error={p.fehler.price90}>
            <input className={FIELD_CONTROL} inputMode="decimal" autoComplete="off" {...p.feld("price90")} />
          </Field>
        </>
      ),
    },
    {
      ...info("zusammenfassung"),
      titel: "Zusammenfassung",
      beschreibung: "Stimmt alles? Mit „Zurück“ kannst du etwas ändern.",
      pruefe: (w) => validateStep("zusammenfassung", w),
      render: (p) => <Summary p={p} />,
    },
    {
      ...info("abschluss"),
      titel: "Anfrage senden",
      beschreibung: `Für gebuchte Spiele berechnet Soccaz eine Provision von ${commissionPercent.toFixed(2).replace(".", ",")} % der Hallenmiete.`,
      pruefe: (w) => validateStep("abschluss", w),
      render: (p) => (
        <>
          <div className="space-y-2 rounded-[10px] border border-line p-3" data-testid="onboarding-terms">
            <p className="text-xs font-semibold uppercase" data-testid="onboarding-terms-draft">
              {t("hallen.onboarding.terms.draftNote")}
            </p>
            <p className="text-sm">{t("hallen.onboarding.terms.entwurf")}</p>
          </div>
          <Check name="terms" label="Ich bestätige die Bedingungen (Entwurf)" required p={p} />
        </>
      ),
    },
  ];
}

export function HalleOnboarding({ commissionPercent, abschlussAction }: { commissionPercent: number; abschlussAction: (prev: ActionState, formData: FormData) => Promise<ActionState> }) {
  return (
    <Assistent
      id={ONBOARDING_ID}
      titel="Halle anfragen"
      schritte={buildHalleSteps(commissionPercent)}
      abschlussLabel="Anfrage senden"
      abschlussAction={abschlussAction}
      erfolg={
        <p data-testid="onboarding-done">
          Anfrage gesendet. Wir prüfen sie und melden uns. Den Stand siehst du unter <Link href="/halle" className="underline">Meine Halle</Link>. Bis zur Freischaltung ist die Halle nicht sichtbar und nicht buchbar.
        </p>
      }
    />
  );
}
