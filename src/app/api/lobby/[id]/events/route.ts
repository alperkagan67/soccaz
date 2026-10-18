import { canViewLobby, getLobby } from "@/server/lobby";
import { createMatchStream } from "@/server/sse";
import { getCurrentUser } from "@/server/session";

/** Server-Sent Events der Lobby: nur für Berechtigte. */
export async function GET(request: Request, ctx: RouteContext<"/api/lobby/[id]/events">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Nicht angemeldet", { status: 401 });

  const view = await getLobby(id, { id: user.id, role: user.role });
  if (!view || !canViewLobby(view)) return new Response("Nicht gefunden", { status: 404 });
  return createMatchStream(request, id);
}
