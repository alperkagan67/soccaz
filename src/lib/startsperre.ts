// Startsperre (Go-live, Entscheid t2q 2026-11-24): In Produktion (und Staging, es läuft ebenfalls mit NODE_ENV=production) darf PAYMENTS_FAKE=1 nie gesetzt sein,
// sonst gälte das bekannte Fake-Geheimnis der Testzahlungen. Fail closed: Der Server-Start wird verweigert (src/instrumentation.ts wirft). Keine Ausnahme.
// Nur zur LAUFZEIT: `next build` (NEXT_PHASE=phase-production-build) und Entwicklungs-/Test-Server sind nicht betroffen.
// Gleiche Regel wie der späte Schutz in src/server/payments/provider.ts (wirft erst beim ersten Zahlungsaufruf); hier schon beim Start.

export const STARTSPERRE_MELDUNG = "PAYMENTS_FAKE=1 ist in Produktion verboten. Die Variable nur in Tests und CI setzen, nie in Staging oder Produktion. Start verweigert.";

type Env = Record<string, string | undefined>;

/** true, wenn der Start verweigert werden muss. */
export function startVerboten(env: Env = process.env): boolean {
  if (env.NEXT_PHASE === "phase-production-build") return false; // Build (lokal und CI) mit gesetzter Variable darf nicht scheitern
  return env.NODE_ENV === "production" && env.PAYMENTS_FAKE === "1";
}
