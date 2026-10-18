import { deliverPending } from "./notifications";
import { autoConfirmOverdueResults } from "./results";
import { runBookingAgent } from "./booking";
import { closeMvpVoting } from "./stats";
import { cancelUnderfilledLobbies, cleanup, expireOldRequests, expireStalePayments, notifyFinanceAlerts, sendMatchReminders, sendResultReminders, settleDueMatches } from "./scheduled";

/** Alle Hintergrundjobs als einfache Funktionen. Zeitplaner und Test-Schnittstelle rufen sie über den Namen auf. */
export const JOBS: Record<string, () => Promise<unknown>> = {
  "auto-confirm-results": () => autoConfirmOverdueResults(),
  "deliver-notifications": () => deliverPending(),
  "send-reminders": () => sendMatchReminders(),
  "lobby-deadlines": () => cancelUnderfilledLobbies(),
  "expire-requests": () => expireOldRequests(),
  "result-reminders": () => sendResultReminders(),
  cleanup: () => cleanup(),
  "settle-matches": () => settleDueMatches(),
  "expire-payments": () => expireStalePayments(),
  "booking-agent": () => runBookingAgent(),
  "finance-alerts": () => notifyFinanceAlerts(),
  "close-mvp": () => closeMvpVoting(),
};

/** Zeitplan (Cron, UTC). Läuft über pg-boss, siehe instrumentation.ts. */
export const SCHEDULE: Record<string, string> = {
  "deliver-notifications": "* * * * *",
  "send-reminders": "* * * * *",
  "lobby-deadlines": "*/5 * * * *",
  "auto-confirm-results": "*/5 * * * *",
  "result-reminders": "*/15 * * * *",
  "expire-requests": "*/10 * * * *",
  cleanup: "17 3 * * *",
  "settle-matches": "*/5 * * * *",
  "expire-payments": "*/30 * * * *",
  "booking-agent": "*/5 * * * *",
  "finance-alerts": "5 6 * * *",
  "close-mvp": "10 * * * *",
};

export async function runJob(name: string): Promise<unknown> {
  const job = JOBS[name];
  if (!job) throw new Error(`Unbekannter Job: ${name}`);
  return job();
}
