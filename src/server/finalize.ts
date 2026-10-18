import { audit } from "./audit";
import type { Tx } from "./tx";

/**
 * Wird in derselben Transaktion aufgerufen, wenn ein Spiel endgültig gespielt ist.
 * Hier hängen sich Statistik, Elo, Abzeichen, Ligatabellen und Benachrichtigungen ein.
 */
type Finalizer = (tx: Tx, matchId: string, actorId: string | null) => Promise<void>;

const finalizers: { name: string; run: Finalizer }[] = [];

export function registerFinalizer(name: string, run: Finalizer) {
  if (!finalizers.some((f) => f.name === name)) finalizers.push({ name, run });
}

export async function onMatchPlayed(tx: Tx, matchId: string, actorId: string | null) {
  for (const f of finalizers) {
    await f.run(tx, matchId, actorId);
  }
  await audit(actorId, "match.finalized", "match", matchId, { after: { steps: finalizers.map((f) => f.name) } }, tx);
}
