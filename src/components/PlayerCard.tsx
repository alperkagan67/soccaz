import { TEAM_COLORS } from "@/lib/color";
import { ratedCard, type PlayerCardData } from "@/lib/player-card";
import { TIER_LABELS } from "@/lib/rating";
import { TierChip } from "@/components/TierChip";

// Spielerkarte (Vertrag 013 v3, AC-17; DESIGN.md "Karten"). Reine Darstellung: die Komponente bekommt NUR das schon gefilterte Objekt aus playerCardFor
// (serverseitige Sichtbarkeit) und rendert genau dessen Felder. Sie liest nichts nach und verzweigt nie nach Rolle: ein Feld, das nicht im Objekt steht, kann nicht im HTML stehen.
// Stufe und Wertung stehen immer auch als Text da (nie nur Farbe); Teamfarbe ist nur der schmale Streifen links.

/** Kürzel und Wort der Position (die fünf Werte aus POSITIONS); unbekannte Werte erscheinen als Wort ohne Kürzel. */
const POSITION_SHORT: Record<string, string> = { Torwart: "TW", Abwehr: "AB", Mittelfeld: "MF", Angriff: "AN", Flexibel: "FX" };

function stripeHex(colorKey: string): string {
  return (TEAM_COLORS.find((c) => c.key === colorKey) ?? TEAM_COLORS[0]).hex;
}

export function PlayerCard({ data: given, className = "" }: { data: PlayerCardData; className?: string }) {
  // Fail-closed (Review security): NUR die beiden bekannten Wertungs-Varianten ("full", "nameless") führen in die volle Sicht. Alles andere (fehlendes oder kaputtes Objekt, JSON ohne kind,
  // unbekannte Art) wird wie die neutrale Karte gerendert und liest NUR die Initialen als Text; Wertung, Stufe, Position und Name eines unbekannten Objekts erscheinen nie.
  const data = (given && typeof given === "object" ? given : {}) as Partial<PlayerCardData> & { kind?: string };
  const known = ratedCard(data) !== null;
  const hex = stripeHex(typeof data.colorKey === "string" ? data.colorKey : "");
  const base = `relative isolate flex min-h-28 w-full max-w-xs items-stretch gap-3 overflow-hidden rounded-2xl border border-line bg-panel p-3 pl-5 text-ink ${className}`;
  const stripe = <span aria-hidden="true" data-testid="player-card-stripe" className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: hex }} />;

  if (!known) {
    const initials = typeof (data as { initials?: unknown }).initials === "string" ? (data as { initials: string }).initials : "?";
    return (
      <article data-testid="player-card" data-kind="neutral" aria-label={`Spielerkarte ${initials}`} className={base}>
        {stripe}
        <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center self-center rounded-full border border-rim text-xl font-semibold tracking-wide">
          {initials}
        </span>
        <p className="self-center text-sm text-muted">Name, Wertung und Position siehst du nach der Anmeldung.</p>
      </article>
    );
  }

  const card = data as Extract<PlayerCardData, { kind: "full" | "nameless" }>;
  const tierLabel = TIER_LABELS[card.tier];
  const posShort = card.position ? POSITION_SHORT[card.position] : null;
  const summary = [card.kind === "full" ? card.name : "Spieler", `Wertung ${card.rating}`, `Stufe ${tierLabel}`, card.position ? `Position ${card.position}` : null].filter(Boolean).join(", ");

  return (
    <article data-testid="player-card" data-kind={card.kind} aria-label={summary} className={base}>
      {stripe}
      <div className="flex shrink-0 flex-col items-center justify-center">
        <span data-testid="player-card-rating" className="text-5xl font-bold leading-none tabular-nums">
          {card.rating}
        </span>
        <span className="mt-1 text-xs uppercase tracking-wide text-muted">Wertung</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="min-w-0">
          {card.kind === "full" ? (
            <p data-testid="player-card-name" className="truncate text-lg font-semibold">
              {card.name}
            </p>
          ) : (
            <p className="text-lg font-semibold text-muted">Spieler</p>
          )}
          {card.position ? (
            <p data-testid="player-card-position" className="text-sm text-muted">
              {posShort ? <span className="mr-1.5 font-semibold text-ink">{posShort}</span> : null}
              {card.position}
            </p>
          ) : null}
        </div>
        <TierChip tier={card.tier} />
      </div>
      {card.kind === "full" ? (
        <span aria-hidden="true" className="absolute right-3 top-2 text-xs font-semibold tracking-wide text-muted">
          {card.initials}
        </span>
      ) : null}
    </article>
  );
}
