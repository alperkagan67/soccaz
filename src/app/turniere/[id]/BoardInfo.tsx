import { BoardClock, type ClockBlock } from "./BoardClock";

/**
 * Anzeige oben rechts im Bracket: nach dem Zeitplan Countdown, laufende Spielzeit und Pause, am Ende der Turniersieger.
 */
export function BoardInfo({ blocks, slotMinutes, gapMinutes, winner }: { blocks: ClockBlock[] | null; slotMinutes: number; gapMinutes: number; winner: string | null }) {
  if (winner) {
    return (
      <div className="w-full space-y-1 rounded-lg border border-line bg-panel p-3 text-center" data-testid="board-info">
        <p className="text-xs uppercase tracking-wide text-muted">Turniersieger</p>
        <p className="font-heading text-lg font-extrabold text-green">🏆 {winner}</p>
      </div>
    );
  }
  if (!blocks) return null;
  return (
    <div className="w-full" data-testid="board-info">
      <BoardClock blocks={blocks} slotMinutes={slotMinutes} gapMinutes={gapMinutes} />
    </div>
  );
}
