/** Wird beim Start des Servers einmal ausgeführt. Startet den Zeitplaner, sofern aktiviert. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const enabled = process.env.ENABLE_SCHEDULER ?? (process.env.NODE_ENV === "production" ? "1" : "0");
  if (enabled !== "1" || !process.env.DATABASE_URL) return;
  const { startScheduler } = await import("./server/scheduler");
  await startScheduler().catch((error) => console.error("[scheduler] Start fehlgeschlagen:", error));
}
