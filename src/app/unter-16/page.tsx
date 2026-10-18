import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Mindestalter 16" };

export default function Under16Page() {
  return (
    <section className="mx-auto mt-10 max-w-md space-y-4 text-center">
      <h1 className="text-2xl font-bold">Socaz ist ab 16</h1>
      <p className="text-muted">
        Du kannst noch kein Konto anlegen. Dein Konto wurde wieder gelöscht, dein Geburtsdatum haben wir nie gespeichert.
      </p>
      <Link href="/" className="btn btn-ghost">Zur Startseite</Link>
    </section>
  );
}
