import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <section className="mx-auto mt-16 max-w-sm space-y-3 text-center">
      <h1 className="text-2xl font-bold">Keine Verbindung</h1>
      <p className="text-muted">Socaz braucht Internet, damit Spielstände und Lobbys aktuell sind. Sobald du wieder online bist, geht es weiter.</p>
    </section>
  );
}
