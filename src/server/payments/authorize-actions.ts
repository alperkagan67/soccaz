"use server";

import { requireUser } from "../session";
import { DomainError } from "../teams";
import { getAuthorizationSecret } from "./authorize";

export type AuthorizationState = { ok: true; clientSecret: string } | { ok: false; error: string };

/**
 * 3-D-Secure-Freigabe (Vertrag 012, M3c-1c): liefert dem eingeloggten Nutzer SELBST das clientSecret seines offenen Versuchs (die Nutzer-ID kommt aus der Sitzung, nie aus der Eingabe).
 * Das Secret steht nur in der Antwort dieser Server-Aktion (POST), nie in einer Seite, URL oder einem Log. Fehler sind neutral. Das Ergebnis der Pruefung im Browser bucht NICHTS:
 * die Zahlung kommt allein ueber den Webhook.
 */
export async function createAuthorizationAction(matchId: string): Promise<AuthorizationState> {
  const user = await requireUser("/app");
  try {
    const r = await getAuthorizationSecret(user.id, typeof matchId === "string" ? matchId : "");
    return { ok: true, clientSecret: r.clientSecret };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    throw error;
  }
}
