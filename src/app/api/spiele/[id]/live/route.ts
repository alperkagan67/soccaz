import { initialsOf } from "@/lib/guest-roster";
import { getMatchPage } from "@/server/results";

/** Spielstand als JSON für Overlays und andere Werkzeuge. Nur für öffentliche Spiele, frei abrufbar, ohne Anmeldung: Torschützen daher immer nur als Initialen (AC-17, Entscheid t2q 2026-11-24; Produktfolge: Werkzeuge, die `player` als Namen lesen, sehen Initialen). */
export async function GET(_request: Request, ctx: RouteContext<"/api/spiele/[id]/live">) {
  const { id } = await ctx.params;
  const page = await getMatchPage(id, null);
  if (!page || page.match.visibility !== "public") return Response.json({ error: "Nicht gefunden" }, { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
  const { match, live, result, phase } = page;
  const shown = result && (match.status === "played" || result.confirmedHome || result.confirmedAway) ? { home: result.homeScore, away: result.awayScore } : live;
  return Response.json(
    {
      id: match.id,
      status: match.status,
      phase,
      startsAt: match.startsAt.toISOString(),
      durationMin: match.durationMin,
      home: { name: match.homeName, score: shown.home },
      away: { name: match.awayName, score: shown.away },
      goals: page.events.filter((e) => e.type === "goal").map((e) => ({ minute: e.minute, team: e.teamId === match.homeId ? "home" : "away", player: e.scorer ? initialsOf(e.scorer) : null })),
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } },
  );
}
