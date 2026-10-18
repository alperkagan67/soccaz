import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { getTeamBySlug, getTeamMembers, isTeamAdmin } from "@/server/teams";
import { InviteBox } from "./InviteBox";

export async function generateMetadata({ params }: PageProps<"/teams/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  return { title: team ? team.name : "Team nicht gefunden" };
}

export default async function TeamPage({ params }: PageProps<"/teams/[slug]">) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) notFound();

  const [members, user] = await Promise.all([getTeamMembers(team.id), getCurrentUser()]);
  const admin = user ? await isTeamAdmin(user.id, team.id) : false;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">{team.name}</h1>
        <p className="text-muted">{team.city} · Spielstärke {team.strength} von 5</p>
      </header>

      {admin && <InviteBox teamId={team.id} teamName={team.name} />}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Kader ({members.length})</h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.userId} className="card flex items-center justify-between">
              <span>
                <span className="font-semibold">{m.name}</span>
                {m.isVerifiedPro && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 text-xs text-green">Profi</span>}
                <span className="block text-sm text-muted">{m.position ?? "Position offen"}</span>
              </span>
              {m.role === "admin" && <span className="text-xs text-muted">Team-Admin</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
