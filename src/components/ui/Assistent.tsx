"use client";

// Schritt-für-Schritt-Ablauf auf EINER URL (Vertrag 013 Version 3, Abschnitt 4, AC-25/26): Fortschritt („Schritt 2 von 5“), Weiter und Zurück, ein Gedanke pro Schritt,
// Pflichtprüfung je Schritt mit Fehler am Feld, Entwurf bleibt in der Browser-Sitzung erhalten (sessionStorage, nie auf dem Server), Enter = Weiter,
// nach jedem Schrittwechsel springt der Fokus auf die Überschrift des Schritts. Keine neue Seite, kein `?schritt=`, keine Bewegung (Schrittwechsel ohne Animation).
//
// Benutzung: `schritte` enthält Funktionen (`render`, `pruefe`) und gehört deshalb in eine Client-Komponente; nur `abschlussAction` darf eine Server-Aktion sein
// (Signatur wie bei `Form`: (vorher, formData) => ActionState; die Werte aller Felder gehen als FormData hinein, bestehende Aktionen bleiben nutzbar).
import { useEffect, useId, useMemo, useRef, useState, useTransition, type ChangeEvent, type ReactNode, type SyntheticEvent } from "react";
import { DEFAULT_LOCALE, translate } from "@/lib/i18n";
import type { ActionState } from "@/lib/validation";
import {
  entwurfSchluessel,
  fortschritt,
  istLetzterSchritt,
  leseEntwurf,
  schrittStatus,
  serialisiereEntwurf,
  setzeWert,
  springeZuFehler,
  startZustand,
  weiter,
  zurueck,
  type Fehler,
  type SchrittInfo,
  type Werte,
  type Zustand,
} from "@/lib/assistent";
import { Button } from "./Button";

export type SchrittProps = {
  werte: Werte;
  fehler: Fehler;
  setze: (name: string, wert: string) => void;
  /** Eigenschaften für ein gesteuertes Eingabeelement: `<input {...feld("name")} />` (in `Field` einbetten). */
  feld: (name: string) => { name: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void };
};

export type AssistentSchritt = SchrittInfo & {
  titel: string;
  beschreibung?: ReactNode;
  render: (p: SchrittProps) => ReactNode;
  /** Pflichtprüfung dieses Schritts: Fehlertext je Feldname; leer = weiter erlaubt. Der Server prüft am Ende trotzdem alles. */
  pruefe?: (werte: Werte) => Fehler;
};

export type AssistentProps = {
  /** Kennung des Ablaufs (Entwurfsschlüssel), z. B. „halle-onboarding“. */
  id: string;
  /** Überschrift des Ablaufs (benennt den Bereich für Screenreader). */
  titel: string;
  schritte: readonly AssistentSchritt[];
  anfangswerte?: Werte;
  /** Beschriftung der Abschluss-Handlung im letzten Schritt, z. B. „Anfrage senden“. */
  abschlussLabel: string;
  /** Server-Aktion des Abschlusses (Name endet auf Action, wie Next es für Server-Aktionen als Prop verlangt). */
  abschlussAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Inhalt nach erfolgreichem Abschluss (Standard: „Gespeichert.“). */
  erfolg?: ReactNode;
};

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(DEFAULT_LOCALE, key, vars);

function alleFehler(schritte: readonly AssistentSchritt[], werte: Werte): Fehler {
  const fehler: Record<string, string> = {};
  for (const s of schritte) Object.assign(fehler, s.pruefe?.(werte) ?? {});
  return fehler;
}

