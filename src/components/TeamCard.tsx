import { TEAM_RATING_MIN_MEMBERS, type TeamCardData } from "@/lib/player-card";

// Teamkarte (Vertrag 013 v3, AC-19; DESIGN.md "Karten"): Trikotfarbe als Fläche, Schrift automatisch in Weiß oder Fast-Schwarz (textOn, Kontrast >= 4,5:1),
// Wappen-Platzhalter aus Initialen, Teamwertung nur als Zahl (erst ab genug Mitgliedern, sonst ein Hinweis; die Einzelwertungen stehen nie im Objekt).
export function TeamCard({ data, className = "" }: { data: TeamCardData; className?: string }) {
  const rated = data.teamRating !== null;
  return (
    <article
      data-testid="team-card"
      data-color={data.colorKey}
      aria-label={rated ? `Team ${data.name}, Teamwertung ${data.teamRating}` : `Team ${data.name}`}
      className={`flex min-h-24 w-full max-w-xs items-center gap-3 rounded-2xl border border-rim p-3 ${className}`}
      style={{ backgroundColor: data.hex, color: data.textColor }}
    >
      <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-xl border text-lg font-bold tracking-wide" style={{ borderColor: data.textColor }}>
        {data.initials}
      </span>
      <div className="min-w-0 flex-1">
        <p data-testid="team-card-name" className="truncate text-lg font-semibold">
          {data.name}
        </p>
        <p className="text-sm">
          {rated ? (
            <>
              Teamwertung <span data-testid="team-card-rating" className="font-bold tabular-nums">{data.teamRating}</span>
            </>
          ) : (
            `Teamwertung ab ${TEAM_RATING_MIN_MEMBERS} Spielern`
          )}
        </p>
      </div>
    </article>
  );
}
