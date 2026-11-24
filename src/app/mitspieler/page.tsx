import type { Metadata } from "next";
import Link from "next/link";
import { PersonName } from "@/components/PersonName";
import { personRef } from "@/lib/lobby-namen";
import { formatDate, toBerlinInputValue } from "@/lib/time";
import { CITIES } from "@/lib/validation";
import { listPosts } from "@/server/freeplayers";
import { myAdminTeams } from "@/server/requests";
import { getViewerSicht } from "@/server/viewer-sicht";
import { ClosePostButton, PostForm, RequestPlayerButton } from "./PostForm";

export const metadata: Metadata = { title: "Mitspieler gesucht" };

export default async function FreePlayersPage({ searchParams }: PageProps<"/mitspieler">) {
  const sp = await searchParams;
  const city = typeof sp.city === "string" && (CITIES as readonly string[]).includes(sp.city) ? sp.city : undefined;
  const [{ user, sicht }, posts] = await Promise.all([getViewerSicht(), listPosts({ city })]); // AC-17: Name und Link nur für Angemeldete, Position nur für Angemeldete
  const adminTeams = user?.onboardedAt ? await myAdminTeams(user.id) : [];
  const min = toBerlinInputValue(new Date()).slice(0, 10);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Mitspieler gesucht</h1>
        <p className="text-muted">Spieler, die an einem Tag Lust auf ein Spiel haben. Fehlt dir jemand? Frag ihn an.</p>
      </header>

      {user?.onboardedAt ? (
        <PostForm defaultCity={user.city} min={min} />
      ) : (
        <p className="card text-sm text-muted">
          <Link href="/anmelden?next=/mitspieler" className="text-accent-fg underline">Melde dich an</Link>, um dich einzutragen.
        </p>
      )}

      <form className="flex gap-2" role="search">
        <select name="city" defaultValue={city ?? ""} aria-label="Stadt" className="field !w-auto flex-1">
          <option value="">Alle Städte</option>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn btn-primary">Filtern</button>
      </form>

      {posts.length === 0 ? (
        <p className="text-muted">Gerade hat sich niemand eingetragen.</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((p, i) => (
            <li key={p.id} className="card space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <PersonName person={personRef(sicht, p.userId, p.name, i)} className="font-semibold" />
                  <span className="block text-sm text-muted">{[sicht === "member" ? p.position : null, p.city].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="text-right text-sm">{formatDate(new Date(`${p.day}T12:00:00Z`))}</span>
              </div>
              {p.note && <p className="text-sm text-muted">{p.note}</p>}
              <div>
                {user?.id === p.userId ? (
                  <ClosePostButton id={p.id} />
                ) : adminTeams.length > 0 ? (
                  <RequestPlayerButton postId={p.id} teams={adminTeams.map((t) => ({ id: t.id, name: t.name }))} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
