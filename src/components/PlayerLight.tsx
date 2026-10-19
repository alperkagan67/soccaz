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
