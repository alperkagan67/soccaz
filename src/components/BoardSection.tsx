import Link from "next/link";
import { headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { matchmakingQueue } from "@/db/schema-matchmaking";
import { listBoard, type BoardFilter } from "@/server/board";
import { teamElo } from "@/server/matchmaking";
import { myAdminTeams } from "@/server/requests";
import { getCurrentUser } from "@/server/session";
import { paymentsEnabled } from "@/server/settings";
import { LobbyBoard } from "./LobbyBoard";

/** Lädt die offenen Lobbys und Suchen samt dem, was die angemeldete Person damit tun kann, und zeigt sie. `limit` kürzt die Liste. */
export async function BoardSection({ filter = {}, limit }: { filter?: BoardFilter; limit?: number }) {
  const [user, payOn, all, h] = await Promise.all([getCurrentUser(), paymentsEnabled(), listBoard(filter), headers()]);
  const adminTeams = user?.onboardedAt ? await myAdminTeams(user.id) : [];
  const mine = await Promise.all(adminTeams.map(async (t) => ({ id: t.id, name: t.name, elo: await teamElo(t.id), strength: t.strength })));
  const waiting = adminTeams.length
    ? await db.select({ teamId: matchmakingQueue.teamId }).from(matchmakingQueue).where(and(eq(matchmakingQueue.status, "waiting"), gt(matchmakingQueue.expiresAt, new Date())))
    : [];
  const myWaiting = waiting.map((w) => w.teamId).filter((id) => adminTeams.some((t) => t.id === id));
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const shown = limit ? all.slice(0, limit) : all;
  return (
    <>
      <LobbyBoard entries={shown} mine={mine} myWaitingTeamIds={myWaiting} loggedIn={Boolean(user)} shareBase={process.env.APP_URL ?? `${proto}://${host}`} paymentsOn={payOn} />
      {limit && all.length > limit && (
        <p className="text-sm">
          <Link href="/suche" className="text-green underline">
            Alle {all.length} offenen Lobbys und Suchen ansehen
          </Link>
        </p>
      )}
    </>
  );
}
