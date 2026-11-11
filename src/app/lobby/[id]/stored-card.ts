// Schnittstelle zur Server-Aktion "gespeicherte Karte für diese Lobby nutzen" (Vertrag 012, AC-1, Entscheid B: je Lobby-Platz ausdrückliches Mandat).
// Die Server-Aktion (useStoredCardForLobby in src/server/payments/card-actions.ts) liefert M1c. Bis sie existiert, ist der Zustand ausgeschaltet und die
// Lobby zeigt das normale Formular für eine neue Karte. Beim Anschluss: Import der Aktion hier eintragen und STORED_CARD_ACTION_AVAILABLE auf true setzen.
export const STORED_CARD_ACTION_AVAILABLE = false;

export async function activateStoredCard(matchId: string): Promise<{ error?: string }> {
  void matchId;
  return { error: "Das ist gerade nicht verfügbar." };
}
