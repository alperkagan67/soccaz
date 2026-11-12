// Ein Nachruecker (Zeile mit slot_of) scheitert bei der Abbuchung (Vertrag 012, M3c-2a, AC-8). Eigene kleine Datei ohne Import von charge.ts/charge-run.ts, damit beide sie
// nutzen koennen (kein Importzyklus). Der Nachruecker ist sofort draussen (kein Fenster, kein Mensch fuer 3-D-Secure); der Platz bleibt offen und der naechste Lauf
// nimmt den Naechsten der Warteliste. Benachrichtigt wird NUR er selbst, nie der Captain oder Dritte (AC-20).
import { and, eq } from "drizzle-orm";
import { clearCoversInvolving } from "./cover-clear";
import { matchParticipants, paymentCharges } from "@/db/schema";
import { chargeFailureText } from "@/lib/charge-failure-text";
import { audit } from "../audit";
import { notifyUsers } from "../notifications";
import type { Tx } from "../tx";

export async function failSubstitute(tx: Tx, row: { id: string; matchId: string; userId: string }, code: string | null): Promise<void> {
  await tx.update(paymentCharges).set({ resolution: "replaced", updatedAt: new Date() }).where(eq(paymentCharges.id, row.id));
  await clearCoversInvolving(tx, row.matchId, row.userId);
  // wieder nicht eingeteilt; die Karte hat nicht geklappt
  await tx.update(matchParticipants).set({ teamId: null, cardStatus: "failed" }).where(and(eq(matchParticipants.matchId, row.matchId), eq(matchParticipants.userId, row.userId)));
  await audit(null, "charge.substitute_failed", "match", row.matchId, { after: { userId: row.userId, code } }, tx);
  await notifyUsers(
    [row.userId],
    {
      type: "payment",
      title: "Nachrücken hat nicht geklappt",
      body: `Die Abbuchung für den freien Platz hat nicht geklappt. ${chargeFailureText(code)} Der Platz geht an den Nächsten auf der Warteliste.`,
      url: `/lobby/${row.matchId}`,
    },
    tx,
  );
}
