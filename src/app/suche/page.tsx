import type { Metadata } from "next";

export const metadata: Metadata = { title: "Spielsuchen" };

export default function SearchPage() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold">Spielsuchen</h1>
      <p className="card text-muted">Hier erscheinen bald alle offenen Spielsuchen mit Filtern. Das ist das nächste Feature.</p>
    </section>
  );
}
