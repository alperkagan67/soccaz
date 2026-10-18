import { autoConfirmOverdueResults } from "./results";

/** Alle Hintergrundjobs als einfache Funktionen. Der Zeitplaner und die Test-Schnittstelle rufen sie über diesen Namen auf. */
export const JOBS: Record<string, () => Promise<unknown>> = {
  "auto-confirm-results": () => autoConfirmOverdueResults(),
};

export async function runJob(name: string): Promise<unknown> {
  const job = JOBS[name];
  if (!job) throw new Error(`Unbekannter Job: ${name}`);
  return job();
}
