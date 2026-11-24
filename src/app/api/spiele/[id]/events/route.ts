import { canViewMatch, getMatchPage } from "@/server/results";
import { createMatchStream } from "@/server/sse";
import { getCurrentUser } from "@/server/session";
import { gesperrteAntwort, spielGesperrt } from "@/server/turnier-only";

/** Server-Sent Events der Spielseite: öffentlich für öffentliche Spiele, sonst nur für Berechtigte. */
export async function GET(request: Request, ctx: RouteContext<"/api/spiele/[id]/events">) {
  const { id } = await ctx.params;
  if (await spielGesperrt(id)) return gesperrteAntwort(); // TURNIER_ONLY: gesperrter Bereich (Live-Kanal)
  const user = await getCurrentUser();
  const page = await getMatchPage(id, user ? { id: user.id, role: user.role } : null);
  if (!page || !canViewMatch(page)) return new Response("Nicht gefunden", { status: 404 });
  return createMatchStream(request, id);
}
