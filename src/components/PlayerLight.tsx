import type { CardStatus } from "@/db/schema";
import { CARD_LEGEND, cardView } from "@/lib/card-view";

/**
 * Ampel pro Spieler in der Lobby:
 *  rot = in der Lobby (noch nicht bereit), orange = bereit und Anteil bezahlt (Spiel noch nicht bestätigt), grün = Spiel bestätigt.
 * Sind Zahlungen noch aus, heißt orange nur „bereit“.
 */
export type Light = "red" | "orange" | "green";

export function lightFor(p: { ready: boolean; paid: boolean }, matchConfirmed: boolean): Light {
  if (matchConfirmed && (p.ready || p.paid)) return "green";
  if (p.ready || p.paid) return "orange";
  return "red";
}

const COLOR: Record<Light, string> = { red: "#ef4444", orange: "#f59e0b", green: "#22c55e" };

export function lightLabel(light: Light, paymentsOn: boolean): string {
  if (light === "green") return "Bestätigt";
  if (light === "orange") return paymentsOn ? "Bereit und bezahlt" : "Bereit";
  return "In der Lobby";
}

export function PlayerLight({ light, paymentsOn = true, showLabel = false }: { light: Light; paymentsOn?: boolean; showLabel?: boolean }) {
  const label = lightLabel(light, paymentsOn);
  return (
    <span className="inline-flex items-center gap-1.5" title={label} data-light={light}>
      <span className="inline-block size-3 rounded-full" style={{ background: COLOR[light], boxShadow: `0 0 6px ${COLOR[light]}88` }} aria-hidden />
      {showLabel ? <span className="text-xs text-muted">{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

export function LightLegend({ paymentsOn = true }: { paymentsOn?: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legende der Ampel" data-testid="light-legend">
      <PlayerLight light="red" paymentsOn={paymentsOn} showLabel />
      <PlayerLight light="orange" paymentsOn={paymentsOn} showLabel />
      <PlayerLight light="green" paymentsOn={paymentsOn} showLabel />
    </p>
  );
}

/**
 * Kartenmodell (Vertrag 012, AC-12): Form UND Wort, nie nur Farbe. Grün = Karte hinterlegt (Haken im gefüllten Kreis), rot = keine Karte (Kreuz im Ring)
 * oder Abbuchung fehlgeschlagen (Ausrufezeichen im Ring), neutral = Abbuchung läuft (Pünktchen im Ring). Die Zuordnung steht in src/lib/card-view.ts.
 */
export function CardLight({ status, showLabel = true }: { status: CardStatus; showLabel?: boolean }) {
  const v = cardView(status);
  const color = v.tone === "green" ? COLOR.green : v.tone === "red" ? COLOR.red : "var(--color-muted, #9ca3af)";
  return (
    <span className="inline-flex items-center gap-1.5" title={v.label} data-card-light={v.tone === "neutral" ? "neutral" : v.tone} data-card-status={status}>
      <span
        className="inline-flex size-5 items-center justify-center rounded-full text-xs font-bold leading-none"
        style={v.filled ? { background: color, color: "#04130a" } : { border: `2px ${v.tone === "neutral" ? "dashed" : "solid"} ${color}`, color }}
        aria-hidden
      >
        {v.glyph}
      </span>
      {showLabel ? <span className="text-xs text-muted">{v.label}</span> : <span className="sr-only">{v.label}</span>}
    </span>
  );
}

export function CardLightLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legende der Ampel" data-testid="card-light-legend">
      {CARD_LEGEND.map((status) => (
        <CardLight key={status} status={status} />
      ))}
    </p>
  );
}
