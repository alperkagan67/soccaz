import { EventEmitter } from "node:events";
import { Client } from "pg";

// Eine einzige Datenbankverbindung hört auf den Kanal "lobby" und verteilt Ereignisse im Prozess
// an alle offenen SSE-Verbindungen. Ohne Redis, passend zu einem einzelnen Server.
const CHANNEL = "lobby";
export const ALL_MATCHES = "*"; // Abo-Schlüssel für alle Spiele (Livescore-Übersicht)

type Hub = { emitter: EventEmitter; starting?: Promise<void>; client?: Client };
const globalForHub = globalThis as unknown as { __lobbyHub?: Hub };
const hub: Hub = (globalForHub.__lobbyHub ??= { emitter: new EventEmitter().setMaxListeners(0) });

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
      hub.emitter.emit(msg.payload);
      hub.emitter.emit(ALL_MATCHES);
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
