/**
 * Schnittstelle für den Buchungs-Agenten. Heute bucht ein Mensch (Admin-Dashboard, Bereich Buchungen).
 * Später kann ein Agent Hallen über deren Webseite, Telefon oder E-Mail buchen: er implementiert `attempt`
 * und liefert Ergebnis und Nachweis. Alles, was er nicht sicher erledigen kann, gibt er mit "skipped" an den Menschen zurück.
 */
export type BookingJobContext = {
  jobId: string;
  matchId: string;
  startsAt: Date;
  durationMin: number;
  venueName: string | null;
  venueContact: string | null;
  note: string | null;
};

export type AgentResult = { status: "booked" | "unavailable" | "skipped"; note?: string; proofUrl?: string };

export interface BookingAgent {
  readonly name: string;
  attempt(job: BookingJobContext): Promise<AgentResult>;
}

/** Standard: es gibt keinen automatischen Agenten, alles bleibt bei den Admins. */
export const manualAgent: BookingAgent = {
  name: "manual",
  async attempt() {
    return { status: "skipped" };
  },
};

export function getAgent(): BookingAgent {
  return manualAgent;
}
