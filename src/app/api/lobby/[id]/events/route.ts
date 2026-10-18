import { canViewLobby, getLobby } from "@/server/lobby";
import { subscribeToLobby } from "@/server/realtime";
import { getCurrentUser } from "@/server/session";

const HEARTBEAT_MS = 25_000;

/** Server-Sent Events: meldet jede Änderung der Lobby. Der Client lädt die Seite dann neu. */
export async function GET(request: Request, ctx: RouteContext<"/api/lobby/[id]/events">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Nicht angemeldet", { status: 401 });

  const view = await getLobby(id, { id: user.id, role: user.role });
  if (!view || !canViewLobby(view)) return new Response("Nicht gefunden", { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = await subscribeToLobby(id, () => send("event: update\ndata: 1\n\n"));
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* schon geschlossen */
        }
      };
      request.signal.addEventListener("abort", cleanup);
      send("retry: 3000\n\n: verbunden\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
