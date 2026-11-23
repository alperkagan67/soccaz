// Skelett waehrend die Anfragen laden (Barrierefreiheit: aria-busy, Statusmeldung fuer Screenreader); andere Admin-Seiten haben noch keines.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" data-testid="requests-loading">
      <p role="status" className="sr-only">Hallen-Anfragen werden geladen.</p>
      <div aria-hidden className="h-8 w-56 animate-pulse rounded-md bg-panel" />
      <div aria-hidden className="card h-28 animate-pulse" />
      <div aria-hidden className="card h-28 animate-pulse" />
    </div>
  );
}
