"use client";

// Spieler-Onboarding "Willkommen" (Vertrag 013 Version 3, Abschnitt 4 Punkt 2, AC-26): die fünf Schritte als Inhalt für den Baustein `Assistent`. Schrittdefinition, Feldnamen und Prüfung stehen in
// `src/lib/player-onboarding.ts` und laufen am Server genauso (Aktion `completeOnboardingAction`). Diese Datei enthält nur Oberfläche und Texte. Das Geburtsdatum wird nie gespeichert
// (weder im Browser-Entwurf noch in der Datenbank) und steht auch nicht im Klartext in der Zusammenfassung. Die Schritte stehen außerhalb der Komponente (stabile Identität).
import type { ReactNode } from "react";
import { Assistent, type AssistentSchritt, type SchrittProps } from "@/components/ui/Assistent";
import { Field, FIELD_CONTROL } from "@/components/ui/Field";
import { PLAYER_ONBOARDING_ID, PLAYER_ONBOARDING_STEPS, validatePlayerStep, type PlayerStepId } from "@/lib/player-onboarding";
import { CITIES, POSITIONS } from "@/lib/validation";
import type { ActionState } from "@/lib/validation";

const info = (id: PlayerStepId) => PLAYER_ONBOARDING_STEPS.find((s) => s.id === id)!;

/** Häkchen als gesteuertes Feld: der Wert ist "on" oder leer (wie im FormData). */
function Check({ name, label, p, required = false }: { name: string; label: ReactNode; p: SchrittProps; required?: boolean }) {
  return (
    <Field name={name} label={label} required={required} error={p.fehler[name]}>
      <input type="checkbox" className="h-5 w-5 ui-focus" checked={p.werte[name] === "on"} onChange={(e) => p.setze(name, e.target.checked ? "on" : "")} />
    </Field>
  );
}

function Summary({ p }: { p: SchrittProps }) {
  const w = p.werte;
  const row = (label: string, value: ReactNode, key: string) => (
    <div key={key} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-line py-2" data-testid={`summary-${key}`}>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
  return (
    <>
      <dl className="text-sm" data-testid="onboarding-summary">
        {row("Anzeigename", w.name || "—", "name")}
        {row("Stadt", w.city || "—", "city")}
        {row("Position", w.position || "—", "position")}
        {row("Geburtsdatum", w.birthDate ? "eingegeben (wird nur zur Prüfung verwendet und nicht gespeichert)" : "—", "birthdate")}
      </dl>
      {!w.birthDate ? (
        <p className="py-2 text-sm font-medium" role="note" data-testid="summary-birthdate-missing">
          Das Geburtsdatum wird nicht im Entwurf gespeichert. Bitte gehe mit „Zurück“ zu Schritt 3 und gib es erneut ein.
        </p>
      ) : null}
    </>
  );
}

/** Die fünf Schritte. */
export function buildPlayerSteps(): readonly AssistentSchritt[] {
  return [
    {
      ...info("spieler"),
      titel: "Du",
      beschreibung: "Wie sollen wir dich nennen, und wo spielst du?",
      pruefe: (w) => validatePlayerStep("spieler", w),
      render: (p) => (
        <>
          <Field name="name" label="Anzeigename" required error={p.fehler.name}>
            <input className={FIELD_CONTROL} maxLength={40} autoComplete="nickname" {...p.feld("name")} />
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
        </>
      ),
    },
    {
      ...info("position"),
      titel: "Position",
      beschreibung: "Auf welcher Position spielst du am liebsten?",
      pruefe: (w) => validatePlayerStep("position", w),
      render: (p) => (
        <Field name="position" label="Position" required error={p.fehler.position}>
          <select className={FIELD_CONTROL} {...p.feld("position")}>
            <option value="">Bitte wählen</option>
            {POSITIONS.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </Field>
      ),
    },
    {
      ...info("alter"),
      titel: "Alter",
      beschreibung: "Socaz ist ab 16.",
      pruefe: (w) => validatePlayerStep("alter", w),
      render: (p) => (
        <Field name="birthDate" label="Geburtsdatum" required hint="Das Datum wird nur zur Prüfung verwendet und nicht gespeichert." error={p.fehler.birthDate}>
          <input type="date" className={FIELD_CONTROL} autoComplete="bday" {...p.feld("birthDate")} />
        </Field>
      ),
    },
    {
      ...info("zusammenfassung"),
      titel: "Zusammenfassung",
      beschreibung: "Stimmt alles? Mit „Zurück“ kannst du etwas ändern.",
      pruefe: (w) => validatePlayerStep("zusammenfassung", w),
      render: (p) => <Summary p={p} />,
    },
    {
      ...info("abschluss"),
      titel: "Los geht's",
      beschreibung: "Noch eine Bestätigung, dann kannst du loslegen.",
      pruefe: (w) => validatePlayerStep("abschluss", w),
      render: (p) => <Check name="terms" label="Ich akzeptiere die Datenschutzerklärung und die Hausordnung." required p={p} />,
    },
  ];
}

const STEPS = buildPlayerSteps();

export function PlayerOnboarding({ defaultName, next, abschlussAction }: { defaultName: string; next: string; abschlussAction: (prev: ActionState, formData: FormData) => Promise<ActionState> }) {
  return (
    <Assistent
      id={PLAYER_ONBOARDING_ID}
      titel="Willkommen"
      schritte={STEPS}
      anfangswerte={{ name: defaultName, next }}
      abschlussLabel="Los geht's"
      abschlussAction={abschlussAction}
      erfolg={<p data-testid="onboarding-done">Willkommen bei Socaz! Du wirst weitergeleitet.</p>}
    />
  );
}
