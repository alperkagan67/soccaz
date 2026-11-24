import { createMatchStream } from "@/server/sse";
import { ALL_MATCHES } from "@/server/realtime";
import { gesperrteAntwort, bereichGesperrt } from "@/server/turnier-only";

/** Öffentlicher Live-Kanal der Livescore-Übersicht: meldet Änderungen irgendeines Spiels (keine Inhalte, nur "update"). */
export async function GET(request: Request) {
  if (await bereichGesperrt()) return gesperrteAntwort(); // TURNIER_ONLY: gesperrter Bereich (Live-Kanal)
  return createMatchStream(request, ALL_MATCHES);
}
