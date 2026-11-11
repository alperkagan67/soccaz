import { applyStoredCardForLobby } from "@/server/payments/card-actions";

export type StoredCardResult = { ok: true } | { ok: false; error: string; needsNewCard: boolean };

/**
 * Gespeicherte Karte für diesen Lobby-Platz nutzen (Vertrag 012, AC-1, Entscheid B: je Platz ein ausdrückliches Mandat).
 * mandateAccepted ist nur true, wenn der Spieler den sichtbaren Mandatstext angehakt und den Knopf gedrückt hat.
 * needsNewCard = true: die gespeicherte Karte gilt nicht mehr, die Lobby bietet das Formular für eine neue Karte an.
 */
export async function activateStoredCard(input: { matchId: string; mandateAccepted: boolean }): Promise<StoredCardResult> {
  return applyStoredCardForLobby(input);
}
