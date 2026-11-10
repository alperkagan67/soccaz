import { EventEmitter } from "node:events";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db";
import { matches } from "@/db/schema";

// Eine einzige Datenbankverbindung hört auf den Kanal "lobby" und verteilt Ereignisse im Prozess
// an alle offenen SSE-Verbindungen. Ohne Redis, passend zu einem einzelnen Server.
const CHANNEL = "lobby";
export const ALL_MATCHES = "*"; // Abo-Schlüssel für alle Spiele (Livescore-Übersicht)

type Hub = { emitter: EventEmitter; starting?: Promise<void>; client?: Client };
const globalForHub = globalThis as unknown as { __lobbyHub?: Hub };
const hub: Hub = (globalForHub.__lobbyHub ??= { emitter: new EventEmitter().setMaxListeners(0) });

/**
 * Darf eine Änderung an diesem Spiel in den globalen Kanal (Livescore-Übersicht, ohne Anmeldung erreichbar)? Nur bei öffentlichen Spielen:
 * Privatspiele verraten sonst über den Zeitpunkt der Meldungen, dass dort etwas passiert. Fehler beim Nachschlagen führen zu "nein"
 * (fail closed) und werden ohne Nutzerdaten ignoriert; die Lobby-Aktion selbst ist da längst abgeschlossen und scheitert daran nie.
 */
export async function mayAnnounceToAll(matchId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return true; // keine Spiel-ID: nichts Privates
  try {
    const [row] = await db.select({ visibility: matches.visibility }).from(matches).where(eq(matches.id, matchId));
    return !row || row.visibility === "public";
  } catch {
    return false;
  }
}

function reset() {
  hub.client?.removeAllListeners();
  hub.client?.end().catch(() => {});
  hub.client = undefined;
  hub.starting = undefined;
}

async function start() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  client.on("notification", (msg) => {
    if (msg.channel === CHANNEL && msg.payload) {
      hub.emitter.emit(msg.payload); // Kanal des einzelnen Spiels (die Berechtigung prüft die Events-Route)
      void mayAnnounceToAll(msg.payload).then((ok) => ok && hub.emitter.emit(ALL_MATCHES), () => {});
    }
  });
  const retry = () => {
    reset();
    setTimeout(() => void ensureListening().catch(() => {}), 2000).unref();
  };
  client.on("error", retry);
  client.on("end", retry);
  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  hub.client = client;
}

function ensureListening(): Promise<void> {
  hub.starting ??= start().catch((error) => {
    hub.starting = undefined;
    throw error;
  });
  return hub.starting;
}

/** Ruft `onChange`, sobald sich an der Lobby `matchId` etwas ändert. Gibt eine Abmeldefunktion zurück. */
export async function subscribeToLobby(matchId: string, onChange: () => void): Promise<() => void> {
  await ensureListening();
  hub.emitter.on(matchId, onChange);
  return () => {
    hub.emitter.off(matchId, onChange);
  };
}

export const LOBBY_CHANNEL = CHANNEL;
