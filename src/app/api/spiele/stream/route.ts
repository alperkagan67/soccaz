import { createMatchStream } from "@/server/sse";
import { ALL_MATCHES } from "@/server/realtime";

/** Öffentlicher Live-Kanal der Livescore-Übersicht: meldet Änderungen irgendeines Spiels (keine Inhalte, nur "update"). */
export async function GET(request: Request) {
  return createMatchStream(request, ALL_MATCHES);
}
