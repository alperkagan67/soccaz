import Link from "next/link";
import type { ReactNode } from "react";
import { TierChip } from "@/components/TierChip";
import { ratedCard, type PlayerCardData } from "@/lib/player-card";

// Spielerzeile für Listen (Vertrag 013 v3, AC-30; DESIGN.md "Listen zeigen einfache Zeilen statt Vollkarten"): KEIN eigener Kartenrahmen (keine Karte in Karte), eine Zeile je Person mit Initialen,
// Name, Position, Wertung als Zahl und genau einem Stufen-Chip. Wie PlayerCard bekommt sie NUR das schon gefilterte Objekt aus playerCardFor und entscheidet nichts nach Rolle;
// alles ohne gültige Wertungs-Sicht (neutral, leer, kaputt) erscheint nur mit Initialen.
const POSITION_SHORT: Record<string, string> = { Torwart: "TW", Abwehr: "AB", Mittelfeld: "MF", Angriff: "AN", Flexibel: "FX" };

export function PlayerRow({ data, href, badges, trailing, className = "" }: { data: PlayerCardData; href?: string; badges?: ReactNode; trailing?: ReactNode; className?: string }) {
  const rated = ratedCard(data);
  const initials = typeof (data as { initials?: unknown } | null)?.initials === "string" ? (data as { initials: string }).initials : "?";
  const name = rated?.kind === "full" ? rated.name : null;
  const label = name ?? "Spieler";
  const inner = (
    <>
      {rated?.kind === "nameless" ? null : (
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border border-rim text-sm font-semibold tracking-wide">
          {initials}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span data-testid="player-row-name" className="block truncate font-semibold">
          {rated ? label : initials}
          {badges}
        </span>
        {rated ? (
          <span data-testid="player-row-position" className="block text-sm text-muted">
            {rated.position ? `${POSITION_SHORT[rated.position] ? `${POSITION_SHORT[rated.position]} · ` : ""}${rated.position}` : "Position offen"}
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <div data-testid="player-row" data-kind={rated ? rated.kind : "neutral"} className={`flex items-center gap-3 ${className}`}>
      {href && name ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 hover:text-accent-fg">
          {inner}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{inner}</span>
      )}
      {rated ? (
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-lg font-bold tabular-nums">
            <span className="sr-only">Wertung </span>
            <span data-testid="player-row-rating">{rated.rating}</span>
          </span>
          <TierChip tier={rated.tier} />
        </span>
      ) : null}
      {trailing}
    </div>
  );
}
