import type { Instrumentation } from "next";
import { turnierOnlyWarnung } from "@/lib/turnier-only";

/** Wird beim Start des Servers einmal ausgeführt: Fehlerüberwachung und Zeitplaner. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Turnier 12.12.: In Produktion MUSS die Betriebsart ausdrücklich gesetzt sein (TURNIER_ONLY=1 oder =0); ohne die Variable bleibt der Betrieb offen und das steht hier im Protokoll (ohne Wert, ohne Geheimnis).
  if (turnierOnlyWarnung(process.env)) {
    console.warn("[start] WARNUNG: TURNIER_ONLY ist in Produktion nicht gesetzt oder ungültig (nur 1 schaltet ein; 1 = nur Turniere, 0 = bewusst alles offen). Pflichtvariable im Betriebsablauf.");
  }

  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
  }

  const enabled = process.env.ENABLE_SCHEDULER ?? (process.env.NODE_ENV === "production" ? "1" : "0");
  if (enabled === "1" && process.env.DATABASE_URL) {
    const { startScheduler } = await import("./server/scheduler");
    await startScheduler().catch((error) => console.error("[scheduler] Start fehlgeschlagen:", error));
  }
}

/** Jeder unbehandelte Serverfehler landet strukturiert im Protokoll und, falls konfiguriert, in Sentry. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      message: err.message,
      digest: err.digest,
      path: request.path,
      method: request.method,
      route: context.routePath,
      type: context.routeType,
    }),
  );
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/node");
    Sentry.captureException(err, { tags: { route: context.routePath, routeType: context.routeType }, extra: { digest: err.digest } });
  }
};
