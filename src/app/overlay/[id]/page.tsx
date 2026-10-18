import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveIndicator } from "@/components/LiveIndicator";
import { PHASE_LABEL } from "@/lib/result-rules";
import { getMatchPage } from "@/server/results";

export const metadata: Metadata = { title: "Overlay", robots: { index: false, follow: false } };

/** Spielstand-Einblendung für OBS (als Browser-Quelle): durchsichtiger Hintergrund, aktualisiert sich selbst. */
export default async function OverlayPage({ params }: PageProps<"/overlay/[id]">) {
  const { id } = await params;
  const page = await getMatchPage(id, null);
  if (!page || page.match.visibility !== "public") notFound();
  const { match, live, result, phase } = page;
  const shown = result && (match.status === "played" || result.confirmedHome || result.confirmedAway) ? { home: result.homeScore, away: result.awayScore } : live;

  return (
    <div className="overlay-root fixed left-4 top-4 inline-flex items-stretch overflow-hidden rounded-xl border border-green/40 bg-bg/90 text-white shadow-lg" data-testid="overlay">
      <style>{`html, body { background: transparent !important; } body > header, body > footer, body > nav { display: none !important; } main > :not(.overlay-root) { display: none !important; }`}</style>
      <div className="flex min-w-40 items-center justify-end px-4 py-2 text-lg font-bold">{match.homeName}</div>
      <div className="flex items-center gap-2 bg-green px-4 font-heading text-3xl font-extrabold tabular-nums text-black" aria-label={`Spielstand ${shown.home} zu ${shown.away}`}>
        <span>{shown.home}</span>
        <span>:</span>
        <span>{shown.away}</span>
      </div>
      <div className="flex min-w-40 items-center px-4 py-2 text-lg font-bold">{match.awayName}</div>
      <div className="flex items-center border-l border-white/10 px-3 text-xs text-muted">{PHASE_LABEL[phase]}</div>
      <div className="sr-only">
        <LiveIndicator eventsUrl={`/api/spiele/${match.id}/events`} />
      </div>
    </div>
  );
}
