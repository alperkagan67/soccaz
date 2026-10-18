import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { matchEvents, matchResults, matches, teams, users } from "@/db/schema";
import { formatDate } from "@/lib/time";

export const CARD_SIZE = { width: 1200, height: 630 };
const GREEN = "#2ecc71";
const BG = "#030806";
const MUTED = "#8aa396";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: BG, color: "white", padding: 56, fontFamily: "sans-serif", borderTop: `10px solid ${GREEN}` }}>
      {children}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: MUTED }}>
        <span style={{ color: GREEN, fontWeight: 800, letterSpacing: 4 }}>SOCAZ</span>
        <span>Hallenfußball in NRW</span>
      </div>
    </div>
  );
}

const plain = () => new ImageResponse(<Frame><div style={{ display: "flex", fontSize: 72, fontWeight: 800 }}>Socaz</div></Frame>, CARD_SIZE);

/** Spielbericht-Karte: Ergebnis, Torschützen, Datum. Nur für öffentliche Spiele; sonst eine neutrale Karte ohne Namen. */
export async function matchCard(matchId: string): Promise<ImageResponse> {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return plain();
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const [m] = await db
    .select({ startsAt: matches.startsAt, status: matches.status, visibility: matches.visibility, homeId: matches.homeTeamId, homeName: home.name, awayName: away.name, homeScore: matchResults.homeScore, awayScore: matchResults.awayScore })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .leftJoin(matchResults, eq(matchResults.matchId, matches.id))
    .where(eq(matches.id, matchId));
  if (!m || m.visibility !== "public") return plain();

  const goals = await db
    .select({ name: users.name, teamId: matchEvents.teamId, minute: matchEvents.minute })
    .from(matchEvents)
    .leftJoin(users, eq(users.id, matchEvents.userId))
    .where(eq(matchEvents.matchId, matchId));
  const scorers = goals
    .filter((g) => g.name)
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
    .slice(0, 6)
    .map((g) => `${g.name} ${g.minute}'`);
  const played = m.status === "played" && m.homeScore !== null;

  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 30, color: MUTED }}>
          <span>{played ? "Endstand" : "Spiel"} · {formatDate(m.startsAt)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <div style={{ display: "flex", flex: 1, justifyContent: "flex-end", fontSize: 54, fontWeight: 800, textAlign: "right" }}>{m.homeName}</div>
          <div style={{ display: "flex", fontSize: played ? 140 : 80, fontWeight: 900, color: GREEN, padding: "0 20px" }}>{played ? `${m.homeScore}:${m.awayScore}` : "vs"}</div>
          <div style={{ display: "flex", flex: 1, fontSize: 54, fontWeight: 800 }}>{m.awayName}</div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#cfe3d8", minHeight: 40 }}>{scorers.join("  ·  ")}</div>
      </Frame>
    ),
    CARD_SIZE,
  );
}

export async function teamCard(slug: string): Promise<ImageResponse> {
  await connection();
  const [t] = await db.select({ name: teams.name, city: teams.city, archivedAt: teams.archivedAt }).from(teams).where(eq(teams.slug, slug));
  if (!t || t.archivedAt) return plain();
  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: "flex", fontSize: 30, color: MUTED }}>Team</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 88, fontWeight: 900 }}>{t.name}</div>
          <div style={{ display: "flex", fontSize: 40, color: GREEN }}>{t.city}</div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#cfe3d8" }}>Fordere uns auf Socaz heraus.</div>
      </Frame>
    ),
    CARD_SIZE,
  );
}
