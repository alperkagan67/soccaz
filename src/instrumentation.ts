import type { Instrumentation } from "next";

/** Wird beim Start des Servers einmal ausgeführt: Fehlerüberwachung und Zeitplaner. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
