// Schnittstelle zur Server-Aktion "gespeicherte Karte für diese Lobby nutzen" (Vertrag 012, AC-1, Entscheid B: je Lobby-Platz ausdrückliches Mandat).
// Die Server-Aktion applyStoredCardForLobby(matchId) in src/server/payments/card-actions.ts liefert worker-1 (M1c). Bis sie gemergt ist, ist der Zustand
// ausgeschaltet und die Lobby zeigt das normale Formular für eine neue Karte. Beim Anschluss: Aktion hier importieren, in activateStoredCard aufrufen
// und STORED_CARD_ACTION_AVAILABLE auf true setzen. needsNewCard = true bedeutet: die gespeicherte Karte gilt nicht mehr, die Lobby bietet das Formular an.
export const STORED_CARD_ACTION_AVAILABLE = false;

export type StoredCardResult = { ok: true } | { ok: false; error: string; needsNewCard: boolean };

export async function activateStoredCard(matchId: string): Promise<StoredCardResult> {
  void matchId;
  return { ok: false, error: "Das ist gerade nicht verfügbar.", needsNewCard: true };
}
