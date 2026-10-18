import { subscribeToLobby } from "./realtime";

const HEARTBEAT_MS = 25_000;

/** Baut eine SSE-Antwort, die bei jeder Änderung des Spiels ein "update"-Ereignis sendet. */
export function createMatchStream(request: Request, matchId: string): Response {
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
      const unsubscribe = await subscribeToLobby(matchId, () => send("event: update\ndata: 1\n\n"));
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
