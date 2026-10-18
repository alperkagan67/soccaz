import type { Metadata } from "next";
import Link from "next/link";
import { CITIES } from "@/lib/validation";
import { listPublicVenues } from "@/server/venues";

export const metadata: Metadata = { title: "Hallen" };

export default async function VenuesPage({ searchParams }: PageProps<"/hallen">) {
  const sp = await searchParams;
  const city = typeof sp.city === "string" && (CITIES as readonly string[]).includes(sp.city) ? sp.city : undefined;
  const venues = await listPublicVenues(city);
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Hallen</h1>
      <form className="flex gap-2">
        <select name="city" defaultValue={city ?? ""} aria-label="Stadt" className="field !w-auto flex-1">
          <option value="">Alle Städte</option>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn btn-primary">Anzeigen</button>
      </form>
      {venues.length === 0 ? (
        <p className="text-muted">Noch keine Hallen eingetragen.</p>
      ) : (
        <ul className="space-y-2">
          {venues.map((v) => (
            <li key={v.id}>
              <Link href={`/hallen/${v.id}`} className="card flex items-center justify-between gap-3 hover:border-green/50">
                <span>
                  <span className="font-semibold">{v.name}</span>
                  {v.is_partner && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 text-xs text-green">Partner</span>}
                  <span className="block text-sm text-muted">{[v.city, v.surface].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="text-right text-sm">
                  {v.avg ? <><span className="text-yellow">★</span> {v.avg}</> : <span className="text-muted">–</span>}
                  <span className="block text-xs text-muted">{v.n} {v.n === 1 ? "Bewertung" : "Bewertungen"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