export function Assistent({ id, titel, schritte, anfangswerte, abschlussLabel, abschlussAction, erfolg }: AssistentProps) {
  const uid = useId();
  const [z, setZ] = useState<Zustand>(() => startZustand(anfangswerte ?? {}));
  const [bereit, setBereit] = useState(false); // erst nach dem Lesen des Entwurfs wird geschrieben (sonst überschreibt der leere Start den Entwurf)
  const [fertig, setFertig] = useState(false);
  const [allgemein, setAllgemein] = useState<string | undefined>();
  const [fokusUeberschrift, setFokusUeberschrift] = useState(0);
  const [fokusFehler, setFokusFehler] = useState(0);
  const [pending, startTransition] = useTransition();
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const infos = useMemo<readonly SchrittInfo[]>(() => schritte.map((s) => ({ id: s.id, felder: s.felder, nichtSpeichern: s.nichtSpeichern })), [schritte]);
  const infosRef = useRef(infos);
  useEffect(() => {
    infosRef.current = infos; // vor den Effekten unten, damit Lesen und Schreiben des Entwurfs die aktuellen Schritte kennen
  }, [infos]);
  const key = entwurfSchluessel(id);
  const anzahl = schritte.length;
  const aktuell = schritte[Math.min(z.schritt, anzahl - 1)];
  const letzter = istLetzterSchritt(z, anzahl);
  const { n, m } = fortschritt(z, anzahl);

  // Entwurf lesen (nach dem Mount, kein Unterschied zwischen Server- und Browser-Markup)
  useEffect(() => {
    try {
      const entwurf = leseEntwurf(window.sessionStorage.getItem(key), infosRef.current);
      if (entwurf) setZ((alt) => ({ ...alt, schritt: entwurf.schritt, werte: { ...alt.werte, ...entwurf.werte } }));
    } catch {
      /* sessionStorage nicht verfügbar (privater Modus): der Ablauf läuft ohne Entwurf weiter */
    }
    setBereit(true);
  }, [key]);

  // Entwurf schreiben
  useEffect(() => {
    if (!bereit || fertig) return;
    try {
      window.sessionStorage.setItem(key, serialisiereEntwurf(z, infosRef.current));
    } catch {
      /* siehe oben */
    }
  }, [bereit, fertig, key, z]);

  // Fokus: Überschrift des neuen Schritts (nur nach Weiter/Zurück, nie beim ersten Laden), erstes fehlerhaftes Feld nach einem Fehler
  useEffect(() => {
    if (fokusUeberschrift > 0) ueberschrift.current?.focus();
  }, [fokusUeberschrift]);
  useEffect(() => {
    if (fokusFehler > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fokusFehler]);

  const setze = (name: string, wert: string) => setZ((alt) => setzeWert(alt, name, wert));
  const feld: SchrittProps["feld"] = (name) => ({ name, value: z.werte[name] ?? "", onChange: (e) => setze(name, e.target.value) });

  const entwurfLoeschen = () => {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* siehe oben */
    }
  };

  const abschliessen = () => {
    const fehler = alleFehler(schritte, z.werte);
    if (Object.keys(fehler).length > 0) {
      setZ((alt) => springeZuFehler(alt, infos, fehler));
      setFokusUeberschrift((x) => x + 1);
      setFokusFehler((x) => x + 1);
      return;
    }
    const daten = new FormData();
    for (const s of schritte) for (const name of s.felder) daten.set(name, z.werte[name] ?? "");
    setAllgemein(undefined);
    entwurfLoeschen(); // bei Erfolg oder Weiterleitung bleibt kein alter Entwurf liegen; bei einem Fehler schreibt der Effekt ihn wieder
    startTransition(async () => {
      const antwort = await abschlussAction(undefined, daten);
      if (!antwort?.error && !antwort?.fieldErrors) {
        setFertig(true);
        return;
      }
      setAllgemein(antwort.error);
      setZ((alt) => springeZuFehler(alt, infos, antwort.fieldErrors ?? {}));
      setFokusFehler((x) => x + 1);
      try {
        window.sessionStorage.setItem(key, serialisiereEntwurf(z, infos));
      } catch {
        /* siehe oben */
      }
    });
  };

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault(); // Enter und der Knopf laufen hier zusammen: im letzten Schritt Abschluss, sonst Weiter
    if (pending) return;
    if (letzter) {
      abschliessen();
      return;
    }
    const fehler = aktuell.pruefe?.(z.werte) ?? {};
    setZ((alt) => weiter(alt, anzahl, fehler));
    if (Object.keys(fehler).length > 0) setFokusFehler((x) => x + 1);
    else setFokusUeberschrift((x) => x + 1);
  };

  const statusText = { erledigt: t("ui.assistent.stepDone"), aktuell: t("ui.assistent.stepCurrent"), offen: t("ui.assistent.stepOpen") } as const;

  if (fertig) {
    return (
      <section aria-labelledby={`${uid}-titel`} className="space-y-3">
        <h2 id={`${uid}-titel`} className="text-xl font-semibold">
          {titel}
        </h2>
        <div role="status" data-testid="assistent-fertig">
          {erfolg ?? t("ui.saved")}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${uid}-titel`} className="space-y-4" data-testid="assistent" data-schritt={z.schritt + 1}>
      <p id={`${uid}-titel`} className="text-sm font-semibold text-muted">
        {titel}
      </p>
      <p className="text-sm text-muted" data-testid="assistent-fortschritt">
        {t("ui.assistent.progress", { n, m })}
      </p>
      <ol aria-label={t("ui.assistent.steps")} className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {schritte.map((s, i) => {
          const status = schrittStatus(z, i);
          return (
            <li key={s.id} aria-current={status === "aktuell" ? "step" : undefined} data-testid={`assistent-punkt-${s.id}`} className={status === "aktuell" ? "font-semibold text-ink" : "text-muted"}>
              <span aria-hidden>{status === "erledigt" ? "✓" : i + 1}</span>{" "}
              <span className={status === "aktuell" ? undefined : "sr-only sm:not-sr-only"}>{s.titel}</span>
              <span className="sr-only"> ({statusText[status]})</span>
            </li>
          );
        })}
      </ol>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4" data-testid={`assistent-form-${aktuell.id}`}>
        <h2 ref={ueberschrift} tabIndex={-1} className="text-xl font-semibold outline-none ui-focus" data-testid="assistent-ueberschrift">
          {aktuell.titel}
        </h2>
        {aktuell.beschreibung && <div className="text-sm text-muted">{aktuell.beschreibung}</div>}
        <div className="space-y-4">{aktuell.render({ werte: z.werte, fehler: z.fehler, setze, feld })}</div>
        {Object.keys(z.fehler).length > 0 && <p className="text-sm font-semibold">{t("ui.checkFields")}</p>}
        {allgemein && (
          <p className="error" role="alert">
            {allgemein}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {z.schritt > 0 && (
            <Button
              variant="secondary"
              data-testid="assistent-zurueck"
              onClick={() => {
                setZ((alt) => zurueck(alt));
                setFokusUeberschrift((x) => x + 1);
              }}
            >
              {t("ui.assistent.back")}
            </Button>
          )}
          <Button type="submit" variant="primary" pending={pending} data-testid={letzter ? "assistent-abschluss" : "assistent-weiter"}>
            {letzter ? abschlussLabel : t("ui.assistent.next")}
          </Button>
        </div>
      </form>
    </section>
  );
}
