import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Comments } from "@/components/Comments";
import { getPublicVenue } from "@/server/venues";

export async function generateMetadata({ params }: PageProps<"/hallen/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getPublicVenue(id);
  return { title: data ? data.venue.name : "Halle nicht gefunden" };
}

export default async function VenuePage({ params }: PageProps<"/hallen/[id]">) {
  const { id } = await params;
  const data = await getPublicVenue(id);
  if (!data) notFound();
  const { venue } = data;
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">
          {venue.name}
          {venue.isPartner && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 align-middle text-xs text-green">Partner</span>}
        </h1>
        <p className="text-muted">{[venue.address, venue.city].filter(Boolean).join(", ")}</p>
        <p className="text-sm">{data.avg ? <><span className="text-yellow">★</span> {data.avg} aus {data.n} {data.n === 1 ? "Bewertung" : "Bewertungen"}</> : "Noch keine Bewertung"}</p>
      </header>
      <dl className="card grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-muted">Boden</dt><dd className="font-semibold">{venue.surface ?? "–"}</dd></div>
        <div><dt className="text-muted">Duschen</dt><dd className="font-semibold">{venue.hasShowers ? "Ja" : "Nein"}</dd></div>
        <div><dt className="text-muted">Parkplatz</dt><dd className="font-semibold">{venue.hasParking ? "Ja" : "Nein"}</dd></div>
      </dl>
      <Comments targetType="venue" targetId={venue.id} path={`/hallen/${venue.id}`} title="Bewertungen" />
    </div>
  );
}
