import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { matches, teamMembers, users } from "@/db/schema";
import { parseStreamUrl, STREAM_HELP } from "@/lib/stream";
import { audit } from "./audit";
import { DomainError } from "./teams";

/** Team-Admins beider Teams und Plattform-Admins tragen den Stream-Link ein (leer = entfernen). */
export async function setStreamUrl(userId: string, matchId: string, url: string) {
  const value = url.trim();
  if (value && !parseStreamUrl(value, "example.org")) throw new DomainError(`Dieser Link wird nicht unterstützt. ${STREAM_HELP}`);
  const [m] = await db.select({ home: matches.homeTeamId, away: matches.awayTeamId, status: matches.status }).from(matches).where(eq(matches.id, matchId));
  if (!m) throw new DomainError("Spiel nicht gefunden.");
  if (m.status === "cancelled") throw new DomainError("Das Spiel ist abgesagt.");
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  const [admin] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.userId, userId), eq(teamMembers.role, "admin"), inArray(teamMembers.teamId, [m.home, m.away])));
  if (u?.role !== "admin" && !admin) throw new DomainError("Nur Team-Admins dieses Spiels können den Stream eintragen.");
  await db.update(matches).set({ streamUrl: value || null }).where(eq(matches.id, matchId));
  await audit(userId, value ? "match.stream_set" : "match.stream_remove", "match", matchId, { after: { streamUrl: value || null } });
}
