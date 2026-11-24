import { canViewLobby, getLobby } from "@/server/lobby";
import { createMatchStream } from "@/server/sse";
import { getCurrentUser } from "@/server/session";
import { gesperrteAntwort, bereichGesperrt } from "@/server/turnier-only";

/** Server-Sent Events der Lobby: nur für Berechtigte. */
export async function GET(request: Request, ctx: RouteContext<"/api/lobby/[id]/events">) {
  const { id } = await ctx.params;
  if (await bereichGesperrt()) return gesperrteAntwort(); // TURNIER_ONLY: gesperrter Bereich (Live-Kanal)
  const user = await getCurrentUser();
  // Öffentliche Lobbys dürfen alle live mitverfolgen, private nur Berechtigte
  const view = await getLobby(id, user ? { id: user.id, role: user.role } : null);
  if (!view || !canViewLobby(view)) return new Response("Nicht gefunden", { status: 404 });
  return createMatchStream(request, id);
}
